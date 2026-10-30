/* Local Telegram emoji assets. Keep the Unicode character for copy and accessibility. */
(() => {
  'use strict';
  const data=window.telegramEmojiData;
  if (!data) return;
  const escaped=char=>char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const expression=Object.keys(data.standard).sort((a,b)=>[...b].length-[...a].length).map(key=>[...key].map(char=>escaped(char)+(char==='\u200d'?'':'\ufe0f?')).join('')).join('|');
  const pattern=new RegExp(expression || '(?!)','gu');
  window.renderTelegramEmoji = root => {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node) {
      return node.parentElement?.closest('script,style,textarea,input,.telegram-emoji')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text=node.nodeValue, fragment=document.createDocumentFragment(); let start=0, changed=false;
      pattern.lastIndex=0;
      for (const match of text.matchAll(pattern)) {
        if (text[match.index+match[0].length]==='\ufe0e') continue;
        fragment.append(document.createTextNode(text.slice(start,match.index)));
        const span=document.createElement('span'); span.className='telegram-emoji';
        span.style.backgroundImage=`url("${data.standard[match[0].replace(/\ufe0f/g,'')]}")`;
        const character=document.createElement('span'); character.className='emoji-character'; character.textContent=match[0];
        span.append(character); fragment.append(span); start=match.index+match[0].length; changed=true;
      }
      if (changed) {fragment.append(document.createTextNode(text.slice(start)));node.replaceWith(fragment);}
    }
  };
  function animate() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const players=new WeakMap(), active=new WeakSet(), loading=new WeakSet(), scripts=new Map();
    window.telegramEmojiFrames={};
    function script(src) {
      if (!scripts.has(src)) scripts.set(src,new Promise((resolve,reject)=>{
        const tag=document.createElement('script'); tag.src=src;
        tag.onload=()=>{tag.remove();resolve();}; tag.onerror=()=>{tag.remove();scripts.delete(src);reject();};
        document.head.append(tag);
      }));
      return scripts.get(src);
    }
    async function play(element) {
      if (loading.has(element)) return;
      let player=players.get(element);
      if (!player) {
        loading.add(element);
        const id=element.dataset.customEmoji, asset=data.custom[id];
        try {
          if (asset.type==='tgs') await Promise.all([script('lottie.min.js'),script(asset.runtime)]);
          if (!element.isConnected || !active.has(element)) return;
          const layer=document.createElement('span'); layer.className='emoji-animation'; layer.setAttribute('aria-hidden','true');
          element.append(layer);
          if (asset.type==='tgs') {
            player=window.lottie.loadAnimation({container:layer,renderer:'svg',loop:true,autoplay:false,animationData:structuredClone(window.telegramEmojiFrames[id]),rendererSettings:{progressiveLoad:true}});
            player.addEventListener('DOMLoaded',()=>element.classList.add('emoji-playing'));
          } else {
            player=document.createElement('video'); player.src=asset.animation; player.muted=true; player.loop=true; player.playsInline=true;
            player.setAttribute('aria-hidden','true'); player.setAttribute('disablepictureinpicture','');
            player.addEventListener('loadeddata',()=>element.classList.add('emoji-playing')); layer.append(player);
          }
          players.set(element,player);
        } catch (_) { return; }
        finally { loading.delete(element); }
      }
      const playing=player.play(); if(playing?.catch) playing.catch(()=>element.classList.remove('emoji-playing'));
    }
    const observer=new IntersectionObserver(entries=> {
      for (const entry of entries) {
        if (entry.isIntersecting) {active.add(entry.target);play(entry.target);}
        else {active.delete(entry.target);players.get(entry.target)?.pause();}
      }
    },{rootMargin:'80px'});
    function track(root) {
      for (const element of root.querySelectorAll('[data-custom-emoji]')) if (data.custom[element.dataset.customEmoji]?.animation) observer.observe(element);
    }
    document.addEventListener('rag:message',event=>track(event.detail.message));
    document.addEventListener('rag:unmount',event=>{
      for (const element of event.detail.message.querySelectorAll('[data-custom-emoji]')) {
        observer.unobserve(element);active.delete(element);
        const player=players.get(element); if(player?.destroy) player.destroy(); else if(player) {player.pause();player.removeAttribute('src');player.load();}
        players.delete(element);
      }
    });
    track(document);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',animate,{once:true}); else animate();
})();
