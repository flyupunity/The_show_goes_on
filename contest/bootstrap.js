/* Load only the chosen series index and the selected contest. Works with file://. */
(() => {
  'use strict';
  const base=new URL('.',document.currentScript.src), revision=new URL(document.currentScript.src).search, scripts=new Map();
  const main=document.getElementById('library-main') || document.getElementById('main');
  const play=main.id==='main', series=new URLSearchParams(location.search).get('series')==='vk'?'vk':'dano';
  let started=false;
  function load(file) {
    if(!scripts.has(file)) scripts.set(file,new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=new URL(file,base).href+revision;
      script.onload=()=>{script.remove();resolve();};
      script.onerror=()=>{script.remove();scripts.delete(file);reject(Error('Не удалось загрузить материалы.'));};
      document.head.append(script);
    }));
    return scripts.get(file);
  }
  async function start() {
    if(started) return;
    main.setAttribute('aria-busy','true');
    main.innerHTML='<div class="overview"><p role="status">Загрузка контестов…</p></div>';
    try {
      let manifest=window.CONTEST_MANIFESTS?.[series];
      if(!manifest) {await load(`manifest-${series}.js`);manifest=window.CONTEST_MANIFEST;}
      if(manifest?.series!==series || !manifest.catalog?.length) throw Error('Не удалось прочитать каталог.');
      window.CONTEST_MANIFESTS ||= {};window.CONTEST_MANIFESTS[series]=manifest;
      let catalog=manifest.catalog, keys={};
      if(play) {
        const requested=new URLSearchParams(location.search).get('contest');
        const selected=catalog.find(c=>c.id===requested) || catalog.find(c=>c.id==='2025-r2-v3') || catalog[0];
        if(!/^packs\/(?:dano|vk)-[a-z0-9-]+\.js$/.test(selected.asset)) throw Error('Неверный адрес контеста.');
        await load(selected.asset);
        const pack=window.CONTEST_PACK;
        if(pack?.series!==series || pack.contest?.id!==selected.id) throw Error('Не удалось прочитать контест.');
        catalog=catalog.map(c=>c.id===selected.id?pack.contest:c);
        keys[selected.id]=pack.keys;
      }
      window[series==='vk'?'VK_CONTEST_CATALOG':'CONTEST_CATALOG']=catalog;
      window[series==='vk'?'VK_CONTEST_ANSWER_KEYS':'CONTEST_ANSWER_KEYS']=keys;
      const entry=play?'CONTEST_APP_START':'CONTEST_LIBRARY_START';
      if(typeof window[entry]!=='function') await load(play?'app.js':'library.js');
      if(typeof window[entry]!=='function') throw Error('Не удалось запустить контест.');
      await window[entry]();started=true;
      main.removeAttribute('aria-busy');
    } catch(error) {
      scripts.clear();
      main.removeAttribute('aria-busy');
      main.innerHTML='<div class="overview"><h1>Материалы не загрузились</h1><p role="status">Проверьте подключение или наличие файлов рядом со страницей.</p><button type="button" class="button primary" id="retry-contest">Повторить загрузку</button></div>';
      document.getElementById('retry-contest').onclick=()=>{window.CONTEST_READY=start();};
    }
  }
  window.CONTEST_READY=start();
})();
