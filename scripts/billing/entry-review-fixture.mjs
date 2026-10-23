// New fictitious operational class / bib references; never inserts legacy entries.
import {randomUUID} from 'node:crypto';
export function entryReviewFixture(sql,f,c,save=()=>{}){
 c.registration??={riders:[randomUUID(),randomUUID()],assignments:[randomUUID(),randomUUID()],blocks:[randomUUID(),randomUUID(),randomUUID()],classes:Array.from({length:16},()=>randomUUID())};save();const r=c.registration;
 for(let i=0;i<2;i++){
  sql(`insert into contacts(id,type,first_name,last_name) values('${r.riders[i]}','rider','${i?'Camille':'Morgan'}','Cavalier DEMO') on conflict do nothing;`);
  sql(`insert into directory_contacts(organization_discipline_id,contact_id) values('${f.org.replace("300000","700000")}','${r.riders[i]}') on conflict do nothing;`);
  sql(`insert into organization_back_numbers(id,organization_id,number,status,assignment_mode,assigned_horse_id,assigned_rider_contact_id) values('${r.assignments[i]}','${f.org}',${941+i},'assigned','horse_rider_team','${f.horses[i]}','${r.riders[i]}') on conflict(id) do nothing;`);
 }
 for(let i=0;i<3;i++)sql(`insert into blocks(id,organization_id,show_id,name,sort_order) values('${r.blocks[i]}','${f.org}','${c.show}','Bloc DEMO ${i===2?'B':'A'}',${i+1}) on conflict do nothing;`);
 for(let i=0;i<16;i++){const block=i<12?0:i<14?1:2;sql(`insert into classes(id,organization_id,show_id,block_id,name,sort_order,organization_discipline_id,back_number_policy_override) values('${r.classes[i]}','${f.org}','${c.show}','${r.blocks[block]}','Classe DEMO ${String(i+1).padStart(2,'0')}',${i+1},'${f.org.replace("300000","700000")}','horse_rider_team') on conflict do nothing;`);}
 return r;
}
