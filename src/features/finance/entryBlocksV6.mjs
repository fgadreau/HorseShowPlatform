import {displayCents,entryBlocks,entryGroups} from './entryGroups.mjs';

// Presentation only: block judge charges stay financially distinct, but share
// the row of the entry that caused the one-per-block fee.
export function entryBlocksV6(charges,locale,currency){
 const fr=locale==='fr',tr=(a,b)=>fr?a:b,money=c=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency}).format(c/100);
 const detail=cs=>cs.map(c=>[c.description,`${money(displayCents(c.unit_price))} × ${c.quantity}`,...c.taxes.map(t=>`${t.name} (${t.rate}%) ${money(displayCents(t.amount))}`),c.exemption_reason].filter(Boolean).join(' · ')).join('\n');
 const old=entryBlocks(charges,locale,currency),groups=entryGroups(charges,locale),result=[];let index=0;
 for(const g of groups){
  const bib=g.number!=null?(fr?'dossard ':'back number ')+g.number:(fr?'dossard non attribué':'back number not assigned');
  for(const [i,block] of g.blocks.entries()){
   const previous=old[index++],assigned=block.classes.map(()=>[]);
   for(const judge of block.blockJudges){
    const identity=judge.entry_identity??{};
    let target=block.classes.findIndex(c=>identity.class_id!=null&&String(c.key)===String(identity.class_id));
    if(target<0&&identity.entry_id!=null)target=block.classes.findIndex(c=>c.charges.some(x=>String(x.entry_identity?.entry_id??'')===String(identity.entry_id)));
    if(target<0&&assigned.length)target=0;
    if(target>=0)assigned[target].push(judge);
   }
   const rows=block.classes.map((c,j)=>{
    const judges=assigned[j],judge=judges.reduce((n,x)=>n+displayCents(x.subtotal),0),suffix=judges.length?`\n${tr('Frais de juges du bloc','Block judge fees')}\n${detail(judges)}`:'';
    return [previous.rows[j][0]+suffix,money(c.entry),money(c.judge+judge),money(c.total+judge)];
   });
   // Defensive fallback for malformed historical snapshots with a judge fee but
   // no entry row. Valid current data always takes the compact path above.
   if(!block.classes.length&&block.blockJudges.length)rows.push([...previous.rows[0]]);
   rows.push([...previous.rows.at(-1)]);
   const b={...previous,rows};
   b.rowKinds=b.rows.map((_,j)=>j===b.rows.length-1?'block-total':'class-detail');
   b.rows.at(-1)[0]=`Total ${block.label} — ${bib} — ${block.occurrence} — ${fr?'avant taxes':'before taxes'}`;
   b.keepTail=2;
   if(i===g.blocks.length-1){const total=old[index++];b.rows.push([total.rows[0][0]+(fr?' — avant taxes':' — before taxes'),...total.rows[0].slice(1)]);b.rowKinds.push('bib-total');b.keepTail=3;b.endsBib=true;}
   result.push(b);
  }
 }
 result.push(...old.slice(index));return result;
}
