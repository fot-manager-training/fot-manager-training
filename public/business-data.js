import {businessCases} from './business-cases.js?v=20261021-2';
import {currentSegment} from './segments.js?v=20261021-2';
export const scenario=businessCases[currentSegment().id];
export const caseUrl=`/cases/${scenario.id}/`;
export const attemptKey=`fot-${scenario.id}-attempt`;
export const total=scenario.questions.length;
export function quizPassed(a){return !scenario.bonusQuiz||scenario.bonusQuiz.every((q,index)=>{const entry=a?.quiz?.answers?.[index],correct=q.options.flatMap((o,i)=>o[1]?[i]:[]);return entry?.correct===true&&Array.isArray(entry.selected)&&entry.selected.length===correct.length&&correct.every(i=>entry.selected.includes(i))})}
export function readAttempt(){try{
 const a=JSON.parse(localStorage.getItem(attemptKey)||'null');if(!a)return null;
 if(scenario.id==='mmb'&&a.version==='mmb-20261019-1'){
  const updatedIndex=scenario.questions.findIndex(q=>q.id==='meeting-1');
  if(a.index>=updatedIndex&&updatedIndex>=0){
   delete a.answers?.['meeting-1'];a.index=updatedIndex;a.view='question';a.status='active';delete a.finishedAt;
   a.updateNotice='Вопрос о начале встречи обновлён. Остальной прогресс сохранён — ответьте на этот вопрос ещё раз.';
  }
  a.version=scenario.version;
  localStorage.setItem(attemptKey,JSON.stringify(a));
 }
 const compatible=({kksb:['kksb-20261014-3','kksb-20261015-1'],rgs:['rgs-20261014-1','rgs-20261015-1']})[scenario.id]||[];
 if(a.version!==scenario.version&&compatible.includes(a.version)&&a.status==='active'){
  if(scenario.id==='kksb'&&a.version==='kksb-20261014-3'){const oldOrder=['prep-1','prep-2','prep-3','prep-4','prep-5','meeting-1','meeting-2','meeting-3','meeting-4','agreement-1','agreement-2'];a.index=scenario.questions.findIndex(q=>q.id===oldOrder[a.index])}
  a.version=scenario.version;
  if(scenario.bonusQuiz&&!quizPassed(a)){
   const quizIndex=scenario.questions.findIndex(q=>q.bonusAfter);
   if(a.quiz){a.quiz.completed=false;a.quiz.index=scenario.bonusQuiz.findIndex((q,index)=>!a.quiz.answers?.[index]?.correct);if(a.quiz.index<0)a.quiz.index=0;const entry=a.quiz.answers?.[a.quiz.index];if(entry&&!entry.correct)entry.checked=false}
   if(a.index>quizIndex){a.index=quizIndex;a.view='question'}
  }
  if(scenario.id==='rgs'&&a.index>scenario.questions.findIndex(q=>q.stage===3)-1&&!a.recording?.used){a.index=scenario.questions.findIndex(q=>q.stage===2);a.view='boundary'}
  localStorage.setItem(attemptKey,JSON.stringify(a));
 }
 if(a.version!==scenario.version||!Number.isInteger(a.index)||a.index<0||a.index>=total||typeof a.name!=='string'||a.lives<0||a.lives>2||!a.answers||typeof a.answers!=='object')return null;
 a.recording??={active:false,used:false,checked:false,elapsedMs:0,startedAt:null};return a;
 }catch{return null}}
export function businessProgress(){const a=readAttempt();return a?{stage:scenario.questions[a.index].stage,index:a.index,status:a.status,view:a.view,lives:a.lives,passed:Object.values(a.answers).filter(v=>v.feedback).length}:null}
