// Shared display sums in integer cents. This module never assigns charges or taxes.
export const displayCents=v=>{const n=Number(v),c=Math.round(n*100);if(!Number.isFinite(n)||!Number.isSafeInteger(c)||Math.abs(n*100-c)>0.0001)throw Error('BILLING_PDF_INVALID_AMOUNT');return c;};
export function entryGroups(charges,locale='fr'){
 const fr=locale==='fr',tr=(a,b)=>fr?a:b,groups=new Map();
 for(const c of charges.filter(c=>c.presentation?.section==='entry'&&c.supplier!=='hsp')){
  const p=c.presentation,i=c.entry_identity;
  // No assignment FK exists on entries. Policy targets, scoped to the show,
  // identify the business group; the recorded number only partitions that group.
  let target;
  if(i?.version===1&&i.organization_id&&i.show_id&&i.entry_id){
   target=i.policy==='horse'&&i.horse?.id?['horse',i.horse.id]:i.policy==='rider'&&i.rider?.id?['rider',i.rider.id]:i.policy==='horse_rider_team'&&i.horse?.id&&i.rider?.id?['team',i.horse.id,i.rider.id]:['entry',i.entry_id];
  }
  const key=JSON.stringify(target?[i.organization_id,i.show_id,i.assignment_id??null,...target,i.number??null]:['unlinked',c.id]);
  if(!groups.has(key))groups.set(key,{key,number:target?i.number:null,horses:new Map(),riders:new Map(),blocks:new Map(),entry:0,judge:0,total:0});
  const g=groups.get(key),horse=target?i.horse:c.horse,rider=target?i.rider:null;
  if(horse?.id&&horse.name)g.horses.set(horse.id,horse.name);
  if(rider?.id&&rider.name)g.riders.set(rider.id,rider.name);
  if(!p.block_id||!p.occurrence_id||!['entry','judge_class','judge_block'].includes(p.fee_kind))throw Error('BILLING_PDF_INVALID_GROUP');
  const bk=JSON.stringify([p.block_id,p.occurrence_id]);
  if(!g.blocks.has(bk))g.blocks.set(bk,{key:bk,label:p.block_label,occurrence:p.occurrence_id,classes:new Map(),blockJudges:[],entry:0,judge:0,total:0});
  const b=g.blocks.get(bk),n=displayCents(c.subtotal),kind=p.fee_kind==='entry'?'entry':'judge';
  b[kind]+=n;b.total+=n;g[kind]+=n;g.total+=n;
  if(p.fee_kind==='judge_block')b.blockJudges.push(c);
  else {if(!p.class_id)throw Error('BILLING_PDF_INVALID_GROUP');if(!b.classes.has(p.class_id))b.classes.set(p.class_id,{key:p.class_id,label:p.class_label,entry:0,judge:0,total:0,charges:[]});const row=b.classes.get(p.class_id);row[kind]+=n;row.total+=n;row.charges.push(c);}
 }
 return [...groups.values()].map(g=>({...g,label:[g.number!=null?tr('Dossard ','Back number ')+g.number:tr('Dossard non attribué','Back number not assigned'),...g.horses.values(),...g.riders.values()].join(' — '),totalLabel:g.number!=null?tr('Total inscriptions — dossard ','Entries total — back number ')+g.number:tr('Total inscriptions — dossard non attribué','Entries total — back number not assigned'),blocks:[...g.blocks.values()].map(b=>({...b,classes:[...b.classes.values()]}))}));
}
export function entryBlocks(charges,locale,currency){
 const fr=locale==='fr',tr=(a,b)=>fr?a:b,money=c=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency}).format(c/100),groups=entryGroups(charges,locale),blocks=[];
 const columns=[tr('Bloc / classe','Block / class'),tr('Inscription','Entry fee'),tr('Frais de juges','Judge fees'),tr('Total avant taxes','Total before taxes')];
 const detail=cs=>cs.map(c=>[c.description,`${money(displayCents(c.unit_price))} × ${c.quantity}`,...c.taxes.map(t=>`${t.name} (${t.rate}%) ${money(displayCents(t.amount))}`),c.exemption_reason].filter(Boolean).join(' · ')).join('\n');
 for(const g of groups){for(const b of g.blocks){const judges=b.blockJudges,judge=judges.reduce((n,c)=>n+displayCents(c.subtotal),0);blocks.push({label:g.label+'\n'+b.label+' · '+b.occurrence,bib:g.label,columns,rows:[...b.classes.map(c=>[c.label+'\n'+detail(c.charges),money(c.entry),money(c.judge),money(c.total)]),...(judges.length?[[tr('Frais de juges du bloc','Block judge fees')+'\n'+detail(judges),'',money(judge),money(judge)]]:[]),[tr('Total du bloc avant taxes','Block total before taxes'),money(b.entry),money(b.judge),money(b.total)]],total:b.total});}
 blocks.push({label:g.label,columns,rows:[[g.totalLabel,money(g.entry),money(g.judge),money(g.total)]],total:g.total});}
 if(groups.length)blocks.push({label:tr('Sous-total inscriptions','Entries subtotal'),columns:['',tr('Avant taxes','Before taxes')],rows:[[tr('Inscriptions et frais de juges','Entries and judge fees'),money(groups.reduce((n,g)=>n+g.total,0))]]});
 return blocks;
}
export function entryChargeLabel(charge,locale){if(charge?.presentation?.section!=='entry')return '';return [entryGroups([charge],locale)[0]?.label,charge.presentation.block_label,charge.presentation.occurrence_id,charge.presentation.class_label].filter(Boolean).join(' · ');}
