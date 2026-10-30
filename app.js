/* Static archive: search uses local data and runs on the visitor's device. */
'use strict';

const STOP = new Set('и в во на с со по к ко у за от для не а но или это как что где мне найти можно есть из о об ли же все всё который какие какой хочу пожалуйста дай расскажи подскажи знать про подготовиться подготовка материал материалы'.split(' '));
function queryOlympiad(query) {
  const terms=new Set(words(query)), vsosh=['всош','vsosh'].some(w=>terms.has(w)), vk=['всерос','vseros','вкшный','вкшного','вк','vk'].some(w=>terms.has(w));
  return vsosh&&!vk?'vsosh':vk&&!vsosh?'vk':null;
}
function words(text) { return text.toLowerCase().match(/[a-zа-яё0-9_]+/g) || []; }
function stem(word) {
  word = word.toLowerCase().replace(/ё/g, 'е');
  if (/^(?:регион(?:альн[а-я]*|[а-я]{0,3})|регэтап)$/.test(word)) return 'регион';
  if (/^(?:ли[дб]ербор[дн][а-я]*|leaderboards?|standings)$/.test(word)) return 'лидерборд';
  if (/^[а-я]{5,}$/.test(word)) return word.replace(/(иями|ами|ями|ого|ему|ому|ией|иям|иях|ыми|ими|ие|ые|ая|яя|ой|ий|ый|ов|ев|ей|ам|ям|ах|ях|ию|ия|ью|ом|ем|а|я|ы|и|у|ю|е|о)$/, '');
  return word;
}
function tokens(text) { return words(text).filter(w => !STOP.has(w) && w.length > 1).map(stem); }
function counter(items) { const c = new Map(); for (const w of items) c.set(w, (c.get(w) || 0) + 1); return c; }
function nearWord(a,b,limit) {
  if (Math.abs(a.length-b.length)>limit) return limit+1;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++) {
    const next=[i+1];
    for(let j=0;j<b.length;j++) next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));
    if(Math.min(...next)>limit) return limit+1;
    row=next;
  }
  return row[b.length];
}
function createSearchEngine(corpus) {
  const aliases=(corpus.aliases || []).map(group=>new Set(group.map(stem)));
  const df=new Map(), titles=new Map(), corrections=new Map(), stems=new Map();
  const chunks = corpus.chunks.map(c => {
    const terms=words(c.text).filter(w=>!STOP.has(w)&&w.length>1).map(w=>{
      if(!stems.has(w)) stems.set(w,stem(w));
      return stems.get(w);
    }), tf=counter(terms);
    for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
    const key=c.resource_id || 'post:'+c.post_id;
    if(!titles.has(key)) titles.set(key,new Set(c.resource_id ? corpus.resource_titles?.[key] : corpus.titles?.[String(c.post_id)]));
    return {id:c.post_id,text:c.text,resourceId:c.resource_id || null,tf,length:terms.length,phrase:terms.join(' '),title:titles.get(key)};
  });
  stems.clear();
  const average = chunks.reduce((a,c)=>a+c.length,0) / Math.max(chunks.length,1);
  function corrected(word) {
    if(df.has(word) || word.length<5) return [];
    if(!corrections.has(word)) {
      const limit=word.length<8?1:2;
      corrections.set(word,[...df.keys()].map(w=>[w,nearWord(word,w,limit)]).filter(([,n])=>n<=limit)
        .sort((a,b)=>a[1]-b[1] || df.get(b[0])-df.get(a[0])).slice(0,2).map(([w])=>w));
      if(corrections.size>100) corrections.delete(corrections.keys().next().value);
    }
    return corrections.get(word);
  }
  function rank(query) {
    for (const [pattern,name] of corpus.query_names || []) query=query.replace(new RegExp(pattern,'gi'),name);
    const scope=queryOlympiad(query);
    const direct = new Set(tokens(query));
    const titleWeights=new Map([...direct].map(w=>[w,1+Math.log((1+chunks.length)/(1+(df.get(w)||0)))]));
    const titleTotal=[...titleWeights.values()].reduce((a,b)=>a+b,0)||1;
    const concepts=[...direct].map(word=> {
      const group=new Set([word]);
      for (const equivalent of aliases) if(equivalent.has(word)) for(const w of equivalent) group.add(w);
      for(const w of corrected(word)) group.add(w);
      return group;
    });
    const conceptWeights=concepts.map(group=>1+Math.log((1+chunks.length)/(1+Math.max(...[...group].map(w=>df.get(w)||0),0))));
    const conceptTotal=conceptWeights.reduce((a,b)=>a+b,0)||1;
    const weights = new Map([...direct].map(w=>[w,1]));
    for (const group of concepts) for (const w of group) if(!weights.has(w)) weights.set(w,.4);
    const ids = [...query.matchAll(/(?:№|сообщени[ея]\s+|ClassicalML\/)(\d+)/gi)].map(m=>Number(m[1]));
    if (/^\d+$/.test(query.trim())) ids.push(Number(query.trim()));
    const phrase = tokens(query).join(' '), candidates = [];
    for (const c of chunks) {
      if (scope && corpus.olympiads?.[String(c.id)]!==scope && !ids.includes(c.id)) continue;
      let bm25=0;
      for (const [w,weight] of weights) {
        const f=c.tf.get(w) || 0;
        if (f) bm25 += weight * Math.log(1+(chunks.length-df.get(w)+.5)/(df.get(w)+.5)) * f*2.2/(f+1.2*(.25+.75*c.length/Math.max(average,1)));
      }
      const explicit = ids.includes(c.id);
      if (!bm25 && !explicit) continue;
      const coverage = [...direct].filter(w=>c.tf.has(w)).length / Math.max(direct.size,1);
      const titleCoverage = [...direct].filter(w=>c.title.has(w)).reduce((sum,w)=>sum+titleWeights.get(w),0) / titleTotal;
      const conceptCoverage=concepts.reduce((sum,group,i)=>sum+([...group].some(w=>c.tf.has(w))?conceptWeights[i]:0),0)/conceptTotal;
      candidates.push({id:c.id,text:c.text,resourceId:c.resourceId,bm25,coverage,conceptCoverage,titleCoverage,phrase:phrase && direct.size>=2 && c.phrase.includes(phrase),explicit});
    }
    const maximum = Math.max(...candidates.map(c=>c.bm25),1e-9);
    for (const c of candidates) c.score=.65*c.bm25/maximum+.15*c.coverage+.35*c.titleCoverage+.08*Number(Boolean(c.phrase))+10*Number(c.explicit);
    const best=Math.max(...candidates.map(c=>c.score),0), seen=new Set(), seenResources=new Set();
    const conceptBest=Math.max(...candidates.map(c=>c.conceptCoverage),0), conceptMin=Math.max(0,conceptBest-.30);
    return candidates.sort((a,b)=>b.score-a.score).filter(c=> {
      if ((!c.explicit && (c.score<Math.max(.1,best*.38) || c.conceptCoverage<conceptMin)) || seen.has(c.id)) return false;
      const groups=c.resourceId ? [c.resourceId] : ((corpus.post_resources || {})[String(c.id)] || []);
      if (groups.some(id=>seenResources.has(id))) return false;
      seen.add(c.id); for (const id of groups) seenResources.add(id); return true;
    }).map(c=>({id:c.id,score:c.score,text:c.text,resourceId:c.resourceId,source:corpus.resources?.[c.resourceId],terms:[...weights.keys()]}));
  }
  return {rank};
}

