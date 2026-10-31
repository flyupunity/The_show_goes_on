/* Shared, local-only progress across every variant of one olympiad. */
(function(root) {
  'use strict';
  const g=root.CONTEST_ENGINE || (typeof require==='function'?require('./grader.js'):null);
  const weight=task=>Number.isFinite(task.difficultyWeight)&&task.difficultyWeight>0?task.difficultyWeight:1;
  const formatPercent=value=>value>0&&value<0.1?'<0,1':(value<100?Math.min(99.9,value):value).toLocaleString('ru-RU',{maximumFractionDigits:1});
  function calculate(catalog, states={}) {
    const result={earned:0,total:0,automaticWeight:0,manualWeight:0,solvedTasks:0,filledTasks:0,tasks:0,automaticFields:0,manualFields:0,filledFields:0,pendingFields:0,incorrectFields:0};
    for(const contest of catalog) {
      const state=states[contest.id] || {};
      for(const task of contest.tasks) {
        result.tasks++;const taskWeight=weight(task),fields=task.fields || [],answers=state.answers?.[task.id] || {};
        result.total+=taskWeight;let done=0,filled=0;
        const whole=state.checks?.[task.id],wholeChecked=whole?.attempts>0&&whole.fingerprint===g.fingerprint(task,answers);
        for(const field of fields) {
          const value=answers[field.key];if(!g.filled(value))continue;
          result.filledFields++;filled++;
          const descriptor=task.progressFields?.[field.key],rule=descriptor?.rule,manual=descriptor?.manual===true || (descriptor?.manual!==false&&g.isManual(rule));
          const share=taskWeight/fields.length;
          if(manual) {
            if(state.manualSolved?.[task.id]?.[field.key]===g.fieldFingerprint(value)) {result.manualFields++;result.manualWeight+=share;done++;}
            else result.pendingFields++;
          } else {
            const last=state.fieldChecks?.[task.id]?.[field.key],checked=last?.attempts>0&&last.fingerprint===g.fieldFingerprint(value) || wholeChecked;
            if(!checked) {result.pendingFields++;continue;}
            const status=g.checkRule(rule,value,field).status;
            if(status==='correct') {result.automaticFields++;result.automaticWeight+=share;done++;}
            else if(status==='incorrect'||status==='invalid')result.incorrectFields++;
            else result.pendingFields++;
          }
        }
        if(fields.length&&done===fields.length)result.solvedTasks++;
        if(fields.length&&filled===fields.length)result.filledTasks++;
      }
    }
    result.earned=Math.min(result.total,result.automaticWeight+result.manualWeight);
    result.percent=result.total?100*result.earned/result.total:0;
    return result;
  }
  function readStates(catalog,storage) {
    const states={};let unavailable=false;
    for(const contest of catalog) {
      try {
        const saved=JSON.parse(storage.getItem(g.storageKey(contest)));
        states[contest.id]=g.restoreState(saved,contest.tasks) || {};
      } catch(_) {states[contest.id]={};unavailable=true;}
    }
    return {states,unavailable};
  }
  let dispose;
  function attach({series,catalog,getCurrent}) {
    if(typeof document==='undefined')return;
    dispose?.();document.getElementById('series-progress')?.remove();
    const panel=document.createElement('section');panel.id='series-progress';panel.className='series-progress';panel.setAttribute('aria-label','Общий прогресс '+series.name);
    const esc=g.escapeHTML;
    panel.innerHTML=`<div class="series-progress-heading"><span><strong>${esc(series.name)} · общий прогресс</strong><span class="series-progress-scope">Все ${catalog.length} вариантов · учебный вес по сложности</span></span><strong data-series-percent>0%</strong></div><div class="series-progress-track" role="progressbar" aria-label="Общий прогресс ${esc(series.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-series-fill></span></div><div class="series-progress-meta"><span data-series-summary></span><span data-series-confirmed></span></div><details class="series-progress-help"><summary>Как считается прогресс</summary><p>Сложность оценивается от 1 до 3. Вес отбора — 1–3, основного этапа или второго отбора — 4–6, финала — 7–9; у тренировочного банка — 1–3. Поэтому любая задача следующего этапа весит больше задачи предыдущего. Пункты делят вес задачи поровну. Засчитываются проверенные верные ответы и явно подтверждённая самопроверка. Это учебная оценка, а не официальные баллы олимпиады.</p></details><p class="series-progress-warning" data-series-warning hidden>Сохранённый прогресс доступен не полностью. Проверьте настройки хранения браузера и сохраните JSON прогресса.</p>`;
    document.querySelector('.topbar').after(panel);
    let storage,loaded;
    function reload() {
      try {storage=root.localStorage;loaded=readStates(catalog,storage);}
      catch(_) {loaded={states:{},unavailable:true};}
    }
    function update() {
      if(!loaded)reload();
      const current=getCurrent?.(),states={...loaded.states};
      if(current&&catalog.some(c=>c.id===current.contestId))states[current.contestId]=current.state;
      const progress=calculate(catalog,states),percent=formatPercent(progress.percent);
      panel.querySelector('[data-series-percent]').textContent=percent+'%';
      panel.querySelector('[data-series-fill]').style.width=progress.percent+'%';
      panel.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',String(Math.round(progress.percent*10)/10));
      panel.querySelector('[data-series-summary]').textContent=`Зачтено ${progress.solvedTasks} из ${progress.tasks} задач · заполнено ${progress.filledTasks}`;
      panel.querySelector('[data-series-confirmed]').textContent=`Верных пунктов: ${progress.automaticFields} · самопроверка: ${progress.manualFields}`;
      panel.querySelector('[data-series-warning]').hidden=!loaded.unavailable;
      return progress;
    }
    const refresh=()=>{reload();update();};
    const storageChanged=event=>{if(event.key===null||catalog.some(c=>g.storageKey(c)===event.key))refresh();};
    document.addEventListener('contest:progress',update);root.addEventListener('storage',storageChanged);root.addEventListener('pageshow',refresh);
    dispose=()=>{document.removeEventListener('contest:progress',update);root.removeEventListener('storage',storageChanged);root.removeEventListener('pageshow',refresh);};
    update();return {update,refresh,destroy:dispose};
  }
  const api=Object.freeze({calculate,readStates,attach,weight,formatPercent});root.CONTEST_PROGRESS=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
