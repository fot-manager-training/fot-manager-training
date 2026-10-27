export function calculateBrief(b={}){
 const n=k=>{if(b[k]===''||b[k]===null||b[k]===undefined)return null;const x=Number(String(b[k]).replace(',','.'));return Number.isFinite(x)&&x>=0&&x<=1e12?x:null};
 const pct=k=>{const x=n(k);return x!==null&&x<=100?x:null};
 const payroll=n('payroll'),staff=n('staff'),commission=pct('commission'),sber=pct('sberCommission'),cashRate=pct('cashRate'),cashBase=n('cashBase'),cap=n('cashCap');
 const fee=payroll!==null&&commission!==null?payroll*commission/100:null;
 const sberFee=payroll!==null&&sber!==null?payroll*sber/100:null;
 const cashback=cashBase!==null&&cashRate!==null?Math.min(cashBase*cashRate/100,cap??Infinity):null;
 const saving=fee!==null&&sberFee!==null?fee-sberFee:null;
 return {savingAnnual:saving===null?null:saving*12,savingPerEmployee:saving!==null&&staff>0&&Number.isInteger(staff)?saving/staff:null,metricNotes:{perEmployee:'Только условный кэшбэк на одного сотрудника, не экономия компании',savingPerEmployee:'Условная экономия комиссии компании на сотрудника, не личный доход сотрудника'},annualAssumption:"12 одинаковых месяцев при неизменных базе, ставках и месячном лимите",payroll,staff,fee,sberFee,cashback,feeAnnual:fee===null?null:fee*12,sberFeeAnnual:sberFee===null?null:sberFee*12,cashbackAnnual:cashback===null?null:cashback*12,saving:fee!==null&&sberFee!==null?fee-sberFee:null,perEmployee:cashback!==null&&staff>0&&Number.isInteger(staff)?cashback/staff:null,recipient:b.cashRecipient==='employees'?'employees':'company',formulas:{fee:'ФОТ за месяц × комиссия / 100',cashback:'min(указанная база за месяц × ставка / 100; месячный лимит)',saving:'Комиссия текущего банка − комиссия Сбера'}};
}
