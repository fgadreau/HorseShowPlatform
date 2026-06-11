import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, ClipboardList, MapPin, Plus, X } from "lucide-react";
import { ModalDialog, ViewIntro } from "../../components/ui";
import { formatDate, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createShow, slugify, updateShow } from "../../services/supabaseServices";
import type { ClassRecord, Division, Entry, Invoice, Organization, Show, ShowDay, ShowScoreClassSetup, StallOption } from "../../types/domain";
import type { ViewKey } from "../../types/ui";
import { uiText, buildShowReadinessItems, type ShowReadinessItem } from "../dashboard/shared";
import { showTimeInputValue } from "../classes/classUtils";

type ShowAssistantStep = "essentials" | "payments" | "readiness";



function ShowAssistant({
  locale = "fr",
  classes,
  divisions,
  entries,
  initialShow,
  invoices,
  organization,
  showDays,
  showScoreClassSetups,
  stallOptions,
  onClose,
  onCreateShow,
  onUpdateShow,
  onViewChange,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  divisions: Division[];
  entries: Entry[];
  initialShow: Show | null;
  invoices: Invoice[];
  organization: Organization | null;
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  stallOptions: StallOption[];
  onClose: () => void;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<Show>;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [activeShow, setActiveShow] = useState<Show | null>(initialShow);
  const [step, setStep] = useState<ShowAssistantStep>(initialShow ? "readiness" : "essentials");
  const [name, setName] = useState(initialShow?.name ?? "");
  const [slug, setSlug] = useState(initialShow?.slug ?? "");
  const [startDate, setStartDate] = useState(initialShow?.start_date ?? today);
  const [endDate, setEndDate] = useState(initialShow?.end_date ?? today);
  const [location, setLocation] = useState(initialShow?.location ?? "");
  const [reservationPaymentPolicy, setReservationPaymentPolicy] = useState<Show["reservation_payment_policy"]>(initialShow?.reservation_payment_policy ?? "pay_at_booking");
  const [entryPaymentPolicy, setEntryPaymentPolicy] = useState<Show["entry_payment_policy"]>(initialShow?.entry_payment_policy ?? "card_on_file_preauth");
  const [entryPreauthTiming, setEntryPreauthTiming] = useState<Show["entry_preauth_timing"]>(initialShow?.entry_preauth_timing ?? "show_start");
  const [entryPreauthTime, setEntryPreauthTime] = useState(showTimeInputValue(initialShow?.entry_preauth_time, "08:00"));
  const [entrySettlementTiming, setEntrySettlementTiming] = useState<Show["entry_settlement_timing"]>(initialShow?.entry_settlement_timing ?? "show_end");
  const [entrySettlementDueTime, setEntrySettlementDueTime] = useState(showTimeInputValue(initialShow?.entry_settlement_due_time, "14:00"));
  const [entryAutoCaptureEnabled, setEntryAutoCaptureEnabled] = useState(initialShow?.entry_auto_capture_enabled ?? true);
  const [entryPreauthAmountStrategy, setEntryPreauthAmountStrategy] = useState<Show["entry_preauth_amount_strategy"]>(initialShow?.entry_preauth_amount_strategy ?? "entry_balance");
  const [entryPreauthMarginPercent, setEntryPreauthMarginPercent] = useState(String(initialShow?.entry_preauth_margin_percent ?? 0));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveShow(initialShow);
    setStep(initialShow ? "readiness" : "essentials");
    setName(initialShow?.name ?? "");
    setSlug(initialShow?.slug ?? "");
    setStartDate(initialShow?.start_date ?? today);
    setEndDate(initialShow?.end_date ?? today);
    setLocation(initialShow?.location ?? "");
    setReservationPaymentPolicy(initialShow?.reservation_payment_policy ?? "pay_at_booking");
    setEntryPaymentPolicy(initialShow?.entry_payment_policy ?? "card_on_file_preauth");
    setEntryPreauthTiming(initialShow?.entry_preauth_timing ?? "show_start");
    setEntryPreauthTime(showTimeInputValue(initialShow?.entry_preauth_time, "08:00"));
    setEntrySettlementTiming(initialShow?.entry_settlement_timing ?? "show_end");
    setEntrySettlementDueTime(showTimeInputValue(initialShow?.entry_settlement_due_time, "14:00"));
    setEntryAutoCaptureEnabled(initialShow?.entry_auto_capture_enabled ?? true);
    setEntryPreauthAmountStrategy(initialShow?.entry_preauth_amount_strategy ?? "entry_balance");
    setEntryPreauthMarginPercent(String(initialShow?.entry_preauth_margin_percent ?? 0));
  }, [initialShow, today]);

  const readinessItems = activeShow
    ? buildShowReadinessItems(activeShow, {
        locale,
        classes,
        divisions,
        entries,
        invoices,
        showDays,
        showScoreClassSetups,
        stallOptions,
      })
    : [];
  const readinessTotal = readinessItems.length || 1;
  const readinessDone = readinessItems.filter((item) => item.done).length;
  const readinessPercent = Math.round((readinessDone / readinessTotal) * 100);

  async function handleEssentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      const payload = {
        name,
        slug: slug || slugify(name),
        start_date: startDate,
        end_date: endDate,
        location: location || null,
      };

      if (activeShow) {
        await onUpdateShow(activeShow.id, payload);
        setActiveShow({ ...activeShow, ...payload });
        setStep("payments");
        return;
      }

      const createdShow = await onCreateShow({
        organization_id: organization.id,
        name: payload.name,
        slug: payload.slug,
        start_date: payload.start_date,
        end_date: payload.end_date,
        location: location || undefined,
        status: "draft",
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
      setActiveShow(createdShow);
      setStep("payments");
    } finally {
      setBusy(false);
    }
  }

  async function handlePaymentsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeShow) {
      return;
    }

    setBusy(true);

    try {
      const payload = {
        reservation_payment_policy: reservationPaymentPolicy,
        entry_payment_policy: entryPaymentPolicy,
        entry_preauth_timing: entryPreauthTiming,
        entry_preauth_time: entryPreauthTime,
        entry_settlement_timing: entrySettlementTiming,
        entry_settlement_due_time: entrySettlementDueTime,
        entry_auto_capture_enabled: entryAutoCaptureEnabled,
        entry_preauth_amount_strategy: entryPreauthAmountStrategy,
        entry_preauth_margin_percent: numericValue(entryPreauthMarginPercent) ?? 0,
      };

      await onUpdateShow(activeShow.id, payload);
      setActiveShow({ ...activeShow, ...payload });
      setStep("readiness");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenShow() {
    if (!activeShow) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateShow(activeShow.id, { status: "open" });
      setActiveShow({ ...activeShow, status: "open" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="show-assistant-title" aria-modal="true" className="assistant-modal" role="dialog">
        <div className="assistant-modal-header">
          <div>
            <p className="eyebrow">{uiText(locale, "Assistant", "Assistant")}</p>
            <h2 id="show-assistant-title">{activeShow ? activeShow.name : uiText(locale, "Nouveau concours", "New show")}</h2>
            <p>{activeShow ? `${formatDate(activeShow.start_date)} - ${formatDate(activeShow.end_date)}` : organization?.name ?? uiText(locale, "Crée une association d'abord.", "Create an organization first.")}</p>
          </div>
          <button className="icon-button" title={uiText(locale, "Fermer", "Close")} type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="assistant-stepper">
          <button className={step === "essentials" ? "active" : ""} type="button" onClick={() => setStep("essentials")}>
            <CalendarDays size={16} />
            {uiText(locale, "Essentiel", "Essentials")}
          </button>
          <button className={step === "payments" ? "active" : ""} disabled={!activeShow} type="button" onClick={() => setStep("payments")}>
            <CircleDollarSign size={16} />
            {uiText(locale, "Paiements", "Payments")}
          </button>
          <button className={step === "readiness" ? "active" : ""} disabled={!activeShow} type="button" onClick={() => setStep("readiness")}>
            <ClipboardList size={16} />
            {uiText(locale, "Checklist", "Checklist")}
          </button>
        </div>

        {activeShow ? (
          <div className="assistant-save-state">
            <CheckCircle2 size={16} />
            <span>{uiText(locale, "Brouillon sauvegardé", "Draft saved")}</span>
          </div>
        ) : null}

        {step === "essentials" ? (
          <form className="stack assistant-form" onSubmit={handleEssentialsSubmit}>
            <div className="form-grid">
              <label>
                {uiText(locale, "Nom", "Name")}
                <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Slug
                <input disabled={!organization} placeholder={slugify(name) || "spring-classic"} value={slug} onChange={(event) => setSlug(event.target.value)} />
              </label>
            </div>
            <div className="form-grid">
              <label>
                {uiText(locale, "Début", "Start")}
                <input disabled={!organization} required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label>
                {uiText(locale, "Fin", "End")}
                <input disabled={!organization} min={startDate} required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
            <label>
              {uiText(locale, "Lieu", "Location")}
              <input disabled={!organization} value={location} onChange={(event) => setLocation(event.target.value)} />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={busy || !organization} type="submit">
                <CheckCircle2 size={18} />
                {activeShow ? uiText(locale, "Sauvegarder", "Save") : uiText(locale, "Créer le brouillon", "Create draft")}
              </button>
              <button className="ghost-button" type="button" onClick={onClose}>
                {uiText(locale, "Fermer", "Close")}
              </button>
            </div>
          </form>
        ) : null}

        {step === "payments" ? (
          <form className="stack assistant-form" onSubmit={handlePaymentsSubmit}>
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
            <div className="form-actions">
              <button className="primary-button" disabled={busy || !activeShow} type="submit">
                <CheckCircle2 size={18} />
                {uiText(locale, "Sauvegarder", "Save")}
              </button>
              <button className="ghost-button" type="button" onClick={() => setStep("essentials")}>
                {uiText(locale, "Retour", "Back")}
              </button>
              <button className="ghost-button" type="button" onClick={onClose}>
                {uiText(locale, "Fermer", "Close")}
              </button>
            </div>
          </form>
        ) : null}

        {step === "readiness" && activeShow ? (
          <div className="assistant-readiness">
            <div className="readiness-summary">
              <div>
                <strong>{readinessDone}/{readinessItems.length} {uiText(locale, "prêts", "ready")}</strong>
                <span>{uiText(locale, "Préparation du concours", "Show readiness")}</span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${readinessPercent}%` }} />
              </div>
            </div>
            <div className="readiness-list">
              {readinessItems.map((item) => (
                <div className={item.done ? "readiness-item done" : "readiness-item"} key={item.key}>
                  <span className="readiness-icon">{item.done ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  {item.view ? (
                    <button className="text-button" type="button" onClick={() => onViewChange(item.view as ViewKey)}>
                      {item.actionLabel ?? uiText(locale, "Ouvrir", "Open")}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={busy || activeShow.status === "open"} type="button" onClick={handleOpenShow}>
                <CheckCircle2 size={18} />
                {activeShow.status === "open" ? uiText(locale, "Concours ouvert", "Show open") : uiText(locale, "Ouvrir les inscriptions", "Open entries")}
              </button>
              <button className="ghost-button" type="button" onClick={() => setStep("payments")}>
                {uiText(locale, "Paiements", "Payments")}
              </button>
              <button className="ghost-button" type="button" onClick={onClose}>
                {uiText(locale, "Fermer", "Close")}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export { ShowAssistant };
