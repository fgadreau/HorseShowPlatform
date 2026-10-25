import {buildWarmupSchedule,warmupScheduleCsv} from '../src/lib/paidWarmupSchedule';
function assert(condition:boolean,label:string){if(!condition)throw Error(label);}
const labels=['Owner A — Horse A','Owner B — Horse B','Owner C — Horse C','Owner D — Horse D','Owner E — Horse E'];
const rows=buildWarmupSchedule({labels,minutesPerHorse:5,dragEvery:2,dragMinutes:8,startTime:'08:00:00'});
assert(rows.map(r=>r.time).join(',')==='08:00,08:05,08:10,08:18,08:23,08:28,08:36','horse and drag times');
assert(rows.filter(r=>r.kind==='drag').length===2,'two equal drags between groups');
assert(rows.filter(r=>r.kind==='horse').map(r=>r.number).join(',')==='1,2,3,4,5','sequential places exclude drags');
assert(buildWarmupSchedule({labels:labels.slice(0,2),minutesPerHorse:5,dragEvery:2,dragMinutes:8}).length===2,'no final drag after last horse');
assert(buildWarmupSchedule({labels:labels.slice(0,2),minutesPerHorse:5,dragEvery:null,dragMinutes:8})[1].time==='+5 min','relative times without start');
assert(buildWarmupSchedule({labels:labels.slice(0,2),minutesPerHorse:5,dragEvery:null,dragMinutes:8,startTime:'23:58'})[1].time==='00:03 (+1 j/d)','midnight rollover');
const csv=warmupScheduleCsv(rows);assert(csv.startsWith('\uFEFF'),'UTF8 BOM for Sheets');assert(csv.includes('Préparation de piste / Arena drag'),'drag rows exported');assert(csv.includes('08:36'),'last approximate start exported');
let rejected=false;try{buildWarmupSchedule({labels,minutesPerHorse:0,dragEvery:2,dragMinutes:8});}catch{rejected=true;}assert(rejected,'reject zero duration');
rejected=false;try{buildWarmupSchedule({labels,minutesPerHorse:5,dragEvery:2,dragMinutes:8,startTime:'25:10'});}catch{rejected=true;}assert(rejected,'reject invalid start');
console.log('Warmup timing and CSV: 11 checks passed');
