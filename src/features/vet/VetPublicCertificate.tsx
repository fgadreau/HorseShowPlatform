import type { VetAdministration } from '../../services/vetServices';
export type PublicCertificate = {
 number: string; version: number; issued_at: string; status: string; certificate_status: string; replacement_number?: string;
 details?: { horse_name?: string; owner_name?: string; agent_name?: string; identifiers?: {type: string; value: string}[];
 clinic_name?: string; clinic_contact?: string; prepared_name?: string; veterinarian_name?: string; permit_number?: string;
 verification_result?: string; verification_status?: string; verified_at?: string; signed_at?: string;
 signature_visual?: [number,number][][]; administrations?: VetAdministration[]; };
};
const diseases: Record<string,string> = {influenza:'Influenza',ehv_1:'EHV-1',ehv_4:'EHV-4'};
function date(value?: string, time=false) {
 if (!value) return '';
 const parsed = new Date(time ? value : `${value.slice(0,10)}T12:00:00Z`);
 return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('fr-CA',{dateStyle:'long',...(time?{timeStyle:'short' as const}:{}),timeZone:'America/Toronto'}).format(parsed);
}
function Row({label,value}: {label:string;value?:string}) {return value ? <p><strong>{label} :</strong> {value}</p> : null;}
export function VetPublicCertificate({certificate:c}: {certificate:PublicCertificate}) {
 const d=c.details;if(!d)return null;
 return <article aria-label="Renseignements du certificat">
 <h2>Cheval et propriétaire</h2><Row label="Nom officiel du cheval HSP" value={d.horse_name}/><Row label="Propriétaire" value={d.owner_name}/>
 {d.identifiers?.map((i,k)=><Row key={k} label={i.type==='microchip'?'Micropuce':'Enregistrement'} value={i.value}/>)}
 <Row label="Écurie ou agent" value={d.agent_name}/>
 <h2>Vaccinations administrées</h2>{d.administrations?.map((a,i)=><section className="vet-guide" key={i}>
 <h3>Administration {i+1}</h3><Row label="Produit" value={a.product}/><Row label="Fabricant" value={a.manufacturer}/>
 <Row label="Maladies couvertes" value={a.diseases?.map(v=>diseases[v]??v).join(', ')}/><Row label="Lot ou série" value={a.lot}/>
 <Row label="Date d’administration" value={date(a.administered_on)}/><Row label="Expiration du produit" value={date(a.product_expires_on)}/>
 <Row label="Date de rappel / fin de validité" value={date(a.valid_until)}/><Row label="Durée déclarée" value={a.declared_duration}/>
 </section>)}
 <h2>Clinique et vétérinaire responsable</h2><Row label="Clinique émettrice" value={d.clinic_name}/><Row label="Coordonnées de la clinique" value={d.clinic_contact}/>
 <Row label="Préparé par" value={d.prepared_name}/><Row label="Vétérinaire responsable" value={d.veterinarian_name}/><Row label="Numéro de permis" value={d.permit_number}/>
 {d.verification_result==='verified'&&<p>Vétérinaire vérifié auprès de l’OMVQ — Statut actif lors de la vérification</p>}
 <Row label="Vérification effectuée le" value={date(d.verified_at,true)}/>
 {d.signed_at&&<section><h2>Signature électronique du vétérinaire</h2>
 {c.status==='test'?<p><strong>TEST — AUCUNE SIGNATURE RÉELLE</strong></p>:<><svg viewBox="0 0 640 200" style={{width:'100%',maxWidth:400}} role="img" aria-label="Signature électronique du vétérinaire">
 {d.signature_visual?.map((line,i)=><polyline key={i} fill="none" stroke="currentColor" strokeWidth="2" points={line.map(([x,y])=>`${x*640},${y*200}`).join(' ')}/>)}</svg>
 <p>Signature apposée automatiquement en vertu de l’autorisation préalable du vétérinaire.</p></>}
 <Row label="Vétérinaire" value={d.veterinarian_name}/><Row label="Permis" value={d.permit_number}/><Row label="Signature apposée le" value={date(d.signed_at,true)}/></section>}
 <p>Renseignements conservés au moment de l’émission. Les courriels et coordonnées personnelles restent dans le PDF transmis par la clinique.</p>
 </article>;
}
