/* Static archive: search uses local data and runs on the visitor's device. */
'use strict';

const STOP = new Set('и в во на с со по к ко у за от для не а но или это как что где мне найти можно есть из о об ли же все всё который какие какой хочу пожалуйста дай расскажи подскажи знать про подготовиться подготовка материал материалы'.split(' '));
function queryOlympiad(terms) {
  const vsosh=terms.has('всош'), vk=terms.has('всерос');
  return vsosh&&!vk?'vsosh':vk&&!vsosh?'vk':null;
}
function words(text) { return text.toLowerCase().match(/[a-zа-яё0-9_]+/g) || []; }
function baseStem(word) {
  word = word.toLowerCase().replace(/ё/g, 'е');
  if (/^(?:закл(?:[аеуы]|ом|ов|ам|ах|ами)?|заключ|зэ|заключительн[а-я]*|финал(?:[аеуы]|ом|ов|ам|ах|ами|ьн[а-я]*)?)$/.test(word)) return 'финал';
  if (/^(?:регион(?:альн[а-я]*|[а-я]{0,3})|регэтап|рэ)$/.test(word)) return 'регион';
  if (/^(?:ли[дб]ербор[дн][а-я]*|leaderboards?|standings|лб)$/.test(word)) return 'лидерборд';
  if (/^[а-я]{5,}$/.test(word)) return word.replace(/(иями|ами|ями|ого|ему|ому|ием|ией|иям|иях|ыми|ими|ие|ые|ая|яя|ой|ий|ый|ов|ев|ей|ам|ям|ах|ях|ию|ия|ью|ом|ем|а|я|ы|и|у|ю|е|о)$/, '');
  return word;
}
function stem(word,forms={}) { word=baseStem(word);return forms[word] || word; }
function tokens(text,forms={},stop=STOP) { return words(text).filter(w => !stop.has(w) && w.length > 1).map(w=>stem(w,forms)); }
function normalizeQuery(query,corpus) {
  query=query.trim();
  for(const [pattern,name] of corpus.query_names || []) query=query.replace(new RegExp(pattern,'gi'),name).trim();
  return query;
}
function stages(terms) {
  const result=terms.filter(w=>['финал','регион','муниципальн','школьн'].includes(w));
  if(terms.includes('основн')&&terms.some(w=>['тур','тура','туры','туре','этап'].includes(w))) result.push('основной');
  return result;
}
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
  const forms=corpus.word_forms || {}, stop=new Set(corpus.stop_words || STOP), normalized=w=>stem(w,forms);
  const aliases=(corpus.aliases || []).map(group=>new Set(group.map(normalized)));
  const focus=new Map(Object.entries(corpus.focus || {}).map(([id,terms])=>[Number(id),new Set(terms)]));
  const df=new Map(), titles=new Map(), corrections=new Map(), stems=new Map(), compact=corpus.index;
  const termIds=compact?new Map(compact.vocab.map((word,index)=>[word,index])):null;
  if(compact) compact.vocab.forEach((word,index)=>df.set(word,compact.df[index]));
  class IndexedCounts extends Map {
    get(word) {return super.get(typeof word==='number'?word:termIds.get(word));}
    has(word) {return super.has(typeof word==='number'?word:termIds.get(word));}
  }
  function compactCounts(sequence) {
    const tf=new IndexedCounts();let length=0;
    for(const symbol of sequence) {
      let code=symbol.codePointAt(0);if(code>=0xE000) code-=0x800;
      const id=code-256;tf.set(id,(tf.get(id)||0)+1);length++;
    }
    return {tf,length};
  }
  const chunks = (compact?compact.rows:corpus.chunks).map((row,chunkIndex) => {
    const c=compact?{post_id:row[0],resource_id:row[1]}:row;
    let tf,length,phrase;
    if(compact) ({tf,length}=compactCounts(phrase=row[2]));
    else {
    const terms=words(c.text).filter(w=>!stop.has(w)&&w.length>1).map(w=>{
      if(!stems.has(w)) stems.set(w,normalized(w));
      return stems.get(w);
    });tf=counter(terms);length=terms.length;phrase=terms.join(' ');
    for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
    }
    const key=c.resource_id || 'post:'+c.post_id;
    if(!titles.has(key)) titles.set(key,new Set(c.resource_id ? corpus.resource_titles?.[key] : corpus.titles?.[String(c.post_id)]));
    const title=titles.get(key), ownStages=stages([...title]);
    return {id:c.post_id,text:c.text,chunkIndex,resourceId:c.resource_id || null,tf,length,phrase,title,
      stages:ownStages.length?ownStages:(corpus.stages?.[String(c.post_id)] || [])};
  });
  stems.clear();
  const average = chunks.reduce((a,c)=>a+c.length,0) / Math.max(chunks.length,1);
  const vocabulary=compact?compact.vocab:[...df.keys()], byLength=new Map();
  vocabulary.forEach((word,ordinal)=>{
    if(!byLength.has(word.length))byLength.set(word.length,[]);
    byLength.get(word.length).push(ordinal);
  });
  function corrected(word) {
    if(df.has(word) || word.length<5) return [];
    if(!corrections.has(word)) {
      const limit=word.length<8?1:2;
      const candidates=[];
      for(let length=word.length-limit;length<=word.length+limit;length++) for(const ordinal of byLength.get(length)||[]) {
        const candidate=vocabulary[ordinal],distance=nearWord(word,candidate,limit);
        if(distance<=limit)candidates.push([candidate,distance,ordinal]);
      }
      corrections.set(word,candidates.sort((a,b)=>a[1]-b[1] || df.get(b[0])-df.get(a[0]) || a[2]-b[2]).slice(0,2).map(([w])=>w));
      if(corrections.size>100) corrections.delete(corrections.keys().next().value);
    }
    return corrections.get(word);
  }
  function rank(query) {
    query=normalizeQuery(query,corpus);
    const direct = new Set(tokens(query,forms,stop)), scope=queryOlympiad(direct);
    // Олимпиада уже проверяется по метаданным, её частота не должна перебивать намерение запроса.
    if(scope&&direct.size>1) {
      direct.delete(scope==='vk'?'всерос':'всош');
      if(scope==='vk') {direct.delete('вк');direct.delete('vk');}
    }
    const names=[...direct].filter(w=>['ioai','iaio','neoai','faio','dano','dls'].includes(w));
    const stage=stages([...direct]);
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
    const phraseTerms=tokens(query,forms,stop);
    const phrase = compact ? phraseTerms.every(w=>termIds.has(w)) ? phraseTerms.map(w=>{
      let code=termIds.get(w)+256;if(code>=0xD800)code+=0x800;return String.fromCodePoint(code);
    }).join('') : '' : phraseTerms.join(' '), candidates = [];
    for (const c of chunks) {
      if (scope && corpus.olympiads?.[String(c.id)]!==scope && !ids.includes(c.id)) continue;
      if(names.length&&!names.some(w=>c.tf.has(w)||corpus.focus?.[String(c.id)]?.includes(w))&&!ids.includes(c.id)) continue;
      if(stage.length===1&&c.stages.length&&!c.stages.includes(stage[0])&&!ids.includes(c.id)) continue;
      let bm25=0;
      for (const [w,weight] of weights) {
        const f=c.tf.get(w) || 0;
        if (f) bm25 += weight * Math.log(1+(chunks.length-df.get(w)+.5)/(df.get(w)+.5)) * f*2.2/(f+1.2*(.25+.75*c.length/Math.max(average,1)));
      }
      const explicit = ids.includes(c.id);
      if (!bm25 && !explicit) continue;
      const coverage=concepts.filter(group=>[...group].some(w=>c.tf.has(w))).length/Math.max(concepts.length,1);
      const focusCoverage=concepts.reduce((sum,group,i)=>sum+([...group].some(w=>focus.get(c.id)?.has(w))?conceptWeights[i]:0),0)/conceptTotal;
      const titleCoverage=concepts.reduce((sum,group,i)=>sum+([...group].some(w=>c.title.has(w))?conceptWeights[i]:0),0)/conceptTotal;
      const conceptCoverage=concepts.reduce((sum,group,i)=>sum+([...group].some(w=>c.tf.has(w))?conceptWeights[i]:0),0)/conceptTotal;
      candidates.push({id:c.id,text:c.text,chunkIndex:c.chunkIndex,resourceId:c.resourceId,bm25,coverage,conceptCoverage,titleCoverage,focusCoverage,phrase:phrase && direct.size>=2 && c.phrase.includes(phrase),explicit});
    }
    const maximum = Math.max(...candidates.map(c=>c.bm25),1e-9);
    for (const c of candidates) c.score=.65*c.bm25/maximum+.15*c.coverage+.35*c.titleCoverage+.15*c.focusCoverage+.08*Number(Boolean(c.phrase))+10*Number(c.explicit);
    const best=Math.max(...candidates.map(c=>c.score),0), seen=new Set(), seenResources=new Set();
    const conceptBest=Math.max(...candidates.map(c=>c.conceptCoverage),0), conceptMin=Math.max(0,conceptBest-.30);
    return candidates.sort((a,b)=>b.score-a.score).filter(c=> {
      if ((!c.explicit && (c.score<Math.max(.1,best*.38) || c.conceptCoverage<conceptMin)) || seen.has(c.id)) return false;
      const groups=c.resourceId ? [c.resourceId] : ((corpus.post_resources || {})[String(c.id)] || []);
      if (groups.some(id=>seenResources.has(id))) return false;
      seen.add(c.id); for (const id of groups) seenResources.add(id); return true;
    }).map(c=>({id:c.id,score:c.score,text:c.text,chunkIndex:c.chunkIndex,resourceId:c.resourceId,source:corpus.resources?.[c.resourceId],terms:[...weights.keys()]}));
  }
  return {rank};
}

