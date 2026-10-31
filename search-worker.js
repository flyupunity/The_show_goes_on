/* The heavy search data and source excerpts stay off the UI thread. */
importScripts('app.js'+(typeof location==='undefined'?'':location.search));
let engine, corpus, legacy=false;
const loading=new Map();
function prepare(core) {
  if(engine)return;
  importScripts(core || 'search-core.js');
  corpus=globalThis.ragSearchCorpus;engine=createSearchEngine(corpus);
}
function loadText(id) {
  id=String(id);
  if(globalThis.ragSearchTexts?.[id])return Promise.resolve();
  if(!loading.has(id)) {
    const file=corpus.text_files?.[id];
    if(!file)return Promise.reject(Error('Не найден текст источника.'));
    loading.set(id,fetch(file).then(response=>{
      if(!response.ok)throw Error('Не удалось загрузить текст источника.');
      return response.text();
    }).then(source=>{
      const marker='globalThis.ragSearchTexts['+JSON.stringify(id)+']=';
      const start=source.indexOf(marker);
      if(start<0)throw Error('Неверный формат текста источника.');
      globalThis.ragSearchTexts ||= {};
      globalThis.ragSearchTexts[id]=JSON.parse(source.slice(start+marker.length).trim().replace(/;$/,''));
    }).catch(error=>{loading.delete(id);throw error;}));
  }
  return loading.get(id);
}
onmessage=({data})=>{
  const fail=error=>postMessage({id:data.id,query:data.query,error:String(error.message || error),
    ...(data.hydrate?{hydrated:[],indices:data.hydrate}:{})});
  try {
    if(data.corpus) {corpus=data.corpus;engine=createSearchEngine(corpus);legacy=true;return;}
    prepare(data.core);
    if(data.prepare) {postMessage({prepared:true});return;}
    if(data.hydrate) {
      const indices=[...new Set(data.hydrate)].filter(i=>Number.isInteger(i)&&i>=0&&i<(corpus.index?.rows.length || corpus.chunks?.length || 0));
      const post=i=>corpus.index?corpus.index.rows[i][0]:corpus.chunks[i].post_id;
      Promise.all([...new Set(indices.map(post))].map(loadText)).then(()=>postMessage({id:data.id,query:data.query,
        hydrated:indices.map(i=>({chunkIndex:i,text:globalThis.ragSearchTexts[String(post(i))][String(i)]}))})).catch(fail);
      return;
    }
    const hits=engine.rank(data.query);
    if(legacy) for(const hit of hits) if(typeof hit.text!=='string' && !globalThis.ragSearchTexts?.[String(hit.id)]) {
      const file=corpus.text_files?.[String(hit.id)];if(file)importScripts(file);
    }
    postMessage({id:data.id,query:data.query,hits:legacy?hydrateSearchHits(hits,globalThis.ragSearchTexts):hits});
  } catch(error) {fail(error);}
};
