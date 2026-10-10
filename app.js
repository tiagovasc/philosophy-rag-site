let corpusMeta=null;
const CORPUS_LABELS={SEP:'Stanford Encyclopedia of Philosophy',IEP:'Internet Encyclopedia of Philosophy'};
function updateCorpusCount(){if(!corpusMeta)return;const tag=document.getElementById('corpus-selection').value,m=corpusMeta[tag];document.getElementById('corpus-count').textContent=tag+' · '+m.entries.toLocaleString()+' articles · '+m.passages.toLocaleString()+' passages · snapshot';}
const API_BASE = window.PHILOSOPHY_API_URL;
let libraryToken=localStorage.getItem('philosophy-library');
if(!libraryToken){libraryToken=crypto.randomUUID().replaceAll('-','');localStorage.setItem('philosophy-library',libraryToken);}
const $ = id => document.getElementById(id);
let current = null, polling = null, busy = false, tab = 'answer';
const nodes = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n; };
async function api(path, body) {
  const response=await fetch(API_BASE+path,{method:body?'POST':'GET',headers:{'X-Research-Owner':libraryToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Something went wrong. Please try again.');
  return result;
}
function alertMessage(message) { $('alert').textContent=message;$('alert').hidden=!message; }
function setBusy(value) {busy=value;['research-button','search-button','corpus-selection'].forEach(id=>$(id).disabled=value);}
function options() {return {corpus_tag:$('corpus-selection').value,rag_count:Number($('rag-count').value),selection:$('selection').value,answer_count:Number($('answer-count').value),model:$('model').value,effort:$('effort').value};}
function populateOptions(o) {if(!o)return;$('corpus-selection').value=o.corpus_tag||'SEP';updateCorpusCount();$('rag-count').value=o.rag_count;$('selection').value=o.selection;$('answer-count').value=o.answer_count;$('model').value=o.model;$('effort').value=o.effort;$('answer-count-label').hidden=o.selection!=='number';}
async function start(mode) {
  if(busy)return;
  const question=$('question').value.trim();
  if(question.length<3){alertMessage('Write a question to begin.');$('question').focus();return;}
  if(!$('ask-form').reportValidity())return;
  alertMessage('');setBusy(true);
  try {
    const {id}=await api('/api/ask',{question,mode,...options()});
    await load(id);await loadLibrary();
  } catch(e){setBusy(false);alertMessage(e.message);}
}
async function load(id) {
  clearTimeout(polling);
  try {
    const record=await api('/api/jobs/'+encodeURIComponent(id));
    const changed=!current||current.id!==record.id;
    current=record;
    if(changed){tab=record.mode==='search'?'passages':'answer';$('question').value=record.question;populateOptions(record.options);$('rating-filter').value='all';}
    showResearch(record);
    const running=['running','queued'].includes(record.status);
    setBusy(running);
    if(running)polling=setTimeout(()=>load(id),1300);
    else await loadLibrary();
  }catch(e){setBusy(false);alertMessage(e.message);}
}
async function loadLibrary() {
  try {
    const {queries}=await api('/api/library');
    $('library-count').textContent=queries.length;
    if(!queries.length)return;
    $('library').replaceChildren();
    queries.forEach(q=>{
      const b=nodes('button',undefined,'library-item'+(current?.id===q.id?' active':''));
      b.append(nodes('span',q.question),nodes('small',(q.corpus_tag||'SEP')+' · '+new Date(q.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})+' · '+(q.mode==='search'?'Passage search':q.status==='done'?'Research':q.status)));
      b.addEventListener('click',()=>{if(!busy||current?.id===q.id){document.querySelector('.sidebar').classList.remove('mobile-open');$('library-toggle').setAttribute('aria-expanded','false');load(q.id);}else alertMessage('An inquiry is running. Wait for it to finish before switching inquiries.');});
      $('library').append(b);
    });
  }catch(e){alertMessage(e.message);}
}
function switchTab(value) {
  tab=value;
  ['answer','passages','method'].forEach(name=>{ $(name+'-tab').setAttribute('aria-selected',String(name===value));$(name+'-view').hidden=name!==value;});
}
function showResearch(r) {
  $('welcome').hidden=true;$('suggestions').hidden=true;$('research').hidden=false;
  $('result-question').textContent=r.question;
  $('progress').replaceChildren();
  const stepLabels=r.mode==='search'?['Find passages']:['Find passages','Check relevance','Write answer','Ready to read'];
  stepLabels.forEach((label,i)=>$('progress').append(nodes('span',(i+1)+'. '+label,r.status==='done'||r.step>i+1?'done':r.step===i+1?'current':'')));
  $('progress').append(nodes('span',r.stage+(r.total&&r.step===2?' · '+r.completed+'/'+r.total:''),'stage'));
  const retrieved=r.retrieved||[], selected=r.sources||[];
  const entries=new Set(retrieved.map(x=>x.doc_id));
  $('result-meta').textContent=(r.options?.corpus_tag||'SEP')+' · '+(retrieved.length ? `${retrieved.length} passages · ${entries.size} entries${selected.length?' · '+selected.length+' passages selected':''}` : 'Searching the selected snapshot');
  $('passage-count').textContent=(r.ranked||retrieved).length||'';
  $('answer').replaceChildren();
  if(r.answer){renderMarkdown($('answer'),r.answer);$('copy-button').hidden=false;}
  else {
    $('copy-button').hidden=true;
    const message=r.mode==='search'?'This inquiry contains passages only. Choose Explore question to run relevance checks and write an answer.':r.status==='error'||r.status==='interrupted'?'The answer stopped before completion. Your saved evidence is available in Passages.':'The answer will appear here once the evidence has been checked.';
    $('answer').append(nodes('p',message,'waiting'));
  }
  if(r.error)alertMessage(r.error);else alertMessage('');
  renderSources(selected);
  renderPassages();renderMethod(r);switchTab(tab);
}
function renderSources(selected) {
  $('sources').replaceChildren(nodes('h3','SELECTED EVIDENCE'));
  const grouped=new Map();
  selected.forEach(row=>{if(!grouped.has(row.doc_id))grouped.set(row.doc_id,[]);grouped.get(row.doc_id).push(row);});
  grouped.forEach(rows=>{
    const row=rows[0],b=nodes('button',undefined,'source-card');
    b.append(nodes('span',rows.map(r=>r.source_id).join(' · '),'source-number'),nodes('strong',row.title),nodes('span',row.authors||'Author not recorded'),nodes('span',rows.length+' selected passage'+(rows.length===1?'':'s')+' ↗'));
    b.addEventListener('click',()=>openSource(row));$('sources').append(b);
  });
  if(!selected.length)$('sources').append(nodes('p','Selected sources will appear here.','library-empty'));
}
function renderPassages() {
  if(!current)return;
  const rows=current.ranked||current.retrieved||[], filter=$('rating-filter').value,selected=new Set((current.sources||[]).map(r=>r.chunk_id));
  const shown=rows.filter(r=>filter==='all'||(filter==='selected'?selected.has(r.chunk_id):r.tier===Number(filter)));
  $('passages').replaceChildren();$('passage-summary').textContent=shown.length+' of '+rows.length;
  shown.forEach(row=>{
    const card=nodes('article',undefined,'passage-card'),top=nodes('div',undefined,'passage-card-top');
    top.append(nodes('span',row.source_id+' · RETRIEVAL #'+row.retrieval_rank+' · SIMILARITY '+row.rag_score.toFixed(3)));
    const badges=nodes('div');badges.append(nodes('span',row.tier_label||'Not yet rated','rating-pill'));
    if(selected.has(row.chunk_id))badges.append(nodes('span','Selected','rating-pill selected-pill'));
    top.append(badges);card.append(top,nodes('h3',row.title),nodes('div',row.authors||'Author not recorded','author-line'),nodes('p',row.text,'passage-text'));
    const open=nodes('button','Read passage & nearby context ↗');open.addEventListener('click',()=>openSource(row));card.append(open);$('passages').append(card);
  });
  if(!shown.length)$('passages').append(nodes('p',rows.length?'No passages match this filter.':'The retrieved passages will appear here.','library-empty'));
}
function renderMethod(r) {
  const o=r.options;$('method-view').replaceChildren(nodes('h3','The path this inquiry took'));
  const dl=nodes('dl');
  const labels={perfect:'Perfectly relevant only',very:'Perfectly relevant + Very relevant',relevant:'Perfectly relevant + Very relevant + Relevant',number:'Best '+o.answer_count+' passages, regardless of rating'};
  const pairs=[['Corpus',CORPUS_LABELS[o.corpus_tag||'SEP']+' · snapshot'],['Retrieval','Semantic cosine search over existing EmbeddingGemma passage vectors'],['Candidate count',String(o.rag_count)],['Relevance check',r.mode==='search'?'Not run for passage search':'Jev · original question · five categorical tiers'],['Evidence selection',labels[o.selection]],['Ordering','Jev tier first, then retrieval similarity within the tier'],['Answer model',`${o.model} · ${o.effort} thinking`],['Persistence','Saved online to your browser’s library; original sources and embeddings remain read-only']];
  pairs.forEach(([k,v])=>dl.append(nodes('dt',k),nodes('dd',v)));$('method-view').append(dl,nodes('p','All retrieved passages must receive a successful relevance rating before synthesis. Rating thresholds pass every qualifying passage; custom count may include weaker evidence. No matching evidence produces an explicit insufficient-evidence result. A citation opens the exact saved passage with one neighboring passage on each side.'));
}
function inline(parent,text) {
  const regex=/\[S\d+\]|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;let offset=0,match;
  while((match=regex.exec(text))){parent.append(document.createTextNode(text.slice(offset,match.index)));if(match[0].startsWith('[S')){
    const id=match[0].slice(1,-1),row=(current.sources||[]).find(r=>r.source_id===id);
    if(row){const button=nodes('button',id,'cite');button.title='Read '+row.title;button.addEventListener('click',()=>openSource(row));parent.append(button);}else parent.append(document.createTextNode(match[0]));
  }else {const n=nodes(match[1]?'strong':'em',match[1]||match[2]);parent.append(n);}offset=regex.lastIndex;}
  parent.append(document.createTextNode(text.slice(offset)));
}
function renderMarkdown(parent,text) {
  const blocks=text.replace(/\r/g,'').split(/\n\s*\n/);
  for(const block of blocks){const lines=block.trim().split('\n');if(!lines[0])continue;
    if(/^#{1,3} /.test(lines[0])){const title=lines.shift().replace(/^#{1,3}\s+/,''),h=nodes('h2');inline(h,title);parent.append(h);if(lines.length){const p=nodes('p');inline(p,lines.join(' '));parent.append(p);}}
    else if(lines.every(l=>/^[-*]\s+|^\d+\.\s+/.test(l))){const list=nodes(/^\d/.test(lines[0])?'ol':'ul');lines.forEach(l=>{const item=nodes('li');inline(item,l.replace(/^([-*]|\d+\.)\s+/,''));list.append(item);});parent.append(list);}
    else {const p=nodes('p');inline(p,lines.join(' '));parent.append(p);}
  }
}
async function openSource(row) {
  $('source-content').replaceChildren(nodes('p','Loading the saved source…'));
  if(!$('source-dialog').open)$('source-dialog').showModal();
  try {
    const entry=await api('/api/source?id='+encodeURIComponent(row.doc_id)+'&seq='+row.seq);
    $('source-content').replaceChildren(nodes('h2',entry.title),nodes('div',entry.authors||'Author not recorded','author-line'));
    entry.passages.forEach(p=>{const div=nodes('div',undefined,'source-context'+(p.seq===row.seq?' target':''));div.append(nodes('span',p.seq===row.seq?'CITED PASSAGE · '+row.source_id:p.seq<row.seq?'PREVIOUS PASSAGE':'NEXT PASSAGE','context-label'),nodes('div',p.text));$('source-content').append(div);});
    try {const url=new URL(entry.url);if(url.protocol==='https:'&&['plato.stanford.edu','iep.utm.edu'].includes(url.hostname)){const a=nodes('a','Open original '+(entry.corpus_tag||'SEP')+' entry ↗','external-link');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';$('source-content').append(a);}}catch{}
    $('source-content').append(nodes('p','Saved passage text. Adjacent chunks may repeat text because the original index uses overlapping passages. The online encyclopedia entry may have changed since this snapshot.','about-note'));
  }catch(e){$('source-content').replaceChildren(nodes('p',e.message));}
}
$('ask-form').addEventListener('submit',e=>{e.preventDefault();start('research');});
$('search-button').addEventListener('click',()=>start('search'));
$('settings-button').addEventListener('click',()=>{const show=$('settings').hidden;$('settings').hidden=!show;$('settings-button').setAttribute('aria-expanded',String(show));});
$('selection').addEventListener('change',()=>{$('answer-count-label').hidden=$('selection').value!=='number';});
document.querySelectorAll('[data-question]').forEach(b=>b.addEventListener('click',()=>{$('question').value=b.dataset.question;$('question').focus();}));
['answer','passages','method'].forEach(n=>$(n+'-tab').addEventListener('click',()=>switchTab(n)));
$('rating-filter').addEventListener('change',renderPassages);
$('new-research').addEventListener('click',()=>{if(busy){alertMessage('This inquiry is still running. You can start another when it finishes.');return;}clearTimeout(polling);current=null;$('research').hidden=true;$('welcome').hidden=false;$('suggestions').hidden=false;$('question').value='';alertMessage('');$('question').focus();loadLibrary();});
$('copy-button').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(current.answer);$('copy-button').textContent='Copied';setTimeout(()=>$('copy-button').textContent='Copy answer',1500);}catch{alertMessage('Copy is unavailable in this browser. Select the answer text to copy it.');}});
$('close-source').addEventListener('click',()=>$('source-dialog').close());
$('about-button').addEventListener('click',()=>$('about-dialog').showModal());
$('close-about').addEventListener('click',()=>$('about-dialog').close());
$('library-toggle').addEventListener('click',()=>{const open=document.querySelector('.sidebar').classList.toggle('mobile-open');$('library-toggle').setAttribute('aria-expanded',String(open));});
api('/api/status').then(s=>{corpusMeta=s.corpora;populateOptions(s.defaults);if(s.notice)alertMessage(s.notice);}).catch(e=>alertMessage(e.message));
loadLibrary();

$('corpus-selection').addEventListener('change',updateCorpusCount);
