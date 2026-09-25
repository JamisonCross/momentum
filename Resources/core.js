(function (root) {
  'use strict';
  const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const parse = value => new Date(value + 'T12:00:00');
  const shift = (value, amount) => { const d = parse(value); d.setDate(d.getDate()+amount); return day(d); };
  const days = (end = day(), count = 7) => Array.from({length:count}, (_,i) => shift(end, i-count+1));
  const uuid = () => globalThis.crypto?.randomUUID?.() || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const empty = () => ({schemaVersion:1, profile:{name:''}, habits:[], goals:[], projects:[], activities:[]});
  const percent = (done,total) => total ? Math.round(done/total*100) : null;
  const scheduled = (h,d) => d>=h.created && (!h.archivedOn || d<h.archivedOn) && h.weekdays.includes(parse(d).getDay());
  const habitStats = (habits, end=day(), count=7) => {
    let done=0,total=0;
    for(const d of days(end,count)) for(const h of habits) if(scheduled(h,d)) {total++; if(h.checks[d]) done++;}
    return {done,total,rate:percent(done,total)};
  };
  const streak = (h,end=day()) => {
    let n=0;
    for(let d=end; d>=h.created; d=shift(d,-1)) {
      if(!scheduled(h,d)) continue;
      if(h.checks[d]) n++; else if(d!==end) break;
    }
    return n;
  };
  const projectStats = p => { const total=p.tasks.length, done=p.tasks.filter(t=>t.status==='done').length; return {total,done,rate:percent(done,total)}; };
  const goalPercent = g => Math.min(100, Math.max(0, Math.round(g.current/g.target*100)));
  const projectProgressDays = (projects,end=day(),count=7) => {
    const allowed = new Set(days(end,count)), result=new Set();
    projects.forEach(p=>p.tasks.forEach(t=>{if(t.status==='done' && allowed.has(t.completedOn)) result.add(t.completedOn);}));
    return result.size;
  };
  const progressDays = (state,end=day(),count=7) => {
    const span=days(end,count),result=new Set();
    for(const d of span) {
      if(state.habits.some(h=>scheduled(h,d)&&h.checks[d])) result.add(d);
      if(state.projects.some(p=>p.tasks.some(t=>t.status==='done'&&t.completedOn===d))) result.add(d);
      if(state.goals.some(g=>g.updates.some(u=>u.day===d&&u.delta>0))) result.add(d);
    }
    return result.size;
  };
  const validDate = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(parse(d)) && day(parse(d))===d;
  function validate(s) {
    const fail = () => {throw new Error('This file is not a valid Momentum backup. Your existing data has not been changed.');};
    const str=x=>typeof x==='string', arr=Array.isArray;
    const id=x=>x && str(x.id) && /^[a-zA-Z0-9_-]+$/.test(x.id);
    const named=x=>id(x)&&str(x.name)&&x.name.trim().length>0&&validDate(x.created)&&str(x.description);
    const note=n=>id(n)&&str(n.text)&&validDate(n.day)&&str(n.at);
    const archive=x=>x.archivedOn===null || validDate(x.archivedOn);
    if(!s || s.schemaVersion!==1 || !s.profile || !str(s.profile.name) || !arr(s.habits)||!arr(s.goals)||!arr(s.projects)||!arr(s.activities)) fail();
    if(!s.habits.every(h=>named(h)&&archive(h)&&arr(h.weekdays)&&h.weekdays.length>0&&new Set(h.weekdays).size===h.weekdays.length&&h.weekdays.every(n=>Number.isInteger(n)&&n>=0&&n<=6)&&h.checks&&typeof h.checks==='object'&&!arr(h.checks)&&Object.entries(h.checks).every(([d,v])=>validDate(d)&&typeof v==='boolean')&&arr(h.notes)&&h.notes.every(note))) fail();
    if(!s.goals.every(g=>named(g)&&archive(g)&&Number.isFinite(g.current)&&g.current>=0&&Number.isFinite(g.target)&&g.target>0&&str(g.unit)&&(!g.due||validDate(g.due))&&arr(g.updates)&&g.updates.every(u=>note(u)&&Number.isFinite(u.delta)))) fail();
    if(!s.projects.every(p=>named(p)&&archive(p)&&(!p.due||validDate(p.due))&&arr(p.notes)&&p.notes.every(note)&&arr(p.tasks)&&p.tasks.every(t=>id(t)&&str(t.title)&&t.title.trim().length>0&&str(t.notes)&&['todo','doing','done'].includes(t.status)&&['low','normal','high'].includes(t.priority)&&(!t.due||validDate(t.due))&&(t.completedOn===null||validDate(t.completedOn))&&(t.status!=='done'||validDate(t.completedOn))))) fail();
    if(!s.activities.every(a=>id(a)&&str(a.text)&&str(a.at)&&validDate(a.day))) fail();
    const ids=[...s.habits,...s.goals,...s.projects,...s.projects.flatMap(p=>p.tasks)].map(x=>x.id);
    if(new Set(ids).size!==ids.length) fail();
    return s;
  }
  const api={day,parse,shift,days,uuid,empty,percent,scheduled,habitStats,streak,projectStats,goalPercent,projectProgressDays,progressDays,validDate,validate};
  if(typeof module!=='undefined') module.exports=api;
  root.MomentumCore=api;
})(typeof window!=='undefined'?window:globalThis);
