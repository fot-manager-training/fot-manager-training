const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){let out='',last=0;const pattern=/\[([^\]\n]{1,160})\]\((https:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*/g;for(const m of s.matchAll(pattern)){out+=escapeText(s.slice(last,m.index));if(m[3])out+='<strong>'+escapeText(m[3])+'</strong>';else{try{const u=new URL(m[2]);out+=u.protocol==='https:'&&!u.username&&!u.password?'<a href="'+escapeText(u.href)+'" target="_blank" rel="noopener noreferrer">'+escapeText(m[1])+'</a>':escapeText(m[0])}catch{out+=escapeText(m[0])}}last=m.index+m[0].length}return out+escapeText(s.slice(last))}
export function renderLisaMessage(text){const lines=String(text).split('\n');let out='';for(let i=0;i<lines.length;i++){
 const line=lines[i];if(!line.trim())continue;
 if(/^\s*\|/.test(line)&&/^\s*\|?(\s*:?-{3,}:?\s*\|)+/.test(lines[i+1]||'')){
  const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').slice(0,8).map(t=>t.trim());const header=cells(line);i+=2;const rows=[];while(i<lines.length&&/^\s*\|/.test(lines[i])&&rows.length<60)rows.push(cells(lines[i++]));i--;out+='<div class="lisa-reply-table"><table><thead><tr>'+header.map(t=>'<th>'+inline(t)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+header.map((_,n)=>'<td>'+inline(row[n]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';continue;
 }
 const heading=line.match(/^#{2,3}\s+(.+)/);if(heading){out+='<h3>'+inline(heading[1])+'</h3>';continue}
 out+='<p>'+(/^[*-]\s+/.test(line)?'• '+inline(line.replace(/^[*-]\s+/,'')):inline(line))+'</p>';
 }return out}