function highlightTerms(query,corpus={}) {
  for(const [pattern,name] of corpus.query_names || []) query=query.replace(new RegExp(pattern,'gi'),name);
  const direct=new Set(tokens(query)), terms=new Set(direct);
  for(const group of corpus.aliases || []) {
    const normalized=group.map(stem);
    if(normalized.some(w=>direct.has(w))) for(const word of normalized) terms.add(word);
  }
  return terms;
}
function matchRanges(text,terms) {
  const set=terms instanceof Set?terms:new Set(terms);
  return [...text.matchAll(/[a-zа-яё0-9_]+/gi)].filter(m=>set.has(stem(m[0]))).map(m=>[m.index,m.index+m[0].length]);
}
let activeHighlights={query:'',terms:[]};
function highlightRag(root,query,corpus={}) {
  if(!root) return;
  for(const mark of root.querySelectorAll('mark[data-rag]')) {
    const parent=mark.parentNode; mark.replaceWith(document.createTextNode(mark.textContent)); parent.normalize();
  }
  const terms=query===activeHighlights.query?new Set(activeHighlights.terms):highlightTerms(query,corpus);
  if(!terms.size) return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
    return node.parentElement.closest('script,style,input,textarea,.telegram-emoji,.channel-message-meta,.forwarded-heading,.channel-date')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
  }}), nodes=[];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  for(const node of nodes) {
    const ranges=matchRanges(node.nodeValue,terms);
    if(!ranges.length) continue;
    const fragment=document.createDocumentFragment(); let start=0;
    for(const [a,b] of ranges) {
      fragment.append(document.createTextNode(node.nodeValue.slice(start,a)));
      const mark=document.createElement('mark'); mark.className='rag-match'; mark.dataset.rag=''; mark.textContent=node.nodeValue.slice(a,b); fragment.append(mark); start=b;
    }
    fragment.append(document.createTextNode(node.nodeValue.slice(start))); node.replaceWith(fragment);
  }
}
function searchExcerpt(text,terms) {
  const clean=text.split('\n').filter(line=>! /^(?:Также ищут как:|Из публикации:|Контекст публикации:|Поисковая тема:)/.test(line)).join(' ').replace(/\s+/g,' ');
  const at=matchRanges(clean,terms)[0]?.[0] || 0, start=Math.max(0,at-60), end=Math.min(clean.length,start+220);
  return (start?'…':'')+clean.slice(start,end)+(end<clean.length?'…':'');
}

