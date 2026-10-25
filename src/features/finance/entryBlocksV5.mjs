import {entryBlocks,entryGroups} from './entryGroups.mjs';
// Presentation only; reuse version 4's business groups and integer-cent sums.
export function entryBlocksV5(charges,locale,currency){
 const fr=locale==='fr',old=entryBlocks(charges,locale,currency),groups=entryGroups(charges,locale),result=[];let index=0;
 for(const g of groups){
  const bib=g.number!=null?(fr?'dossard ':'back number ')+g.number:(fr?'dossard non attribué':'back number not assigned');
  for(const [i,block] of g.blocks.entries()){
   const b=old[index++];b.rows=b.rows.map(r=>[...r]);
   b.rowKinds=b.rows.map((_,j)=>j===b.rows.length-1?'block-total':'class-detail');
   b.rows.at(-1)[0]=`Total ${block.label} — ${bib} — ${block.occurrence} — ${fr?'avant taxes':'before taxes'}`;
   b.keepTail=2;
   if(i===g.blocks.length-1){const total=old[index++];b.rows.push([total.rows[0][0]+(fr?' — avant taxes':' — before taxes'),...total.rows[0].slice(1)]);b.rowKinds.push('bib-total');b.keepTail=3;b.endsBib=true;}
   result.push(b);
  }
 }
 result.push(...old.slice(index));return result;
}
