#!/usr/bin/env python3
"""Upgrade the existing domain installation to the verified cloud frontend.

Run as root on the existing VPS. The agent, secrets and bank refresh remain
in Sites. Domain completion counters and the visitor key stay on this VPS.
"""
import concurrent.futures
import fcntl
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
import time
import urllib.parse
import urllib.request
import urllib.error

CLOUD = 'https://fot-practice-km.c8cpv86h5k.chatgpt.site'
DOMAIN = 'https://fot-manager-training.ru'
SOURCE_REF = '67d6c90026c76fba88b3a16c1dbf4f8fe07caeb7'
RAW = 'https://raw.githubusercontent.com/fot-manager-training/fot-manager-training/' + SOURCE_REF
FILES = RAW + '/public/'
MANIFEST_URL = RAW + '/manifest.json'
MANIFEST_SHA256 = '48cd44104e80228ecf33531209e5941edf169501403a82658be53940bb2b4ad6'
BASE = Path('/opt/fot-manager-training')
DATA = Path('/var/lib/fot-manager-training')
BACKUPS = Path('/var/backups/fot-manager-training')
SERVICE = 'fot-manager-training.service'
NGINX = Path('/etc/nginx/sites-available/fot-manager-training.ru')
SERVICE_FILE = Path('/etc/systemd/system/' + SERVICE)
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'


def download(url, maximum, headers=None, method=None):
    if not (url.startswith(CLOUD + '/') or url.startswith(FILES) or url == MANIFEST_URL or url.startswith('http://127.0.0.1:8766/')):
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
    command('nginx', '-t')
    command('systemctl', 'is-active', SERVICE)
    if not local_json('/api/health').get('ready'):
        raise RuntimeError('The existing statistics backend is not healthy')
    before = local_json('/api/training/completions')['counts']
    print('Checking cloud agent and domain access...', flush=True)
    cloud_access = True
    try:
        for origin in [DOMAIN, 'https://www.fot-manager-training.ru']:
            body, headers = download(CLOUD + '/api/lisa/health', 200_000, {'Origin': origin})
            if not json.loads(body).get('ready') or headers.get('Access-Control-Allow-Origin') != origin:
                raise RuntimeError('Cloud agent is not ready for the domain')
            _, headers = download(CLOUD + '/api/lisa/chat', 200_000, {'Origin': origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'}, 'OPTIONS')
            if headers.get('Access-Control-Allow-Origin') != origin or 'POST' not in headers.get('Access-Control-Allow-Methods', ''):
                raise RuntimeError('Cloud agent chat access is not ready for the domain')
    except urllib.error.HTTPError as error:
        if error.code != 403:
            raise
        cloud_access = False
        print("Cloud API returned HTTP 403 from this VPS. Files will download from GitHub. The chat connects directly from the visitor browser; browser verification is required.", flush=True)
    manifest = read_manifest(download(MANIFEST_URL, 2_000_000)[0], MANIFEST_SHA256)
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(os.getpid())
    release = BASE / 'releases' / (stamp + '-cloud-agent')
    release.mkdir(mode=0o755)
    print('Downloading and verifying', len(manifest['files']), 'files...', flush=True)
    try:
        stage_files(manifest, release / 'public')
        shutil.copy2(previous / 'server.py', release / 'server.py')
        (release / 'server.py').chmod(0o644)
        (release / 'cases.json').write_text(json.dumps(manifest['cases'], ensure_ascii=False))
        (release / 'cases.json').chmod(0o644)
        info = {'release': manifest['release'], 'cloud_source_commit': manifest['source_commit'], 'assistant': 'cloud-lisa', 'statistics': 'existing-local-database', 'installed_at': stamp, 'vps_cloud_access': cloud_access}
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
    rollback = '#!/bin/sh\nset -eu\nln -s ' + shlex.quote(str(previous)) + ' /opt/fot-manager-training/current.rollback\nmv -Tf /opt/fot-manager-training/current.rollback /opt/fot-manager-training/current\nsystemctl restart fot-manager-training.service\n'
    (backup / 'rollback.sh').write_text(rollback)
    (backup / 'rollback.sh').chmod(0o700)
    print('Backup:', backup, flush=True)
    switch(release)
    try:
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
        after = local_json('/api/training/completions')['counts']
        if any(after.get(segment, -1) < total for segment, total in before.items()):
            raise RuntimeError('Statistics check failed')
        served = download('http://127.0.0.1:8766/lisa-chat.js', 300_000)[0]
        expected = next(e['sha256'] for e in manifest['files'] if e['path'] == 'lisa-chat.js')
        if hashlib.sha256(served).hexdigest() != expected:
            raise RuntimeError('Updated chat interface was not served')
    except BaseException:
        switch(previous)
        command('systemctl', 'restart', SERVICE)
        raise
    print('READY:', DOMAIN)
    print('Select ККСБ, then click the 3D fox to open Lisa.')
    print('Statistics preserved:', json.dumps(after, ensure_ascii=False))
    print('Rollback:', backup / 'rollback.sh')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Upgrade stopped:', error, file=sys.stderr)
        sys.exit(1)
