import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import { slugify, updateShow } from "../../services/supabaseServices";
import { numericValue } from "../../lib/display";
import type { Show } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { showTimeInputValue } from "../classes/classUtils";

function ShowEditForm({
  locale = "fr",
  show,
  onCancel,
  onUpdateShow,
}: {
  locale?: Locale;
  show: Show;
  onCancel: () => void;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(show.name);
  const [slug, setSlug] = useState(show.slug);
  const [startDate, setStartDate] = useState(show.start_date);
  const [endDate, setEndDate] = useState(show.end_date);
  const [location, setLocation] = useState(show.location ?? "");
  const [status, setStatus] = useState<Show["status"]>(show.status);
  const [reservationPaymentPolicy, setReservationPaymentPolicy] = useState<Show["reservation_payment_policy"]>(show.reservation_payment_policy ?? "pay_at_booking");
  const [entryPaymentPolicy, setEntryPaymentPolicy] = useState<Show["entry_payment_policy"]>(show.entry_payment_policy ?? "card_on_file_preauth");
  const [entryPreauthTiming, setEntryPreauthTiming] = useState<Show["entry_preauth_timing"]>(show.entry_preauth_timing ?? "show_start");
  const [entryPreauthTime, setEntryPreauthTime] = useState(showTimeInputValue(show.entry_preauth_time, "08:00"));
  const [entrySettlementTiming, setEntrySettlementTiming] = useState<Show["entry_settlement_timing"]>(show.entry_settlement_timing ?? "show_end");
  const [entrySettlementDueTime, setEntrySettlementDueTime] = useState(showTimeInputValue(show.entry_settlement_due_time, "14:00"));
  const [entryAutoCaptureEnabled, setEntryAutoCaptureEnabled] = useState(show.entry_auto_capture_enabled ?? true);
  const [entryPreauthAmountStrategy, setEntryPreauthAmountStrategy] = useState<Show["entry_preauth_amount_strategy"]>(show.entry_preauth_amount_strategy ?? "entry_balance");
  const [entryPreauthMarginPercent, setEntryPreauthMarginPercent] = useState(String(show.entry_preauth_margin_percent ?? 0));
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateShow(show.id, {
        name,
        slug: slug || slugify(name),
        start_date: startDate,
        end_date: endDate,
        location: location || null,
        status,
        reservation_payment_policy: reservationPaymentPolicy,
        entry_payment_policy: entryPaymentPolicy,
        entry_preauth_timing: entryPreauthTiming,
        entry_preauth_time: entryPreauthTime,
        entry_settlement_timing: entrySettlementTiming,
        entry_settlement_due_time: entrySettlementDueTime,
        entry_auto_capture_enabled: entryAutoCaptureEnabled,
        entry_preauth_amount_strategy: entryPreauthAmountStrategy,
        entry_preauth_margin_percent: numericValue(entryPreauthMarginPercent) ?? 0,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier le concours", "Edit show")}</h2>
          <p>{show.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom", "Name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
          {uiText(locale, "Début", "Start")}
            <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
          {uiText(locale, "Fin", "End")}
            <input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Statut", "Status")}
            <select value={status} onChange={(event) => setStatus(event.target.value as Show["status"])}>
              <option value="draft">{uiText(locale, "Brouillon", "Draft")}</option>
              <option value="open">{uiText(locale, "Ouvert", "Open")}</option>
              <option value="closed">{uiText(locale, "Fermé", "Closed")}</option>
              <option value="archived">{uiText(locale, "Archivé", "Archived")}</option>
            </select>
          </label>
          <label>
            {uiText(locale, "Lieu", "Location")}
            <input value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>
        </div>
        <div className="field-group">
          <span className="contact-picker-label">{uiText(locale, "Paiements du concours", "Show payments")}</span>
          <div className="form-grid">
            <label>
              {uiText(locale, "Réservations", "Reservations")}
              <select value={reservationPaymentPolicy} onChange={(event) => setReservationPaymentPolicy(event.target.value as Show["reservation_payment_policy"])}>
                <option value="pay_at_booking">{uiText(locale, "Paiement à la réservation", "Pay at booking")}</option>
                <option value="manual">{uiText(locale, "Gestion manuelle", "Manual handling")}</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Inscriptions", "Entries")}
              <select value={entryPaymentPolicy} onChange={(event) => setEntryPaymentPolicy(event.target.value as Show["entry_payment_policy"])}>
                <option value="card_on_file_preauth">{uiText(locale, "Carte + préautorisation", "Card on file + preauthorization")}</option>
                <option value="manual">{uiText(locale, "Gestion manuelle", "Manual handling")}</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Préautorisation", "Preauthorization")}
              <select disabled={entryPaymentPolicy === "manual"} value={entryPreauthTiming} onChange={(event) => setEntryPreauthTiming(event.target.value as Show["entry_preauth_timing"])}>
                <option value="show_start">{uiText(locale, "Première journée du concours", "First show day")}</option>
                <option value="manual">{uiText(locale, "Manuelle", "Manual")}</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Heure", "Time")}
              <input disabled={entryPaymentPolicy === "manual" || entryPreauthTiming === "manual"} type="time" value={entryPreauthTime} onChange={(event) => setEntryPreauthTime(event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Échéance", "Due date")}
              <select disabled={entryPaymentPolicy === "manual"} value={entrySettlementTiming} onChange={(event) => setEntrySettlementTiming(event.target.value as Show["entry_settlement_timing"])}>
                <option value="show_end">{uiText(locale, "Dernière journée du concours", "Last show day")}</option>
                <option value="manual">{uiText(locale, "Manuelle", "Manual")}</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Heure limite", "Due time")}
              <input disabled={entryPaymentPolicy === "manual" || entrySettlementTiming === "manual"} type="time" value={entrySettlementDueTime} onChange={(event) => setEntrySettlementDueTime(event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Montant préautorisé", "Preauthorized amount")}
              <select disabled={entryPaymentPolicy === "manual"} value={entryPreauthAmountStrategy} onChange={(event) => setEntryPreauthAmountStrategy(event.target.value as Show["entry_preauth_amount_strategy"])}>
                <option value="entry_balance">{uiText(locale, "Solde des inscriptions", "Entry balance")}</option>
                <option value="entry_balance_with_margin">{uiText(locale, "Solde + marge", "Balance + margin")}</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Marge %", "Margin %")}
              <input disabled={entryPaymentPolicy === "manual" || entryPreauthAmountStrategy !== "entry_balance_with_margin"} min="0" step="0.01" type="number" value={entryPreauthMarginPercent} onChange={(event) => setEntryPreauthMarginPercent(event.target.value)} />
            </label>
          </div>
          <label className="check-row">
            <input checked={entryAutoCaptureEnabled} disabled={entryPaymentPolicy === "manual"} type="checkbox" onChange={(event) => setEntryAutoCaptureEnabled(event.target.checked)} />
            <span>{uiText(locale, "Capture automatique à l'échéance", "Auto-capture at due date")}</span>
          </label>
        </div>
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

export { ShowEditForm };
