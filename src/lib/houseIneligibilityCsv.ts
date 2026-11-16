import { parseCsvRecords } from './incentiveNominationCsv.ts';
export const houseNameKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseHouseCsv(input:string):string[]{
 if(input.includes('\uFFFD'))throw Error('Utilisez un fichier CSV UTF-8.');
 const records=parseCsvRecords(input.replace(/^\uFEFF/,''));
 const headers=(records.shift()??[]).map(houseNameKey);
 const full=headers.findIndex(x=>['nomcomplet','ridername','cavalier','fullname'].includes(x));
 const first=headers.findIndex(x=>['prenom','firstname'].includes(x));
 const last=headers.findIndex(x=>['nom','nomdefamille','lastname'].includes(x));
 if(full<0&&(first<0||last<0))throw Error('Colonnes requises : nom_complet, ou prenom et nom.');
 const names=records.map(r=>full>=0?r[full]?.trim():[r[first],r[last]].filter(Boolean).join(' ').trim()).filter((s):s is string=>Boolean(s)&&s!=='#N/A');
 if(!names.length||names.length>2000||names.some(n=>n.length<2||n.length>200))throw Error('Le fichier doit contenir de 1 à 2000 noms de 2 à 200 caractères.');
 const seen=new Set<string>();return names.filter(n=>{const key=houseNameKey(n);if(seen.has(key))return false;seen.add(key);return true;});
}
