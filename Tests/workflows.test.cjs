const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
// Lightweight application harness. These verify UI handlers, generated markup,
// persistence, and recovery logic; they do not replace browser layout or macOS tests.
function app(storage=new Map(),bridge=false){
 const elements=new Map();
 function element(s){if(!elements.has(s))elements.set(s,{innerHTML:'',textContent:'',hidden:false,open:false,addEventListener(){},classList:{add(){},remove(){}},focus(){},setSelectionRange(){},showModal(){this.open=true;},close(){this.open=false;},querySelector(){return {focus(){}};}});return elements.get(s);}
 const callbacks={},sent=[];
 const context={console,Date,Math,JSON,Set,Map,Number,String,Array,Object,Error,Blob,URL,crypto:require('node:crypto').webcrypto,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{querySelector:element,addEventListener:(n,f)=>callbacks[n]=f,createElement:()=>({click(){}})},setInterval(){},setTimeout(){return 1;},clearTimeout(){},FormData:class{constructor(target){return {get:k=>target.values[k]??null,getAll:k=>target.values[k]??[]};}}};
 context.window=context;context.scrollTo=()=>{};
 if(bridge)context.webkit={messageHandlers:{momentum:{postMessage:p=>sent.push(p)}}};
 vm.createContext(context);
 for(const file of ['core.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Resources',file),'utf8'),context);
 const run=code=>vm.runInContext(code,context);
 const submit=values=>element('#modal-form').onsubmit({preventDefault(){},target:{values}});
 const click=async(action,dataset={})=>{context.event={target:{closest:()=>({dataset:{action,...dataset},tagName:'BUTTON',type:'button'})},preventDefault(){}};await run('action(event)');};
 return {run,submit,click,storage,elements,sent,html:()=>element('#app').innerHTML,error:()=>element('#modal-error').textContent};
}
test('habit creation, check-in, note and reload persist correctly',async()=>{
 const a=app();a.run("editEntity('habit')");a.submit({name:'Read <one> page',description:'Five minutes',weekday:[0,1,2,3,4,5,6].map(String),created:'2026-09-01'});
 assert.equal(a.run('state.habits.length'),1);assert.ok(a.html().includes('Read &lt;one&gt; page'));
 const id=a.run('state.habits[0].id');await a.click('check-habit',{id,date:a.run('C.day()')});
 a.run(`editNote('habit','${id}')`);a.submit({text:'Started with Atomic Habits.',day:a.run('C.day()')});
 const b=app(a.storage);assert.equal(b.run('state.habits[0].checks[C.day()]'),true);assert.equal(b.run('state.habits[0].notes[0].text'),'Started with Atomic Habits.');assert.equal(b.run('C.habitStats(state.habits,C.day(),1).rate'),100);
});
test('four independent projects, checklist status, editing, deletion and notes',async()=>{
 const a=app();for(let i=1;i<=4;i++){a.run("editEntity('project')");a.submit({name:'Business '+i,description:'Independent plan',due:''});a.run('editTask(selectedProject)');a.submit({title:'First step '+i,notes:'Research',status:'todo',priority:'high',due:''});}
 assert.equal(a.run('state.projects.length'),4);assert.equal(a.run('state.projects.map(p=>p.tasks.length).join()'),'1,1,1,1');
 const pid=a.run('state.projects[1].id'),tid=a.run('state.projects[1].tasks[0].id');await a.click('start-task',{project:pid,id:tid});assert.equal(a.run('state.projects[1].tasks[0].status'),'doing');
 await a.click('toggle-task',{project:pid,id:tid});assert.equal(a.run('C.projectStats(state.projects[1]).rate'),100);
 await a.click('toggle-task',{project:pid,id:tid});assert.equal(a.run('C.projectStats(state.projects[1]).rate'),0);
 a.run(`editNote('project','${pid}')`);a.submit({text:'Customer interviews scheduled.',day:a.run('C.day()')});assert.equal(a.run('state.projects[1].notes.length'),1);
 a.run(`editTask('${pid}','${tid}')`);a.submit({title:'Revised next step',notes:'Call the supplier',status:'doing',priority:'normal',due:''});assert.equal(a.run('state.projects[1].tasks[0].title'),'Revised next step');
 await a.click('delete-task',{project:pid,id:tid});a.submit({});assert.equal(a.run('state.projects[1].tasks.length'),0);assert.equal(a.run('state.projects[0].tasks.length'),1);
});
test('goal progress, correction and history survive a reload',()=>{
 const a=app();a.run("editEntity('goal')");a.submit({name:'Savings',description:'Travel',target:'1000',current:'100',unit:'dollars',due:''});const id=a.run('state.goals[0].id');a.run(`updateGoal('${id}')`);a.submit({current:'1100',note:'Target reached'});assert.equal(a.run('C.goalPercent(state.goals[0])'),100);a.run(`updateGoal('${id}')`);a.submit({current:'900',note:'Corrected total'});
 const b=app(a.storage);assert.equal(b.run('state.goals[0].current'),900);assert.equal(b.run('state.goals[0].updates[1].delta'),-200);
});
test('bad backup is rejected, valid import replaces only after confirmation',()=>{
 const a=app();a.run(`window.momentumImport('{"schemaVersion":9}')`);assert.equal(a.run('state.projects.length'),0);assert.ok(a.elements.get('#toast').textContent.includes('valid Momentum backup'));
 a.run(`window.momentumImport(JSON.stringify({...C.empty(),profile:{name:'Restored'}}))`);assert.equal(a.run('state.profile.name'),'');a.submit({});assert.equal(a.run('state.profile.name'),'Restored');assert.equal(app(a.storage).run('state.profile.name'),'Restored');
});
test('demo changes never replace the actual workspace',async()=>{
 const a=app();a.run("state.profile.name='My real workspace';save();startDemo()");assert.equal(a.run('state.projects.length'),3);a.run("state.profile.name='Changed demo';save()");assert.equal(JSON.parse(a.storage.get('momentum.v1')).profile.name,'My real workspace');await a.click('exit-demo');assert.equal(a.run('state.profile.name'),'My real workspace');assert.equal(a.run('state.projects.length'),0);
});
test('all screens generate clean markup for empty and populated workspaces',()=>{
 const a=app();for(const populate of [false,true]){if(populate)a.run('startDemo()');for(const view of ['overview','habits','goals','projects','activity','settings']){a.run(`view='${view}';render()`);assert.ok(!a.html().includes('NaN'));assert.ok(!a.html().includes('undefined'));assert.ok(a.html().includes('<main'));}if(populate){a.run("view='projects';selectedProject=state.projects[0].id;render()");assert.ok(a.html().includes('Your project steps'));a.run('query="prototype";render()');assert.ok(a.html().includes('results for'));}}
});
test('native save acknowledgments are required; failure remains visible',()=>{
 const a=app(new Map(),true);assert.equal(a.sent[0].action,'load');a.run("momentumReady('',null);state.profile.name='Native';save()");assert.equal(a.sent.at(-1).action,'save');assert.equal(a.run('saving'),true);a.run("momentumSaveResult(1,'Disk full')");assert.equal(a.run('saveError'),'Disk full');a.run('save();momentumSaveResult(2,null)');assert.equal(a.run('saving'),false);assert.equal(a.run('saveError'),'');
});
test('archive and restore preserve historical habits as separate records',async()=>{
 const a=app();a.run("editEntity('habit')");a.submit({name:'Walk',description:'',weekday:['1'],created:'2026-09-01'});const id=a.run('state.habits[0].id');await a.click('archive-item',{kind:'habit',id});a.submit({});assert.equal(a.run('state.habits[0].archivedOn'),a.run('C.day()'));await a.click('archive-item',{kind:'habit',id});assert.equal(a.run('state.habits.length'),2);assert.equal(a.run('state.habits[1].archivedOn'),null);assert.equal(a.run('state.habits[1].created'),a.run('C.day()'));
});
