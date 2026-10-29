#!/usr/bin/env python3
"""Upgrade the existing domain installation to the verified cloud frontend.

Run as root on the existing VPS. Lisa uses DeepSeek directly on the domain;
OCR, bank snapshots and training counters stay on this VPS.
"""
import concurrent.futures
import fcntl
import getpass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import platform
import time
import urllib.parse
import urllib.request
import urllib.error

CLOUD = 'https://fot-practice-km.c8cpv86h5k.chatgpt.site'
DOMAIN = 'https://fot-manager-training.ru'
SOURCE_REF = '138f28ea66cdb093f604cd3ba6c46fa7617d85c8'
RAW = 'https://raw.githubusercontent.com/fot-manager-training/fot-manager-training/' + SOURCE_REF
FILES = RAW + '/public/'
MANIFEST_URL = RAW + '/manifest.json'
MANIFEST_SHA256 = 'a67580fe504a8ce13ea3513d2c84ef1f0f42d2401cd3d3bd90b3b8c328109680'
BASE = Path('/opt/fot-manager-training')
DATA = Path('/var/lib/fot-manager-training')
BACKUPS = Path('/var/backups/fot-manager-training')
SERVICE = 'fot-manager-training.service'
NGINX = Path('/etc/nginx/sites-available/fot-manager-training.ru')
SERVICE_FILE = Path('/etc/systemd/system/' + SERVICE)
LISA_SERVICE = 'fot-lisa.service'
LISA_UNIT = Path('/etc/systemd/system/fot-lisa.service')
LISA_REFRESH_UNIT = Path('/etc/systemd/system/fot-lisa-refresh.service')
LISA_TIMER = Path('/etc/systemd/system/fot-lisa-refresh.timer')
LISA_ENV = Path('/etc/fot-manager-training/lisa.env')
NODE_BINARY = None
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'


def download(url, maximum, headers=None, method=None):
    if not (url.startswith(CLOUD + '/') or url.startswith(FILES) or url.startswith(RAW + '/backend/') or url == MANIFEST_URL or url.startswith('http://127.0.0.1:8766/')):
        raise RuntimeError('Unexpected download destination')
    request = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {})}, method=method)
    with urllib.request.urlopen(request, timeout=45) as response:
        if urllib.parse.urlsplit(response.url).netloc != urllib.parse.urlsplit(url).netloc:
            raise RuntimeError('Unexpected cross-host redirect')
        body = response.read(maximum + 1)
        if len(body) > maximum:
            raise RuntimeError('Response exceeds the expected size')
        return body, response.headers


def valid_file(entry):
    path = entry.get('path', '')
    parts = PurePosixPath(path).parts
    if not isinstance(path, str) or not path or path.startswith('/') or '\\' in path or not parts or any(p in ('.', '..') or p.startswith('.') for p in parts) or str(PurePosixPath(path)) != path:
        raise RuntimeError('Unsafe file path')
    if not re.fullmatch('[a-f0-9]{64}', entry.get('sha256', '')) or type(entry.get('size')) is not int or not 0 <= entry['size'] <= 40_000_000:
        raise RuntimeError('Invalid file metadata')
    return path


def read_manifest(raw, expected):
    if hashlib.sha256(raw).hexdigest() != expected:
        raise RuntimeError('Manifest checksum does not match this installer')
    manifest = json.loads(raw)
    files = manifest['files']
    if manifest.get('cloud_origin') != CLOUD or manifest.get('target_origin') != DOMAIN or not isinstance(files, list) or not 1 <= len(files) <= 500:
        raise RuntimeError('Unexpected release manifest')
    paths = [valid_file(e) for e in files]
    if len(paths) != len(set(paths)) or sum(e['size'] for e in files) > 150_000_000:
        raise RuntimeError('Invalid release size or duplicate paths')
    if not {'index.html', 'app.js', 'lisa-chat.js', 'lisa-chat.css', 'completion.js', 'business-cases.js'}.issubset(paths):
        raise RuntimeError('Incomplete release')
    return manifest


