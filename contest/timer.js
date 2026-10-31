/* Wall time persists across visits; foreground time has no persisted live anchor. */
(function(root) {
  'use strict';
  const duration=value=>Number.isFinite(value)&&value>=0?Math.min(value,1e12):0;
  const timestamp=(value,now)=>Number.isFinite(value)&&value>0&&value<=now?value:null;
  function restore(saved,legacy={},now=Date.now()) {
    const current=saved?.version===1, source=current?saved:legacy;
    const runningSince=legacy.started&&!legacy.finished?timestamp(source.runningSince,now):null;
    const elapsed=duration(source.elapsed);
    return {version:1,elapsed,activeElapsed:current?Math.min(duration(source.activeElapsed),duration(elapsed+(runningSince===null?0:now-runningSince))):0,runningSince,
      firstStartedAt:timestamp(source.firstStartedAt,now)||runningSince,
      legacyActiveUnknown:current?source.legacyActiveUnknown===true:elapsed>0||runningSince!==null};
  }
  function create(saved,legacy={},now=Date.now()) {
    const data=restore(saved,legacy,now);let activeSince=null;
    const total=at=>duration(data.elapsed+(data.runningSince===null?0:Math.max(0,at-data.runningSince)));
    const active=at=>Math.min(total(at),duration(data.activeElapsed+(activeSince===null?0:Math.max(0,at-activeSince))));
    function checkpoint(at=Date.now()) {
      data.activeElapsed=active(at);if(activeSince!==null)activeSince=at;return data;
    }
    function setActive(eligible,at=Date.now()) {
      checkpoint(at);activeSince=eligible&&data.runningSince!==null?at:null;
    }
    function resume(at=Date.now()) {
      if(data.runningSince===null)data.runningSince=at;
      data.firstStartedAt ||= at;
    }
    function pause(at=Date.now()) {
      checkpoint(at);data.elapsed=total(at);data.runningSince=null;activeSince=null;
    }
    function reset(at=Date.now()) {
      pause(at);Object.assign(data,{elapsed:0,activeElapsed:0,firstStartedAt:null,legacyActiveUnknown:false});
    }
    function snapshot(at=Date.now()) {
      checkpoint(at);return {...data,elapsed:total(at),activeElapsed:active(at),runningSince:null};
    }
    return {data,read:(at=Date.now())=>({elapsed:total(at),activeElapsed:active(at)}),checkpoint,setActive,resume,pause,reset,snapshot};
  }
  const api=Object.freeze({restore,create});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.CONTEST_TIMER=api;
})(typeof window==='undefined'?null:window);
