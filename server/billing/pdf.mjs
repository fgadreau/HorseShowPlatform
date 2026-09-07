// Explicit dispatch: historical documents keep their original renderer.
import * as v1 from './pdf-v1.mjs';
import * as v2 from './pdf-v2.mjs';
import {renderDocument as renderV3} from './pdf-v3.mjs';
import {renderDocument as renderV4} from './pdf-v4.mjs';
import {documentModel as modelV4} from './pdf-model-v4.mjs';
export {cents} from './pdf-v2.mjs';
export const renderVersions=[1,2,3,4];
function version(d){const v=d.snapshot.render_version??1;if(!renderVersions.includes(v))throw Error('BILLING_PDF_RENDER_VERSION');return v;}
export function documentModel(d,locale){const v=version(d);return v===4?modelV4(d,locale):v===1?v1.documentModel(d,locale):v2.documentModel(v===2?d:{...d,snapshot:{...d.snapshot,render_version:2}},locale);}
export function renderDocument(d,locale,options){const v=version(d);return (v===1?v1.renderDocument:v===2?v2.renderDocument:v===3?renderV3:renderV4)(d,locale,options);}
