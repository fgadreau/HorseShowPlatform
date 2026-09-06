import { useState } from 'react';
import { requireSupabase } from '../../lib/supabase';
import type { Locale } from '../../lib/i18n';
import { uiText } from '../dashboard/shared';

type Row = { id: string; disease: string; product: string; administered_on: string; valid_until: string | null; product_expires_on: string; lot: string; certificate_number: string; certificate_status: string; veterinarian_name: string; permit_number: string };
export function VaccinationHistory({ horseId, locale }: { horseId: string; locale: Locale }) {
 const [rows, setRows] = useState<Row[] | null>(null);const [error, setError] = useState('');const [busy, setBusy] = useState(false);
 async function load() {
  setBusy(true);setError('');
  const { data, error } = await requireSupabase().rpc('get_horse_vaccination_history', { p_horse: horseId });
  if (error) setError(error.message);else setRows((data ?? []) as Row[]);
  setBusy(false);
 }
 return <details><summary>{uiText(locale,'Historique des vaccinations certifiées','Certified vaccination history')}</summary>
  <button type="button" disabled={busy} onClick={() => void load()}>{uiText(locale,'Actualiser l’historique','Refresh history')}</button>
  {error && <p role="alert">{error}</p>}{rows?.length === 0 && <p>{uiText(locale,'Aucune vaccination issue du portail vétérinaire.','No vaccinations from the veterinary portal.')}</p>}
  {rows?.map(row => <article key={row.id}><strong>{row.disease.toUpperCase()} · {row.product}</strong><p>{uiText(locale,'Administration','Administered')}: {row.administered_on} · {uiText(locale,'Rappel','Due')}: {row.valid_until ?? '—'}<br />{uiText(locale,'Lot','Batch')}: {row.lot} · {uiText(locale,'Expiration du produit','Product expiration')}: {row.product_expires_on}<br />{row.veterinarian_name} · {row.permit_number}<br />{row.certificate_number} · {row.certificate_status}</p></article>)}
 </details>;
}
