import { useEffect, useState } from "react";
import { SearchSelect } from "../../components/ui";
import { contactLabel, errorMessage, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { requireSupabase } from "../../lib/supabase";
import type { ClassTemplate, Contact, Horse } from "../../types/domain";
import { uiText } from "../dashboard/shared";

type Exclusion = { id: string; rider_contact_id: string | null; horse_id: string | null; reason: string };

export function HouseClassExclusions({ template, contacts, horses, locale }: {
  template: ClassTemplate; contacts: Contact[]; horses: Horse[]; locale: Locale;
}) {
  const [rows, setRows] = useState<Exclusion[]>([]);
  const [subject, setSubject] = useState("rider");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    void requireSupabase().from("house_class_exclusions").select("id,rider_contact_id,horse_id,reason")
      .eq("organization_id", template.organization_id).eq("class_template_id", template.id).order("created_at")
      .then(({ data, error }) => { if (live) { if (error) setError(error.message); else setRows(data ?? []); setBusy(false); } });
    return () => { live = false; };
  }, [template.id, template.organization_id, revision]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!target || busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await requireSupabase().from("house_class_exclusions").insert({
        organization_id: template.organization_id, class_template_id: template.id,
        rider_contact_id: subject === "rider" ? target : null, horse_id: subject === "horse" ? target : null, reason: reason.trim(),
      });
      if (error) throw error;
      setTarget(""); setReason(""); setRevision(value => value + 1);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError("");
    try {
      const { error } = await requireSupabase().from("house_class_exclusions").delete().eq("id", id).eq("class_template_id", template.id);
      if (error) throw error;
      setRevision(value => value + 1);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const items = subject === "rider"
    ? contacts.map(contact => ({ id: contact.id, label: contactLabel(contact) }))
    : horses.map(horse => ({ id: horse.id, label: horseLabel(horse) }));
  return <div className="stack">
    <p>{uiText(locale, "Cette liste s’applique uniquement à cette classe maison récurrente et aux concours de cette association qui l’utilisent. Une exclusion reste active jusqu’à son retrait. Les inscriptions existantes ne sont pas annulées.", "This list applies only to this recurring house class and shows from this association that use it. An exclusion stays active until removed. Existing entries are not cancelled.")}</p>
    {error ? <p role="alert">{error}</p> : null}
    <form className="stack form-section" onSubmit={save}>
      <label>{uiText(locale, "Exclure", "Exclude")}<select value={subject} onChange={event => { setSubject(event.target.value); setTarget(""); }}><option value="rider">{uiText(locale, "Un cavalier", "A rider")}</option><option value="horse">{uiText(locale, "Un cheval", "A horse")}</option></select></label>
      <SearchSelect items={items} placeholder={uiText(locale, "Rechercher le cavalier ou le cheval", "Search for a rider or horse")} value={target} onChange={setTarget} />
      <label>{uiText(locale, "Motif interne (facultatif)", "Internal reason (optional)")}<textarea maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="row-actions"><button className="primary-button" disabled={busy || !target} type="submit">{uiText(locale, "Ajouter à la liste", "Add to list")}</button></div>
    </form>
    {!rows.length ? <p className="muted-line">{uiText(locale, "Aucune exclusion pour cette classe.", "No exclusions for this class.")}</p> : null}
    {rows.map(row => <article className="form-section panel-header" key={row.id}>
      <div><strong>{row.rider_contact_id ? contactLabel(contacts.find(contact => contact.id === row.rider_contact_id)) : horseLabel(horses.find(horse => horse.id === row.horse_id))}</strong><p className="muted-line">{row.rider_contact_id ? uiText(locale, "Cavalier", "Rider") : uiText(locale, "Cheval", "Horse")}{row.reason ? ` · ${row.reason}` : ""}</p></div>
      <button className="ghost-button" type="button" disabled={busy} onClick={() => void remove(row.id)}>{uiText(locale, "Retirer de la liste", "Remove from list")}</button>
    </article>)}
  </div>;
}
