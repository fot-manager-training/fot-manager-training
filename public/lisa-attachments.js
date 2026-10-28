export const MAX_ATTACHMENT_BYTES=10*1024*1024;
export const MAX_ATTACHMENT_TEXT=18000;
export const ATTACHMENT_ACCEPT='.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.csv';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+' МБ':Math.ceil(n/1024)+' КБ';
export function attachmentMarkup(files=[]){return files.map(a=>`<details class="lisa-message-attachment"><summary>▧ ${esc(a.name)} <small>${size(a.size||0)}${a.method==='ocr'?' · распознано с изображения':''}</small></summary><p>${esc((a.warnings||[]).join(' '))}${a.userEdited?' Текст исправлен КМ.':''}</p><pre>${esc(a.text)}</pre></details>`).join('')}
export function packAttachmentMessages(messages){
 let remaining=60000;
 return messages.slice(-40).map(m=>({role:m.role,content:m.content,attachments:m.role==='user'?m.attachments||[]:[]})).reverse().map(m=>{
  const attachments=[];let omitted=false;
  for(const a of m.attachments){if(!a||typeof a.text!=='string'||typeof a.name!=='string')continue;const text=a.text.slice(0,Math.min(MAX_ATTACHMENT_TEXT,remaining));remaining-=text.length;if(!text){omitted=true;continue}attachments.push({id:a.id,name:a.name,mime:a.mime,size:a.size,text,method:a.method,userEdited:!!a.userEdited,truncated:!!a.truncated||text.length<a.text.length,warnings:(a.warnings||[]).slice(0,6)})}
  return {role:m.role,content:m.content+(omitted?'\n[Текст прежних вложений не помещается в контекст; при необходимости попросите приложить нужные страницы ещё раз.]':''),...(attachments.length?{attachments}:{})};
 }).reverse();
}
export function createAttachmentManager({url,notice}){
 const drafts=new Map(),chains=new Map();let mounted=null;
 const rows=id=>{if(!drafts.has(id))drafts.set(id,[]);return drafts.get(id)};
 function draw(){
  if(!mounted?.form.isConnected)return;const {form,id,isBusy}=mounted,slot=form.querySelector('.lisa-attachment-drafts');if(!slot)return;
  slot.innerHTML=rows(id).map(r=>`<article class="lisa-attachment-draft is-${r.status}"><div><strong>${esc(r.name)}</strong><small>${r.status==='ready'?(r.attachment.method==='ocr'?'Распознано · проверьте цифры':'Текст извлечён'):r.status==='reading'?'Распознаём условия…':r.status==='waiting'?'Ожидает распознавания':esc(r.error||'Не удалось прочитать файл')} · ${size(r.size)}</small></div><button type="button" data-remove-attachment="${r.id}" aria-label="Убрать файл ${esc(r.name)}">×</button>${r.status==='error'?`<button type="button" data-retry-attachment="${r.id}">Повторить</button>`:''}${r.status==='ready'?`<details><summary>Проверить распознанный текст</summary><p>${esc((r.attachment.warnings||[]).join(' '))}</p><textarea data-edit-attachment="${r.id}" maxlength="18000" rows="5" aria-label="Условия из файла ${esc(r.name)}">${esc(r.attachment.text)}</textarea></details>`:''}</article>`).join('');
  slot.querySelectorAll('[data-remove-attachment]').forEach(b=>{b.disabled=isBusy();b.onclick=()=>{const r=rows(id).find(r=>r.id===b.dataset.removeAttachment);r?.controller?.abort();drafts.set(id,rows(id).filter(x=>x!==r));draw()}});
  slot.querySelectorAll('[data-retry-attachment]').forEach(b=>{b.disabled=isBusy();b.onclick=()=>{const r=rows(id).find(r=>r.id===b.dataset.retryAttachment);if(r?.file)enqueue(id,r)}});
  slot.querySelectorAll('[data-edit-attachment]').forEach(input=>input.oninput=()=>{const r=rows(id).find(r=>r.id===input.dataset.editAttachment);if(r){r.attachment.text=input.value;r.attachment.userEdited=true}});
  const button=form.querySelector('.lisa-attach');if(button)button.disabled=isBusy()||rows(id).length>=3;
 }
 function enqueue(id,r){
  r.status='waiting';r.error='';draw();const job=(chains.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(!rows(id).includes(r)||!r.file)return;
   r.status='reading';r.controller=new AbortController();draw();const timer=setTimeout(()=>r.controller.abort(),150000);
   try{
    const body=new FormData();body.append('file',r.file,r.name);
    const response=await fetch(url,{method:'POST',body,signal:r.controller.signal});
    let result;try{result=await response.json()}catch{throw new Error(response.status===413?'Файл больше допустимого размера.':'Сервис загрузки временно недоступен. Попробуйте позже.')}
    if(!response.ok)throw new Error([404,405].includes(response.status)?'Загрузка файлов временно недоступна. Попробуйте позже.':result.message||'Не удалось прочитать файл.');
    const a=result.attachment;if(!a||typeof a.text!=='string'||!a.text.trim()||a.text.length>MAX_ATTACHMENT_TEXT||typeof a.name!=='string')throw new Error('Не удалось прочитать условия из файла.');
    if(!rows(id).includes(r)||r.controller.signal.aborted)return;r.attachment=a;r.status='ready';r.file=null;
   }catch(error){if(rows(id).includes(r)){r.status='error';r.error=r.controller.signal.aborted?'Распознавание остановлено. Можно повторить.':error.message}}
   finally{clearTimeout(timer);r.controller=null;draw()}
  });chains.set(id,job);
 }
 function add(files,id){
  if(mounted?.isBusy())return notice('Дождитесь ответа Лисы, затем добавьте файл.');
  if(!files.length)return;if(rows(id).length+files.length>3)return notice('К одному сообщению можно прикрепить до трёх файлов.');
  for(const f of files){const ext='.'+f.name.split('.').at(-1).toLowerCase();if(!ATTACHMENT_ACCEPT.split(',').includes(ext))return notice('Поддерживаются JPG, PNG, WebP, PDF, DOCX, XLSX, PPTX, TXT и CSV.');if(!f.size||f.size>MAX_ATTACHMENT_BYTES)return notice('Каждый файл должен быть непустым и не больше 10 МБ.')}
  notice('');for(const f of files){const r={id:crypto.randomUUID(),name:f.name,size:f.size,file:f,status:'waiting'};rows(id).push(r);enqueue(id,r)}draw();
 }
 return {
  bind(form,id,isBusy){mounted={form,id,isBusy};const input=form.querySelector('.lisa-file-input');input.accept=ATTACHMENT_ACCEPT;input.onchange=()=>{add([...input.files],id);input.value=''};form.querySelector('.lisa-attach').onclick=()=>input.click();form.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();form.classList.add('is-file-dragover')}});form.addEventListener('dragleave',e=>{if(!form.contains(e.relatedTarget))form.classList.remove('is-file-dragover')});form.addEventListener('drop',e=>{if(e.dataTransfer?.files.length){e.preventDefault();form.classList.remove('is-file-dragover');add([...e.dataTransfer.files],id)}});form.querySelector('.lisa-composer-input').addEventListener('paste',e=>{const files=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(files.length){if(!e.clipboardData.getData('text/plain'))e.preventDefault();add(files,id)}});draw()},
  take(id){const list=rows(id);if(list.some(r=>r.status!=='ready'))throw new Error('Дождитесь распознавания или уберите файл, который не удалось прочитать.');if(list.some(r=>!r.attachment.text.trim()))throw new Error('Вложение не содержит текста. Дополните его или уберите.');const result=list.map(r=>({...r.attachment}));drafts.set(id,[]);draw();return result},
  has(id){return rows(id).length>0},
  restore(id,files){drafts.set(id,files.map(a=>({id:crypto.randomUUID(),name:a.name,size:a.size,status:'ready',attachment:a})));draw()},
  refresh:draw,
  cancel(id){for(const r of rows(id))r.controller?.abort()},
  discard(id){for(const r of rows(id))r.controller?.abort();drafts.delete(id)}
 };
}
