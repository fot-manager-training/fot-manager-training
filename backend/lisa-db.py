#!/usr/bin/env python3
"""Private SQLite adapter for the local agent, invoked only over process stdin."""
import json
import os
from pathlib import Path
import sqlite3
import sys

data=json.load(sys.stdin)
path=Path(os.environ.get('LISA_DATABASE','/var/lib/fot-manager-training/lisa.sqlite3'))
with sqlite3.connect(path,timeout=15) as db:
    db.row_factory=sqlite3.Row
    db.executescript('''CREATE TABLE IF NOT EXISTS lisa_bank_catalog (
      bank_id TEXT PRIMARY KEY NOT NULL,content_json TEXT NOT NULL,status TEXT NOT NULL,last_attempt_at TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS lisa_bank_refresh (
      id TEXT PRIMARY KEY NOT NULL CHECK(id='main'),lease_until INTEGER NOT NULL,updated_at INTEGER NOT NULL);''')
    if data.get('seed'):
        for record in data['seed']:
            db.execute('INSERT OR IGNORE INTO lisa_bank_catalog VALUES (?,?,?,?,?)',
                       (record['id'],json.dumps(record,ensure_ascii=False),record.get('status','unavailable'),record.get('lastAttemptAt'),record.get('error')))
        result={}
    else:
        sql=data['sql']
        if 'lisa_bank_' not in sql or len(sql)>3000:
            raise ValueError('Unexpected local bank query')
        before=db.total_changes
        cursor=db.execute(sql,data.get('params',[]))
        rows=[dict(row) for row in cursor.fetchall()] if cursor.description else []
        result={'results':rows,'meta':{'changes':db.total_changes-before}}
print(json.dumps(result,ensure_ascii=False))
