export const FEEDBACK_URL='https://polly.events/events/c73f306a-a0e9-4ed8-84f2-3ff39bf158a3';
const API='https://fot-practice-km.c8cpv86h5k.chatgpt.site/api/training/completions';
const QUEUE='fot-completion-pending-v1',ACK='fot-completion-sent-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=segment=>({kksb:'ККСБ',rgs:'РГС',mmb:'ММБ'})[segment]||'';
let sending=null,onlineBound=false;const memory={},displayed={};
const load=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}};
const store=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
export function completionCounterMarkup(segment){return `<section class="completion-counter" data-completion-counter="${esc(segment)}" aria-label="Количество завершений кейса ${label(segment)}"><span class="completion-counter-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6M4 21h16"/></svg></span><div><span>Завершили кейс ${label(segment)}</span><strong data-completion-count="${esc(segment)}" aria-live="polite">…</strong><small data-completion-status>Уникальных прохождений</small></div></section>`}
export function feedbackMarkup(modal=false){return `<section class="training-feedback ${modal?'is-modal':''}"><div class="feedback-copy"><span class="feedback-kicker">Нам очень нужна ваша обратная связь</span><h2${modal?' id="feedback-dialog-title"':''}>Не уходите<br>без <em>оценки!</em></h2><p>Пожалуйста, оцените обучение. Что понравилось, а что стоит улучшить? Ваш отклик поможет сделать платформу полезнее для КМ.</p><a class="button feedback-action" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">Оценить обучение <span aria-hidden="true">↗</span></a><small>Перейдите по ссылке или отсканируйте QR-код.</small></div><a class="feedback-qr" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer" aria-label="Открыть форму оценки обучения в Polly"><img src="/assets/feedback/polly-qr.svg" width="184" height="184" alt="QR-код: оценить обучение в Polly"><span>Наведите камеру<br>и поделитесь впечатлениями</span></a></section>`}
function paintCount(segment,total){displayed[segment]=Math.max(displayed[segment]||0,total);total=displayed[segment];for(const node of document.querySelectorAll('[data-completion-count]'))if(node.dataset.completionCount===segment){node.textContent=new Intl.NumberFormat('ru-RU').format(total);const status=node.closest('[data-completion-counter]')?.querySelector('[data-completion-status]');if(status)status.textContent='Уникальных прохождений'}}
async function refreshCounts(){try{const response=await fetch(API,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const data=await response.json();for(const [segment,total] of Object.entries(data.counts||{}))if(Number.isInteger(total)&&total>=0)paintCount(segment,total)}catch{document.querySelectorAll('[data-completion-status]').forEach(el=>el.textContent='Счётчик временно недоступен')}}
async function flush(){
 if(sending)return sending;
 sending=(async()=>{
  const queue={...load(QUEUE),...memory};
  for(const [segment,payload] of Object.entries(queue))try{
   const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   if(!response.ok)continue;const data=await response.json();if(data.segment!==segment||!Number.isInteger(data.total))continue;
   paintCount(segment,data.total);if(memory[segment]?.attempt.id===payload.attempt.id)delete memory[segment];const sent=load(ACK);sent[segment]=payload.attempt.id;store(ACK,sent);const pending=load(QUEUE);if(pending[segment]?.attempt.id===payload.attempt.id){delete pending[segment];store(QUEUE,pending)}
  }catch{}
 })().finally(()=>{sending=null});return sending;
}
export function completionProof(segment,attempt){return {segment,attempt:{id:attempt.id,status:attempt.status,index:attempt.index,version:attempt.version,answers:attempt.answers,quiz:attempt.quiz}}}
export function initCompletion(root,{segment,attempt,prompt=false}={}){
 refreshCounts();
 if(attempt?.status==='done'&&load(ACK)[segment]!==attempt.id){const queue=load(QUEUE);queue[segment]=completionProof(segment,attempt);memory[segment]=queue[segment];store(QUEUE,queue)}
 flush();if(!onlineBound){onlineBound=true;window.addEventListener('online',()=>{flush();refreshCounts()})}
 if(prompt&&attempt?.status==='done'){
  const flag='fot-feedback-prompt-'+attempt.id;let seen=false;try{seen=sessionStorage.getItem(flag)==='1'}catch{}
  const target=root.querySelector('.training-feedback');
  if(!seen&&target)setTimeout(()=>{
   if(!target.isConnected||document.querySelector('.feedback-dialog[open]'))return;
   try{sessionStorage.setItem(flag,'1')}catch{}
   const dialog=document.createElement('dialog');dialog.className='feedback-dialog';dialog.setAttribute('aria-labelledby','feedback-dialog-title');dialog.innerHTML=`<button type="button" class="feedback-close" aria-label="Закрыть приглашение к оценке">×</button>${feedbackMarkup(true)}<button type="button" class="feedback-later">Оценю позже</button>`;document.body.append(dialog);
   const previous=document.activeElement;dialog.querySelector('.feedback-close').onclick=()=>dialog.close();dialog.querySelector('.feedback-later').onclick=()=>dialog.close();dialog.querySelector('.feedback-action').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true})},{once:true});dialog.showModal();dialog.querySelector('.feedback-action').focus({preventScroll:true});
  },1000);
 }
}
