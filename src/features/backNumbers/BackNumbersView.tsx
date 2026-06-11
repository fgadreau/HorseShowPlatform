import { useState } from "react";
import type { FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { EmptyState, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, findById, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { assignBackNumber, assignNextBackNumber, claimHorseBackNumber, createBackNumberRange, deleteBackNumber, releaseBackNumber, updateBackNumberStatus } from "../../services/supabaseServices";
import type { Contact, Horse, HorseContact, Organization, OrganizationBackNumber } from "../../types/domain";
import { uiText, entryNumberValue, organizationBackNumberMode, backNumberModeNeedsHorse, backNumberModeNeedsRider, backNumberAssignmentMatchesTarget, backNumberAssigneeLabel, backNumberAssignmentMeta, backNumberModeLabel, backNumberStatusLabel, backNumberStatusBadgeClass, contactBackNumberDetail } from "../dashboard/shared";

function BackNumbersView({
  locale,
  backNumbers,
  contacts,
  horseContacts,
  horses,
  organization,
  profileId,
  onAssignBackNumber,
  onAssignNextBackNumber,
  onCreateBackNumberRange,
  onDeleteBackNumber,
  onReleaseBackNumber,
  onUpdateBackNumberStatus,
}: {
  locale: Locale;
  backNumbers: OrganizationBackNumber[];
  contacts: Contact[];
  horseContacts: HorseContact[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  onAssignBackNumber: (input: Parameters<typeof assignBackNumber>[0]) => Promise<void>;
  onAssignNextBackNumber: (input: Parameters<typeof assignNextBackNumber>[0]) => Promise<void>;
  onCreateBackNumberRange: (input: Parameters<typeof createBackNumberRange>[0]) => Promise<void>;
  onDeleteBackNumber: (id: Parameters<typeof deleteBackNumber>[0]) => Promise<void>;
  onReleaseBackNumber: (id: Parameters<typeof releaseBackNumber>[0]) => Promise<void>;
  onUpdateBackNumberStatus: (id: string, status: Parameters<typeof updateBackNumberStatus>[1]) => Promise<void>;
}) {
  const [startNumber, setStartNumber] = useState("");
  const [endNumber, setEndNumber] = useState("");
  const [rangeNotes, setRangeNotes] = useState("");
  const [horseId, setHorseId] = useState("");
  const [riderContactId, setRiderContactId] = useState("");
  const [number, setNumber] = useState("");
  const [forceTransfer, setForceTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const assignmentMode = organizationBackNumberMode(organization);
  const needsHorse = backNumberModeNeedsHorse(assignmentMode);
  const needsRider = backNumberModeNeedsRider(assignmentMode);
  const sortedBackNumbers = [...backNumbers].sort((first, second) => first.number - second.number);
  const selectedHorse = findById(horses, horseId) ?? null;
  const selectedHorseId = needsHorse ? selectedHorse?.id ?? null : null;
  const selectedRiderId = needsRider ? riderContactId || null : null;
  const selectedAssignment = (needsHorse ? Boolean(selectedHorseId) : true) && (needsRider ? Boolean(selectedRiderId) : true)
    ? backNumbers.find(
        (backNumber) =>
          backNumber.status === "assigned" &&
          backNumberAssignmentMatchesTarget(backNumber, assignmentMode, selectedHorseId, selectedRiderId),
      )
    : null;
  const availableCount = backNumbers.filter((backNumber) => backNumber.status === "available").length;
  const assignedCount = backNumbers.filter((backNumber) => backNumber.status === "assigned").length;
  const riderAssignedCount = backNumbers.filter((backNumber) => backNumber.status === "assigned" && backNumber.assignment_mode === "rider").length;
  const teamAssignedCount = backNumbers.filter((backNumber) => backNumber.status === "assigned" && backNumber.assignment_mode === "horse_rider_team").length;

  async function handleCreateRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    const start = entryNumberValue(startNumber);
    const end = entryNumberValue(endNumber || startNumber);

    if (!start || !end) {
      return;
    }

    setBusy(true);

    try {
      await onCreateBackNumberRange({
        organization_id: organization.id,
        start_number: start,
        end_number: end,
        assignment_mode: assignmentMode,
        notes: rangeNotes,
        created_by_user_id: profileId || null,
      });
      setStartNumber("");
      setEndNumber("");
      setRangeNotes("");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || (needsHorse && !selectedHorseId) || (needsRider && !selectedRiderId)) {
      return;
    }

    const parsedNumber = entryNumberValue(number);

    if (!parsedNumber) {
      return;
    }

    setBusy(true);

    try {
      await onAssignBackNumber({
        organization_id: organization.id,
        number: parsedNumber,
        horse_id: selectedHorseId,
        rider_contact_id: selectedRiderId,
        assignment_mode: assignmentMode,
        transfer_existing: forceTransfer,
        created_by_user_id: profileId || null,
      });
      setNumber("");
      setForceTransfer(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignNext() {
    if (!organization || (needsHorse && !selectedHorseId) || (needsRider && !selectedRiderId)) {
      return;
    }

    setBusy(true);

    try {
      await onAssignNextBackNumber({
        organization_id: organization.id,
        horse_id: selectedHorseId,
        rider_contact_id: selectedRiderId,
        assignment_mode: assignmentMode,
        created_by_user_id: profileId || null,
      });
      setForceTransfer(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBackNumber(backNumber: OrganizationBackNumber) {
    if (!window.confirm(uiText(locale, `Supprimer le dossard ${backNumber.number}?`, `Delete back number ${backNumber.number}?`))) {
      return;
    }

    await onDeleteBackNumber(backNumber.id);
  }

  const canAssign = Boolean(
    organization &&
      (!needsHorse || selectedHorseId) &&
      (!needsRider || selectedRiderId) &&
      entryNumberValue(number),
  );
  const canAssignNext = Boolean(organization && (!needsHorse || selectedHorseId) && (!needsRider || selectedRiderId) && availableCount > 0);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Secrétariat", "Office")}
        title={uiText(locale, "Dossards", "Back numbers")}
        description={uiText(locale, "Gère le stock de dossards de l'association selon sa politique active.", "Manage the association's back-number inventory based on its active policy.")}
        stats={[
          { label: uiText(locale, "Inventaire", "Inventory"), value: String(backNumbers.length) },
          { label: uiText(locale, "Disponibles", "Available"), value: String(availableCount) },
          { label: uiText(locale, "Assignés", "Assigned"), value: String(assignedCount) },
          { label: uiText(locale, "Politique", "Policy"), value: backNumberModeLabel(assignmentMode, locale) },
          { label: uiText(locale, "Par cavalier", "By rider"), value: String(riderAssignedCount) },
          { label: uiText(locale, "Par équipe", "By team"), value: String(teamAssignedCount) },
        ]}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter un inventaire", "Add inventory")}</h2>
            <p>{uiText(locale, "Ajoute une plage de dossards physiques ou virtuels sans écraser les numéros existants.", "Add a range of physical or virtual back numbers without overwriting existing numbers.")}</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleCreateRange}>
          <div className="form-grid">
            <label>
              {uiText(locale, "Premier dossard", "First back number")}
              <input min="1" required step="1" type="number" value={startNumber} onChange={(event) => setStartNumber(event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Dernier dossard", "Last back number")}
              <input min="1" step="1" type="number" value={endNumber} onChange={(event) => setEndNumber(event.target.value)} />
              <span className="input-help">{uiText(locale, "Laisse vide pour ajouter un seul numéro.", "Leave blank to add one number.")}</span>
            </label>
          </div>
          <div className="form-grid">
            <div className="readiness-card">
              <strong>{uiText(locale, "Mode d'inventaire", "Inventory mode")}</strong>
              <span>{backNumberModeLabel(assignmentMode, locale)}</span>
            </div>
            <label>
              Notes
              <input value={rangeNotes} onChange={(event) => setRangeNotes(event.target.value)} />
            </label>
          </div>
          <button className="primary-button" disabled={busy || !organization} type="submit">
            <Plus size={18} />
            {uiText(locale, "Ajouter les dossards", "Add back numbers")}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Assigner un dossard", "Assign a back number")}</h2>
            <p>{uiText(locale, "La politique vient des réglages de l'association", "The policy comes from association settings")}: {backNumberModeLabel(assignmentMode, locale)}.</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleAssign}>
          {needsHorse ? (
            <label>
              {uiText(locale, "Cheval", "Horse")}
              <SearchSelect
                disabled={!horses.length}
                items={horses.map((horse) => ({
                  id: horse.id,
                  label: horse.name,
                  detail: contactLabel(findById(contacts, horse.primary_owner_contact_id)),
                }))}
                placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
                value={horseId}
                onChange={setHorseId}
              />
            </label>
          ) : null}
          {needsRider ? (
            <label>
              {uiText(locale, "Cavalier", "Rider")}
              <SearchSelect
                disabled={!contacts.length}
                items={contacts.map((contact) => ({
                  id: contact.id,
                  label: contactLabel(contact),
                  detail: contactBackNumberDetail(contact, selectedHorse, horseContacts),
                }))}
                placeholder={uiText(locale, "Rechercher un cavalier", "Search rider")}
                value={riderContactId}
                onChange={setRiderContactId}
              />
            </label>
          ) : null}
          <div className="form-grid">
            <label>
              {uiText(locale, "Numéro exact", "Exact number")}
              <input min="1" step="1" type="number" value={number} onChange={(event) => setNumber(event.target.value)} />
              <span className="input-help">{selectedAssignment ? uiText(locale, `Dossard actuel: ${selectedAssignment.number}.`, `Current back number: ${selectedAssignment.number}.`) : uiText(locale, "Le numéro peut déjà être dans l'inventaire ou être créé à l'assignation.", "The number can already be in inventory or be created on assignment.")}</span>
            </label>
            <label className="checkbox-card">
              <input checked={forceTransfer} type="checkbox" onChange={(event) => setForceTransfer(event.target.checked)} />
              {uiText(locale, "Transférer si le dossard est déjà attribué", "Transfer if the back number is already assigned")}
            </label>
          </div>
          <div className="row-actions">
            <button className="primary-button" disabled={busy || !canAssign} type="submit">
              {uiText(locale, "Assigner le numéro", "Assign number")}
            </button>
            <button className="ghost-button" disabled={busy || !canAssignNext} type="button" onClick={() => void handleAssignNext()}>
              {uiText(locale, "Assigner le prochain disponible", "Assign next available")}
            </button>
          </div>
        </form>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Registre des dossards", "Back-number register")}</h2>
            <p>{backNumbers.length ? uiText(locale, `${backNumbers.length} dossard${backNumbers.length === 1 ? "" : "s"} dans l'association.`, `${backNumbers.length} back number${backNumbers.length === 1 ? "" : "s"} in the association.`) : uiText(locale, "Ajoute une plage pour commencer.", "Add a range to get started.")}</p>
          </div>
        </div>
        <div className="table back-number-table">
          <div className="table-row table-head">
            <span>Dossard</span>
            <span>{uiText(locale, "Assignation", "Assignment")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>Action</span>
          </div>
          {sortedBackNumbers.map((backNumber) => (
            <div className="table-row" key={backNumber.id}>
              <div>
                <strong>#{backNumber.number}</strong>
                <span className="muted-line">{backNumberModeLabel(backNumber.assignment_mode, locale)}</span>
              </div>
              <div>
                <strong>{backNumberAssigneeLabel(backNumber, horses, contacts, locale)}</strong>
                <span className="muted-line">{backNumber.notes || backNumberAssignmentMeta(backNumber, locale)}</span>
              </div>
              <div>
                {backNumber.status === "assigned" ? (
                  <span className={`badge ${backNumberStatusBadgeClass(backNumber.status)}`}>{backNumberStatusLabel(backNumber.status, locale)}</span>
                ) : (
                  <select value={backNumber.status} onChange={(event) => void onUpdateBackNumberStatus(backNumber.id, event.target.value as Parameters<typeof updateBackNumberStatus>[1])}>
                    <option value="available">{uiText(locale, "Disponible", "Available")}</option>
                    <option value="reserved">{uiText(locale, "Réservé", "Reserved")}</option>
                    <option value="lost">{uiText(locale, "Perdu", "Lost")}</option>
                    <option value="retired">{uiText(locale, "Retiré", "Retired")}</option>
                  </select>
                )}
              </div>
              <div className="row-actions">
                {backNumber.status === "assigned" ? (
                  <button className="text-button" type="button" onClick={() => void onReleaseBackNumber(backNumber.id)}>
                    {uiText(locale, "Libérer", "Release")}
                  </button>
                ) : null}
                <button className="text-button danger-text" type="button" onClick={() => void handleDeleteBackNumber(backNumber)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!backNumbers.length ? <EmptyState label={uiText(locale, "Aucun dossard dans l'inventaire.", "No back numbers in inventory.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function MyBackNumbersView({
  locale,
  backNumbers,
  contacts,
  horses,
  organization,
  onClaimHorseBackNumber,
}: {
  locale: Locale;
  backNumbers: OrganizationBackNumber[];
  contacts: Contact[];
  horses: Horse[];
  organization: Organization | null;
  onClaimHorseBackNumber: (input: Parameters<typeof claimHorseBackNumber>[0]) => Promise<void>;
}) {
  const [horseId, setHorseId] = useState("");
  const [riderContactId, setRiderContactId] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const assignmentMode = organizationBackNumberMode(organization);
  const needsHorse = backNumberModeNeedsHorse(assignmentMode);
  const needsRider = backNumberModeNeedsRider(assignmentMode);
  const sortedBackNumbers = [...backNumbers].sort((first, second) => first.number - second.number);
  const selectedHorse = findById(horses, horseId) ?? null;
  const selectedHorseId = needsHorse ? selectedHorse?.id ?? null : null;
  const selectedRiderId = needsRider ? riderContactId || null : null;
  const canClaim = Boolean(organization && (!needsHorse || selectedHorseId) && (!needsRider || selectedRiderId) && entryNumberValue(number));

  async function handleClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || (needsHorse && !selectedHorseId) || (needsRider && !selectedRiderId)) {
      return;
    }

    const parsedNumber = entryNumberValue(number);

    if (!parsedNumber) {
      return;
    }

    setBusy(true);

    try {
      await onClaimHorseBackNumber({
        organization_id: organization.id,
        horse_id: selectedHorseId,
        number: parsedNumber,
        assignment_mode: assignmentMode,
        rider_contact_id: selectedRiderId,
      });
      setNumber("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes dossards", "My back numbers")}
        description={uiText(locale, "Consulte les dossards liés à tes chevaux ou cavaliers dans l'association active.", "Review back numbers linked to your horses or riders in the active association.")}
        stats={[
          { label: "Association", value: organization?.short_name || organization?.name || "-" },
          { label: uiText(locale, "Politique", "Policy"), value: backNumberModeLabel(assignmentMode, locale) },
          { label: "Dossards", value: String(backNumbers.length) },
        ]}
      />

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter un dossard", "Add back number")}</h2>
            <p>{uiText(locale, "Tu peux ajouter un dossard selon la politique de l'association active si le numéro n'est pas déjà utilisé.", "You can add a back number under the active association policy if the number is not already used.")}</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleClaim}>
          <div className="form-grid">
            <div className="readiness-card">
              <strong>Mode</strong>
              <span>{backNumberModeLabel(assignmentMode, locale)}</span>
            </div>
          </div>
          <div className="form-grid">
            {needsHorse ? (
              <label>
                {uiText(locale, "Cheval", "Horse")}
                <SearchSelect
                  disabled={!horses.length}
                  items={horses.map((horse) => ({
                    id: horse.id,
                    label: horse.name,
                    detail: contactLabel(findById(contacts, horse.primary_owner_contact_id)),
                  }))}
                  placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
                  value={horseId}
                  onChange={setHorseId}
                />
              </label>
            ) : null}
          </div>
          {needsRider ? (
            <label>
              {uiText(locale, "Cavalier", "Rider")}
              <SearchSelect
                disabled={!contacts.length}
                items={contacts.map((contact) => ({
                  id: contact.id,
                  label: contactLabel(contact),
                  detail: contact.email || contact.type,
                }))}
                placeholder={uiText(locale, "Rechercher un cavalier", "Search rider")}
                value={riderContactId}
                onChange={setRiderContactId}
              />
            </label>
          ) : null}
          <div className="form-grid">
            <label>
              {uiText(locale, "Numéro de dossard", "Back number")}
              <input min="1" step="1" type="number" value={number} onChange={(event) => setNumber(event.target.value)} />
              <span className="input-help">{uiText(locale, "Si ce numéro est déjà assigné dans cette association, l'app va le refuser.", "If this number is already assigned in this association, the app will reject it.")}</span>
            </label>
          </div>
          <button className="primary-button" disabled={busy || !canClaim} type="submit">
            {uiText(locale, "Ajouter le dossard", "Add back number")}
          </button>
        </form>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Dossards assignés", "Assigned back numbers")}</h2>
            <p>{backNumbers.length ? uiText(locale, "Ces numéros seront repris automatiquement dans les inscriptions admissibles.", "These numbers will be reused automatically in eligible entries.") : uiText(locale, "Aucun dossard lié à ton profil pour l'instant.", "No back number linked to your profile yet.")}</p>
          </div>
        </div>
        <div className="table back-number-table">
          <div className="table-row table-head">
            <span>Dossard</span>
            <span>{uiText(locale, "Assignation", "Assignment")}</span>
            <span>Mode</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
          </div>
          {sortedBackNumbers.map((backNumber) => (
            <div className="table-row" key={backNumber.id}>
              <strong>#{backNumber.number}</strong>
              <span>{backNumberAssigneeLabel(backNumber, horses, contacts, locale)}</span>
              <span>{backNumberModeLabel(backNumber.assignment_mode, locale)}</span>
              <span className={`badge ${backNumberStatusBadgeClass(backNumber.status)}`}>{backNumberStatusLabel(backNumber.status, locale)}</span>
            </div>
          ))}
          {!backNumbers.length ? <EmptyState label={uiText(locale, "Le secrétariat pourra assigner un dossard lorsque nécessaire.", "The office can assign a back number when needed.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { BackNumbersView, MyBackNumbersView };
