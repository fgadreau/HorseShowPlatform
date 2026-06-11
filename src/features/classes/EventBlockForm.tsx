import { useState } from "react";
import type { FormEvent } from "react";
import { SearchSelect } from "../../components/ui";
import { findById, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createClass } from "../../services/supabaseServices";
import type { ClassRecord, Organization, Show, ShowDay } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { showDayLabel } from "./classUtils";

const EVENT_TYPES = ["Souper", "5 à 7", "Remise de prix", "Cérémonie", "Pause", "Autre"] as const;

function EventBlockForm({
  locale = "fr",
  defaultShowDayId,
  defaultShowId,
  organization,
  showDays,
  shows,
  onCreateClass,
  onCreated,
}: {
  locale?: Locale;
  defaultShowDayId?: string;
  defaultShowId?: string;
  organization: Organization | null;
  showDays: ShowDay[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreated?: () => void;
}) {
  const [showId, setShowId] = useState(defaultShowId ?? "");
  const [showDayId, setShowDayId] = useState(defaultShowDayId ?? "");
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedShow = findById(shows, showId);
  const showDaysForShow = showDays.filter((d) => d.show_id === showId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!organization || !showId || !name.trim()) return;

    setSubmitting(true);
    try {
      await onCreateClass({
        organization_id: organization.id,
        show_id: showId,
        show_day_id: showDayId || undefined,
        name: name.trim(),
        block_label: eventType || undefined,
        schedule_start_mode: scheduledTime ? "fixed" : "unscheduled",
        scheduled_time: scheduledTime ? `${scheduledTime}:00` : null,
        is_event_block: true,
      });
      onCreated?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="form-field">
        <label>{uiText(locale, "Concours", "Show")}</label>
        <SearchSelect
          items={shows.map((s) => ({ id: s.id, label: showLabel(s) }))}
          value={showId}
          placeholder={uiText(locale, "Choisir un concours", "Select a show")}
          onChange={(v) => { setShowId(v); setShowDayId(""); }}
        />
      </div>

      {showDaysForShow.length > 0 ? (
        <div className="form-field">
          <label>{uiText(locale, "Journée", "Day")}</label>
          <SearchSelect
            items={showDaysForShow.map((d) => ({ id: d.id, label: showDayLabel(d) }))}
            value={showDayId}
            placeholder={uiText(locale, "Choisir une journée", "Select a day")}
            onChange={setShowDayId}
          />
        </div>
      ) : null}

      <div className="form-field">
        <label htmlFor="event-name">{uiText(locale, "Titre de l'événement", "Event title")}</label>
        <input
          id="event-name"
          type="text"
          value={name}
          placeholder={uiText(locale, "ex. Banquet annuel", "e.g. Annual banquet")}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="event-type">{uiText(locale, "Type d'événement", "Event type")}</label>
        <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">{uiText(locale, "— Optionnel —", "— Optional —")}</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="event-time">{uiText(locale, "Heure de début", "Start time")}</label>
        <input
          id="event-time"
          type="time"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
        />
      </div>

      <div className="form-actions">
        <button className="primary-button" disabled={submitting || !showId || !name.trim()} type="submit">
          {submitting ? uiText(locale, "Création...", "Creating...") : uiText(locale, "Créer l'événement", "Create event")}
        </button>
      </div>
    </form>
  );
}

export { EventBlockForm };
