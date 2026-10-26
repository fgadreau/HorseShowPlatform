import { useState } from "react";
import { billingRpc } from "../../services/billingFolio";
import { errorMessage } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Discipline, OrganizationDiscipline } from "../../types/domain";
import { uiText } from "../dashboard/shared";

export function HorseForOwnerForm({ orgId, directories, disciplines, locale, onSaved }: {
  orgId: string; directories: OrganizationDiscipline[]; disciplines: Discipline[]; locale: Locale; onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"nrha" | "name">("nrha");
  const [number, setNumber] = useState("");
  const [owner, setOwner] = useState<{ first_name: string; last_name: string } | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [name, setName] = useState("");
  const [registration, setRegistration] = useState("");
  const [gender, setGender] = useState("");
  const [year, setYear] = useState("");
  const reining = directories.find(directory => disciplines.some(discipline => discipline.id === directory.discipline_id && discipline.code.toUpperCase() === "REINING"));
  const [directoryId, setDirectoryId] = useState(reining?.id ?? directories.find(directory => directory.is_default)?.id ?? directories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookupNotice, setLookupNotice] = useState("");
  async function lookup() {
    setBusy(true); setError(""); setOwner(null); setLookupNotice("");
    try {
      const matches = await billingRpc("find_horse_owner_by_nrha", { p_org: orgId, p_number: number.trim() });
      if (matches.length === 1) setOwner(matches[0]);
      else setLookupNotice(uiText(locale, "Ce numéro ne correspond pas à une fiche unique. Utilise le nom avec confirmation du secrétariat.", "This number does not identify a unique record. Use the name and request office confirmation."));
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    const details = { name: name.trim(), registration_number: registration.trim(), gender, birth_year: year };
    try {
      if (mode === "nrha") await billingRpc("create_horse_for_nrha_owner", { p_org: orgId, p_directory: directoryId, p_number: number.trim(), p_details: details });
      else await billingRpc("request_horse_owner_confirmation", { p_org: orgId, p_directory: directoryId, p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_details: details });
      await onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={save}>
    <p>{uiText(locale, "Le cheval appartient au propriétaire désigné. Si tu le crées pour quelqu’un d’autre, tu seras ajouté comme agent pour les inscriptions et réservations. Les documents santé pourront être ajoutés depuis la fiche du cheval.", "The horse belongs to its designated owner. When creating it for someone else, you become its agent for entries and reservations. Health documents can be added from the horse record.")}</p>
    <div className="segmented-control compact-segmented" role="group" aria-label={uiText(locale, "Identifier le propriétaire", "Identify owner")}>
      <button type="button" className={mode === "nrha" ? "active" : ""} aria-pressed={mode === "nrha"} onClick={() => setMode("nrha")}>{uiText(locale, "Numéro NRHA", "NRHA number")}</button>
      <button type="button" className={mode === "name" ? "active" : ""} aria-pressed={mode === "name"} onClick={() => setMode("name")}>{uiText(locale, "Nom et confirmation", "Name and confirmation")}</button>
    </div>
    {mode === "nrha" ? <div className="stack form-section">
      <label>{uiText(locale, "Numéro NRHA du propriétaire", "Owner NRHA number")}<input required inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} value={number} onChange={event => { setNumber(event.target.value); setOwner(null); setLookupNotice(""); }} /></label>
      <div className="row-actions"><button className="ghost-button" type="button" disabled={busy || !/^[0-9]{1,20}$/.test(number.trim())} onClick={() => void lookup()}>{uiText(locale, "Rechercher le propriétaire", "Find owner")}</button></div>
      {owner ? <p role="status">{uiText(locale, "Propriétaire trouvé : ", "Owner found: ")}<strong>{owner.first_name} {owner.last_name}</strong></p> : null}
      {lookupNotice ? <p role="status">{lookupNotice}</p> : null}
    </div> : <div className="form-grid">
      <label>{uiText(locale, "Prénom du propriétaire", "Owner first name")}<input required maxLength={100} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
      <label>{uiText(locale, "Nom du propriétaire", "Owner last name")}<input required maxLength={100} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
      <p className="input-help full-span">{uiText(locale, "Le secrétariat devra confirmer la fiche du propriétaire. Le cheval sera créé et ton accès d’agent accordé seulement après cette confirmation.", "The office must confirm the owner record. The horse and your agent access will be created only after confirmation.")}</p>
    </div>}
    <label>{uiText(locale, "Répertoire", "Directory")}<select required value={directoryId} onChange={event => setDirectoryId(event.target.value)}>{directories.map(directory => <option key={directory.id} value={directory.id}>{disciplines.find(discipline => discipline.id === directory.discipline_id)?.name ?? uiText(locale, "Répertoire", "Directory")}</option>)}</select></label>
    <label>{uiText(locale, "Nom du cheval", "Horse name")}<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
    <label>{uiText(locale, "Numéro d’enregistrement du cheval (facultatif)", "Horse registration number (optional)")}<input maxLength={100} value={registration} onChange={event => setRegistration(event.target.value)} /></label>
    <div className="form-grid"><label>{uiText(locale, "Sexe", "Sex")}<select value={gender} onChange={event => setGender(event.target.value)}><option value="">{uiText(locale, "À préciser", "Unspecified")}</option><option value="M">{uiText(locale, "Étalon", "Stallion")}</option><option value="F">{uiText(locale, "Jument", "Mare")}</option><option value="G">{uiText(locale, "Hongre", "Gelding")}</option></select></label>
      <label>{uiText(locale, "Année de naissance (facultative)", "Birth year (optional)")}<input type="number" min="1900" max={new Date().getFullYear() + 1} value={year} onChange={event => setYear(event.target.value)} /></label></div>
    {error ? <p role="alert">{error}</p> : null}
    <div className="row-actions"><button className="primary-button" type="submit" disabled={busy || !directoryId || (mode === "nrha" && !owner)}>{mode === "nrha" ? uiText(locale, "Créer le cheval pour ce propriétaire", "Create horse for this owner") : uiText(locale, "Demander la confirmation du propriétaire", "Request owner confirmation")}</button></div>
  </form>;
}
