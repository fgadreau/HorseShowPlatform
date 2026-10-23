import {documentModel as previous} from './pdf-v2.mjs';
import {entryBlocks} from '../../src/features/finance/entryGroups.mjs';
export function documentModel(d,locale){
 if(d.snapshot.render_version!==4)throw Error('BILLING_PDF_RENDER_VERSION');
 const model=previous({...d,snapshot:{...d.snapshot,render_version:2}},locale);
 const start=d.kind==='receipt'?1:0,count=model.groups+(model.groups?1:0);
 const blocks=entryBlocks(d.snapshot.charges,locale,d.snapshot.currency);
 const supplier=d.snapshot.suppliers?.association?.name;
 if(supplier)for(const b of blocks)b.label=supplier+' — '+b.label;
 model.blocks.splice(start,count,...blocks);
 return model;
}
