import type {Json} from '../../services/billingFolio';
export function DocumentView({document,locale}:{document:Json;locale:string}){
 const s=document.snapshot,fr=locale==='fr';const money=(v:unknown)=>new Intl.NumberFormat(locale,{style:'currency',currency:s.currency}).format(Number(v??0));
 return <article className="finance-document"><h3>{document.kind==='invoice'?(fr?'Facture finale':'Final invoice'):document.kind==='receipt'?(fr?'Reçu de paiement':'Payment receipt'):(fr?'Relevé du compte':'Account statement')} {document.number??''}</h3>
 {document.kind==='receipt'&&s.receipt_payment&&<p><strong>{fr?'Paiement de ce reçu':'Payment on this receipt'} : {money(s.receipt_payment.amount)}</strong> · {s.receipt_payment.method} · {s.receipt_payment.received_at}</p>}
 <p>{fr?'DÉMONSTRATION — montants et taxes fictifs':'DEMONSTRATION — fictitious amounts and taxes'}</p><p>{s.account_number} · {fr?s.context.name_fr:s.context.name_en} · {s.context.financial_year??'—'}</p>
 <p>{s.payer.first_name} {s.payer.last_name} {s.payer.company_name} · {s.payer.address}</p>
 <div className="finance-table-wrap"><table><thead><tr><th>{fr?'Frais':'Charge'}</th><th>{fr?'Bénéficiaire / cheval':'Beneficiary / horse'}</th><th>{fr?'Taxes':'Taxes'}</th><th>Total</th></tr></thead><tbody>{s.charges.map((c:Json)=><tr key={c.id}><td>{c.description} × {c.quantity}</td><td>{c.beneficiary?.display_name??'—'} / {c.horse?.name??'—'}</td><td>{c.taxes.map((t:Json)=><div key={t.code}>{t.name} ({t.rate}%) : {money(t.amount)}</div>)}</td><td>{money(c.total)}</td></tr>)}</tbody></table></div>
 <p>{fr?'Sous-total':'Subtotal'} : {money(s.subtotal)} · Taxes : {money(s.tax_amount)} · Total : {money(s.total)}</p>
 <ul>{s.payments.map((p:Json)=><li key={p.id}>{p.method} · {money(p.amount)} · {p.received_at}</li>)}</ul><strong>{fr?'Solde à la date du document':'Balance at document date'} : {money(s.balance)}</strong>
 <p>{fr?'PDF non disponible — génération prévue en tranche 1C.':'PDF unavailable — generation planned in tranche 1C.'}</p></article>;
}