if (typeof module !== 'undefined' && module.exports) module.exports = {createSearchEngine,tokens,stem,highlightTerms,matchRanges,searchExcerpt};
if (typeof document !== 'undefined') {
  window.highlightRag=highlightRag;
  const data=document.getElementById('search-data');
  if(data) {
    const corpus=JSON.parse(data.textContent), list=document.getElementById('entries');
    const cards=[...list.querySelectorAll('.entry')], byId=new Map(cards.map(c=>[Number(c.dataset.id),c]));
    const search=document.getElementById('search'), filter=document.getElementById('filter'), count=document.getElementById('count');
    const panel=document.getElementById('channel-pane'), feed=document.getElementById('channel-feed'), compact=window.matchMedia('(max-width:900px)');
    let selectedId=null,lastQuery='',lastHits=[],returnFocus=null,version=0,timer,worker,localEngine,workerFailed=false;
    function closeChannel() {
      panel.classList.remove('is-open');panel.removeAttribute('role');panel.removeAttribute('aria-modal');document.querySelector('.search-pane').inert=false;
      returnFocus?.focus({preventScroll:true});
    }
    function showMessage(id,reveal=false) {
      const message=window.ensureChannelMessage?.(Number(id)) || document.getElementById('channel-message-'+id);
      if(!message) return;
      if(selectedId!==null) {
        byId.get(selectedId)?.classList.remove('is-selected');byId.get(selectedId)?.querySelector('[data-channel-id]')?.removeAttribute('aria-current');
        document.getElementById('channel-message-'+selectedId)?.classList.remove('is-selected');
      }
      selectedId=Number(id);byId.get(selectedId)?.classList.add('is-selected');byId.get(selectedId)?.querySelector('[data-channel-id]')?.setAttribute('aria-current','true');message.classList.add('is-selected');
      highlightRag(message,search.value.trim(),corpus);
      if(reveal&&compact.matches) {
        returnFocus=document.activeElement;panel.classList.add('is-open');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');document.querySelector('.search-pane').inert=true;document.getElementById('close-channel').focus({preventScroll:true});
      }
      (message.querySelector('mark[data-rag]') || message).scrollIntoView({block:'center',inline:'nearest'});
    }
    function render(hits,query) {
      lastHits=hits;const mode=filter.value,matches=new Map(hits.map(h=>[h.id,h]));
      activeHighlights={query,terms:hits[0]?.terms || [...highlightTerms(query,corpus)]};
      const order=mode==='service'?cards.filter(c=>c.dataset.service==='1'&&(!query||c.textContent.toLowerCase().includes(query.toLowerCase()))):query?hits.map(h=>byId.get(h.id)).filter(Boolean):cards;
      for(const card of cards) card.hidden=true;
      const fragment=document.createDocumentFragment();let total=0,first=null;
      for(const card of order) {
        if(mode!=='service'&&(card.dataset.service==='1'||mode==='context'&&card.dataset.context!=='1'||mode==='questions'&&card.dataset.question!=='1')) continue;
        fragment.append(card);card.hidden=false;total++;first??=Number(card.dataset.id);
        const hit=matches.get(Number(card.dataset.id)),box=card.querySelector('.search-match');box.replaceChildren();box.hidden=!hit?.source;
        if(hit?.source) {
          const link=document.createElement('a');link.href=hit.source.url;link.target='_blank';link.rel='noreferrer';link.textContent='Фрагмент по ссылке: '+hit.source.title;
          const excerpt=document.createElement('p');excerpt.textContent=searchExcerpt(hit.text,hit.terms || activeHighlights.terms);box.append(link,excerpt);
          window.renderTelegramEmoji?.(excerpt);
        }
        highlightRag(card,query,corpus);
      }
      list.append(fragment);list.removeAttribute('aria-busy');count.textContent=query?`Найдено: ${total}`:`Сообщений: ${total}`;document.getElementById('empty').hidden=total>0;
      for(const message of feed.querySelectorAll('.channel-message:not(.is-lazy)')) highlightRag(message,query,corpus);
      if(first!==null&&(query!==lastQuery||selectedId===null||byId.get(selectedId)?.hidden)) showMessage(first);
      lastQuery=query;
    }
    function requestSearch() {
      const query=search.value.trim(),id=++version;
      if(!query) {render([],query);return;}
      if(query===lastQuery) {render(lastHits,query);return;}
      count.textContent='Поиск…';list.setAttribute('aria-busy','true');
      if(!worker&&!workerFailed&&location.protocol!=='file:'&&typeof Worker!=='undefined') {
        try {
          worker=new Worker('search-worker.js');
          worker.onmessage=event=>{if(event.data.id===version) render(event.data.hits,event.data.query);};
          worker.onerror=event=>{event.preventDefault();worker.terminate();worker=null;workerFailed=true;requestSearch();};
          worker.postMessage({corpus});
        } catch(_) {workerFailed=true;}
      }
      if(worker) worker.postMessage({id,query});
      else setTimeout(()=>{if(id===version){localEngine ||= createSearchEngine(corpus);render(localEngine.rank(query),query);}},0);
    }
    search.addEventListener('input',()=>{clearTimeout(timer);version++;timer=setTimeout(requestSearch,120);});filter.addEventListener('change',()=>{clearTimeout(timer);requestSearch();});
    search.addEventListener('keydown',e=>{if(e.key==='Escape'){clearTimeout(timer);version++;search.value='';render([],'');}});
    list.addEventListener('click',e=>{const link=e.target.closest('[data-channel-id]');if(link){e.preventDefault();showMessage(link.dataset.channelId,true);history.replaceState(null,'','#channel-message-'+link.dataset.channelId);}});
    document.addEventListener('rag:message',e=>highlightRag(e.detail.message,search.value.trim(),corpus));
    document.getElementById('open-channel').onclick=()=>showMessage(selectedId || cards[0]?.dataset.id,true);
    document.getElementById('close-channel').onclick=closeChannel;
    document.getElementById('channel-search').onclick=()=>{closeChannel();search.focus();};
    document.getElementById('channel-latest').onclick=()=>showMessage(Math.max(...[...feed.querySelectorAll('[data-message-id]')].map(m=>Number(m.dataset.messageId))));
    compact.addEventListener('change',e=>{if(!e.matches){closeChannel();showMessage(selectedId);}});
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('is-open'))closeChannel();});
    render([],'');const initial=location.hash.match(/^#(?:channel-)?message-(\d+)$/);if(initial)showMessage(initial[1]);
  }
}
