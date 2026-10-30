/* Keep index construction and ranking off the UI thread. */
importScripts('app.js');
let engine;
onmessage=({data})=>{
  if(data.corpus) engine=createSearchEngine(data.corpus);
  else postMessage({id:data.id,query:data.query,hits:engine.rank(data.query)});
};
