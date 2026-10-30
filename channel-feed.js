/* Keep the full archive in inert templates; mount only the visible part of the feed. */
(() => {
  const feed=document.getElementById('channel-feed');
  if (!feed) return;
  const messages=new Map([...feed.querySelectorAll('.channel-message')].map(node=>[Number(node.dataset.messageId),node]));
  const nearby=new Set();let cleanupPending=false;
  function release(message,height) {
    if (message.classList.contains('is-lazy') || message.classList.contains('is-selected')) return;
    height=height || message.getBoundingClientRect().height;
    if(height>0) message.style.setProperty('--message-height',`${Math.ceil(height)}px`);
    document.dispatchEvent(new CustomEvent('rag:unmount',{detail:{message}}));
    for (const node of [...message.childNodes]) if (node.nodeName!=='TEMPLATE') node.remove();
    message.classList.add('is-lazy');
  }
  window.ensureChannelMessage=id=>{
    const message=messages.get(Number(id));
    if (message?.classList.contains('is-lazy')) {
      message.append(message.querySelector('template').content.cloneNode(true));
      message.classList.remove('is-lazy');
      document.dispatchEvent(new CustomEvent('rag:message',{detail:{message}}));
    }
    if(!cleanupPending) {
      cleanupPending=true;requestAnimationFrame(()=>{cleanupPending=false;for(const node of messages.values()) if(!nearby.has(node)) release(node);});
    }
    return message;
  };
  const observer=new IntersectionObserver(entries=>{
    for (const entry of entries) {
      const message=entry.target;
      if (entry.isIntersecting) {nearby.add(message);window.ensureChannelMessage(message.dataset.messageId);}
      else {nearby.delete(message);release(message,entry.boundingClientRect.height);}
    }
  },{root:feed,rootMargin:'500px 0px'});
  for (const message of messages.values()) observer.observe(message);
})();
