// Incremental SSE decoding shared by the server and chat interface.
export async function readEventStream(stream,onEvent,{signal}={}){
 if(!stream)throw new Error('Поток ответа недоступен.');
 const reader=stream.getReader(),decoder=new TextDecoder();let buffer='',stopped=false;
 const abort=()=>{stopped=true;reader.cancel().catch(()=>{})};
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 async function dispatch(frame){
  let event='message';const data=[];
  for(const line of frame.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''))}
  if(data.length&&await onEvent({event,data:data.join('\n')})===false)stopped=true;
 }
 try{
  while(!stopped){
   const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});buffer=buffer.replace(/\r\n/g,'\n');
   if(buffer.length>1048576)throw new Error('Неполный пакет ответа.');
   let end;while(!stopped&&(end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);await dispatch(frame)}
   if(done){if(!stopped&&buffer.trim())await dispatch(buffer);break}
  }
 }finally{signal?.removeEventListener('abort',abort);try{await reader.cancel()}catch{}reader.releaseLock()}
}

// Smooth short bursts without waiting for the complete model response.
export function createTextReveal(update,{reducedMotion=false,requestFrame=globalThis.requestAnimationFrame,cancelFrame=globalThis.cancelAnimationFrame}={}){
 let text='',shown=0,frame=null,last=0,stopped=false;const waiting=[];
 const settle=()=>{if(shown===text.length)while(waiting.length)waiting.shift()()};
 function paint(now){
  frame=null;if(stopped)return;
  if(!last||now-last>=24){
   shown=reducedMotion?text.length:Math.min(text.length,shown+Math.max(1,Math.ceil((text.length-shown)/10)));
   if(shown<text.length&&/[\uDC00-\uDFFF]/.test(text[shown]))shown++;
   update(text.slice(0,shown));last=now;
  }
  if(shown<text.length)frame=requestFrame(paint);else settle();
 }
 return {
  append(part){if(stopped)return;text+=part;if(frame===null)frame=requestFrame(paint)},
  finished(){return shown===text.length?Promise.resolve():new Promise(resolve=>waiting.push(resolve))},
  stop(){stopped=true;if(frame!==null)cancelFrame(frame);frame=null;shown=text.length;update(text);settle()}
 };
}
