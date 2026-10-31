(function(root) {
  'use strict';
  const filled = value => Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '';
  function normalizeText(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru-RU')
      .replace(/ё/g,'е').replace(/[“”„«»"'‘’`]/g,'').replace(/[−–—-]/g,' ')
      .replace(/\s+/g,' ').trim().replace(/[.,;:!?]+$/g,'').trim();
  }
  function parseNumber(value, field = {}) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let text = String(value ?? '').normalize('NFKC').trim();
    const percentage = /%\s*$/.test(text);
    text = text.replace(/(?:%|₽|руб\.?|рублей|кг|г|ч|часа|часов|мин\.?|минут|сек\.?|секунд)\s*$/i,'')
      .replace(/[−–—]/g,'-').replace(/\s/g,'').replace(/,/g,'.');
    const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
    const parts = text.split('/');
    let n;
    if (parts.length === 2 && parts.every(p=>decimal.test(p)) && Number(parts[1]) !== 0) n = Number(parts[0])/Number(parts[1]);
    else if (parts.length === 1 && decimal.test(text)) n = Number(text);
    else return null;
    if (percentage && field.unit !== '%') n /= 100;
    return Number.isFinite(n) ? n : null;
  }
  function isManual(rule) {
    return !rule || rule.kind === 'manual' || (rule.kind === 'anyOf' && rule.rules.every(isManual));
  }
  function checkRule(rule, value, field = {}) {
    return feedbackData(evaluateRule(rule,value,field));
  }
  function feedbackData(result, allowed = true) {
    const reveal=allowed && ['correct','manual'].includes(result.status);
    return {...result,note:reveal?(result.note || ''):'',criteria:reveal?(result.criteria || []):[],
      ...(!reveal && result.results?{results:result.results.map(r=>feedbackData(r,false))}:{})};
  }
  function evaluateRule(rule, value, field = {}) {
    const common = {note:rule?.note || '',criteria:rule?.criteria || [],manual:isManual(rule)};
    if (!filled(value)) return {...common,status:'empty'};
    if (!rule || rule.kind === 'manual') return {...common,status:'manual'};
    if (rule.kind === 'anyOf') {
      const results=rule.rules.map(r=>checkRule(r,value,field));
      const pass=results.find(r=>r.status==='correct');
      if(pass) return {...pass,note:common.note || pass.note,manual:false};
      if(results.some(r=>r.status==='manual')) return {...common,status:'manual',manual:true};
      return {...common,status:results.every(r=>r.status==='invalid')?'invalid':'incorrect',manual:false};
    }
    if (rule.kind === 'number') {
      const n=parseNumber(value,field);
      if(n === null) return {...common,status:'invalid'};
      const targets=rule.acceptedValues || [rule.value];
      const tolerance=rule.tolerance ?? 0.000001;
      const ok=targets.some(x=>Number.isFinite(x) && Math.abs(n-x)<=tolerance+1e-9);
      return {...common,status:ok?'correct':'incorrect'};
    }
    if (rule.kind === 'choice') {
      return {...common,status:value===field.options?.[rule.index]?'correct':'incorrect'};
    }
    if (rule.kind === 'multi') {
      const selected=Array.isArray(value)?[...new Set(value)]:[];
      const expected=rule.indexes.map(i=>field.options?.[i]);
      const ok=selected.length===expected.length && selected.every(x=>expected.includes(x));
      return {...common,status:ok?'correct':'incorrect'};
    }
    if (rule.kind === 'text') {
      const normalized=normalizeText(value);
      const ok=rule.values.some(v=>normalizeText(v)===normalized);
      return {...common,status:ok?'correct':'incorrect'};
    }
    return {...common,status:'manual',manual:true};
  }
  function fingerprint(task, answers = {}) {
    return JSON.stringify(task.fields.map(f=>{
      const value=answers[f.key];
      return Array.isArray(value)?[...value].sort():String(value ?? '');
    }));
  }
  const fieldFingerprint = value => JSON.stringify(Array.isArray(value) ? [...value].sort() : String(value ?? ''));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey = contest => contest.id === '2025-r2-v3' ? 'dano-2025-round2-variant3-v1' : `${contest.series === 'vk' ? 'vk' : 'dano'}-${contest.id}-v1`;
  function seriesConfig(id, source) {
    const vk = id === 'vk';
    return {id:vk?'vk':'dano',name:vk?'Всерос':'DANO',brand:vk?'Всерос':'DΛNO',query:vk?'?series=vk':'',
      caption:vk?'ВКшный Всерос · РСОШ II уровня':'DANO · Анализ данных',
      catalog:(vk?source.VK_CONTEST_CATALOG:source.CONTEST_CATALOG)||[],keys:(vk?source.VK_CONTEST_ANSWER_KEYS:source.CONTEST_ANSWER_KEYS)||{}};
  }
  const freshState = () => ({version:1,answers:{},notes:{},flags:{},checks:{},fieldChecks:{},manualSolved:{},elapsed:0,runningSince:null,started:false,finished:false,current:0,updatedAt:null});
  function restoreState(saved, tasks, now = Date.now()) {
    if (!saved || saved.version !== 1 || !saved.answers || typeof saved.answers !== 'object') return null;
    const state=freshState();
    const check=value=>value && Number.isSafeInteger(value.attempts) && value.attempts>=0 && typeof value.fingerprint==='string'
      ? {attempts:value.attempts,fingerprint:value.fingerprint.slice(0,1200000),at:typeof value.at==='string'?value.at:''} : null;
    for (const task of tasks) {
      const answers=state.answers[task.id]={};
      state.fieldChecks[task.id]={};
      state.manualSolved[task.id]={};
      for (const field of task.fields) {
        const value=saved.answers[task.id]?.[field.key];
        if (field.type==='multi' && Array.isArray(value)) answers[field.key]=field.options.filter(o=>value.includes(o));
        else if (typeof value==='string' && (!['choice','select'].includes(field.type) || field.options.includes(value))) answers[field.key]=value.slice(0,field.type==='textarea'?100000:2000);
        const last=check(saved.fieldChecks?.[task.id]?.[field.key]);
        if (last) state.fieldChecks[task.id][field.key]=last;
        const confirmed=saved.manualSolved?.[task.id]?.[field.key];
        if (typeof confirmed==='string' && filled(answers[field.key]) && confirmed===fieldFingerprint(answers[field.key])) state.manualSolved[task.id][field.key]=confirmed;
      }
      if (typeof saved.notes?.[task.id]==='string') state.notes[task.id]=saved.notes[task.id].slice(0,100000);
      if (saved.flags?.[task.id]===true) state.flags[task.id]=true;
      const old=check(saved.checks?.[task.id]);
      if (old) {
        state.checks[task.id]=old;
        if (old.fingerprint===fingerprint(task,answers)) for (const field of task.fields) state.fieldChecks[task.id][field.key] ||= {...old,fingerprint:fieldFingerprint(answers[field.key])};
      }
    }
    state.elapsed=Number.isFinite(saved.elapsed) && saved.elapsed>=0 ? Math.min(saved.elapsed,1e12) : 0;
    state.started=saved.started===true;state.finished=saved.finished===true;
    state.runningSince=state.started && !state.finished && Number.isFinite(saved.runningSince) && saved.runningSince>0 && saved.runningSince<=now ? saved.runningSince : null;
    state.current=tasks.some(t=>t.id===saved.current)?saved.current:0;
    state.updatedAt=typeof saved.updatedAt==='string'?saved.updatedAt:null;
    if (saved.timer && typeof saved.timer==='object' && !Array.isArray(saved.timer)) state.timer={...saved.timer};
    return state;
  }
  function recordCheck(state, task, fieldKey, at = new Date().toISOString()) {
    const answers=state.answers[task.id]||{}, checks=state.fieldChecks[task.id] ||= {};
    for (const field of task.fields.filter(f=>!fieldKey || f.key===fieldKey)) checks[field.key]={attempts:(checks[field.key]?.attempts||0)+1,fingerprint:fieldFingerprint(answers[field.key]),at};
    if (!fieldKey) state.checks[task.id]={attempts:(state.checks[task.id]?.attempts||0)+1,fingerprint:fingerprint(task,answers),at};
  }
  function beginAnswer(state, now = Date.now()) {
    if (!state.started && !state.finished) {state.started=true;state.runningSince=now;}
  }
  function checkedField(state, task, field, taskKey) {
    const last=state.fieldChecks[task.id]?.[field.key], value=state.answers[task.id]?.[field.key];
    return last && last.fingerprint===fieldFingerprint(value) ? {key:field.key,label:field.label,...checkRule(taskKey.fields?.[field.key],value,field)} : null;
  }
  function fieldResult(state, task, field, taskKey = {}) {
    const result=checkedField(state,task,field,taskKey);
    if (!result || (!result.note && !result.criteria.length)) return result;
    // A sibling's explanation can contain answers for the whole task.
    const reveal=task.fields.every(f=>{
      const rule=taskKey.fields?.[f.key], answer=state.answers[task.id]?.[f.key], checked=state.fieldChecks[task.id]?.[f.key];
      return isManual(rule) || (checked?.fingerprint===fieldFingerprint(answer) && checkRule(rule,answer,f).status==='correct');
    });
    return feedbackData(result,reveal);
  }
  function checkTask(task, answers = {}, taskKey = {}) {
    const results=task.fields.map(field=>({key:field.key,label:field.label,...checkRule(taskKey.fields?.[field.key],answers[field.key],field)}));
    return summarize(results,taskKey);
  }
  function summarize(results, taskKey = {}) {
    const counts={correct:0,incorrect:0,invalid:0,empty:0,manual:0};
    for(const result of results)counts[result.status]++;
    let status=results.length?'correct':'manual';
    if(counts.incorrect || counts.invalid)status='incorrect';
    else if(counts.empty)status='incomplete';
    else if(counts.manual)status='manual';
    return feedbackData({status,results,counts,note:taskKey.note || '',criteria:taskKey.criteria || [],automatic:results.filter(r=>!r.manual).length});
  }
  function checkedTask(state, task, taskKey = {}) {
    const results=task.fields.map(f=>checkedField(state,task,f,taskKey));
    return results.every(Boolean) ? summarize(results,taskKey) : null;
  }
  function feedbackHTML(result) {
    const safe=feedbackData(result), labels={correct:'✓ Верно',incorrect:'Пока неверно',empty:'Введите или выберите ответ',invalid:'Проверьте формат числа',manual:'Требуется самопроверка'};
    const criteria=safe.criteria.length?`<details class="rubric"><summary>Критерии самопроверки</summary><ul>${safe.criteria.map(c=>`<li>${escapeHTML(c)}</li>`).join('')}</ul></details>`:'';
    return `<strong>${escapeHTML(labels[safe.status]||'Проверены не все пункты')}</strong>${safe.note?`<p>${escapeHTML(safe.note)}</p>`:''}${criteria}${safe.status==='manual'&&!criteria?'<p>Автоматический ответ для этого пункта не задан.</p>':''}`;
  }
  const api=Object.freeze({filled,normalizeText,parseNumber,isManual,checkRule,checkTask,fingerprint,fieldFingerprint,escapeHTML,storageKey,seriesConfig,freshState,restoreState,recordCheck,fieldResult,checkedTask,beginAnswer,feedbackHTML});
  root.CONTEST_ENGINE=api;
  root.DANO_GRADER=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
