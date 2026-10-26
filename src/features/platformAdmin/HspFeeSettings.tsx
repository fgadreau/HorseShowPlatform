import { useEffect, useState, type FormEvent } from "react";
import { SearchSelect } from "../../components/ui";
import { errorMessage } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Organization, Show } from "../../types/domain";
import { billingRpc } from "../../services/billingFolio";
import { parseHspFeeAmount } from "../finance/hspFeeAmount";
import { uiText } from "../dashboard/shared";

type FeeScope = "platform" | "association" | "show";
type FeeSettings = { platform_admin: boolean; settings: { scope: FeeScope; amount: number | null; note: string | null }[] };

export function PlatformHspFeeSettings({ organizations, shows, locale }: { organizations: Organization[]; shows: Show[]; locale: Locale }) {
  const [organizationId, setOrganizationId] = useState("");
  const [showId, setShowId] = useState("");
  const org = organizations.find(row => row.id === organizationId) ?? [...organizations].sort((a, b) => a.name.localeCompare(b.name))[0];
  const availableShows = shows.filter(row => row.organization_id === org?.id);
  const show = availableShows.find(row => row.id === showId)?.id ?? "";
  return <section className="panel span-2 stack">
    <div className="panel-header"><div><h2>{uiText(locale, "Frais de service HSP", "HSP service fees")}</h2><p>{uiText(locale, "Configure les frais HSP par association. Ces réglages sont réservés à l’administration de la plateforme.", "Configure HSP fees by association. These settings are restricted to platform administrators.")}</p></div></div>
    <div className="form-grid">
      <label>Association<SearchSelect items={organizations.map(row => ({ id: row.id, label: row.name }))} value={org?.id ?? ""} onChange={id => { setOrganizationId(id); setShowId(""); }} placeholder={uiText(locale, "Rechercher une association", "Search associations")} /></label>
      <label>{uiText(locale, "Exception pour un concours (facultatif)", "Show exception (optional)")}<select value={show} onChange={event => setShowId(event.target.value)}><option value="">{uiText(locale, "Réglage de l’association", "Association setting")}</option>{availableShows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    </div>
    {org ? <HspFeeSettings key={`${org.id}:${show}`} org={org.id} show={show} locale={locale} /> : <p>{uiText(locale, "Aucune association disponible.", "No associations available.")}</p>}
  </section>;
}

export function HspFeeSettings({ org, show, locale }: { org: string; show: string; locale: Locale }) {
  const [data, setData] = useState<FeeSettings>();
  const [scope, setScope] = useState<FeeScope>(show ? "show" : "association");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setData(undefined); setError("");
    void billingRpc("get_billing_hsp_fee_settings", { p_org: org, p_show: show || null })
      .then(result => { if (live) setData(result); })
      .catch(error => { if (live) setError(errorMessage(error)); });
    return () => { live = false; };
  }, [org, show]);
  useEffect(() => {
    const row = data?.settings.find(row => row.scope === scope);
    setAmount(row?.amount == null ? "" : String(row.amount).replace(".", locale === "fr" ? "," : "."));
    setNote(row?.note ?? "");
  }, [data, scope, locale]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !data?.platform_admin) return;
    setError(""); setMessage("");
    try {
      const value = parseHspFeeAmount(amount);
      if (scope === "platform" && (value === null || value === 0)) throw Error(uiText(locale, "Le défaut plateforme doit être supérieur à zéro.", "Platform default must be greater than zero."));
      setBusy(true);
      await billingRpc("set_billing_hsp_fee", { p_scope: scope, p_id: scope === "platform" ? "00000000-0000-0000-0000-000000000000" : scope === "show" ? show : org, p_amount: value, p_note: note || null });
      setData(await billingRpc("get_billing_hsp_fee_settings", { p_org: org, p_show: show || null }));
      setMessage(uiText(locale, "Réglage enregistré. Les frais déjà ajoutés restent inchangés.", "Setting saved. Existing fees remain unchanged."));
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <>
    {error ? <p role="alert">{error}</p> : null}
    {!data && !error ? <p>{uiText(locale, "Chargement des frais HSP…", "Loading HSP fees…")}</p> : null}
    {data?.platform_admin ? <form className="stack" onSubmit={save}>
      <div className="form-grid">
        <label>{uiText(locale, "Niveau", "Scope")}<select value={scope} disabled={busy} onChange={event => { setScope(event.target.value as FeeScope); setMessage(""); setError(""); }}><option value="platform">{uiText(locale, "Défaut plateforme — toutes les associations", "Platform default — all associations")}</option><option value="association">Association</option>{show ? <option value="show">{uiText(locale, "Ce concours", "This show")}</option> : null}</select></label>
        <label>{uiText(locale, "Montant avant taxes ($)", "Amount before taxes ($)")}<input aria-label={uiText(locale, "Montant des frais HSP", "HSP fee amount")} inputMode="decimal" placeholder="7,34" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></label>
      </div>
      <p className="input-help">{uiText(locale, "Zéro = commandité. Champ vide = hériter du niveau supérieur. Priorité : concours, association, plateforme. Le défaut plateforme s’applique aux associations sans montant personnalisé.", "Zero = sponsored. Blank = inherit from the higher level. Priority: show, association, platform. The platform default applies to associations without a custom amount.")}</p>
      <label>{uiText(locale, "Note interne (facultative)", "Internal note (optional)")}<input maxLength={1000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
      <div className="form-actions"><button className="primary-button" disabled={busy} type="submit">{uiText(locale, "Enregistrer les frais HSP", "Save HSP fee")}</button></div>
    </form> : null}
    {message ? <p role="status">{message}</p> : null}
  </>;
}
