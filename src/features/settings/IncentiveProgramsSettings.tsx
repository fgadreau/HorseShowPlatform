import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { EmptyState, NoticeBanner } from "../../components/ui";
import { errorMessage, formatCurrency } from "../../lib/display";
import { incentiveNominationCsvHeaders, parseIncentiveNominationCsv, type IncentiveNominationCsvPreview } from "../../lib/incentiveNominationCsv";
import type { Locale } from "../../lib/i18n";
import {
  createIncentiveProgram,
  createIncentiveProgramNomination,
  importIncentiveProgramNominations,
  updateIncentiveProgram,
  updateIncentiveProgramNomination,
  type AppContext,
} from "../../services/supabaseServices";
import type { IncentiveProgram, IncentiveProgramNomination, IncentiveProgramType, Organization } from "../../types/domain";
import type { Notice } from "../../types/ui";
import { incentiveProgramName, incentiveProgramTypeLabel, nominationRoleLabel, nominationStatusLabel, programUsesStallion } from "../programs/programLabels";

const programTypes: IncentiveProgramType[] = [
  "horse_foal_nomination",
  "stallion_nomination",
  "stallion_subscription_foal_nomination",
  "stallion_incentive",
  "performance_incentive",
];

type ProgramForm = {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  programType: IncentiveProgramType;
  validFrom: string;
  validUntil: string;
  nominationDeadline: string;
  nominationFee: string;
  taxApplicable: boolean;
  isActive: boolean;
};

type NominationForm = {
  horseId: string;
  role: IncentiveProgramNomination["nomination_role"];
  seasonYear: string;
  status: IncentiveProgramNomination["status"];
  validFrom: string;
  validUntil: string;
  qualifyingStallionNominationId: string;
  referenceNumber: string;
  notes: string;
};

