const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../Resources/core.js');
const makeHabit=(extra={})=>({id:'habit-1',name:'Walk',description:'',created:'2026-09-01',archivedOn:null,weekdays:[1,2,3,4,5],checks:{},notes:[],...extra});
test('habit denominator excludes time before creation and unscheduled weekends',()=>{
 const h=makeHabit({created:'2026-09-09',checks:{'2026-09-09':true,'2026-09-10':true}});
 assert.deepEqual(C.habitStats([h],'2026-09-11',7),{done:2,total:3,rate:67});
 assert.deepEqual(C.habitStats([h],'2026-09-08',7),{done:0,total:0,rate:null});
});
test('archive date is excluded but earlier scheduled days stay in history',()=>{
 const h=makeHabit({created:'2026-09-07',archivedOn:'2026-09-10',checks:{'2026-09-07':true,'2026-09-08':true,'2026-09-10':true}});
 assert.deepEqual(C.habitStats([h],'2026-09-11',7),{done:2,total:3,rate:67});
});
test('streak skips weekends and unfinished today, but breaks at missed earlier scheduled day',()=>{
 const h=makeHabit({checks:{'2026-09-03':true,'2026-09-04':true,'2026-09-07':true}});
 assert.equal(C.streak(h,'2026-09-07'),3);
 assert.equal(C.streak(h,'2026-09-08'),3);
 assert.equal(C.streak(h,'2026-09-09'),0);
});
test('reopening a step removes it from completion and project progress days',()=>{
 const p={tasks:[{status:'done',completedOn:'2026-09-10'},{status:'todo',completedOn:null}]};
 assert.deepEqual(C.projectStats(p),{total:2,done:1,rate:50});
 assert.equal(C.projectProgressDays([p],'2026-09-11'),1);
 p.tasks[0].status='todo';p.tasks[0].completedOn=null;
 assert.equal(C.projectStats(p).rate,0);assert.equal(C.projectProgressDays([p],'2026-09-11'),0);
 assert.equal(C.projectStats({tasks:[]}).rate,null);
});
test('goal progress caps at 100% and progress days do not count notes or corrections',()=>{
 const s=C.empty();s.goals.push({current:120,target:100,updates:[{day:'2026-09-10',delta:0},{day:'2026-09-09',delta:-10},{day:'2026-09-08',delta:10}]});
 assert.equal(C.goalPercent(s.goals[0]),100);assert.equal(C.progressDays(s,'2026-09-11'),1);
});
test('date arithmetic uses calendar days across leap years and DST',()=>{
 assert.equal(C.shift('2024-03-01',-1),'2024-02-29');
 assert.equal(C.shift('2026-03-08',1),'2026-03-09');
 assert.equal(C.shift('2026-11-01',-1),'2026-10-31');
 assert.equal(C.validDate('2026-02-30'),false);
});
test('backup validation rejects malformed, unsafe and incomplete records',()=>{
 assert.equal(C.validate(C.empty()).schemaVersion,1);
 const s=C.empty();s.habits.push(makeHabit());assert.equal(C.validate(s),s);
 const bad=JSON.parse(JSON.stringify(s));bad.habits[0].weekdays=[9];assert.throws(()=>C.validate(bad));
 bad.habits[0].weekdays=[1];bad.habits[0].id='" onclick="';assert.throws(()=>C.validate(bad));
 assert.throws(()=>C.validate({schemaVersion:1}));
 const dup=JSON.parse(JSON.stringify(s));dup.habits.push({...dup.habits[0]});assert.throws(()=>C.validate(dup));
});