def stage_files(manifest, public, fetch=download):
    public.mkdir(parents=True, exist_ok=False)
    def one(entry):
        path = valid_file(entry)
        body, _ = fetch(FILES + urllib.parse.quote(path, safe='/'), entry['size'])
        if len(body) != entry['size'] or hashlib.sha256(body).hexdigest() != entry['sha256']:
            raise RuntimeError('File checksum mismatch: ' + path)
        if path == 'completion.js':
            old = (CLOUD + '/api/training/completions').encode()
            if body.count(old) != 1:
                raise RuntimeError('Statistics endpoint is not in the expected format')
            body = body.replace(old, b'/api/training/completions')
        dest = public / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        dest.chmod(0o644)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, manifest['files']))
    for path in public.rglob('*'):
        if path.is_dir():
            path.chmod(0o755)
    public.chmod(0o755)


def patch_nginx(text):
    begin = '    # FOT_ATTACHMENT_UPLOAD_BEGIN'
    end = '    # FOT_ATTACHMENT_UPLOAD_END'
    if text.count(begin) > 1 or text.count(end) > 1:
        raise RuntimeError('Multiple attachment upload configurations require inspection')
    if begin in text:
        start=text.index(begin);finish=text.index(end,start)+len(end)
        text=text[:start]+text[finish:].lstrip('\n')
    pattern=re.compile(r'(?m)^[ \t]*location\s+/api/\s*\{')
    matches=list(pattern.finditer(text))
    if len(matches)!=1:
        raise RuntimeError('Expected one API location in this domain configuration')
    location="""    # FOT_ATTACHMENT_UPLOAD_BEGIN
    location ^~ /api/lisa/attachments {
        client_max_body_size 11m;
        client_body_timeout 120s;
        proxy_pass http://127.0.0.1:8766;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 180s;
        add_header Cache-Control \"no-store\" always;
    }
    location /api/lisa/ {
        client_max_body_size 600k;
        proxy_pass http://127.0.0.1:8767;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 180s;
        add_header Cache-Control "no-store" always;
    }
    # FOT_ATTACHMENT_UPLOAD_END
"""
    at=matches[0].start()
    return text[:at]+location+text[at:]