export function IncentiveProgramsSettings({ context, locale, organization, onRefresh }: {
  context: AppContext;
  locale: Locale;
  organization: Organization;
  onRefresh: () => void;
}) {
  const programs = context.incentivePrograms.filter((program) => program.organization_id === organization.id);
  const nominations = context.incentiveProgramNominations.filter((nomination) => nomination.organization_id === organization.id);
  const directoryIds = new Set(context.organizationDisciplines.filter((directory) => directory.organization_id === organization.id).map((directory) => directory.id));
  const horseIds = new Set(context.directoryHorses.filter((horse) => directoryIds.has(horse.organization_discipline_id)).map((horse) => horse.horse_id));
  const horses = context.horses.filter((horse) => horseIds.has(horse.id)).sort((left, right) => left.name.localeCompare(right.name));
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id ?? "");
  const [programForm, setProgramForm] = useState<ProgramForm>(() => emptyProgramForm());
  const [nominationForm, setNominationForm] = useState<NominationForm>(() => emptyNominationForm());
  const [csvPreview, setCsvPreview] = useState<IncentiveNominationCsvPreview | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!programs.some((program) => program.id === selectedProgramId)) setSelectedProgramId(programs[0]?.id ?? "");
  }, [programs, selectedProgramId]);

  const selectedProgram = programs.find((program) => program.id === selectedProgramId) ?? null;
  const selectedNominations = nominations.filter((nomination) => nomination.incentive_program_id === selectedProgramId);
  const stallionNominations = selectedNominations.filter((nomination) => nomination.nomination_role === "stallion" && nomination.status === "active");
  const availableRoles = useMemo<IncentiveProgramNomination["nomination_role"][]>(() => {
    if (!selectedProgram) return ["horse"];
    return programUsesStallion(selectedProgram) ? ["stallion", "foal"] : selectedProgram.program_type === "horse_foal_nomination" ? ["horse", "foal"] : ["horse"];
  }, [selectedProgram]);

  useEffect(() => {
    if (!availableRoles.includes(nominationForm.role)) {
      setNominationForm((current) => ({ ...current, role: availableRoles[0] ?? "horse", qualifyingStallionNominationId: "" }));
    }
  }, [availableRoles, nominationForm.role]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", message: success });
      await onRefresh();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy("");
    }
  }

  async function handleProgramSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      organization_id: organization.id,
      code: programForm.code,
      name_fr: programForm.nameFr,
      name_en: programForm.nameEn || null,
      description_fr: programForm.descriptionFr || null,
      description_en: programForm.descriptionEn || null,
      program_type: programForm.programType,
      valid_from: programForm.validFrom || null,
      valid_until: programForm.validUntil || null,
      nomination_deadline: programForm.nominationDeadline || null,
      nomination_fee: Number(programForm.nominationFee) || 0,
      tax_applicable: programForm.taxApplicable,
      is_active: programForm.isActive,
      created_by_user_id: context.profile.id,
    };
    const editingId = programForm.id;
    await run("program", async () => {
      const saved = editingId
        ? await updateIncentiveProgram(editingId, payload)
        : await createIncentiveProgram(payload);
      setSelectedProgramId(saved.id);
      setProgramForm(emptyProgramForm());
    }, uiText(locale, "Programme enregistré.", "Program saved."));
  }

  async function handleNominationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProgram || !nominationForm.horseId) return;
    const season = Number(nominationForm.seasonYear) || new Date().getFullYear();
    await run("nomination", async () => {
      await createIncentiveProgramNomination({
        organization_id: organization.id,
        incentive_program_id: selectedProgram.id,
        horse_id: nominationForm.horseId,
        nomination_role: nominationForm.role,
        season_year: season,
        status: nominationForm.status,
        source: selectedProgram.program_type === "performance_incentive" ? "performance" : nominationForm.role === "foal" && programUsesStallion(selectedProgram) ? "stallion_progeny" : "manual",
        nominated_on: new Date().toISOString().slice(0, 10),
        valid_from: nominationForm.validFrom || `${season}-01-01`,
        valid_until: nominationForm.validUntil || `${season}-12-31`,
        qualifying_stallion_nomination_id: nominationForm.qualifyingStallionNominationId || null,
        reference_number: nominationForm.referenceNumber || null,
        notes: nominationForm.notes || null,
        created_by_user_id: context.profile.id,
      });
      setNominationForm(emptyNominationForm());
    }, uiText(locale, "Nomination ajoutée.", "Nomination added."));
  }

  async function handleCsvFile(file: File | undefined) {
    if (!file) return;
    setCsvPreview(parseIncentiveNominationCsv(await file.text()));
  }

  async function handleCsvImport() {
    if (!csvPreview?.rows.length || csvPreview.errors.length) return;
    await run("csv", async () => {
      const result = await importIncentiveProgramNominations(organization.id, csvPreview.rows);
      if (result.failed) {
        setCsvPreview({ rows: csvPreview.rows, errors: result.errors });
        throw new Error(`${result.imported} importée(s), ${result.failed} ligne(s) refusée(s).`);
      }
      setCsvPreview(null);
    }, uiText(locale, "Import CSV terminé.", "CSV import completed."));
  }

  return (
    <section className="panel span-2">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Programmes incitatifs et de nomination", "Incentive and nomination programs")}</h2>
          <p>{uiText(locale, "Les programmes sont facultatifs. Ils ne bloquent une inscription que lorsqu’une classe les exige explicitement.", "Programs are optional. They only block an entry when a class explicitly requires one.")}</p>
        </div>
      </div>
      {notice ? <NoticeBanner notice={notice} /> : null}

      <div className="form-grid">
        <label>{uiText(locale, "Programme à gérer", "Program to manage")}
          <select value={selectedProgramId} onChange={(event) => setSelectedProgramId(event.target.value)}>
            <option value="">{uiText(locale, "Choisir un programme", "Choose a program")}</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{`${program.code} · ${incentiveProgramName(program, locale)}`}</option>)}
          </select>
        </label>
        {selectedProgram ? <div className="detail-list"><strong>{incentiveProgramTypeLabel(selectedProgram.program_type, locale)}</strong><span>{formatCurrency(selectedProgram.nomination_fee, organization.currency)}</span></div> : null}
      </div>

      <fieldset className="stack nested-fieldset">
        <legend>{programForm.id ? uiText(locale, "Modifier le programme", "Edit program") : uiText(locale, "Nouveau programme", "New program")}</legend>
        <form className="stack" onSubmit={handleProgramSubmit}>
          <div className="form-grid">
            <label>{uiText(locale, "Code", "Code")}<input required value={programForm.code} onChange={(event) => setProgramForm({ ...programForm, code: event.target.value })} /></label>
            <label>{uiText(locale, "Nom français", "French name")}<input required value={programForm.nameFr} onChange={(event) => setProgramForm({ ...programForm, nameFr: event.target.value })} /></label>
            <label>{uiText(locale, "Nom anglais", "English name")}<input value={programForm.nameEn} onChange={(event) => setProgramForm({ ...programForm, nameEn: event.target.value })} /></label>
            <label>{uiText(locale, "Type", "Type")}<select value={programForm.programType} onChange={(event) => setProgramForm({ ...programForm, programType: event.target.value as IncentiveProgramType })}>{programTypes.map((type) => <option key={type} value={type}>{incentiveProgramTypeLabel(type, locale)}</option>)}</select></label>
          </div>
          <div className="form-grid">
            <label>{uiText(locale, "Valide du", "Valid from")}<input type="date" value={programForm.validFrom} onChange={(event) => setProgramForm({ ...programForm, validFrom: event.target.value })} /></label>
            <label>{uiText(locale, "Valide au", "Valid until")}<input type="date" value={programForm.validUntil} onChange={(event) => setProgramForm({ ...programForm, validUntil: event.target.value })} /></label>
            <label>{uiText(locale, "Date limite", "Deadline")}<input type="date" value={programForm.nominationDeadline} onChange={(event) => setProgramForm({ ...programForm, nominationDeadline: event.target.value })} /></label>
            <label>{uiText(locale, "Prix de nomination", "Nomination fee")}<input min="0" step="0.01" type="number" value={programForm.nominationFee} onChange={(event) => setProgramForm({ ...programForm, nominationFee: event.target.value })} /></label>
          </div>
          <label>{uiText(locale, "Description française", "French description")}<textarea rows={2} value={programForm.descriptionFr} onChange={(event) => setProgramForm({ ...programForm, descriptionFr: event.target.value })} /></label>
          <label>{uiText(locale, "Description anglaise", "English description")}<textarea rows={2} value={programForm.descriptionEn} onChange={(event) => setProgramForm({ ...programForm, descriptionEn: event.target.value })} /></label>
          <div className="row-actions">
            <label className="check-row"><input checked={programForm.taxApplicable} type="checkbox" onChange={(event) => setProgramForm({ ...programForm, taxApplicable: event.target.checked })} /><span>{uiText(locale, "Taxable", "Taxable")}</span></label>
            <label className="check-row"><input checked={programForm.isActive} type="checkbox" onChange={(event) => setProgramForm({ ...programForm, isActive: event.target.checked })} /><span>{uiText(locale, "Actif", "Active")}</span></label>
          </div>
          <div className="row-actions">
            <button className="primary-button" disabled={Boolean(busy)} type="submit">{uiText(locale, "Enregistrer", "Save")}</button>
            {selectedProgram ? <button className="secondary-button" disabled={Boolean(busy)} type="button" onClick={() => setProgramForm(programFormFrom(selectedProgram))}>{uiText(locale, "Modifier le programme choisi", "Edit selected program")}</button> : null}
            {programForm.id ? <button className="secondary-button" type="button" onClick={() => setProgramForm(emptyProgramForm())}>{uiText(locale, "Annuler", "Cancel")}</button> : null}
          </div>
        </form>
      </fieldset>

      {selectedProgram ? <fieldset className="stack nested-fieldset">
        <legend>{uiText(locale, "Nominations du programme", "Program nominations")}</legend>
        <div className="requirement-list">
          {selectedNominations.map((nomination) => {
            const horse = horses.find((candidate) => candidate.id === nomination.horse_id);
            return <div className="membership-type-row" key={nomination.id}>
              <span className="membership-type-main"><strong>{horse?.name ?? nomination.horse_id}</strong>{`${nominationRoleLabel(nomination.nomination_role, locale)} · ${nomination.season_year} · ${nomination.reference_number ?? "—"}`}</span>
              <div className="membership-type-actions"><small>{nominationStatusLabel(nomination.status, locale)}</small><button className="secondary-button" disabled={Boolean(busy)} type="button" onClick={() => void run(`status:${nomination.id}`, () => updateIncentiveProgramNomination(nomination.id, { status: nomination.status === "active" ? "withdrawn" : "active" }), uiText(locale, "Statut mis à jour.", "Status updated."))}>{nomination.status === "active" ? uiText(locale, "Retirer", "Withdraw") : uiText(locale, "Activer", "Activate")}</button></div>
            </div>;
          })}
          {!selectedNominations.length ? <EmptyState label={uiText(locale, "Aucune nomination.", "No nominations.")} /> : null}
        </div>
        <form className="stack" onSubmit={handleNominationSubmit}>
          <div className="form-grid">
            <label>{uiText(locale, "Cheval", "Horse")}<select required value={nominationForm.horseId} onChange={(event) => setNominationForm({ ...nominationForm, horseId: event.target.value })}><option value="">{uiText(locale, "Choisir", "Choose")}</option>{horses.map((horse) => <option key={horse.id} value={horse.id}>{`${horse.name}${horse.registration_number ? ` · ${horse.registration_number}` : ""}`}</option>)}</select></label>
            <label>{uiText(locale, "Rôle", "Role")}<select value={nominationForm.role} onChange={(event) => setNominationForm({ ...nominationForm, role: event.target.value as IncentiveProgramNomination["nomination_role"] })}>{availableRoles.map((role) => <option key={role} value={role}>{nominationRoleLabel(role, locale)}</option>)}</select></label>
            <label>{uiText(locale, "Saison", "Season")}<input min="1900" type="number" value={nominationForm.seasonYear} onChange={(event) => setNominationForm({ ...nominationForm, seasonYear: event.target.value })} /></label>
            <label>{uiText(locale, "Statut", "Status")}<select value={nominationForm.status} onChange={(event) => setNominationForm({ ...nominationForm, status: event.target.value as IncentiveProgramNomination["status"] })}>{(["pending", "active", "expired", "rejected", "withdrawn"] as const).map((status) => <option key={status} value={status}>{nominationStatusLabel(status, locale)}</option>)}</select></label>
          </div>
          {nominationForm.role === "foal" && programUsesStallion(selectedProgram) ? <label>{uiText(locale, "Nomination de l’étalon admissible", "Qualifying stallion nomination")}<select required={nominationForm.status === "active"} value={nominationForm.qualifyingStallionNominationId} onChange={(event) => setNominationForm({ ...nominationForm, qualifyingStallionNominationId: event.target.value })}><option value="">{uiText(locale, "À confirmer", "To be confirmed")}</option>{stallionNominations.map((nomination) => <option key={nomination.id} value={nomination.id}>{`${horses.find((horse) => horse.id === nomination.horse_id)?.name ?? "Étalon"} · ${nomination.reference_number ?? nomination.season_year}`}</option>)}</select></label> : null}
          <div className="form-grid">
            <label>{uiText(locale, "Valide du", "Valid from")}<input type="date" value={nominationForm.validFrom} onChange={(event) => setNominationForm({ ...nominationForm, validFrom: event.target.value })} /></label>
            <label>{uiText(locale, "Valide au", "Valid until")}<input type="date" value={nominationForm.validUntil} onChange={(event) => setNominationForm({ ...nominationForm, validUntil: event.target.value })} /></label>
            <label>{uiText(locale, "No de référence", "Reference number")}<input value={nominationForm.referenceNumber} onChange={(event) => setNominationForm({ ...nominationForm, referenceNumber: event.target.value })} /></label>
          </div>
          <label>{uiText(locale, "Notes", "Notes")}<textarea rows={2} value={nominationForm.notes} onChange={(event) => setNominationForm({ ...nominationForm, notes: event.target.value })} /></label>
          <button className="primary-button" disabled={Boolean(busy) || !nominationForm.horseId} type="submit">{uiText(locale, "Ajouter la nomination", "Add nomination")}</button>
        </form>
      </fieldset> : null}

      <fieldset className="stack nested-fieldset">
        <legend>{uiText(locale, "Import CSV", "CSV import")}</legend>
        <p className="muted-line">{uiText(locale, `En-têtes acceptés : ${incentiveNominationCsvHeaders}`, `Accepted headers: ${incentiveNominationCsvHeaders}`)}</p>
        <input accept=".csv,text/csv" type="file" onChange={(event) => void handleCsvFile(event.target.files?.[0])} />
        {csvPreview ? <div className="stack"><strong>{uiText(locale, `${csvPreview.rows.length} ligne(s) prête(s)`, `${csvPreview.rows.length} row(s) ready`)}</strong><div className="requirement-list">{csvPreview.rows.slice(0, 5).map((row, index) => <div className="membership-type-row" key={`${row.program_code}:${row.registration_number}:${index}`}><span className="membership-type-main"><strong>{row.horse_name || row.registration_number}</strong>{`${row.program_code} · ${row.nomination_role || "horse"} · ${row.season_year || new Date().getFullYear()}`}</span></div>)}</div>{csvPreview.rows.length > 5 ? <span className="muted-line">{uiText(locale, `… et ${csvPreview.rows.length - 5} autre(s) ligne(s).`, `… and ${csvPreview.rows.length - 5} more row(s).`)}</span> : null}{csvPreview.errors.map((error) => <span className="input-help" key={`${error.row}:${error.message}`}>{`${uiText(locale, "Ligne", "Row")} ${error.row}: ${error.message}`}</span>)}<button className="primary-button" disabled={Boolean(busy) || Boolean(csvPreview.errors.length) || !csvPreview.rows.length} type="button" onClick={() => void handleCsvImport()}>{uiText(locale, "Importer les nominations", "Import nominations")}</button></div> : null}
      </fieldset>
    </section>
  );
}

function emptyProgramForm(): ProgramForm {
  return { id: "", code: "", nameFr: "", nameEn: "", descriptionFr: "", descriptionEn: "", programType: "horse_foal_nomination", validFrom: "", validUntil: "", nominationDeadline: "", nominationFee: "0", taxApplicable: false, isActive: true };
}

function programFormFrom(program: IncentiveProgram): ProgramForm {
  return { id: program.id, code: program.code, nameFr: program.name_fr, nameEn: program.name_en ?? "", descriptionFr: program.description_fr ?? "", descriptionEn: program.description_en ?? "", programType: program.program_type, validFrom: program.valid_from ?? "", validUntil: program.valid_until ?? "", nominationDeadline: program.nomination_deadline ?? "", nominationFee: String(program.nomination_fee), taxApplicable: program.tax_applicable, isActive: program.is_active };
}

function emptyNominationForm(): NominationForm {
  const season = new Date().getFullYear();
  return { horseId: "", role: "horse", seasonYear: String(season), status: "active", validFrom: `${season}-01-01`, validUntil: `${season}-12-31`, qualifyingStallionNominationId: "", referenceNumber: "", notes: "" };
}

function uiText(locale: Locale, fr: string, en: string) {
  return locale === "en" ? en : fr;
}
