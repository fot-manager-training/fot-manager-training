#!/usr/bin/env python3
"""Existing statistics backend plus bounded ephemeral file recognition."""
import email.policy
from email.parser import BytesParser
import hashlib
import hmac
import importlib.util
import json
import os
import shutil
import subprocess
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit

import training_core as training
from upload_extract import extract_attachment, ExtractionError, MAX_BYTES, EXTENSIONS

UPLOAD_ORIGINS={'https://fot-manager-training.ru','https://www.fot-manager-training.ru','https://fot-practice-km.c8cpv86h5k.chatgpt.site'}
LIMITS={}
LOCK=threading.Lock()
PROCESSING=threading.BoundedSemaphore(1)


def ready():
    if not all(shutil.which(command) for command in ['tesseract','pdfinfo','pdftotext','pdftoppm']):
        return False
    if not all(importlib.util.find_spec(name) for name in ['PIL','openpyxl']):
        return False
    try:
        langs=subprocess.run(['tesseract','--list-langs'],capture_output=True,text=True,timeout=5,check=True).stdout.splitlines()
        return 'rus' in langs and 'eng' in langs
    except (OSError,subprocess.SubprocessError):
        return False


class Handler(training.Handler):
    def upload_result(self,data,status=200):
        body=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        origin=self.headers.get('Origin')
        if origin in UPLOAD_ORIGINS:
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers','Content-Type')
            self.send_header('Vary','Origin')
        self.end_headers()
        if self.command!='HEAD':
            self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path=='/api/lisa/attachments/health':
            origin=self.headers.get('Origin')
            if origin and origin not in UPLOAD_ORIGINS:
                return self.upload_result({'message':'Источник запроса не разрешён.'},403)
            state=ready()
            return self.upload_result({'ready':state,'maxBytes':MAX_BYTES,'maxFiles':3,'extensions':sorted(EXTENSIONS)},200 if state else 503)
        return super().do_GET()

    def do_OPTIONS(self):
        if urlsplit(self.path).path.startswith('/api/lisa/attachments'):
            if self.headers.get('Origin') not in UPLOAD_ORIGINS:
                return self.upload_result({'message':'Источник запроса не разрешён.'},403)
            return self.upload_result({})
        return super().do_OPTIONS()

    def do_POST(self):
        if urlsplit(self.path).path!='/api/lisa/attachments':
            return super().do_POST()
        self.close_connection=True
        if self.headers.get('Origin') not in UPLOAD_ORIGINS:
            return self.upload_result({'message':'Источник запроса не разрешён.'},403)
        try:
            length=int(self.headers.get('Content-Length','0'))
        except ValueError:
            length=0
        if not 0<length<=MAX_BYTES+65536:
            return self.upload_result({'message':'Файл пустой или больше 10 МБ.'},413)
        content_type=self.headers.get('Content-Type','')
        if len(content_type)>300 or not content_type.lower().startswith('multipart/form-data;') or '\r' in content_type or '\n' in content_type:
            return self.upload_result({'message':'Ожидается загрузка одного файла.'},415)
        peer=training.normalize_ip(self.client_address[0])
        address=training.normalize_ip(self.headers.get('X-Real-IP',peer)) if training.TRUST_PROXY and peer in {'127.0.0.1','::1'} else peer
        if not address:
            return self.upload_result({'message':'Не удалось определить подключение.'},400)
        visitor=hmac.new(training.KEY,('upload\n'+address).encode(),hashlib.sha256).hexdigest()
        now=time.monotonic()
        with LOCK:
            start,count=LIMITS.get(visitor,(now,0))
            if now-start>600:
                start,count=now,0
            LIMITS[visitor]=(start,count+1)
            if len(LIMITS)>10000:
                LIMITS.clear()
            if count>=15:
                return self.upload_result({'message':'Слишком много загрузок. Повторите через несколько минут.'},429)
        if not PROCESSING.acquire(blocking=False):
            return self.upload_result({'message':'Сейчас распознаётся другой файл. Повторите загрузку через минуту.'},429)
        try:
            self.connection.settimeout(90)
            raw=self.rfile.read(length)
            if len(raw)!=length:
                return self.upload_result({'message':'Файл загрузился не полностью. Повторите отправку.'},400)
            message=BytesParser(policy=email.policy.default).parsebytes(('Content-Type: '+content_type+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
            if not message.is_multipart():
                return self.upload_result({'message':'Некорректная загрузка файла.'},400)
            parts=list(message.iter_parts())
            files=[part for part in parts if part.get_param('name',header='content-disposition')=='file' and part.get_filename()]
            if len(parts)>4 or len(files)!=1:
                return self.upload_result({'message':'Отправьте один файл за раз.'},400)
            part=files[0]
            data=part.get_payload(decode=True)
            if not isinstance(data,bytes) or len(data)>MAX_BYTES:
                return self.upload_result({'message':'Файл пустой или больше 10 МБ.'},413)
            attachment=extract_attachment(data,part.get_filename())
            return self.upload_result({'attachment':attachment})
        except (BrokenPipeError,ConnectionResetError):
            return
        except ExtractionError as error:
            return self.upload_result({'message':str(error)},422)
        except Exception:
            return self.upload_result({'message':'Не удалось обработать файл. Попробуйте другой формат или более чёткое фото.'},422)
        finally:
            PROCESSING.release()


if __name__=='__main__':
    training.initialize()
    server=ThreadingHTTPServer((os.environ.get('FOT_LISTEN_HOST','127.0.0.1'),int(os.environ.get('FOT_PORT','8766'))),Handler)
    print('FOT statistics and ephemeral attachment recognition ready.',flush=True)
    server.serve_forever()