function hydrateSearchHits(hits,texts) {
  return hits.map(hit=>({...hit,text:typeof hit.text==='string'?hit.text:(texts?.[String(hit.id)]?.[String(hit.chunkIndex)] || '')}));
}

function highlightTerms(query,corpus={}) {
  query=normalizeQuery(query,corpus);
  const forms=corpus.word_forms || {}, direct=new Set(tokens(query,forms,new Set(corpus.stop_words || STOP))), terms=new Set(direct);
  for(const group of corpus.aliases || []) {
    const normalized=group.map(w=>stem(w,forms));
    if(normalized.some(w=>direct.has(w))) for(const word of normalized) terms.add(word);
  }
  return terms;
}
function matchRanges(text,terms,forms={}) {
  const set=terms instanceof Set?terms:new Set(terms);
  return [...text.matchAll(/[a-zа-яё0-9_]+/gi)].filter(m=>set.has(stem(m[0],forms))).map(m=>[m.index,m.index+m[0].length]);
}
let activeHighlights={query:'',terms:[]};
function highlightRag(root,query,corpus={}) {
  if(!root?.closest('.channel-pane')) return;
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
    const ranges=matchRanges(node.nodeValue,terms,corpus.word_forms);
    if(!ranges.length) continue;
    const fragment=document.createDocumentFragment(); let start=0;
    for(const [a,b] of ranges) {
      fragment.append(document.createTextNode(node.nodeValue.slice(start,a)));
      const mark=document.createElement('mark'); mark.className='rag-match'; mark.dataset.rag=''; mark.textContent=node.nodeValue.slice(a,b); fragment.append(mark); start=b;
    }
    fragment.append(document.createTextNode(node.nodeValue.slice(start))); node.replaceWith(fragment);
  }
}
function searchExcerpt(text,terms,forms={}) {
  const clean=text.split('\n').filter(line=>! /^(?:Также ищут как:|Из публикации:|Контекст публикации:|Поисковая тема:)/.test(line)).join(' ').replace(/\s+/g,' ');
  const at=matchRanges(clean,terms,forms)[0]?.[0] || 0, start=Math.max(0,at-60), end=Math.min(clean.length,start+220);
  return (start?'…':'')+clean.slice(start,end)+(end<clean.length?'…':'');
}

