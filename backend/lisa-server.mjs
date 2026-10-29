import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {setDefaultResultOrder} from 'node:dns';

globalThis.crypto??=webcrypto;
setDefaultResultOrder('ipv4first');
if(!AbortSignal.any)AbortSignal.any=signals=>{const c=new AbortController();for(const s of signals){if(s.aborted){c.abort(s.reason);break}s.addEventListener('abort',()=>c.abort(s.reason),{once:true})}return c.signal};
const here=fileURLToPath(new URL('.',import.meta.url));
const DOMAIN='https://fot-manager-training.ru';

// Alternate verified HTTPS client for official pages when Node's TLS/DNS client fails.
const BANK_HTML_PYTHON=String.raw`
import sys,json,urllib.request,urllib.parse,urllib.error,ssl
data=json.load(sys.stdin)
domain=data['domain']
def allowed(url):
 u=urllib.parse.urlsplit(url)
 return u.scheme=='https' and not u.username and not u.password and (u.port in (None,443)) and (u.hostname==domain or (u.hostname or '').endswith('.'+domain))
if not allowed(data['url']):raise ValueError('URL_NOT_ALLOWED')
class SafeRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if not allowed(newurl):raise ValueError('REDIRECT_NOT_ALLOWED')
  return super().redirect_request(req,fp,code,msg,headers,newurl)
opener=urllib.request.build_opener(SafeRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
try:
 request=urllib.request.Request(data['url'],headers={'User-Agent':'FOTSalaryCatalog/3.0 (+https://fot-manager-training.ru)','Accept':'text/html','Accept-Language':'ru-RU,ru;q=0.9'})
 with opener.open(request,timeout=12) as response:
  if 'html' not in response.headers.get_content_type():raise ValueError('CONTENT_TYPE')
  raw=response.read(2500001)
  if len(raw)>2500000:raise ValueError('PAGE_SIZE')
  result={'raw':raw.decode(response.headers.get_content_charset() or 'utf-8',errors='replace'),'url':response.url}
except Exception as error:
 result={'error':('HTTP_'+str(error.code)) if isinstance(error,urllib.error.HTTPError) else 'OFFICIAL_PAGE_UNAVAILABLE'}
print(json.dumps(result,ensure_ascii=False))
`;
export function officialHtmlFallback(target){
 const allowed=new Set(['vtb.ru','alfabank.ru','tbank.ru','gazprombank.ru','psbank.ru','raiffeisen.ru','domrfbank.ru']);
 const url=new URL(target.url);if(!allowed.has(target.domain)||url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!(url.hostname===target.domain||url.hostname.endsWith('.'+target.domain)))return Promise.reject(Error('URL_NOT_ALLOWED'));
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.LISA_PYTHON||'/usr/bin/python3',['-c',BANK_HTML_PYTHON],{env:process.env,stdio:['pipe','pipe','ignore']});const chunks=[];let size=0;const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>6000000)child.kill('SIGKILL');else chunks.push(chunk)});child.once('error',reject);
  child.once('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('OFFICIAL_PAGE_UNAVAILABLE'));try{const data=JSON.parse(Buffer.concat(chunks).toString());if(data.error)return reject(Error(data.error));if(typeof data.raw!=='string'||!data.url)return reject(Error('CONTENT_TYPE'));resolve(data)}catch{reject(Error('OFFICIAL_PAGE_UNAVAILABLE'))}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({url:target.url,domain:target.domain}));
 });
}

