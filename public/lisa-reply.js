export function cleanLisaReply(value){return String(value||'').replace(/^Основа сравнения:[\s\S]*?(?:\n\n|$)/u,'').trim()}
export function hasAnswerContent(value){return cleanLisaReply(value).replace(/^#{1,6}\s+.*$/gm,'').replace(/Неполный ответ\.?/g,'').trim().length>15}
