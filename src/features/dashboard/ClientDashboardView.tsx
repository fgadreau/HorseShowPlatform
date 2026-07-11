import { AlertCircle, AlertTriangle, CalendarDays, ChevronRight, CircleDollarSign, ClipboardList, MapPin, UserCircle } from "lucide-react";
import { ViewIntro } from "../../components/ui";
import { formatCurrency, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Contact, Division, Entry, Horse, Invoice, Organization, Show, ShowDay, StallBooking, StallOption, UserProfile } from "../../types/domain";
import type { ViewKey } from "../../types/ui";
import { profileIsComplete } from "../profile/ProfileView";
import { uiText } from "./shared";

const ACTIVE_ENTRY_STATUSES: Entry["status"][] = ["draft", "pending_checkout", "active"];
const DUE_INVOICE_STATUSES: Invoice["status"][] = ["sent", "viewed", "partially_paid", "overdue"];

type UpcomingShow = {
  show: Show;
  organization: Organization;
  entries: Entry[];
  bookings: StallBooking[];
  daysUntil: number;
};

function daysUntilShow(startDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
}

function entryStatusLabel(status: Entry["status"], locale: Locale) {
  const map: Record<Entry["status"], [string, string]> = {
    draft: ["Brouillon", "Draft"],
    pending_checkout: ["En attente", "Pending"],
    active: ["Active", "Active"],
    scratched_pending_refund: ["Retrait (remb.)", "Scratched (refund)"],
    scratched: ["Retirée", "Scratched"],
    completed: ["Complétée", "Completed"],
    cancelled: ["Annulée", "Cancelled"],
  };
  const [fr, en] = map[status] ?? [status, status];
  return uiText(locale, fr, en);
}

function entryStatusTone(status: Entry["status"]): "active" | "pending" | "neutral" | "negative" {
  if (status === "active") return "active";
  if (status === "draft" || status === "pending_checkout") return "pending";
  if (status === "scratched" || status === "scratched_pending_refund" || status === "cancelled") return "negative";
  return "neutral";
}

function invoiceStatusLabel(status: Invoice["status"], locale: Locale) {
  const map: Record<Invoice["status"], [string, string]> = {
    draft: ["Brouillon", "Draft"],
    sent: ["Envoyée", "Sent"],
    viewed: ["Vue", "Viewed"],
    partially_paid: ["Part. payée", "Partially paid"],
    paid: ["Payée", "Paid"],
    overdue: ["En retard", "Overdue"],
    void: ["Annulée", "Void"],
  };
  const [fr, en] = map[status] ?? [status, status];
  return uiText(locale, fr, en);
}

function ShowCard({
  item,
  locale,
  onViewChange,
}: {
  item: UpcomingShow;
  locale: Locale;
  onViewChange: (view: ViewKey) => void;
}) {
  const { show, organization, entries, bookings, daysUntil } = item;
  const activeEntries = entries.filter((e) => ACTIVE_ENTRY_STATUSES.includes(e.status));
  const activeBookings = bookings.filter((b) => b.status !== "cancelled");

  return (
    <div className="client-show-card">
      <div className="client-show-card-header">
        <div className="client-show-card-org">{organization.name}</div>
        <div className={`client-show-days-badge ${daysUntil <= 7 ? "soon" : daysUntil <= 0 ? "today" : ""}`}>
          {daysUntil < 0
            ? uiText(locale, "En cours", "In progress")
            : daysUntil === 0
              ? uiText(locale, "Aujourd'hui", "Today")
              : uiText(locale, `Dans ${daysUntil}j`, `In ${daysUntil}d`)}
        </div>
      </div>
      <h3 className="client-show-card-name">{show.name}</h3>
      <div className="client-show-card-meta">
        <span><CalendarDays size={13} />{formatDate(show.start_date)}{show.start_date !== show.end_date ? ` – ${formatDate(show.end_date)}` : ""}</span>
        {show.venue ? <span><MapPin size={13} />{show.venue}</span> : null}
      </div>
      <div className="client-show-card-stats">
        {activeEntries.length > 0 ? (
          <span className="client-show-stat">
            <ClipboardList size={13} />
            {activeEntries.length} {uiText(locale, "inscription" + (activeEntries.length > 1 ? "s" : ""), "entr" + (activeEntries.length > 1 ? "ies" : "y"))}
          </span>
        ) : null}
        {activeBookings.length > 0 ? (
          <span className="client-show-stat">
            🏠 {activeBookings.length} {uiText(locale, "stalle" + (activeBookings.length > 1 ? "s" : ""), "stall" + (activeBookings.length > 1 ? "s" : ""))}
          </span>
        ) : null}
      </div>
      <button className="text-button client-show-card-cta" type="button" onClick={() => onViewChange("my-entries")}>
        {uiText(locale, "Voir mes inscriptions", "View my entries")} <ChevronRight size={14} />
      </button>
    </div>
  );
}

