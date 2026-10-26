import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ContactForm} from '../../../src/features/people/ContactForm';
import {ContactPicker} from '../../../src/components/ui';
import {ContactEditForm} from '../../../src/features/people/ContactEditForm';
import '../../../src/styles.css';
const params=new URLSearchParams(location.search),locale=params.get('locale')==='fr'?'fr':'en',scenario=params.get('scenario')??'form';
const organization={id:'org',name:'Duplicate review pilot',currency:'CAD'};
const initial=[1,2,3].map(i=>({id:'contact'+i,first_name:'Yannick',last_name:'Goulet',middle_name:i===3?'Pierre':null,type:i===1?'owner':'rider',email:null,phone:null,date_of_birth:i===2?'1980-01-01':null}));
window.creations=[];window.dismissals=[];window.reuses=[];
initial.push({id:'unrelated',first_name:'Other',last_name:'Person',middle_name:null,type:'rider',email:null,phone:null,date_of_birth:'1990-01-01'});
function Fixture(){const [contacts,setContacts]=useState(initial),[value,setValue]=useState('');return <main style={{maxWidth:900,margin:'0 auto',padding:12}}>{scenario==='edit'?<ContactEditForm contact={initial[0]} locale={locale} onCancel={()=>{}} onUpdateContact={async(id,input)=>{window.creations.push({id,...input});}}/>:scenario==='picker'?<ContactPicker contacts={contacts} contactRoles={["owner","payer","booker","agent"].map(role=>({contact_id:"contact1",role,organization_id:"org"}))} organization={organization} role="rider" label="Rider" locale={locale} value={value} onChange={value=>{window.reuses.push(value);setValue(value);}} onCreateContact={async input=>{window.creations.push(input);const contact={...input,id:'new'+window.creations.length};setContacts(current=>[...current,contact]);return contact;}}/>:<ContactForm contacts={contacts} organization={organization} locale={locale} onSearchIdentityCandidates={scenario==='dismissed'?async()=>[]:undefined} onDismissIdentityCandidate={async candidate=>{window.dismissals.push(candidate);}} onCreateContact={async input=>{window.creations.push(input);setContacts(current=>[...current,{...input,id:'new'+window.creations.length}]);}} onCreated={()=>{window.reuses.push('form-completed');}}/>}</main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
