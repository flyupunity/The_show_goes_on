/* Fetch older originals in small batches, keeping visited messages in inert templates. */
(() => {
  const feed=document.getElementById('channel-feed');
  if(!feed) return;
  const messages=new Map([...feed.querySelectorAll('.channel-message')].map(node=>[Number(node.dataset.messageId),node]));
  const nearby=new Set(),loads=new Map();let cleanupPending=false;
  window.ragChannelContent ||= {};
  function load(src) {
    if(!loads.has(src)) loads.set(src,new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;
      script.onload=()=>{script.remove();resolve();};
      script.onerror=()=>{script.remove();loads.delete(src);reject(Error('Не удалось загрузить сообщение.'));};
      document.head.append(script);
    }));
    return loads.get(src);
  }
  function release(message,height) {
    if(message.classList.contains('is-lazy')||message.classList.contains('is-selected')) return;
    height=height||message.getBoundingClientRect().height;
    if(height>0) message.style.setProperty('--message-height',`${Math.ceil(height)}px`);
    document.dispatchEvent(new CustomEvent('rag:unmount',{detail:{message}}));
    for(const node of [...message.childNodes]) if(node.nodeName!=='TEMPLATE') node.remove();
    message.classList.add('is-lazy');
  }
  function cleanup() {
    if(cleanupPending) return;
    cleanupPending=true;requestAnimationFrame(()=>{cleanupPending=false;for(const node of messages.values()) if(!nearby.has(node)) release(node);});
  }
  window.ensureChannelMessage=async id=>{
    const message=messages.get(Number(id));
    if(!message) return;
    if(message.classList.contains('is-lazy')) {
      let template=message.querySelector('template');
      if(!template) {
        await load(message.dataset.channelSrc);
        template=message.querySelector('template');
        if(!template) {
          if(typeof window.ragChannelContent[id]!=='string')throw Error('Оригинал не загрузился.');
          template=document.createElement('template');template.innerHTML=window.ragChannelContent[id];message.append(template);
        }
      }
      if(message.classList.contains('is-lazy')) {
        const stick=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80;
        message.querySelector('[data-retry-message]')?.remove();
        message.append(template.content.cloneNode(true));message.classList.remove('is-lazy');
        document.dispatchEvent(new CustomEvent('rag:message',{detail:{message}}));
        if(stick)feed.scrollTop=feed.scrollHeight;
      }
    }
    cleanup();return message;
  };
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries) {
      const message=entry.target;
      if(entry.isIntersecting) {
        nearby.add(message);
        window.ensureChannelMessage(message.dataset.messageId).catch(()=>{
          if(message.querySelector('[data-retry-message]')) return;
          const button=document.createElement('button');button.dataset.retryMessage='';button.textContent='Повторить загрузку сообщения';
          button.onclick=()=>{button.remove();window.ensureChannelMessage(message.dataset.messageId).catch(()=>message.append(button));};message.append(button);
        });
      } else {nearby.delete(message);release(message,entry.boundingClientRect.height);}
    }
  },{root:feed,rootMargin:'500px 0px'});
  const initial=location.hash.match(/^#(?:channel-)?message-(\d+)$/),target=initial&&messages.get(Number(initial[1]));
  feed.scrollTop=target?target.offsetTop:feed.scrollHeight;
  for(const message of messages.values()) observer.observe(message);
})();
