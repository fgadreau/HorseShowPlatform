import { useState } from "react";
import { billingRpc } from "../../services/billingFolio";
import type { NrhaHorseLookupVerification } from "../../services/supabaseServices";
import { errorMessage } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Discipline, OrganizationDiscipline } from "../../types/domain";
import { mapNrhaSex, normalizeNrhaDate } from "./nrhaHorseValidation";
import { uiText } from "../dashboard/shared";

type OwnerMatch = { first_name: string; last_name: string; requires_confirmation: boolean };
type VerifyNrhaHorse = (input: { licenseNumber: number; name: string }) => Promise<NrhaHorseLookupVerification>;

function splitOwnerName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: parts[0] ? "Owner" : "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export function HorseForOwnerForm({ orgId, directories, disciplines, locale, onVerifyNrhaHorse, onSaved }: {
  orgId: string;
  directories: OrganizationDiscipline[];
  disciplines: Discipline[];
  locale: Locale;
  onVerifyNrhaHorse: VerifyNrhaHorse;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"nrha" | "manual">("nrha");
  const [nrhaNumber, setNrhaNumber] = useState("");
  const [nrhaName, setNrhaName] = useState("");
  const [verification, setVerification] = useState<NrhaHorseLookupVerification | null>(null);
  const [owner, setOwner] = useState<OwnerMatch | null>(null);
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
  const importedHorse = verification?.horse ?? null;
  const officialHorseName = importedHorse?.horseName?.trim() || verification?.officialHorseName?.trim() || "";
  const officialOwnerName = importedHorse?.ownerName?.trim() || verification?.officialOwnerName?.trim() || "";
  const officialHorseNumber = String(importedHorse?.licenseNumber ?? verification?.licenseNumber ?? "");
  const officialOwnerNumber = importedHorse?.ownerMemberNumber ? String(importedHorse.ownerMemberNumber) : "";

  function resetNrhaResult() {
    setVerification(null);
    setOwner(null);
    setLookupNotice("");
  }

  async function lookupNrhaHorse() {
    const licenseNumber = Number(nrhaNumber.trim());
    setBusy(true); setError(""); resetNrhaResult();
    try {
      const result = await onVerifyNrhaHorse({ licenseNumber, name: nrhaName.trim() });
      if (result.status === "not_found" || !result.horse) {
        setLookupNotice(uiText(locale, "NRHA ne retourne aucun cheval pour ce numéro et ce nom.", "NRHA did not return a horse for this number and name."));
        return;
      }
      if (result.status === "mismatch" || result.matched !== true || result.checks?.name?.matched !== true) {
        setLookupNotice(uiText(locale, "Le numéro existe dans NRHA, mais le nom saisi ne correspond pas au nom officiel du cheval.", "The number exists in NRHA, but the entered name does not match the horse's official name."));
        return;
      }
      const resolvedNumber = String(result.horse.licenseNumber ?? result.licenseNumber ?? "");
      if (resolvedNumber !== nrhaNumber.trim()) throw new Error(uiText(locale, "Le numéro retourné par NRHA ne correspond pas à la recherche.", "The number returned by NRHA does not match the search."));
      const ownerNumber = result.horse.ownerMemberNumber ? String(result.horse.ownerMemberNumber) : "";
      if (ownerNumber) {
        const matches = await billingRpc("find_horse_owner_by_nrha", { p_org: orgId, p_number: ownerNumber });
        setOwner(matches.length === 1 ? matches[0] : null);
      }
      setVerification(result);
      if (!ownerNumber) setLookupNotice(uiText(locale, "NRHA n’a pas fourni de numéro de membre pour le propriétaire; le secrétariat devra confirmer sa fiche.", "NRHA did not provide an owner member number; the office must confirm the owner record."));
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      if (mode === "nrha") {
        if (!verification || !importedHorse || !officialHorseName || !officialOwnerName || !officialHorseNumber) throw new Error(uiText(locale, "Recherche et confirme d’abord la fiche NRHA du cheval.", "Search and confirm the NRHA horse record first."));
        const ownerParts = splitOwnerName(officialOwnerName);
        const dateOfBirth = normalizeNrhaDate(importedHorse.foalDate ?? verification.officialFoalDate ?? "");
        await billingRpc("create_verified_nrha_horse_for_owner", {
          p_org: orgId,
          p_directory: directoryId,
          p_horse_number: officialHorseNumber,
          p_details: {
            name: officialHorseName,
            registration_number: officialHorseNumber,
            gender: mapNrhaSex(importedHorse.sex),
            birth_year: dateOfBirth.slice(0, 4),
            date_of_birth: dateOfBirth,
            sire_name: importedHorse.sireName?.trim() ?? "",
            dam_name: importedHorse.damName?.trim() ?? "",
            owner_name: officialOwnerName,
            owner_first_name: ownerParts.firstName,
            owner_last_name: ownerParts.lastName,
            owner_nrha_number: officialOwnerNumber,
            verification_source: "nrha_api",
            nrha_verification: {
              status: verification.status,
              matched: verification.matched,
              checks: verification.checks,
              licenseNumber: verification.licenseNumber,
              officialFoalDate: verification.officialFoalDate,
              officialHorseName: verification.officialHorseName,
              officialOwnerName: verification.officialOwnerName,
              horse: importedHorse,
            },
          },
        });
      } else {
        const details = { name: name.trim(), registration_number: registration.trim(), gender, birth_year: year };
        await billingRpc("request_horse_owner_confirmation", { p_org: orgId, p_directory: directoryId, p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_details: details });
      }
      await onSaved();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  return <form className="stack" onSubmit={save}>
    <p>{uiText(locale, "Le cheval appartient au propriétaire officiel. Une fiche NRHA vérifiée permet de reprendre le cheval et son propriétaire avant de t’ajouter comme agent.", "The horse belongs to its official owner. A verified NRHA record imports the horse and owner before adding you as an agent.")}</p>
    <div className="segmented-control compact-segmented" role="group" aria-label={uiText(locale, "Mode de création", "Creation mode")}>
      <button type="button" className={mode === "nrha" ? "active" : ""} aria-pressed={mode === "nrha"} onClick={() => { setMode("nrha"); setError(""); }}>{uiText(locale, "Cheval NRHA", "NRHA horse")}</button>
      <button type="button" className={mode === "manual" ? "active" : ""} aria-pressed={mode === "manual"} onClick={() => { setMode("manual"); setError(""); }}>{uiText(locale, "Création manuelle", "Manual creation")}</button>
    </div>
    {mode === "nrha" ? <div className="stack form-section">
      <div className="form-grid">
        <label>{uiText(locale, "Numéro NRHA du cheval", "Horse NRHA number")}<input required inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} value={nrhaNumber} onChange={event => { setNrhaNumber(event.target.value); resetNrhaResult(); }} /></label>
        <label>{uiText(locale, "Nom du cheval dans NRHA", "Horse name in NRHA")}<input required maxLength={200} value={nrhaName} onChange={event => { setNrhaName(event.target.value); resetNrhaResult(); }} /></label>
      </div>
      <div className="row-actions"><button className="ghost-button" type="button" disabled={busy || !/^[0-9]{1,20}$/.test(nrhaNumber.trim()) || !nrhaName.trim()} onClick={() => void lookupNrhaHorse()}>{uiText(locale, "Rechercher le cheval dans NRHA", "Find horse in NRHA")}</button></div>
      {verification && importedHorse ? <div className="nrha-import-preview" role="status">
        <strong>{uiText(locale, "Fiche NRHA trouvée", "NRHA record found")}</strong>
        <div className="nrha-import-preview-grid">
          <div><span>{uiText(locale, "Cheval", "Horse")}</span><strong>{officialHorseName}</strong></div>
          <div><span>{uiText(locale, "Numéro NRHA", "NRHA number")}</span><strong>{officialHorseNumber}</strong></div>
          <div><span>{uiText(locale, "Propriétaire officiel", "Official owner")}</span><strong>{officialOwnerName}</strong></div>
          <div><span>{uiText(locale, "Numéro de membre du propriétaire", "Owner member number")}</span><strong>{officialOwnerNumber || uiText(locale, "Non fourni", "Not provided")}</strong></div>
        </div>
        {owner ? <p>{uiText(locale, "Fiche propriétaire HSP trouvée : ", "HSP owner record found: ")}<strong>{owner.first_name} {owner.last_name}</strong></p> : <p className="input-help">{uiText(locale, "La fiche du propriétaire devra être confirmée avant la création du cheval et de ton accès d’agent.", "The owner record must be confirmed before creating the horse and your agent access.")}</p>}
      </div> : null}
      {lookupNotice ? <p role="status">{lookupNotice}</p> : null}
    </div> : <div className="stack form-section">
      <p className="input-help">{uiText(locale, "Création manuelle : le cheval ne sera pas marqué comme vérifié par NRHA. Le secrétariat devra confirmer le propriétaire avant sa création.", "Manual creation: the horse will not be marked as NRHA-verified. The office must confirm the owner before creation.")}</p>
      <div className="form-grid">
        <label>{uiText(locale, "Prénom du propriétaire", "Owner first name")}<input required maxLength={100} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
        <label>{uiText(locale, "Nom du propriétaire", "Owner last name")}<input required maxLength={100} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
      </div>
      <label>{uiText(locale, "Nom du cheval", "Horse name")}<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>{uiText(locale, "Numéro d’enregistrement déclaré (facultatif, non vérifié)", "Declared registration number (optional, unverified)")}<input maxLength={100} value={registration} onChange={event => setRegistration(event.target.value)} /></label>
      <div className="form-grid"><label>{uiText(locale, "Sexe", "Sex")}<select value={gender} onChange={event => setGender(event.target.value)}><option value="">{uiText(locale, "À préciser", "Unspecified")}</option><option value="M">{uiText(locale, "Étalon", "Stallion")}</option><option value="F">{uiText(locale, "Jument", "Mare")}</option><option value="G">{uiText(locale, "Hongre", "Gelding")}</option></select></label>
        <label>{uiText(locale, "Année de naissance (facultative)", "Birth year (optional)")}<input type="number" min="1900" max={new Date().getFullYear() + 1} value={year} onChange={event => setYear(event.target.value)} /></label></div>
    </div>}
    <label>{uiText(locale, "Répertoire", "Directory")}<select required value={directoryId} onChange={event => setDirectoryId(event.target.value)}>{directories.map(directory => <option key={directory.id} value={directory.id}>{disciplines.find(discipline => discipline.id === directory.discipline_id)?.name ?? uiText(locale, "Répertoire", "Directory")}</option>)}</select></label>
    {error ? <p role="alert">{error}</p> : null}
    <div className="row-actions"><button className="primary-button" type="submit" disabled={busy || !directoryId || (mode === "nrha" && !verification)}>{mode === "nrha" ? owner?.requires_confirmation ? uiText(locale, "Demander l’accord du propriétaire", "Request owner approval") : owner ? uiText(locale, "Créer le cheval NRHA pour ce propriétaire", "Create NRHA horse for this owner") : uiText(locale, "Demander la confirmation du propriétaire", "Request owner confirmation") : uiText(locale, "Demander la création manuelle", "Request manual creation")}</button></div>
  </form>;
}
