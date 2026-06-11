import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, CircleDollarSign, ClipboardList, MapPin, Plus, Tent, Trophy, Users, Warehouse } from "lucide-react";
import { EmptyState, Metric, NoticeBanner, ViewIntro } from "../../components/ui";
import { contactLabel, errorMessage, formatCurrency, formatDate, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { AppContext } from "../../services/supabaseServices";
import { createOrganization, slugify } from "../../services/supabaseServices";
import type { ClassRecord, Contact, Entry, Horse, Invoice, Organization, Show, StallBooking, StallOption } from "../../types/domain";
import { uiText, showStatusLabel } from "../dashboard/shared";

function OverviewView({
  locale,
  openShows,
  organization,
  shows,
  contacts,
  horses,
  classes,
  entries,
  stallOptions,
  stallBookings,
  invoices,
  unpaidBalance,
  onCreateOrganization,
}: {
  locale: Locale;
  openShows: number;
  organization: Organization | null;
  shows: Show[];
  contacts: Contact[];
  horses: Horse[];
  classes: ClassRecord[];
  entries: Entry[];
  stallOptions: AppContext["stallOptions"];
  stallBookings: AppContext["stallBookings"];
  invoices: AppContext["invoices"];
  unpaidBalance: number;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
}) {
  const upcomingShows = useMemo(
    () =>
      shows
        .filter((show) => show.status !== "archived")
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
        .slice(0, 3),
    [shows],
  );
  const upcomingShow = upcomingShows[0] ?? null;
  const activeShowId = upcomingShow?.id ?? "";
  const currency = organization?.currency ?? "CAD";
  const showEntries = activeShowId ? entries.filter((entry) => entry.show_id === activeShowId) : entries;
  const showClasses = activeShowId ? classes.filter((classRecord) => classRecord.show_id === activeShowId) : classes;
  const showStallOptions = activeShowId ? stallOptions.filter((option) => option.show_id === activeShowId) : stallOptions;
  const showStallBookings = activeShowId ? stallBookings.filter((booking) => booking.show_id === activeShowId) : stallBookings;
  const showInvoices = activeShowId ? invoices.filter((invoice) => invoice.show_id === activeShowId) : invoices;
  const draftEntries = entries.filter((entry) => entry.status === "draft").length;
  const activeEntries = showEntries.filter((entry) => entry.status === "active" || entry.status === "pending_checkout").length;
  const stallCapacity = showStallOptions.reduce((sum, option) => sum + Number(option.total_quantity ?? 0), 0);
  const stallsAvailable = showStallOptions.reduce((sum, option) => sum + Number(option.available_quantity ?? 0), 0);
  const stallsBooked = Math.max(0, stallCapacity - stallsAvailable);
  const stallUsage = stallCapacity ? Math.min(100, Math.round((stallsBooked / stallCapacity) * 100)) : 0;
  const invoiceBalance = showInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);
  const paidInvoices = showInvoices.filter((invoice) => invoice.status === "paid").length;
  const invoiceProgress = showInvoices.length ? Math.round((paidInvoices / showInvoices.length) * 100) : 0;
  const entryProgress = showClasses.length ? Math.min(100, Math.round((showEntries.length / showClasses.length) * 100)) : 0;
  const showLocation = upcomingShow ? [upcomingShow.venue, upcomingShow.location].filter(Boolean).join(" - ") : "";
  const showUnitLabel = uiText(locale, "bloc", "schedule block");
  const actionItems = [
    {
      detail: upcomingShow
        ? uiText(locale, `${upcomingShows.length} concours à venir au calendrier.`, `${upcomingShows.length} upcoming show${upcomingShows.length === 1 ? "" : "s"} on the calendar.`)
        : uiText(locale, "Crée les dates, le lieu et le statut avant d'inviter les compétiteurs.", "Create dates, venue and open status before inviting competitors."),
      icon: upcomingShow ? CheckCircle2 : AlertCircle,
      state: upcomingShow ? uiText(locale, "Prêt", "Ready") : uiText(locale, "Suivant", "Next"),
      title: upcomingShow ? uiText(locale, "Calendrier démarré", "Calendar started") : uiText(locale, "Créer le premier concours", "Create the first show"),
    },
    {
      detail: contacts.length && horses.length
        ? uiText(locale, `${contacts.length} contacts et ${horses.length} chevaux disponibles.`, `${contacts.length} contacts and ${horses.length} horses available.`)
        : uiText(locale, "Ajoute les propriétaires, cavaliers et chevaux avant les inscriptions.", "Add owners, riders and horses before entries."),
      icon: contacts.length && horses.length ? CheckCircle2 : Users,
      state: contacts.length && horses.length ? uiText(locale, "Prêt", "Ready") : uiText(locale, "À bâtir", "Build"),
      title: uiText(locale, "Contacts et chevaux", "People and horses"),
    },
    {
      detail: showEntries.length
        ? uiText(locale, `${activeEntries} inscription${activeEntries === 1 ? "" : "s"} active${activeEntries === 1 ? "" : "s"} ou en attente pour le prochain concours.`, `${activeEntries} active or pending entr${activeEntries === 1 ? "y" : "ies"} for the next show.`)
        : uiText(locale, "Les blocs sont prêts, mais aucune inscription n'est commencée.", "Schedule blocks are ready, but no entries have been started."),
      icon: showEntries.length ? CheckCircle2 : ClipboardList,
      state: showEntries.length ? uiText(locale, "En cours", "Moving") : uiText(locale, "En attente", "Waiting"),
      title: uiText(locale, "Flux d'inscriptions", "Entry pipeline"),
    },
    {
      detail: stallCapacity
        ? uiText(locale, `${stallsBooked} de ${stallCapacity} unités réservées entre stalls, extras et camping.`, `${stallsBooked} of ${stallCapacity} units reserved across stalls, extras and camping.`)
        : uiText(locale, "Publie les options de réservation pour stalls, ripe, foin ou camping.", "Publish reservation options for stalls, bedding, hay or camping."),
      icon: stallCapacity ? Warehouse : Tent,
      state: stallCapacity ? `${stallUsage}%` : uiText(locale, "Setup", "Setup"),
      title: uiText(locale, "Réservations", "Reservations"),
    },
  ];

  return (
    <div className="overview-layout">
      <section className="overview-command span-2">
        <div className="overview-command-main">
          <p className="eyebrow">{uiText(locale, "Centre de commande", "Command center")}</p>
          <h2>{upcomingShow?.name ?? organization?.name ?? uiText(locale, "Bâtir le secrétariat du concours", "Build the show office")}</h2>
          <p>
            {upcomingShow
              ? uiText(locale, `${formatDate(upcomingShow.start_date)} au ${formatDate(upcomingShow.end_date)}${showLocation ? ` à ${showLocation}` : ""}.`, `${formatDate(upcomingShow.start_date)} to ${formatDate(upcomingShow.end_date)}${showLocation ? ` at ${showLocation}` : ""}.`)
              : uiText(locale, "Crée la première association et le premier concours pour débloquer inscriptions, réservations, pointage et facturation.", "Create the first association and show to unlock entries, reservations, scoring and billing.")}
          </p>
          <div className="show-meta">
            <span>
              <CalendarDays size={16} />
              {upcomingShow ? upcomingShow.status : uiText(locale, "Aucun concours", "No show yet")}
            </span>
            <span>
              <MapPin size={16} />
              {showLocation || organization?.primary_contact_email || uiText(locale, "Lieu à confirmer", "Venue pending")}
            </span>
            <span>
              <Trophy size={16} />
              {showClasses.length} {showUnitLabel}
              {locale === "fr" && showClasses.length !== 1 ? "s" : ""}
              {locale === "en" && showClasses.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="overview-command-aside">
          <span className={`badge ${upcomingShow?.status ?? "draft"}`}>{upcomingShow ? upcomingShow.status : "setup"}</span>
          <strong>{formatCurrency(invoiceBalance || unpaidBalance, currency)}</strong>
          <small>{upcomingShow ? uiText(locale, "Solde lié au prochain concours", "Balance tied to next show") : uiText(locale, "Solde ouvert total", "Total open balance")}</small>
        </div>
      </section>

      <section className="metric-grid span-2">
        <Metric detail={upcomingShow ? uiText(locale, `Prochain: ${formatDate(upcomingShow.start_date)}`, `Next: ${formatDate(upcomingShow.start_date)}`) : uiText(locale, "Aucun calendrier actif", "No active calendar")} icon={CalendarDays} label={uiText(locale, "Concours ouverts", "Open shows")} value={String(openShows)} />
        <Metric detail={uiText(locale, `${contacts.length} contacts, ${horses.length} chevaux`, `${contacts.length} people, ${horses.length} horses`)} icon={Users} label={uiText(locale, "Répertoire", "Directory")} value={String(contacts.length + horses.length)} />
        <Metric detail={uiText(locale, `${draftEntries} brouillon${draftEntries === 1 ? "" : "s"} à réviser`, `${draftEntries} draft${draftEntries === 1 ? "" : "s"} need review`)} icon={ClipboardList} label={uiText(locale, "Inscriptions", "Entries")} value={String(entries.length)} />
        <Metric detail={uiText(locale, `${stallsBooked} réservées sur ${stallCapacity || 0}`, `${stallsBooked} reserved of ${stallCapacity || 0}`)} icon={Warehouse} label={uiText(locale, "Utilisation des réservations", "Reservation usage")} value={`${stallUsage}%`} />
        <Metric detail={uiText(locale, `${showInvoices.length} facture${showInvoices.length === 1 ? "" : "s"} en contexte`, `${showInvoices.length} invoice${showInvoices.length === 1 ? "" : "s"} in scope`)} icon={CircleDollarSign} label={uiText(locale, "Solde dû", "Balance due")} value={formatCurrency(unpaidBalance, currency)} />
      </section>

      <section className="panel action-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "File d'actions", "Action queue")}</h2>
            <p>{uiText(locale, "Les prochains gestes utiles pour cet espace.", "The next useful moves for this workspace.")}</p>
          </div>
        </div>
        <div className="action-list">
          {actionItems.map((item) => {
            const Icon = item.icon;
            return (
              <div className="action-row" key={item.title}>
                <div className="action-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
                <small>{item.state}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel schedule-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Concours à venir", "Upcoming shows")}</h2>
            <p>{upcomingShows.length ? uiText(locale, "La piste visible pour les secrétaires et compétiteurs.", "The visible runway for secretaries and competitors.") : uiText(locale, "Aucun concours à venir.", "No upcoming shows yet.")}</p>
          </div>
        </div>
        <div className="timeline-list">
          {upcomingShows.map((show) => (
            <div className="timeline-row" key={show.id}>
              <div>
                <strong>{show.name}</strong>
                <span>{show.location || show.venue || uiText(locale, "Lieu à confirmer", "Location pending")}</span>
              </div>
              <div>
                <span>{formatDate(show.start_date)}</span>
                <span className={`badge ${show.status}`}>{show.status}</span>
              </div>
            </div>
          ))}
          {!upcomingShows.length ? <EmptyState label={uiText(locale, "Crée un concours pour démarrer le calendrier d'opérations.", "Create a show to start the operating calendar.")} /> : null}
        </div>
      </section>

      <section className="panel capacity-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Pouls opérationnel", "Operational pulse")}</h2>
            <p>{uiText(locale, "Lecture rapide de la préparation du prochain concours.", "Quick read on the next show's readiness.")}</p>
          </div>
        </div>
        <div className="progress-stack">
          <ProgressMeter label={uiText(locale, "Inscriptions vs blocs", "Entries vs schedule blocks")} value={entryProgress} detail={uiText(locale, `${showEntries.length} inscriptions dans ${showClasses.length} blocs`, `${showEntries.length} entries across ${showClasses.length} schedule blocks`)} />
          <ProgressMeter label={uiText(locale, "Inventaire de réservations utilisé", "Reservation inventory used")} value={stallUsage} detail={uiText(locale, `${stallsBooked} réservées, ${stallsAvailable} disponibles`, `${stallsBooked} booked, ${stallsAvailable} available`)} />
          <ProgressMeter label={uiText(locale, "Factures payées", "Invoices paid")} value={invoiceProgress} detail={uiText(locale, `${paidInvoices} payées sur ${showInvoices.length} factures`, `${paidInvoices} paid of ${showInvoices.length} invoices`)} />
        </div>
      </section>

      <OrganizationForm locale={locale} onCreateOrganization={onCreateOrganization} />
    </div>
  );
}

function ProgressMeter({ detail, label, value }: { detail: string; label: string; value: number }) {
  return (
    <div className="progress-meter">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <div className="progress-track" aria-label={`${label}: ${value}%`}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function OrganizationForm({ locale = "fr", onCreateOrganization }: { locale?: Locale; onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void> }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onCreateOrganization({
        name,
        slug: slug || slugify(name),
        primary_contact_email: email,
        timezone: "America/Toronto",
        currency: "CAD",
      });
      setName("");
      setSlug("");
      setEmail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouvelle association", "New organization")}</h2>
          <p>{uiText(locale, "Point de départ pour les concours, contacts, inscriptions et facturation.", "Root workspace for shows, contacts, entries and billing.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom", "Name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input placeholder={slugify(name) || "spring-circuit"} value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Courriel de contact", "Contact email")}
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer l'association", "Create organization")}
        </button>
      </form>
    </section>
  );
}

export { OverviewView };
