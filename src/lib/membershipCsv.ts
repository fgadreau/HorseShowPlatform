export type MembershipImportRow = {
  first_name?: string; last_name?: string; email?: string; contact_id?: string;
  membership_number?: string; valid_from?: string; valid_until?: string; notes?: string; create_contact?: boolean;
};
const aliases: Record<string, keyof MembershipImportRow> = {
  first_name:'first_name',prenom:'first_name',last_name:'last_name',nom:'last_name',nom_de_famille:'last_name',
  email:'email',courriel:'email',adresse_courriel:'email',contact_id:'contact_id',identifiant_contact:'contact_id',
  membership_number:'membership_number',numero_membre:'membership_number',numero_de_membre:'membership_number',no_membre:'membership_number',
  valid_from:'valid_from',valide_du:'valid_from',debut_validite:'valid_from',date_debut:'valid_from',
  valid_until:'valid_until',valide_au:'valid_until',fin_validite:'valid_until',date_expiration:'valid_until',notes:'notes',
};
export const membershipCsvTemplate = 'prenom,nom,courriel,numero_membre,valide_du,valide_au,notes\nAlex,Martin,alex@example.com,EXT-001,,,Achetée hors application\n';
export function parseMembershipCsv(input: string): MembershipImportRow[] {
  const content=input.replace(/^\uFEFF/,'');
  if (content.includes('\uFFFD')) throw Error('CSV_UTF8_REQUIRED');
  const firstLine=content.split(/\r?\n/,1)[0] ?? '';
  let inQuote=false,commas=0,semicolons=0;
  for(const char of firstLine) { if(char==='"')inQuote=!inQuote;else if(!inQuote&&char===',')commas++;else if(!inQuote&&char===';')semicolons++; }
  const delimiter=semicolons>commas?';':',';
  const records:string[][]=[];let record:string[]=[],field='',quoted=false,closed=false;
  function endField(){record.push(field.trim());field='';closed=false;}
  function endRecord(){endField();if(record.some(Boolean))records.push(record);record=[];}
  for(let i=0;i<content.length;i++) {
    const char=content[i];
    if(quoted) { if(char==='"'){if(content[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=char; }
    else if(char==='"') { if(field.trim()||closed)throw Error('CSV_INVALID_QUOTES');quoted=true;field=''; }
    else if(char===delimiter)endField();
    else if(char==='\n'||char==='\r'){if(char==='\r'&&content[i+1]==='\n')i++;endRecord();}
    else {if(closed&&char.trim())throw Error('CSV_INVALID_QUOTES');field+=char;}
  }
  if(quoted)throw Error('CSV_INVALID_QUOTES');endRecord();
  if(records.length<2)throw Error('CSV_EMPTY');
  if(records.length>501)throw Error('CSV_ROW_LIMIT');
  const headers=records[0].map(value=>aliases[value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')]);
  const known=headers.filter(Boolean);
  if(new Set(known).size!==known.length)throw Error('CSV_DUPLICATE_HEADERS');
  if(!headers.includes('contact_id')&&!headers.includes('email')&&!(headers.includes('first_name')&&headers.includes('last_name')))throw Error('CSV_IDENTITY_COLUMNS_REQUIRED');
  return records.slice(1).map(record=>{
    if(record.length!==headers.length)throw Error('CSV_COLUMN_COUNT');
    const row:MembershipImportRow={};headers.forEach((header,index)=>{if(header)Object.assign(row,{[header]:record[index]});});return row;
  });
}