if (typeof module !== 'undefined' && module.exports) module.exports = {createSearchEngine,hydrateSearchHits,tokens,stem,normalizeQuery,highlightTerms,matchRanges,searchExcerpt};
if (typeof document !== 'undefined') {
  window.highlightRag=highlightRag;
  const data=document.getElementById('search-data');
  if(data) {
    const corpus=JSON.parse(data.textContent), list=document.getElementById('entries');
    const cards=[...list.querySelectorAll('.entry')], byId=new Map(cards.map(c=>[Number(c.dataset.id),c]));
    const search=document.getElementById('search'), filter=document.getElementById('filter'), count=document.getElementById('count');
    const panel=document.getElementById('channel-pane'), feed=document.getElementById('channel-feed'), compact=window.matchMedia('(max-width:900px)');
    let selectedId=null,lastQuery='',lastHits=[],returnFocus=null,version=0,timer,worker,localEngine,localReady,workerFailed=false,selectionVersion=0;
    const scriptLoads=new Map(),textCache=new Map(),pending=new Set(),inflight=new Set();let hydrationTimer;
    function loadScript(src) {
      if(!scriptLoads.has(src)) scriptLoads.set(src,new Promise((resolve,reject)=>{
        const tag=document.createElement('script');tag.src=src;
        tag.onload=()=>{tag.remove();resolve();};tag.onerror=()=>{tag.remove();scriptLoads.delete(src);reject(Error('Материалы поиска не загрузились.'));};document.head.append(tag);
      }));
      return scriptLoads.get(src);
    }
    function prepareLocal() {
      if(!localReady) localReady=loadScript(corpus.search_core).then(()=>{localEngine=createSearchEngine(window.ragSearchCorpus);}).catch(error=>{localReady=null;throw error;});
      return localReady;
    }
    function receivedText(rows) {
      for(const {chunkIndex,text} of rows) {inflight.delete(chunkIndex);if(typeof text==='string')textCache.set(chunkIndex,text);}
      for(const box of list.querySelectorAll('[data-excerpt-index]')) {
        const index=Number(box.dataset.excerptIndex),hit=lastHits.find(h=>h.chunkIndex===index);
        if(hit&&textCache.has(index)) {box.textContent=searchExcerpt(textCache.get(index),hit.terms,corpus.word_forms);window.renderTelegramEmoji?.(box);excerptObserver.unobserve(box);}
      }
    }
    function excerptFailure(indices) {
      for(const index of indices) inflight.delete(index);
      for(const box of list.querySelectorAll('[data-excerpt-index]')) if(indices.includes(Number(box.dataset.excerptIndex))) {
        box.replaceChildren();const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить загрузку фрагмента';
        retry.onclick=()=>{box.textContent='Загрузка фрагмента…';queueExcerpt(Number(box.dataset.excerptIndex));};box.append(retry);
      }
    }
    async function hydrateLocal(indices) {
      await prepareLocal();
      const full=window.ragSearchCorpus,hits=lastHits.filter(h=>indices.includes(h.chunkIndex));
      await Promise.all([...new Set(hits.map(h=>full.text_files[String(h.id)]))].filter(Boolean).map(loadScript));
      return hydrateSearchHits(hits,window.ragSearchTexts);
    }
    function queueExcerpt(index) {
      if(textCache.has(index)||inflight.has(index)) return;
      pending.add(index);clearTimeout(hydrationTimer);hydrationTimer=setTimeout(drainExcerpts,0);
    }
    function drainExcerpts() {
      const indices=[...pending].slice(0,8);if(!indices.length)return;
      for(const index of indices) {pending.delete(index);inflight.add(index);}
      if(worker) worker.postMessage({id:version,query:lastQuery,hydrate:indices});
      else hydrateLocal(indices).then(rows=>receivedText(rows.map(h=>({chunkIndex:h.chunkIndex,text:h.text})))).catch(()=>excerptFailure(indices));
      if(pending.size) hydrationTimer=setTimeout(drainExcerpts,20);
    }
    const excerptObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)queueExcerpt(Number(entry.target.dataset.excerptIndex));},{rootMargin:'250px'});
    function prepareWorker() {
      if(worker||workerFailed||location.protocol==='file:'||typeof Worker==='undefined') return false;
      try {
        worker=new Worker('search-worker.js?v='+corpus.asset_version);
        worker.onmessage=event=>{
          const result=event.data;
          if(result.hydrated) {receivedText(result.hydrated);if(result.error)excerptFailure(result.indices||[]);return;}
          if(result.prepared)return;
          if(result.id!==version)return;
          if(result.error) {searchFailure();return;}
          render(result.hits,result.query);
        };
        worker.onerror=event=>{event.preventDefault();worker.terminate();worker=null;workerFailed=true;inflight.clear();if(search.value.trim())requestSearch();};
        worker.postMessage({core:corpus.search_core,prepare:true});return true;
      } catch(_) {workerFailed=true;return false;}
    }
    function searchFailure() {
      list.removeAttribute('aria-busy');count.textContent='Не удалось загрузить поиск. ';
      const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить';retry.onclick=requestSearch;count.append(retry);
    }
    function closeChannel() {
      panel.classList.remove('is-open');panel.removeAttribute('role');panel.removeAttribute('aria-modal');document.querySelector('.search-pane').inert=false;
      returnFocus?.focus({preventScroll:true});
    }
    async function showMessage(id,reveal=false) {
      const request=++selectionVersion,message=document.getElementById('channel-message-'+id);
      if(!message) return;
      if(selectedId!==null) {
        byId.get(selectedId)?.classList.remove('is-selected');byId.get(selectedId)?.querySelector('[data-channel-id]')?.removeAttribute('aria-current');
        document.getElementById('channel-message-'+selectedId)?.classList.remove('is-selected');
      }
      selectedId=Number(id);byId.get(selectedId)?.classList.add('is-selected');byId.get(selectedId)?.querySelector('[data-channel-id]')?.setAttribute('aria-current','true');message.classList.add('is-selected');
      if(reveal&&compact.matches) {
        returnFocus=document.activeElement;panel.classList.add('is-open');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');document.querySelector('.search-pane').inert=true;document.getElementById('close-channel').focus({preventScroll:true});
      }
      const visible=()=>!compact.matches||panel.classList.contains('is-open');
      if(visible())message.scrollIntoView({block:'center',inline:'nearest'});
      try {
        await window.ensureChannelMessage?.(Number(id));
        if(request!==selectionVersion)return;
        highlightRag(message,search.value.trim(),corpus);
        if(visible())(message.querySelector('mark[data-rag]')||message).scrollIntoView({block:'center',inline:'nearest'});
      } catch(_) {/* The feed shows a retry button and keeps the selected placeholder. */}
    }
    function render(hits,query) {
      lastHits=hits;excerptObserver.disconnect();pending.clear();const mode=filter.value,matches=new Map(hits.map(h=>[h.id,h]));
      activeHighlights={query,terms:[...new Set([...highlightTerms(query,corpus),...(hits[0]?.terms || [])])]};
      const order=mode==='service'?cards.filter(c=>c.dataset.service==='1'&&(!query||c.textContent.toLowerCase().includes(query.toLowerCase()))):query?hits.map(h=>byId.get(h.id)).filter(Boolean):cards;
      for(const card of cards) card.hidden=true;
      const fragment=document.createDocumentFragment();let total=0,first=null;
      for(const card of order) {
        if(mode!=='service'&&(card.dataset.service==='1'||mode==='context'&&card.dataset.context!=='1'||mode==='questions'&&card.dataset.question!=='1')) continue;
        fragment.append(card);card.hidden=false;total++;first??=Number(card.dataset.id);
        const hit=matches.get(Number(card.dataset.id)),box=card.querySelector('.search-match');box.replaceChildren();box.hidden=!hit?.source;
        if(hit?.source) {
          const link=document.createElement('a');link.href=hit.source.url;link.target='_blank';link.rel='noreferrer';link.textContent='Фрагмент по ссылке: '+hit.source.title;
          const excerpt=document.createElement('p'),text=typeof hit.text==='string'?hit.text:textCache.get(hit.chunkIndex);
          excerpt.textContent=typeof text==='string'?searchExcerpt(text,hit.terms || activeHighlights.terms,corpus.word_forms):'Загрузка фрагмента…';box.append(link,excerpt);
          if(typeof text!=='string') {excerpt.dataset.excerptIndex=hit.chunkIndex;excerptObserver.observe(excerpt);}
          window.renderTelegramEmoji?.(excerpt);
        }
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
      prepareWorker();
      if(worker) worker.postMessage({id,query,core:corpus.search_core});
      else prepareLocal().then(()=>{if(id===version)render(localEngine.rank(query),query);}).catch(()=>{if(id===version)searchFailure();});
    }
    search.addEventListener('focus',()=>{if(!prepareWorker()&&!worker)prepareLocal().catch(()=>{});},{once:true});
    search.addEventListener('input',()=>{clearTimeout(timer);version++;timer=setTimeout(requestSearch,50);});filter.addEventListener('change',()=>{clearTimeout(timer);requestSearch();});
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
