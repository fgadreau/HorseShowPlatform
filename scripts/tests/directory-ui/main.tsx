import React from 'react';
import {createRoot} from 'react-dom/client';
import {PersonalDirectories} from '../../../src/features/profile/PersonalDirectories';
import {MyHorsesView} from '../../../src/features/horses/MyHorsesView';
import {createHorse,createContact,ensureHorseOrganizationLink} from '../../../src/services/supabaseServices';
import '../../../src/styles.css';
const directories=[{id:'dir1',organization_id:'org',discipline_id:'d1',is_active:true,is_default:true},{id:'dir2',organization_id:'org',discipline_id:'d2',is_active:true,is_default:false}];
const disciplines=[{id:'d1',name:'Reining'},{id:'d2',name:'Ranch'}];
const contacts=[{id:'owner',first_name:'Test',last_name:'Owner',type:'owner',linked_user_id:'profile'}];
window.enrollments=[];window.createdHorses=[];window.refreshCount=0;window.failEnrollment=new URLSearchParams(location.search).has('failure');
window.serviceWrites=[];
window.createHorseThroughService=createHorse;
window.createContactThroughService=createContact;
window.ensureHorseDirectoryLink=ensureHorseOrganizationLink;
window.testClient={from(table){
 let payload;let requestedIds=[];
 const result=()=>({data:table==='organization_disciplines'?requestedIds.filter(id=>['dir1','dir2'].includes(id)).map(id=>({id})):table==='horses'?{...payload,id:'service-horse'}:payload,error:null});
 const chain={select(){return chain},eq(){return chain},in(column,ids){requestedIds=ids;return chain},
 insert(value){payload=value;window.serviceWrites.push({table,value});return chain},
 upsert(value){payload=value;window.serviceWrites.push({table,value});return chain},
 single(){return Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
 return chain;
}};
const unexpected=async()=>{throw Error('Unexpected operation')};
createRoot(document.getElementById('root')!).render(<>
<PersonalDirectories locale="fr" organization={{id:'org',name:'Test AQR'}} directories={directories} disciplines={disciplines} contacts={contacts} directoryContacts={[]} profileId="profile" onRefresh={()=>{window.refreshCount++}} />
<MyHorsesView locale="fr" organization={{id:'org',name:'Test AQR'}} profileId="profile" disciplines={disciplines} organizationDisciplines={directories} contacts={contacts} contactRoles={[]} externalCredentialIssuers={[]} horses={[]} horseExternalIdentifiers={[]} horseHealthDocuments={[]} horseContacts={[]} onCreateContact={unexpected} onCreateHorse={async input=>{window.createdHorses.push(input);return {...input,id:'horse'}}} onCreateHorseHealthDocument={unexpected} onDeleteHorse={unexpected} onUpdateHorse={unexpected} onVerifyGvlCogginsDocument={unexpected} onVerifyNrhaHorse={unexpected}/>
</>);