function ClientDashboardView({
  locale,
  contacts,
  divisions,
  entries,
  horses,
  invoices,
  organizations,
  profile,
  shows,
  showDays,
  stallBookings,
  stallOptions,
  onViewChange,
}: {
  locale: Locale;
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
  invoices: Invoice[];
  organizations: Organization[];
  profile: UserProfile;
  shows: Show[];
  showDays: ShowDay[];
  stallBookings: StallBooking[];
  stallOptions: StallOption[];
  onViewChange: (view: ViewKey) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeEntries = entries.filter((e) => ACTIVE_ENTRY_STATUSES.includes(e.status));
  const dueInvoices = invoices.filter((inv) => DUE_INVOICE_STATUSES.includes(inv.status) && Number(inv.balance_due ?? 0) > 0);
  const totalDue = dueInvoices.reduce((sum, inv) => sum + Number(inv.balance_due ?? 0), 0);

  const upcomingShows: UpcomingShow[] = shows
    .filter((show) => {
      const end = new Date(show.end_date);
      end.setHours(23, 59, 59);
      return end >= today && (show.status === "open" || show.status === "closed");
    })
    .filter((show) => {
      const hasEntry = entries.some((e) => e.show_id === show.id && ACTIVE_ENTRY_STATUSES.includes(e.status));
      const hasBooking = stallBookings.some((b) => b.show_id === show.id && b.status !== "cancelled");
      return hasEntry || hasBooking;
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((show) => ({
      show,
      organization: organizations.find((o) => o.id === show.organization_id) ?? { id: show.organization_id, name: "" } as Organization,
      entries: entries.filter((e) => e.show_id === show.id),
      bookings: stallBookings.filter((b) => b.show_id === show.id),
      daysUntil: daysUntilShow(show.start_date),
    }));

  const activeEntriesByShow = shows
    .filter((show) => activeEntries.some((e) => e.show_id === show.id))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((show) => ({
      show,
      entries: activeEntries.filter((e) => e.show_id === show.id),
    }));

  const currency = invoices[0] ? (shows.find((s) => s.id === invoices[0].show_id)?.default_currency ?? "CAD") : "CAD";
  const isProfileComplete = profileIsComplete(profile);
  const hasHorses = horses.length > 0;
  const setupWarnings = [
    !isProfileComplete && {
      key: "profile",
      icon: UserCircle,
      tone: "warning" as const,
      title: uiText(locale, "Profil incomplet", "Incomplete profile"),
      message: uiText(
        locale,
        "Ton nom et ton adresse sont requis pour t'inscrire à un concours et générer des factures.",
        "Your name and address are required to enter a show and generate invoices.",
      ),
      cta: uiText(locale, "Compléter mon profil", "Complete my profile"),
      view: "my-profile" as ViewKey,
    },
    !hasHorses && {
      key: "horses",
      icon: AlertTriangle,
      tone: "info" as const,
      title: uiText(locale, "Aucun cheval ajouté", "No horse added"),
      message: uiText(
        locale,
        "Ajoute au moins un cheval pour pouvoir t'inscrire à des classes.",
        "Add at least one horse to be able to enter classes.",
      ),
      cta: uiText(locale, "Ajouter un cheval", "Add a horse"),
      view: "my-horses" as ViewKey,
    },
  ].filter(Boolean) as Array<{ key: string; icon: typeof UserCircle; tone: "warning" | "info"; title: string; message: string; cta: string; view: ViewKey }>;

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Tableau de bord", "Dashboard")}
        description={uiText(locale, "Un aperçu de tes inscriptions, réservations et factures.", "An overview of your entries, bookings, and invoices.")}
        stats={[
          { label: uiText(locale, "Inscriptions actives", "Active entries"), value: String(activeEntries.length) },
          { label: uiText(locale, "Factures dues", "Invoices due"), value: String(dueInvoices.length) },
          { label: uiText(locale, "Solde dû", "Balance due"), value: totalDue > 0 ? formatCurrency(totalDue, currency) : "—" },
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
        ]}
      />

      {setupWarnings.length > 0 ? (
        <div className="client-setup-warnings span-2">
          {setupWarnings.map(({ key, icon: Icon, tone, title, message, cta, view }) => (
            <div className={`client-setup-warning tone-${tone}`} key={key}>
              <Icon size={20} className="client-warning-icon" />
              <div className="client-warning-content">
                <strong>{title}</strong>
                <p>{message}</p>
              </div>
              <button className="client-warning-cta" type="button" onClick={() => onViewChange(view)}>
                {cta} <ChevronRight size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Shows à venir */}
      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Concours à venir", "Upcoming shows")}</h2>
            <p>{uiText(locale, "Les concours où tu as des inscriptions ou réservations actives.", "Shows where you have active entries or bookings.")}</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => onViewChange("my-entries")}>
            {uiText(locale, "Toutes mes inscriptions", "All my entries")} <ChevronRight size={14} />
          </button>
        </div>
        {upcomingShows.length > 0 ? (
          <div className="client-show-cards">
            {upcomingShows.map((item) => (
              <ShowCard key={item.show.id} item={item} locale={locale} onViewChange={onViewChange} />
            ))}
          </div>
        ) : (
          <div className="client-empty-state">
            <CalendarDays size={32} className="client-empty-icon" />
            <p>{uiText(locale, "Aucun concours à venir. Explore les concours ouverts pour t'inscrire.", "No upcoming shows. Browse open shows to enter.")}</p>
          </div>
        )}
      </section>

      {/* Inscriptions actives */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Inscriptions actives", "Active entries")}</h2>
          </div>
          {activeEntries.length > 0 ? (
            <button className="ghost-button" type="button" onClick={() => onViewChange("my-entries")}>
              {uiText(locale, "Voir tout", "View all")}
            </button>
          ) : null}
        </div>
        {activeEntriesByShow.length > 0 ? (
          <div className="client-entries-list">
            {activeEntriesByShow.map(({ show, entries: showEntries }) => (
              <div className="client-entry-group" key={show.id}>
                <div className="client-entry-group-header">
                  <CalendarDays size={13} />
                  <strong>{show.name}</strong>
                  <span className="client-entry-group-date">{formatDate(show.start_date)}</span>
                </div>
                {showEntries.map((entry) => {
                  const division = divisions.find((d) => d.id === entry.division_id);
                  const horse = horses.find((h) => h.id === entry.horse_id);
                  const rider = contacts.find((c) => c.id === entry.rider_contact_id);
                  const tone = entryStatusTone(entry.status);
                  return (
                    <div className="client-entry-row" key={entry.id}>
                      <div className="client-entry-row-main">
                        <span className="client-entry-horse">{horse?.name ?? "—"}</span>
                        {rider ? <span className="client-entry-rider">{[rider.first_name, rider.middle_name, rider.last_name].filter(Boolean).join(" ")}</span> : null}
                        <span className="client-entry-division">{division?.name ?? "—"}</span>
                      </div>
                      <span className={`client-status-badge status-${tone}`}>{entryStatusLabel(entry.status, locale)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="client-empty-state">
            <ClipboardList size={28} className="client-empty-icon" />
            <p>{uiText(locale, "Aucune inscription active.", "No active entries.")}</p>
            <button className="ghost-button" type="button" onClick={() => onViewChange("my-entries")}>
              {uiText(locale, "Voir mes inscriptions", "View my entries")}
            </button>
          </div>
        )}
      </section>

      {/* Factures dues */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Factures dues", "Invoices due")}</h2>
          </div>
          {dueInvoices.length > 0 ? (
            <button className="ghost-button" type="button" onClick={() => onViewChange("my-invoices")}>
              {uiText(locale, "Voir tout", "View all")}
            </button>
          ) : null}
        </div>
        {dueInvoices.length > 0 ? (
          <div className="client-invoices-list">
            {dueInvoices.map((invoice) => {
              const show = shows.find((s) => s.id === invoice.show_id);
              const isOverdue = invoice.status === "overdue";
              return (
                <div className={`client-invoice-row ${isOverdue ? "overdue" : ""}`} key={invoice.id}>
                  <div className="client-invoice-row-main">
                    {isOverdue ? <AlertCircle size={14} className="client-overdue-icon" /> : <CircleDollarSign size={14} />}
                    <div>
                      <strong>{invoice.invoice_number}</strong>
                      {show ? <span className="client-invoice-show">{show.name}</span> : null}
                    </div>
                  </div>
                  <div className="client-invoice-row-right">
                    <span className={`client-status-badge status-${isOverdue ? "negative" : "pending"}`}>{invoiceStatusLabel(invoice.status, locale)}</span>
                    <strong className="client-invoice-amount">{formatCurrency(Number(invoice.balance_due), currency)}</strong>
                  </div>
                </div>
              );
            })}
            {totalDue > 0 ? (
              <div className="client-invoice-total">
                <span>{uiText(locale, "Total dû", "Total due")}</span>
                <strong>{formatCurrency(totalDue, currency)}</strong>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="client-empty-state">
            <CircleDollarSign size={28} className="client-empty-icon" />
            <p>{uiText(locale, "Aucune facture en attente. Tout est à jour.", "No pending invoices. All clear.")}</p>
          </div>
        )}
      </section>
    </div>
  );
}

export { ClientDashboardView };
