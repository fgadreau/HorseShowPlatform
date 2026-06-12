import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { FormActions, SearchSelect } from "../../components/ui";
import { contactLabel, divisionLabel, findById, horseLabel, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { ClassRecord, Contact, Division, Entry, Horse, Organization, ScheduleStartMode, Show, ShowDay, ShowScorePaidWarmup, ShowScorePaidWarmupInput, ShowScorePaidWarmupUpdateInput } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { showDayLabel } from "./classUtils";

type PaidWarmupFormProps = {
  classes: ClassRecord[];
  contacts: Contact[];
  defaultShowDayId?: string;
  defaultShowId?: string;
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
  locale: Locale;
  organization: Organization | null;
  showDays: ShowDay[];
  showScorePaidWarmups: ShowScorePaidWarmup[];
  shows: Show[];
  warmup?: ShowScorePaidWarmup | null;
  onCancel?: () => void;
  onSaveShowScorePaidWarmup: (input: ShowScorePaidWarmupInput) => Promise<void>;
  onUpdateShowScorePaidWarmup?: (id: string, input: ShowScorePaidWarmupUpdateInput) => Promise<void>;
  onSaved?: () => void;
};

function PaidWarmupForm({
  classes,
  contacts,
  defaultShowDayId,
  defaultShowId,
  divisions,
  entries,
  horses,
  locale,
  organization,
  showDays,
  showScorePaidWarmups,
  shows,
  warmup,
  onCancel,
  onSaveShowScorePaidWarmup,
  onUpdateShowScorePaidWarmup,
  onSaved,
}: PaidWarmupFormProps) {
  const initialShowId = warmup?.show_id || defaultShowId || shows[0]?.id || "";
  const initialShowDayId = warmup?.show_day_id || defaultShowDayId || showDays.find((day) => day.show_id === initialShowId)?.id || "";
  const [showId, setShowId] = useState(initialShowId);
  const [showDayId, setShowDayId] = useState(initialShowDayId);
  const [name, setName] = useState(warmup?.name ?? "Paid warm up");
  const [arena, setArena] = useState(warmup?.arena ?? "");
  const [scheduleStartMode, setScheduleStartMode] = useState<ScheduleStartMode>(warmup?.schedule_start_mode ?? "unscheduled");
  const [scheduleStartTime, setScheduleStartTime] = useState(warmup?.schedule_start_time ?? "");
  const [durationMinutesPerRider, setDurationMinutesPerRider] = useState(String(warmup?.duration_minutes_per_rider ?? 5));
  const [dragInterval, setDragInterval] = useState(warmup?.drag_interval == null ? "" : String(warmup.drag_interval));
  const [dragDurationMinutes, setDragDurationMinutes] = useState(String(warmup?.drag_duration_minutes ?? 8));
  const [isPublicLive, setIsPublicLive] = useState(Boolean(warmup?.is_public_live));
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>(() => warmup?.entries.map((entry) => entry.id) ?? []);
  const [saving, setSaving] = useState(false);

  const showItems = shows.map((show) => ({
    id: show.id,
    label: show.name,
    detail: show.start_date === show.end_date ? show.start_date : `${show.start_date} - ${show.end_date}`,
  }));
  const dayItems = showDays
    .filter((day) => !showId || day.show_id === showId)
    .map((day) => ({
      id: day.id,
      label: showDayLabel(day),
      detail: day.start_time ? day.start_time.slice(0, 5) : undefined,
    }));
  const availableEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.show_id === showId && entry.status !== "cancelled" && entry.status !== "scratched")
        .sort((first, second) => (first.entry_number ?? Number.MAX_SAFE_INTEGER) - (second.entry_number ?? Number.MAX_SAFE_INTEGER) || entryDisplayName(first, contacts, horses).localeCompare(entryDisplayName(second, contacts, horses))),
    [contacts, entries, horses, showId],
  );
  const selectedEntries = selectedEntryIds
    .map((entryId) => findById(entries, entryId))
    .filter((entry): entry is Entry => Boolean(entry));

  function handleShowChange(nextShowId: string) {
    setShowId(nextShowId);
    const nextDay = showDays.find((day) => day.show_id === nextShowId);
    setShowDayId(nextDay?.id ?? "");
    setSelectedEntryIds((current) => current.filter((entryId) => findById(entries, entryId)?.show_id === nextShowId));
  }

  function toggleEntry(entryId: string) {
    setSelectedEntryIds((current) => (current.includes(entryId) ? current.filter((candidate) => candidate !== entryId) : [...current, entryId]));
  }

  function moveEntry(entryId: string, direction: -1 | 1) {
    setSelectedEntryIds((current) => {
      const index = current.indexOf(entryId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !showId || !showDayId) {
      return;
    }

    const paidWarmupEntries = selectedEntryIds.map((entryId, index) => {
      const entry = findById(entries, entryId);
      const existingEntry = warmup?.entries.find((candidate) => candidate.id === entryId);

      return {
        id: entryId,
        order: index + 1,
        rider: entry ? entryDisplayName(entry, contacts, horses) : existingEntry?.rider ?? entryId,
        status: existingEntry?.status ?? "pending",
        completedAt: existingEntry?.completedAt ?? null,
      };
    });

    setSaving(true);

    try {
      const payload = {
        show_day_id: showDayId,
        name,
        arena,
        duration_minutes_per_rider: numericValue(durationMinutesPerRider) ?? 5,
        drag_interval: numericValue(dragInterval) ?? null,
        drag_duration_minutes: numericValue(dragDurationMinutes) ?? 8,
        schedule_start_mode: scheduleStartMode,
        schedule_start_time: scheduleStartMode === "fixed" ? scheduleStartTime : null,
        is_public_live: isPublicLive,
        active_entry_id: warmup?.active_entry_id ?? null,
        active_started_at: warmup?.active_started_at ?? null,
        entries: paidWarmupEntries,
        sort_order: warmup?.sort_order ?? nextWarmupSortOrder(showDayId, classes, showScorePaidWarmups),
        legacy_payload: {
          source: "hsp_paid_warmup",
        },
      };

      if (warmup && onUpdateShowScorePaidWarmup) {
        await onUpdateShowScorePaidWarmup(warmup.id, payload);
      } else {
        await onSaveShowScorePaidWarmup({
          ...payload,
          organization_id: organization.id,
          show_id: showId,
          show_day_id: showDayId,
        });
      }

      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="form-grid two">
        <label>
          Show
          <SearchSelect disabled={Boolean(warmup)} items={showItems} placeholder={uiText(locale, "Choisir un show", "Choose a show")} value={showId} onChange={handleShowChange} />
        </label>
        <label>
          {uiText(locale, "Journée", "Day")}
          <SearchSelect items={dayItems} placeholder={uiText(locale, "Choisir une journée", "Choose a day")} value={showDayId} onChange={setShowDayId} />
        </label>
      </div>

      <div className="form-grid two">
        <label>
          Nom
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Arène
          <input value={arena} onChange={(event) => setArena(event.target.value)} />
        </label>
      </div>

      <div className="form-grid three">
        <label>
          {uiText(locale, "Départ", "Start")}
          <select value={scheduleStartMode} onChange={(event) => setScheduleStartMode(event.target.value as ScheduleStartMode)}>
            <option value="unscheduled">{uiText(locale, "À préciser", "To confirm")}</option>
            <option value="fixed">{uiText(locale, "Heure fixe", "Fixed time")}</option>
            <option value="after_previous">{uiText(locale, "Après le bloc précédent", "After previous block")}</option>
          </select>
        </label>
        <label>
          Heure
          <input disabled={scheduleStartMode !== "fixed"} type="time" value={scheduleStartTime} onChange={(event) => setScheduleStartTime(event.target.value)} />
        </label>
        <label className="checkbox-line compact-checkbox">
          <input checked={isPublicLive} type="checkbox" onChange={(event) => setIsPublicLive(event.target.checked)} />
          Public live
        </label>
      </div>

      <div className="form-grid three">
        <label>
          Min / rider
          <input min="1" type="number" value={durationMinutesPerRider} onChange={(event) => setDurationMinutesPerRider(event.target.value)} />
        </label>
        <label>
          Drag interval
          <input min="1" placeholder={uiText(locale, "Manuel", "Manual")} type="number" value={dragInterval} onChange={(event) => setDragInterval(event.target.value)} />
        </label>
        <label>
          Drag minutes
          <input min="0" type="number" value={dragDurationMinutes} onChange={(event) => setDragDurationMinutes(event.target.value)} />
        </label>
      </div>

      <div className="paid-warmup-entry-picker">
        <div className="picker-column">
          <div className="subsection-heading">
            <h3>{uiText(locale, "Inscriptions HSP", "HSP entries")}</h3>
            <span>{availableEntries.length}</span>
          </div>
          <div className="entry-check-list">
            {availableEntries.map((entry) => {
              const selected = selectedEntryIds.includes(entry.id);

              return (
                <label className={`entry-check-row ${selected ? "selected" : ""}`} key={entry.id}>
                  <input checked={selected} type="checkbox" onChange={() => toggleEntry(entry.id)} />
                  <span>
                    <strong>{entryDisplayName(entry, contacts, horses)}</strong>
                    <span className="muted-line">{entryDetail(entry, contacts, horses, divisions, classes)}</span>
                  </span>
                </label>
              );
            })}
            {!availableEntries.length ? <p className="muted-line">{uiText(locale, "Aucune inscription active pour ce show.", "No active entry for this show.")}</p> : null}
          </div>
        </div>

        <div className="picker-column">
          <div className="subsection-heading">
            <h3>{uiText(locale, "Ordre de passage", "Order of go")}</h3>
            <span>{selectedEntries.length}</span>
          </div>
          <div className="selected-entry-list">
            {selectedEntries.map((entry, index) => (
              <div className="selected-entry-row" key={entry.id}>
                <strong>#{index + 1}</strong>
                <span>
                  {entryDisplayName(entry, contacts, horses)}
                  <span className="muted-line">{entryDetail(entry, contacts, horses, divisions, classes)}</span>
                </span>
                <div className="row-actions">
                  <button className="icon-button" disabled={index === 0} title={uiText(locale, "Monter", "Move up")} type="button" onClick={() => moveEntry(entry.id, -1)}>
                    <ArrowUp size={16} />
                  </button>
                  <button className="icon-button" disabled={index >= selectedEntries.length - 1} title={uiText(locale, "Descendre", "Move down")} type="button" onClick={() => moveEntry(entry.id, 1)}>
                    <ArrowDown size={16} />
                  </button>
                  <button className="icon-button" title={uiText(locale, "Retirer", "Remove")} type="button" onClick={() => toggleEntry(entry.id)}>
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
            {!selectedEntries.length ? <p className="muted-line">{uiText(locale, "Sélectionne les inscriptions dans l'ordre voulu.", "Select entries in the desired order.")}</p> : null}
          </div>
        </div>
      </div>

      <FormActions
        busy={saving}
        cancelLabel={uiText(locale, "Annuler", "Cancel")}
        disabled={!organization || !showId || !showDayId}
        saveLabel={warmup ? uiText(locale, "Mettre à jour", "Update") : uiText(locale, "Créer paid warmup", "Create paid warmup")}
        onCancel={onCancel ?? (() => undefined)}
      />
    </form>
  );
}

function entryDisplayName(entry: Entry, contacts: Contact[], horses: Horse[]) {
  const rider = contactLabel(findById(contacts, entry.rider_contact_id) ?? findById(contacts, entry.owner_contact_id));
  const horse = horseLabel(findById(horses, entry.horse_id));
  const backNumber = entry.entry_number ? `#${entry.entry_number}` : "";
  return [backNumber, rider, horse].filter(Boolean).join(" - ");
}

function entryDetail(entry: Entry, contacts: Contact[], horses: Horse[], divisions: Division[], classes: ClassRecord[]) {
  const division = findById(divisions, entry.division_id);
  const owner = contactLabel(findById(contacts, entry.owner_contact_id));
  return [
    divisionLabel(division, classes),
    owner ? `Owner: ${owner}` : null,
    entry.status,
  ]
    .filter(Boolean)
    .join(" - ");
}

function nextWarmupSortOrder(showDayId: string, classes: ClassRecord[], warmups: ShowScorePaidWarmup[]) {
  const classOrders = classes.filter((classRecord) => classRecord.show_day_id === showDayId).map((classRecord) => classRecord.sort_order);
  const warmupOrders = warmups.filter((warmup) => warmup.show_day_id === showDayId).map((warmup) => warmup.sort_order);
  return Math.max(0, ...classOrders, ...warmupOrders) + 10;
}

export { PaidWarmupForm };
