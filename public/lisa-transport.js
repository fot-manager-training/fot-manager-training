const CLOUD='https://fot-practice-km.c8cpv86h5k.chatgpt.site';
export function lisaApiBase(location){return ['fot-manager-training.ru','www.fot-manager-training.ru'].includes(location.hostname)?location.origin+'/api/lisa':CLOUD+'/api/lisa'}
export async function lisaRequest(url,options={},fetcher=fetch){
 let response;
 try{response=await fetcher(url,options)}catch(error){if(error.name==='AbortError'||options.signal?.aborted)throw error;throw Error('Не удалось связаться с Лисой. Текст и распознанные файлы сохранены — повторите отправку.')}
 if(!response.ok){
  let data;try{data=await response.json()}catch{}
  throw Error(data?.message||([403,404,405].includes(response.status)?'На сервере недоступен обработчик чата. Требуется обновление подключения Лисы.':'Лиса временно недоступна. Текст и файлы сохранены — повторите отправку.'));
 }
 return response;
}
