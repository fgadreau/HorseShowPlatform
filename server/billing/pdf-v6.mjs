import {renderV5Layout} from './pdf-v5.mjs';

export function renderDocument(document,locale,options){
 return renderV5Layout(document,locale,{...options,renderVersion:6,brandedFooter:true});
}
