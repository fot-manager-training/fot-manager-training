import {getSegment,chooseSegment,segmentPicker} from './segments.js?v=20261021-2';
const force=new URLSearchParams(location.search).has('choose-segment');
const routeSegment=location.pathname.match(/^\/cases\/(kksb|rgs|mmb)\/?$/)?.[1];
let selected=!force&&routeSegment?chooseSegment(routeSegment):getSegment();
if(!selected||force){selected=await segmentPicker();if(force)history.replaceState(null,'','/');}
chooseSegment(selected.id);
await import('./app.js?v=20261029-reliable');
