import {documentModel} from './pdf-model-v7.mjs';
import {renderV5Layout} from './pdf-v5.mjs';

export function renderDocument(document,locale,options){
 return renderV5Layout(document,locale,{...options,renderVersion:7,brandedFooter:true,modelBuilder:documentModel,compatibleVersion:7});
}