export function sqliteDatabase({database=process.env.LISA_DATABASE,python=process.env.LISA_PYTHON||'/usr/bin/python3'}={}){
 const execute=data=>new Promise((resolve,reject)=>{
  const child=spawn(python,[here+'lisa-db.py'],{env:{...process.env,...(database?{LISA_DATABASE:database}:{})},stdio:['pipe','pipe','ignore']});
  const chunks=[];let size=0;const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2000000)child.kill('SIGKILL');else chunks.push(chunk)});
  child.once('error',reject);child.once('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('BANK_DATABASE_UNAVAILABLE'));try{resolve(JSON.parse(Buffer.concat(chunks).toString()))}catch{reject(Error('BANK_DATABASE_INVALID'))}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
 });
 return {seed:records=>execute({seed:records}),prepare(sql){let params=[];return {bind(...values){params=values;return this},all(){return execute({sql,params})},run(){return execute({sql,params})}}}};
}

export function startLisaServer({worker,env,port=8767,host='127.0.0.1'}={}){
 const server=http.createServer(async(req,res)=>{
  const abort=new AbortController();res.on('close',()=>{if(!res.writableFinished)abort.abort()});
  const fail=(code,message)=>{if(res.headersSent){res.end();return}res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({message}))};
  try{
   const path=new URL(req.url,DOMAIN).pathname;
   if(!path.startsWith('/api/lisa/'))return fail(404,'Адрес не найден.');
   if(Number(req.headers['content-length']||0)>600000)return fail(413,'Сообщение слишком большое.');
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>600000)return fail(413,'Сообщение слишком большое.');chunks.push(chunk)}
   const headers=new Headers();for(const name of ['origin','content-type','user-agent'])if(req.headers[name])headers.set(name,String(req.headers[name]));
   // Nginx is the sole public entrypoint; ignore visitor-supplied CF/IP headers.
   const peer=req.socket.remoteAddress;const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
   headers.set('CF-Connecting-IP',local?String(req.headers['x-real-ip']||peer):peer);
   const body=Buffer.concat(chunks);const request=new Request(new URL(req.url,DOMAIN),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body}:{}),signal:abort.signal});
   const response=await worker.fetch(request,env);if(abort.signal.aborted)return;
   res.writeHead(response.status,Object.fromEntries(response.headers));res.flushHeaders();
   if(req.method==='HEAD'||!response.body)return res.end();
   const reader=response.body.getReader();
   try{while(!abort.signal.aborted){const {done,value}=await reader.read();if(done)break;if(!res.write(value))await Promise.race([once(res,'drain'),once(res,'close')])}}
   finally{await reader.cancel().catch(()=>{})}res.end();
  }catch{if(!abort.signal.aborted)fail(502,'Лиса временно недоступна. Сообщение сохранено — повторите отправку.');else res.end()}
 });
 server.requestTimeout=180000;server.headersTimeout=30000;server.listen(port,host);return server;
}

export async function main(){
 const {default:worker,refreshBankCatalog}=await import('./lisa-worker.mjs');
 const DB=sqliteDatabase();await DB.seed(JSON.parse(readFileSync(here+'bank-seed.json','utf8')));
 const env={DB,LISA_PROVIDER:'deepseek',DEEPSEEK_MODEL:'deepseek-chat',DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY||'',BANK_FETCH_HTML:officialHtmlFallback};
 if(process.argv.includes('--refresh')){const result=await refreshBankCatalog(env);console.log(JSON.stringify({status:result.status,banks:result.banks?.map(b=>({id:b.id,status:b.status,checkedAt:b.checkedAt,audiences:Object.fromEntries(Object.entries(b.audiences).map(([key,r])=>[key,{checkedAt:r.checkedAt,status:r.status}]))}))}));if(result.status!==200)process.exitCode=1;return}
 const port=process.env.LISA_PORT===undefined?8767:Number(process.env.LISA_PORT);
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('LISA_PORT_INVALID');
 const server=startLisaServer({worker,env,port});server.once('listening',()=>console.log('Lisa DeepSeek API ready on loopback port '+server.address().port+'.'));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))main().catch(error=>{const code=String(error?.code||error?.message||'STARTUP_FAILED');console.error('Lisa startup failed: '+(/^[A-Z0-9_]+$/.test(code)?code:'STARTUP_FAILED')+'. Check runtime configuration.');process.exitCode=1});
