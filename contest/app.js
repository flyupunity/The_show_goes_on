window.CONTEST_APP_START = () => {
  'use strict';
  const g=window.CONTEST_ENGINE, $=id=>document.getElementById(id), esc=g.escapeHTML;
  const series=g.seriesConfig(new URLSearchParams(location.search).get('series'),window);
  const catalog=series.catalog.map(c=>({...c,series:series.id}));
  const selected=catalog.find(c=>c.id===new URLSearchParams(location.search).get('contest')) || catalog.find(c=>c.id==='2025-r2-v3') || catalog[0];
  if (!selected) {$('main').textContent='В этом разделе пока нет контестов.';return;}
  const tasks=selected.tasks, keys=series.keys[selected.id]||{}, key=g.storageKey(selected);
  const catalogURL='index.html'+series.query;
  const contestURL=id=>'play.html'+(series.query || '?series=dano')+'&contest='+encodeURIComponent(id);
  document.title=`${series.name} · ${selected.year} · ${selected.title}`;
  document.querySelector('.brand-mark').textContent=series.brand;
  document.querySelector('.brand').href=catalogURL;
  let state=g.freshState(), storageOK=true, saveTimer, toastTimer;
  try {state=g.restoreState(JSON.parse(localStorage.getItem(key)),tasks)||state;} catch (_) {storageOK=false;}
  const answers=t=>state.answers[t.id]||{}, checked=t=>g.checkedTask(state,t,keys[t.id]);
  const answered=t=>t.fields.filter(f=>g.filled(answers(t)[f.key])).length;
  const complete=t=>answered(t)===t.fields.length;
  const elapsed=()=>state.elapsed+(state.runningSince?Math.max(0,Date.now()-state.runningSince):0);
  const timeString=ms=>[Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':');
  const status=t=>({correct:'Верно',incorrect:'Есть ошибка',manual:'Самопроверка'}[checked(t)?.status] || (answered(t)?complete(t)?'Заполнено':`${answered(t)} из ${t.fields.length}`:'Пусто'));
  const stats=()=>({correct:tasks.filter(t=>checked(t)?.status==='correct').length,full:tasks.filter(complete).length,partial:tasks.filter(t=>answered(t)&&!complete(t)).length,fields:tasks.reduce((n,t)=>n+answered(t),0),total:tasks.reduce((n,t)=>n+t.fields.length,0)});
  function persist() {
    clearTimeout(saveTimer);saveTimer=null;state.updatedAt=new Date().toISOString();
    try {localStorage.setItem(key,JSON.stringify(state));storageOK=true;} catch (_) {storageOK=false;}
    $('save-status').textContent=storageOK?'Сохранено в этом браузере':'Автосохранение недоступно. Скачайте JSON прогресса.';
    $('save-status').classList.toggle('error',!storageOK);
  }
  function saveSoon() {clearTimeout(saveTimer);$('save-status').textContent='Сохраняется…';saveTimer=setTimeout(persist,250);}
  function paintNav() {
    const s=stats();$('contest-name').textContent=`${selected.year} / ${selected.title}`;$('sidebar-year').textContent=series.name+' / '+selected.year;
    $('progress-label').textContent=`Верно ${s.correct} из ${tasks.length} · заполнено ${s.full}`;$('progress-bar').style.width=100*s.full/tasks.length+'%';
    $('task-nav').innerHTML=tasks.map(t=>`<button data-task="${t.id}" class="nav-task ${state.current===t.id?'active':''} ${checked(t)?.status==='correct'?'complete':''} ${state.flags[t.id]?'flagged':''}" ${state.current===t.id?'aria-current="page"':''} aria-label="Задача ${t.id}. ${esc(t.title)}. ${status(t)}">${t.id}</button>`).join('');
    $('finish-btn').textContent=state.finished?'Итоги попытки':'Завершить попытку';$('finish-btn').disabled=!state.started;$('clock').textContent=timeString(elapsed());
  }
  function overview() {
    const s=stats();
    $('main').innerHTML=`<div class="overview"><span class="eyebrow">${esc(series.caption)} · ${selected.year}</span><h1>${esc(selected.title)}</h1><div class="intro-meta"><span>${tasks.length} задач</span><span>${s.fields} из ${s.total} полей заполнено</span><span>Без ограничения времени</span></div>${state.finished?`<p class="finished-banner">Попытка завершена · ${timeString(elapsed())}. Ответы можно исправлять и проверять.</p>`:''}<div class="intro-actions"><button class="button primary" id="start-btn">${state.started?'Продолжить решение':'Начать контест'}</button>${state.started&&!state.finished?`<button class="button" id="pause-btn">${state.runningSince?'Пауза таймера':'Продолжить таймер'}</button>`:''}<button class="button" id="download-main">Скачать ответы</button><button class="button" id="download-json">JSON прогресса</button><label class="button import-label">Загрузить прогресс<input type="file" id="import-file" accept=".json,application/json" aria-label="Загрузить прогресс из JSON"></label></div><p class="storage-note">Ответы и черновики сохраняются в этом браузере. Для переноса на другое устройство используйте JSON прогресса. Проверять каждый пункт можно сколько угодно раз; развёрнутые решения проверяются по критериям.</p><div class="section-heading"><h2>Задачи</h2><span>${s.full} из ${tasks.length} заполнено</span></div><div class="overview-list">${tasks.map(t=>`<button class="overview-item" data-task="${t.id}"><span>${String(t.id).padStart(2,'0')}</span><span>${esc(t.title)}${t.data?' · Датасет':''}${state.flags[t.id]?' ⚑':''}</span><span>${status(t)}</span></button>`).join('')}</div></div>`;
    $('start-btn').onclick=()=>{state.started=true;state.finished=false;state.runningSince ||= Date.now();showTask((tasks.find(t=>!complete(t))||tasks[0]).id);};
    $('pause-btn')?.addEventListener('click',()=>{if(state.runningSince){state.elapsed=elapsed();state.runningSince=null;}else state.runningSince=Date.now();persist();render();});
    $('download-main').onclick=exportAnswers;$('download-json').onclick=exportJSON;$('import-file').onchange=importProgress;
  }
  function fieldHTML(task,f) {
    const value=answers(task)[f.key]??'', id=`q${task.id}-${f.key}`;
    let input;
    if (['choice','multi'].includes(f.type)) input=`<fieldset><legend class="field-label">${esc(f.label)}</legend><div class="choices">${f.options.map((o,i)=>`<label class="choice"><input type="${f.type==='multi'?'checkbox':'radio'}" name="${id}" data-key="${f.key}" value="${esc(o)}" ${(Array.isArray(value)?value.includes(o):value===o)?'checked':''}><span class="choice-no">${i+1}</span><span>${esc(o)}</span></label>`).join('')}</div><button type="button" class="clear-link" data-clear="${f.key}">Снять выбор</button></fieldset>`;
    else {
      const label=`<label class="field-label" for="${id}">${esc(f.label)}</label>`;
      if (f.type==='select') input=label+`<select id="${id}" data-key="${f.key}"><option value="">Выберите вариант</option>${f.options.map(o=>`<option ${value===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
      else if (f.type==='textarea') input=label+`<textarea id="${id}" data-key="${f.key}" placeholder="Решение, расчёты или код">${esc(value)}</textarea>`;
      else input=label+`<div class="input-unit"><input type="text" id="${id}" data-key="${f.key}" value="${esc(value)}" ${f.type==='number'?'inputmode="decimal"':''} autocomplete="off" placeholder="Введите ответ" aria-describedby="${id}-error">${f.unit?`<span>${esc(f.unit)}</span>`:''}</div><p class="field-error" id="${id}-error" hidden></p>`;
    }
    return `<div class="answer-field" data-field="${f.key}">${input}<div class="check-actions"><button type="button" class="button" data-check="${f.key}" aria-label="Проверить пункт: ${esc(f.label)}">Проверить пункт</button><span class="check-attempts" data-attempts="${f.key}"></span></div><div class="field-feedback" data-feedback="${f.key}" role="status" aria-live="polite" hidden></div></div>`;
  }
  function renderTask(task) {
    const index=tasks.indexOf(task);
    $('main').innerHTML=`<article class="task-card"><div class="task-topline"><span class="eyebrow">Задача ${task.id} из ${tasks.length}</span><button class="button small" id="flag-btn" aria-pressed="${!!state.flags[task.id]}">${state.flags[task.id]?'⚑ Отмечена':'⚑ На потом'}</button></div><h1>${esc(task.title)}</h1>${state.finished?'<p class="finished-banner">Попытка завершена. Проверка пунктов и редактирование доступны; таймер остановлен.</p>':''}<section class="task-body" aria-label="Условие">${task.html}</section><section class="answers" aria-label="Ответы"><div class="answers-header"><h2>Твой ответ</h2><span id="answer-progress"></span></div><form id="answer-form" novalidate>${task.fields.map(f=>fieldHTML(task,f)).join('')}</form><div class="answer-checker"><div class="check-actions"><button class="button primary" id="check-answer-btn">Проверить всё задание</button><span class="check-attempts" id="check-attempts"></span></div><div class="check-result" id="check-result" role="status" aria-live="polite" hidden></div></div></section><details class="notes"${state.notes[task.id]?' open':''}><summary>Черновик · заметки, расчёты или код</summary><label class="sr-only" for="task-notes">Черновик задачи ${task.id}</label><textarea id="task-notes">${esc(state.notes[task.id]||'')}</textarea></details><div class="task-bottom"><button class="button primary" id="prev-btn"${index===0?' disabled':''}>← Предыдущая</button><span>${index+1} / ${tasks.length}</span><button class="button primary" id="next-btn">${index===tasks.length-1?'К завершению':'Следующая →'}</button></div></article>`;
    $('flag-btn').onclick=()=>{state.flags[task.id]=!state.flags[task.id];persist();render();};
    $('prev-btn').onclick=()=>showTask(tasks[index-1].id);$('next-btn').onclick=()=>index===tasks.length-1?openFinish():showTask(tasks[index+1].id);
    $('answer-form').onsubmit=e=>e.preventDefault();
    $('answer-form').oninput=e=>{
      const f=task.fields.find(f=>f.key===e.target.dataset.key);if(!f)return;
      g.beginAnswer(state);state.answers[task.id] ||= {};
      state.answers[task.id][f.key]=f.type==='multi'?[...e.target.closest('fieldset').querySelectorAll('input:checked')].map(el=>el.value):e.target.value;
      validate(e.target,f);feedback(task);paintNav();saveSoon();
    };
    $('answer-form').onclick=e=>{
      const clear=e.target.dataset.clear, field=e.target.dataset.check;
      if(clear){delete state.answers[task.id]?.[clear];persist();render();}
      else if(field)check(task,field);
    };
    $('check-answer-btn').onclick=()=>check(task);
    $('task-notes').oninput=e=>{state.notes[task.id]=e.target.value;saveSoon();};
    $('answer-form').querySelectorAll('input[type=text]').forEach(el=>validate(el,task.fields.find(f=>f.key===el.dataset.key)));
    $('main').querySelectorAll('figure img').forEach(img=>{
      const button=document.createElement('button');button.type='button';button.className='image-button';button.setAttribute('aria-label','Увеличить: '+img.alt);
      img.replaceWith(button);button.append(img);button.onclick=()=>{$('large-image').src=img.src;$('large-image').alt=img.alt;$('image-dialog').showModal();};
    });
    feedback(task);
  }
  function feedback(task) {
    $('answer-progress').textContent=`${answered(task)} из ${task.fields.length} заполнено`;
    for (const f of task.fields) {
      const wrapper=[...$('answer-form').children].find(el=>el.dataset.field===f.key), last=state.fieldChecks[task.id]?.[f.key], result=g.fieldResult(state,task,f,keys[task.id]);
      const box=wrapper.querySelector('[data-feedback]');box.hidden=!last;box.className='field-feedback'+(result?' field-feedback-'+result.status:'');
      box.innerHTML=result?g.feedbackHTML(result):'Ответ изменён. Проверьте этот пункт снова.';
      wrapper.querySelector('[data-attempts]').textContent=`Попыток: ${last?.attempts||0} · без ограничений`;
    }
    const result=checked(task), box=$('check-result');box.hidden=!result;
    if(result){box.className='check-result check-result-'+result.status;box.innerHTML=g.feedbackHTML(result)+`<p>${result.automatic?`Автоматически верно: ${result.counts.correct} из ${result.automatic}. `:''}${result.counts.manual?`Самопроверка: ${result.counts.manual}.`:''}</p>`;}
    $('check-attempts').textContent=`Проверок всего задания: ${state.checks[task.id]?.attempts||0}`;
  }
  function check(task,field) {g.recordCheck(state,task,field);persist();paintNav();feedback(task);}
  function validate(el,f) {
    if(f?.type!=='number')return;
    const bad=el.value.trim()!=='' && g.parseNumber(el.value,f)===null;el.setAttribute('aria-invalid',String(bad));
    const box=$(el.id+'-error');box.hidden=!bad;box.textContent='Введите число с точкой, запятой или дробью (1/3).';
  }
  function render() {paintNav();const task=tasks.find(t=>t.id===state.current);if(task)renderTask(task);else overview();if(!storageOK)$('save-status').textContent='Автосохранение недоступно. Скачайте JSON прогресса.';}
  function showTask(id) {state.current=id;persist();render();history.replaceState(null,'',id?'#task-'+id:'#overview');window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});}
  function openFinish() {
    if(state.finished){showTask(0);return;}
    const s=stats();$('finish-summary').textContent=`Заполнено ${s.full} из ${tasks.length} задач, частично ${s.partial}. Время: ${timeString(elapsed())}.`;$('finish-dialog').showModal();
  }
  function notify(text) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4500);}
  function download(suffix,content,type) {
    const url=URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a');a.href=url;a.download=`${series.id}-${selected.id}-${suffix}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function exportJSON() {persist();download('progress.json',JSON.stringify({...state,elapsed:elapsed(),runningSince:null,contest:key},null,2),'application/json');}
  function exportAnswers() {
    persist();download('answers.txt','\ufeff'+[`${series.name} ${selected.year} · ${selected.title}`,`Время: ${timeString(elapsed())}`,`Дата экспорта: ${state.updatedAt}`,'',...tasks.flatMap(t=>[`${t.id}. ${t.title} · ${status(t)}`,...t.fields.map(f=>`  ${f.label}: ${Array.isArray(answers(t)[f.key])?answers(t)[f.key].join('; '):answers(t)[f.key]||'—'}`),...(state.notes[t.id]?['  Черновик:',state.notes[t.id]]:[]),''])].join('\n'),'text/plain;charset=utf-8');
  }
  async function importProgress(e) {
    const file=e.target.files?.[0];if(!file)return;
    try {
      if(file.size>3*1024*1024)throw Error('Файл слишком большой.');
      const data=JSON.parse(await file.text());if(data.contest!==key)throw Error('Это прогресс другого контеста.');
      const next=g.restoreState(data,tasks);if(!next)throw Error('Не удалось прочитать прогресс.');
      if((stats().fields||Object.values(state.notes).some(Boolean))&&!confirm('Заменить текущие ответы и черновики?'))return;
      next.elapsed+=next.runningSince?Date.now()-next.runningSince:0;next.runningSince=null;next.current=0;state=next;persist();render();notify('Прогресс загружен. Таймер на паузе.');
    }catch(err){notify(err.message||'Не удалось загрузить файл.');}finally{e.target.value='';}
  }
  function leave(url) {if(state.runningSince){state.elapsed=elapsed();state.runningSince=null;}persist();location.href=url;}
  $('task-nav').onclick=e=>{const b=e.target.closest('[data-task]');if(b)showTask(Number(b.dataset.task));};
  $('main').addEventListener('click',e=>{const b=e.target.closest('[data-task]');if(b)showTask(Number(b.dataset.task));});
  document.querySelector('.brand').onclick=e=>{e.preventDefault();leave(catalogURL);};
  document.querySelector('.home-link').onclick=e=>{e.preventDefault();leave('../index.html');};
  $('library-btn').onclick=()=>leave(catalogURL);$('overview-btn').onclick=()=>showTask(0);$('export-btn').onclick=exportAnswers;
  $('contest-picker').innerHTML=catalog.map(c=>`<option value="${esc(c.id)}"${c.id===selected.id?' selected':''}>${c.year} · ${esc(c.title)}</option>`).join('');
  $('contest-picker').onchange=e=>leave(contestURL(e.target.value));$('finish-btn').onclick=openFinish;
  $('cancel-finish').onclick=()=>$('finish-dialog').close();$('confirm-finish').onclick=()=>{state.elapsed=elapsed();state.runningSince=null;state.finished=true;$('finish-dialog').close();showTask(0);};
  $('close-image').onclick=()=>$('image-dialog').close();
  window.addEventListener('pagehide',persist);
  window.addEventListener('storage',e=>{if(e.key===key&&e.newValue){try{const next=g.restoreState(JSON.parse(e.newValue),tasks);if(next){state=next;render();}}catch(_){}}});
  window.addEventListener('hashchange',()=>{const id=Number(location.hash.match(/^#task-(\d+)$/)?.[1]);if(tasks.some(t=>t.id===id)){state.current=id;render();}});
  const id=Number(location.hash.match(/^#task-(\d+)$/)?.[1]);if(tasks.some(t=>t.id===id))state.current=id;
  render();setInterval(()=>{$('clock').textContent=timeString(elapsed());},1000);
};
