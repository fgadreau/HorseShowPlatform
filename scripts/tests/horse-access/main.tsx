import React from 'react';
import {createRoot} from 'react-dom/client';
import {HorseAccessPanel} from '../../../src/features/horses/HorseAccessPanel';
import {HorseForm} from '../../../src/features/horses/HorseForm';
import '../../../src/styles.css';
const params=new URLSearchParams(location.search),role=params.get('role')??'requester',locale=params.get('locale')==='fr'?'fr':'en';
const organization={id:'org',name:'Pilot association',currency:'CAD'};
const contacts=[{id:'actor',first_name:'Agent',last_name:'Pilot',type:'agent',linked_user_id:'profile'},{id:'owner',first_name:'Owner',last_name:'Pilot',type:'owner',linked_user_id:'owner-profile'}];
const directories=[{id:'directory',organization_id:'org',discipline_id:'reining',is_default:true,is_active:true}],disciplines=[{id:'reining',code:'REINING',name:'Reining'}];
const request={id:'request',horse_name:'Pilot Horse',status:'pending',requester_name:'Agent Pilot',message:'Manage show entries',is_mine:role==='requester',can_review:['owner','staff'].includes(role)};
const ownerRequest={id:'owner-request',owner_first_name:'Owner',owner_last_name:'Pilot',details:{name:'Proposed Horse'},status:'pending',requester_name:'Agent Pilot',is_mine:role==='requester',can_review:role==='staff'};
window.calls=[];window.requests=['owner','staff'].includes(role)?[request]:[];window.ownerRequests=role==='staff'?[ownerRequest]:[];window.created=[];window.selected=[];window.refreshes=0;
window.horseClient={rpc(name,args){window.calls.push({name,args});let data=[];
 if(name==='list_horse_agent_requests')data=window.requests;
 if(name==='list_horse_owner_confirmations')data=window.ownerRequests;
 if(name==='search_horse_agent_candidates')data=['Pilot Horse','REG-1'].includes(args.p_query)?[{horse_id:'horse',name:'Pilot Horse',registration_number:'REG-1',already_authorized:role==='owned'}]:[];
 if(name==='request_horse_agent_access'){window.requests=[{...request,is_mine:true,can_review:false}];data='request';}
 if(name==='decide_horse_agent_request'){window.requests=window.requests.map(row=>({...row,status:args.p_action==='approve'?'approved':args.p_action==='cancel'?'cancelled':'rejected'}));data='approved';}
 if(name==='find_horse_owner_by_nrha')data=args.p_number==='123'?[{contact_id:'owner',first_name:'Owner',last_name:'Pilot'}]:[];
 if(name==='create_horse_for_nrha_owner'){window.created.push(args);data={id:'new',name:args.p_details.name,primary_owner_contact_id:'owner'};}
 if(name==='request_horse_owner_confirmation'){window.ownerRequests=[{...ownerRequest,details:args.p_details,is_mine:true,can_review:false}];data='owner-request';}
 if(name==='decide_horse_owner_confirmation'){window.ownerRequests=window.ownerRequests.map(row=>({...row,status:args.p_action==='approve'?'approved':'rejected'}));data='approved';}
 return Promise.resolve({data,error:null});},from(){const q={select(){return q},eq(){return q},single:async()=>({data:{id:'horse',name:'Pilot Horse',primary_owner_contact_id:'owner'},error:null})};return q;}};
const unexpected=async()=>{throw Error('Unexpected operation')};
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:1000,margin:'0 auto',padding:12}}>{['form','owned'].includes(role)?<HorseForm locale={locale} organization={organization} contacts={contacts} contactRoles={[]} createdByUserId="profile" externalCredentialIssuers={[]} onCreateContact={unexpected} onCreateHorse={async input=>{window.created.push(input);return {...input,id:'new'};}} onCreateHorseHealthDocument={unexpected} onVerifyGvlCogginsDocument={unexpected} onVerifyNrhaHorse={unexpected} onCreated={horse=>window.selected.push(horse.id)}/>:<HorseAccessPanel organization={organization} contacts={contacts} directories={directories} disciplines={disciplines} locale={locale} staff={role==='staff'} onRefresh={()=>{window.refreshes++;}}/>}</main>);