def ensure_dependencies():
    probe=subprocess.run(['/usr/bin/python3','-c','import PIL,openpyxl'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    tools=all(shutil.which(name) for name in ['tesseract','pdfinfo','pdftotext','pdftoppm'])
    langs=''
    if tools:
        langs=subprocess.run(['tesseract','--list-langs'],capture_output=True,text=True,timeout=10).stdout
    if probe.returncode==0 and tools and 'rus' in langs.splitlines() and 'eng' in langs.splitlines():
        return
    print('Installing Russian/English OCR and document readers...',flush=True)
    env={**os.environ,'DEBIAN_FRONTEND':'noninteractive'}
    subprocess.run(['apt-get','update'],check=True,env=env)
    subprocess.run(['apt-get','install','-y','--no-install-recommends','tesseract-ocr','tesseract-ocr-rus','tesseract-ocr-eng','poppler-utils','python3-pil','python3-openpyxl'],check=True,env=env)


def stage_backend(manifest,release,previous):
    files=manifest.get('backend',[])
    if {entry.get('path') for entry in files}!={'server.py','upload_extract.py','limit_exec.py','lisa-server.mjs','lisa-worker.mjs','lisa-db.py','bank-seed.json'} or len(files)!=7:
        raise RuntimeError('Unexpected backend files')
    for entry in files:
        name=valid_file(entry)
        body,_=download(RAW+'/backend/'+name,entry['size'])
        if hashlib.sha256(body).hexdigest()!=entry['sha256'] or len(body)!=entry['size']:
            raise RuntimeError('Backend checksum mismatch: '+name)
        (release/name).write_bytes(body);(release/name).chmod(0o644)
    core=previous/'training_core.py' if (previous/'training_core.py').is_file() else previous/'server.py'
    shutil.copy2(core,release/'training_core.py');(release/'training_core.py').chmod(0o644)


def deepseek_key():
    key=os.environ.get('DEEPSEEK_API_KEY','').strip()
    if not key and LISA_ENV.is_file():
        for line in LISA_ENV.read_text().splitlines():
            if line.startswith('DEEPSEEK_API_KEY='):
                key=line.split('=',1)[1].strip().strip('\"\'')
    if not key:
        print('Paste your DeepSeek API key at the prompt. It will be hidden and stored only in the root-protected server configuration.',flush=True)
        key=getpass.getpass('DeepSeek API key (hidden): ').strip()
    if not re.fullmatch(r'sk-[a-zA-Z0-9_-]{16,200}',key):
        raise RuntimeError('A valid DeepSeek API key is required; no files were switched')
    return key


def verify_deepseek(key):
    request=urllib.request.Request('https://api.deepseek.com/user/balance',headers={'Authorization':'Bearer '+key,'User-Agent':UA})
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            data=json.loads(response.read(100_000))
        if data.get('is_available') is not True:
            raise RuntimeError('DeepSeek account has no available balance; no switch performed')
    except urllib.error.HTTPError as error:
        raise RuntimeError('DeepSeek rejected the server connection (HTTP '+str(error.code)+'); verify the key and balance') from None


def ensure_node():
    global NODE_BINARY
    def supported(executable):
        if not executable:return False
        try:result=subprocess.run([executable,'-e',"if(parseInt(process.versions.node)<18||typeof fetch!=='function')process.exit(1)"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        except OSError:return False
        return result.returncode==0
    system_node=shutil.which('node')
    if system_node and any(parent in Path(system_node).resolve().parents for parent in [Path('/root'),Path('/home')]):system_node=None
    for candidate in [str(BASE/'runtime/node'),'/usr/bin/node','/usr/local/bin/node',system_node]:
        if supported(candidate):NODE_BINARY=candidate;return
    # Use an official LTS binary when the OS repository offers an obsolete Node.
    arch={'x86_64':'x64','aarch64':'arm64'}.get(platform.machine())
    if arch is None:raise RuntimeError('Automatic Node installation supports x86_64 and arm64')
    origin='https://nodejs.org/dist/latest-v22.x/'
    with urllib.request.urlopen(origin+'SHASUMS256.txt',timeout=45) as response:checksums=response.read(200_000).decode()
    matches=re.findall(r'(?m)^([a-f0-9]{64})\s+(node-v22\.\d+\.\d+-linux-'+arch+r'\.tar\.xz)$',checksums)
    if len(matches)!=1:raise RuntimeError('Official Node LTS checksum not found')
    checksum,name=matches[0]
    print('Installing official Node LTS runtime...',flush=True)
    runtime=BASE/'runtime';runtime.mkdir(exist_ok=True,mode=0o755)
    with tempfile.TemporaryFile() as archive:
        digest=hashlib.sha256();size=0
        with urllib.request.urlopen(origin+name,timeout=90) as response:
            while True:
                chunk=response.read(65536)
                if not chunk:break
                size+=len(chunk)
                if size>70_000_000:raise RuntimeError('Node archive exceeds expected size')
                digest.update(chunk);archive.write(chunk)
        if digest.hexdigest()!=checksum:raise RuntimeError('Node archive checksum mismatch')
        archive.seek(0)
        with tarfile.open(fileobj=archive,mode='r:xz') as tar:
            member=tar.getmember(name.removesuffix('.tar.xz')+'/bin/node')
            if not member.isfile() or member.size>150_000_000:raise RuntimeError('Unexpected Node binary')
            with tar.extractfile(member) as source,open(runtime/'node.next','wb') as output:shutil.copyfileobj(source,output)
        (runtime/'node.next').chmod(0o755)
        if not supported(str(runtime/'node.next')):raise RuntimeError('Node LTS is incompatible with this OS; previous site is unchanged')
        os.replace(runtime/'node.next',runtime/'node')
    NODE_BINARY=str(runtime/'node')


def configure_lisa(key):
    LISA_ENV.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
    LISA_ENV.write_text('DEEPSEEK_API_KEY='+key+'\n');LISA_ENV.chmod(0o600)
    node=NODE_BINARY or shutil.which('node')
    common='''[Unit]
Description=FOT Lisa DeepSeek
After=network-online.target
Wants=network-online.target
[Service]
User=fottraining
Group=fottraining
WorkingDirectory=/opt/fot-manager-training/current
EnvironmentFile=/etc/fot-manager-training/lisa.env
Environment=LISA_DATABASE=/var/lib/fot-manager-training/lisa.sqlite3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/fot-manager-training
'''
    LISA_UNIT.write_text(common+'ExecStart='+node+' /opt/fot-manager-training/current/lisa-server.mjs\nRestart=on-failure\nRestartSec=3\n[Install]\nWantedBy=multi-user.target\n')
    LISA_REFRESH_UNIT.write_text(common+'Type=oneshot\nExecStart='+node+' /opt/fot-manager-training/current/lisa-server.mjs --refresh\nTimeoutStartSec=600\n')
    LISA_TIMER.write_text('''[Unit]
Description=Daily Lisa bank catalogue refresh
[Timer]
OnCalendar=*-*-* 08:00:00 Europe/Moscow
Persistent=true
RandomizedDelaySec=120
[Install]
WantedBy=timers.target
''')
    for path in [LISA_UNIT,LISA_REFRESH_UNIT,LISA_TIMER]:path.chmod(0o644)


def wait_lisa():
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8767/api/lisa/health',timeout=5) as response:
                health=json.loads(response.read(100_000))
            if health.get('ready') and health.get('provider')=='deepseek' and health.get('knowledge',{}).get('chunks',0)>0:return
        except Exception:pass
        time.sleep(1)
    try:state=command('systemctl','show',LISA_SERVICE,'--property=ActiveState,SubState,ExecMainStatus,Result').replace('\n','; ')
    except Exception:state='Service status unavailable'
    raise RuntimeError('Local DeepSeek agent failed its health check ('+state+'); restoring previous release')


def command(*args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout.strip()


def local_json(path):
    return json.loads(download('http://127.0.0.1:8766' + path, 200_000)[0])


def switch(target):
    temporary = BASE / 'current.cloud-next'
    if temporary.exists() or temporary.is_symlink():
        raise RuntimeError('A previous deployment is still pending: ' + str(temporary))
    temporary.symlink_to(target)
    os.replace(temporary, BASE / 'current')


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run this installer as root in the VPS console')
    with open('/run/lock/fot-manager-training-upgrade.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        install()


def install():
    current = BASE / 'current'
    if not current.is_symlink():
        raise RuntimeError('Expected an existing installation with current as a symlink')
    previous = current.resolve(strict=True)
    if BASE / 'releases' not in previous.parents or not (previous / 'server.py').is_file():
        raise RuntimeError('The existing installation does not match the expected structure')
    nginx = NGINX
    service = SERVICE_FILE
    if not nginx.is_file() or '/opt/fot-manager-training/current/public' not in nginx.read_text() or not service.is_file() or '/opt/fot-manager-training/current/server.py' not in service.read_text():
        raise RuntimeError('Custom server configuration requires inspection before upgrading')
    next_nginx=patch_nginx(nginx.read_text())
    command('nginx', '-t')
    command('systemctl', 'is-active', SERVICE)
    if not local_json('/api/health').get('ready'):
        raise RuntimeError('The existing statistics backend is not healthy')
    before = local_json('/api/training/completions')['counts']
    print('Preparing same-origin Lisa with direct DeepSeek access...',flush=True)
    cloud_access = False
    runtime_key = deepseek_key()
    verify_deepseek(runtime_key)
    ensure_node()
    manifest = read_manifest(download(MANIFEST_URL, 2_000_000)[0], MANIFEST_SHA256)
    ensure_dependencies()
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(os.getpid())
    release = BASE / 'releases' / (stamp + '-cloud-agent')
    release.mkdir(mode=0o755)
    print('Downloading and verifying', len(manifest['files']), 'files...', flush=True)
    try:
        stage_files(manifest, release / 'public')
        stage_backend(manifest,release,previous)
        (release / 'cases.json').write_text(json.dumps(manifest['cases'], ensure_ascii=False))
        (release / 'cases.json').chmod(0o644)
        info = {'release': manifest['release'], 'cloud_source_commit': manifest['source_commit'], 'assistant': 'local-deepseek', 'statistics': 'existing-local-database', 'installed_at': stamp, 'vps_cloud_access': cloud_access, 'file_uploads': True, 'same_origin_chat': True}
        (release / 'public' / 'deployment-info.json').write_text(json.dumps(info))
        (release / 'public' / 'deployment-info.json').chmod(0o644)
    except BaseException:
        shutil.rmtree(release)
        raise
    backup = BACKUPS / (stamp + '-before-cloud-agent')
    backup.mkdir(parents=True, mode=0o700)
    backup.chmod(0o700)
    if not (DATA / 'completions.sqlite3').is_file() or not (DATA / 'visitor-hash.key').is_file():
        raise RuntimeError('Statistics database or visitor key is missing; no switch performed')
    with sqlite3.connect('file:' + str(DATA / 'completions.sqlite3') + '?mode=ro', uri=True) as source:
        with sqlite3.connect(backup / 'completions.sqlite3') as target:
            source.backup(target)
    (backup / 'completions.sqlite3').chmod(0o600)
    for src, dest in [(nginx, 'nginx.conf'), (service, 'service.conf'), (DATA / 'visitor-hash.key', 'visitor-hash.key')]:
        shutil.copy2(src, backup / dest)
        (backup / dest).chmod(0o600)
    runtime_previous = {path: path.read_bytes() if path.exists() else None for path in [LISA_UNIT,LISA_REFRESH_UNIT,LISA_TIMER,LISA_ENV]}
    for index,(path,content) in enumerate(runtime_previous.items()):
        if content is not None:
            (backup/('lisa-config-'+str(index))).write_bytes(content);(backup/('lisa-config-'+str(index))).chmod(0o600)
    rollback = '#!/bin/sh\nset -eu\ncp '+shlex.quote(str(backup/'nginx.conf'))+' /etc/nginx/sites-available/fot-manager-training.ru\nnginx -t\nsystemctl reload nginx\nln -s ' + shlex.quote(str(previous)) + ' /opt/fot-manager-training/current.rollback\nmv -Tf /opt/fot-manager-training/current.rollback /opt/fot-manager-training/current\nsystemctl restart fot-manager-training.service\n'
    rollback = rollback.replace('set -eu\n','set -eu\nsystemctl stop fot-lisa-refresh.timer fot-lisa.service || true\n',1)
    for index,(path,content) in enumerate(runtime_previous.items()):
        rollback += ('cp '+shlex.quote(str(backup/('lisa-config-'+str(index))))+' '+shlex.quote(str(path))+'\n') if content is not None else ('rm -f '+shlex.quote(str(path))+'\n')
    rollback += 'systemctl daemon-reload\n'
    if runtime_previous[LISA_UNIT] is not None:rollback += 'systemctl restart fot-lisa.service\n'
    if runtime_previous[LISA_TIMER] is not None:rollback += 'systemctl restart fot-lisa-refresh.timer\n'
    (backup / 'rollback.sh').write_text(rollback)
    (backup / 'rollback.sh').chmod(0o700)
    print('Backup:', backup, flush=True)
    switch(release)
    try:
        configure_lisa(runtime_key)
        command('systemctl','daemon-reload')
        command('systemctl','enable',LISA_SERVICE,'fot-lisa-refresh.timer')
        command('systemctl','restart',LISA_SERVICE)
        command('systemctl','restart','fot-lisa-refresh.timer')
        wait_lisa()
        command('systemctl', 'restart', SERVICE)
        for attempt in range(20):
            try:
                if local_json('/api/health').get('ready'):
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Updated backend failed to start')
        if not local_json('/api/lisa/attachments/health').get('ready'):
            raise RuntimeError('Attachment recognition dependencies are not ready')
        nginx.write_text(next_nginx)
        command('nginx','-t')
        command('systemctl','reload','nginx')
        after = local_json('/api/training/completions')['counts']
        if any(after.get(segment, -1) < total for segment, total in before.items()):
            raise RuntimeError('Statistics check failed')
        served = download('http://127.0.0.1:8766/lisa-chat.js', 300_000)[0]
        expected = next(e['sha256'] for e in manifest['files'] if e['path'] == 'lisa-chat.js')
        if hashlib.sha256(served).hexdigest() != expected:
            raise RuntimeError('Updated chat interface was not served')
    except BaseException:
        try:command('systemctl','stop','fot-lisa-refresh.timer',LISA_SERVICE)
        except Exception:pass
        switch(previous)
        for path,content in runtime_previous.items():
            if content is None:path.unlink(missing_ok=True)
            else:path.write_bytes(content)
        command('systemctl','daemon-reload')
        if runtime_previous[LISA_UNIT] is not None:command('systemctl','restart',LISA_SERVICE)
        if runtime_previous[LISA_TIMER] is not None:command('systemctl','restart','fot-lisa-refresh.timer')
        command('systemctl', 'restart', SERVICE)
        shutil.copy2(backup/'nginx.conf',nginx)
        command('nginx','-t')
        command('systemctl','reload','nginx')
        raise
    try:
        command('systemctl','start','--no-block','fot-lisa-refresh.service')
        print('Company and employee bank conditions refresh started in the background.',flush=True)
    except Exception:
        print('Initial bank refresh could not start; the daily timer remains enabled.',flush=True)
    print('READY:', DOMAIN)
    print('Lisa uses DeepSeek directly on this domain. Photo uploads, OCR and streaming are enabled.')
    print('Statistics preserved:', json.dumps(after, ensure_ascii=False))
    print('Rollback:', backup / 'rollback.sh')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Upgrade stopped:', error, file=sys.stderr)
        sys.exit(1)
