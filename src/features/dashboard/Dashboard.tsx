import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Tent,
  Trophy,
  Users,
  Warehouse,
} from "lucide-react";
import { ContactPicker, EmptyState, FormActions, LanguageToggle, Metric, NoticeBanner, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, divisionLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import type { Locale, Translation } from "../../lib/i18n";
import { associationNavigation, associationViewKeys, personalNavigation } from "../navigation";
import { MyStallsView, StallsView } from "./StallsViews";
import { buildShowScoreRunsForClass } from "../../services/showScoreAdapters";
import {
  createClass,
  createContact,
  createDivision,
  createEntry,
  createHorse,
  createOrganization,
  createShow,
  createStallBooking,
  createStallOption,
  slugify,
  updateClass,
  updateContact,
  updateDivision,
  updateEntry,
  updateHorse,
  updateShow,
  updateStallBooking,
  updateStallOption,
  type AppContext,
} from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactRole, Division, Entry, Horse, Organization, Show, ShowDay, ShowScoreClassSetup } from "../../types/domain";
import type { NavItem, Notice, ViewKey } from "../../types/ui";

export function Dashboard({
  activeView,
  context,
  loading,
  locale,
  notice,
  selectedOrganizationId,
  t,
  onChangeOrganization,
  onCreateClass,
  onCreateContact,
  onCreateDivision,
  onCreateEntry,
  onCreateHorse,
  onCreateOrganization,
  onCreateShow,
  onCreateStallBooking,
  onCreateStallOption,
  onLocaleChange,
  onPrepareShowScoreClass,
  onRefresh,
  onSignOut,
  onUpdateClass,
  onUpdateContact,
  onUpdateDivision,
  onUpdateEntry,
  onUpdateHorse,
  onUpdateShow,
  onUpdateStallBooking,
  onUpdateStallOption,
  onViewChange,
}: {
  activeView: ViewKey;
  context: AppContext | null;
  loading: boolean;
  locale: Locale;
  notice: Notice | null;
  selectedOrganizationId: string;
  t: Translation;
  onChangeOrganization: (organizationId: string) => void;
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<void>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
  onLocaleChange: (locale: Locale) => void;
  onPrepareShowScoreClass: (classRecord: ClassRecord) => Promise<void>;
  onRefresh: () => void;
  onSignOut: () => void;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
  onUpdateStallBooking: (id: string, input: Parameters<typeof updateStallBooking>[1]) => Promise<void>;
  onUpdateStallOption: (id: string, input: Parameters<typeof updateStallOption>[1]) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const organizations = context?.organizations ?? [];
  const organizationMembers = context?.organizationMembers ?? [];
  const shows = context?.shows ?? [];
  const showDays = context?.showDays ?? [];
  const showScoreClassSetups = context?.showScoreClassSetups ?? [];
  const contacts = context?.contacts ?? [];
  const contactRoles = context?.contactRoles ?? [];
  const horses = context?.horses ?? [];
  const classes = context?.classes ?? [];
  const divisions = context?.divisions ?? [];
  const entries = context?.entries ?? [];
  const stallOptions = context?.stallOptions ?? [];
  const stallBookings = context?.stallBookings ?? [];
  const invoices = context?.invoices ?? [];
  const invoiceLineItems = context?.invoiceLineItems ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? organizations[0] ?? null;
  const selectedMembership = selectedOrganization
    ? organizationMembers.find((member) => member.organization_id === selectedOrganization.id && member.user_id === context?.profile.id)
    : null;
  const canManageAssociation = selectedMembership?.role === "admin" || selectedMembership?.role === "secretary";
  const effectiveView = canManageAssociation || !associationViewKeys.has(activeView) ? activeView : "my-horses";
  const selectedOrganizationShows = selectedOrganization
    ? shows.filter((show) => show.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationShowDays = selectedOrganization
    ? showDays.filter((day) => day.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationShowScoreSetups = selectedOrganization
    ? showScoreClassSetups.filter((setup) => setup.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationInvoices = selectedOrganization
    ? invoices.filter((invoice) => invoice.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationContacts = selectedOrganization
    ? contacts.filter((contact) => contact.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationContactRoles = selectedOrganization
    ? contactRoles.filter((role) => role.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationHorses = selectedOrganization
    ? horses.filter((horse) => horse.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationClasses = selectedOrganization
    ? classes.filter((classRecord) => classRecord.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationDivisions = selectedOrganization
    ? divisions.filter((division) => division.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationEntries = selectedOrganization
    ? entries.filter((entry) => entry.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationStallOptions = selectedOrganization
    ? stallOptions.filter((option) => option.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationStallBookings = selectedOrganization
    ? stallBookings.filter((booking) => booking.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationInvoiceLineItems = selectedOrganization
    ? invoiceLineItems.filter((item) => item.organization_id === selectedOrganization.id)
    : [];
  const personalContacts = selectedOrganizationContacts.filter((contact) => contact.linked_user_id === context?.profile.id);
  const personalContactIds = new Set(personalContacts.map((contact) => contact.id));
  const personalHorses = selectedOrganizationHorses.filter((horse) => personalContactIds.has(horse.primary_owner_contact_id));
  const personalHorseIds = new Set(personalHorses.map((horse) => horse.id));
  const personalEntries = selectedOrganizationEntries.filter(
    (entry) =>
      personalHorseIds.has(entry.horse_id) ||
      personalContactIds.has(entry.owner_contact_id) ||
      personalContactIds.has(entry.payer_contact_id) ||
      (entry.rider_contact_id ? personalContactIds.has(entry.rider_contact_id) : false),
  );
  const personalStallBookings = selectedOrganizationStallBookings.filter(
    (booking) =>
      personalContactIds.has(booking.booker_contact_id) ||
      personalContactIds.has(booking.payer_contact_id) ||
      (booking.horse_id ? personalHorseIds.has(booking.horse_id) : false),
  );
  const personalInvoices = selectedOrganizationInvoices.filter((invoice) => personalContactIds.has(invoice.payer_contact_id));
  const personalInvoiceIds = new Set(personalInvoices.map((invoice) => invoice.id));
  const personalInvoiceLineItems = selectedOrganizationInvoiceLineItems.filter((item) => personalInvoiceIds.has(item.invoice_id));
  const openShows = selectedOrganizationShows.filter((show) => show.status === "open").length;
  const unpaidBalance = selectedOrganizationInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup compact">
          <div className="brand-mark">
            <ClipboardList size={22} />
          </div>
          <div>
            <strong>Horse Show</strong>
            <span>Platform</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {canManageAssociation ? (
            <NavigationSection activeView={effectiveView} items={associationNavigation} label={t.nav.association} t={t} onViewChange={onViewChange} />
          ) : null}
          <NavigationSection activeView={effectiveView} items={personalNavigation} label={t.nav.mySpace} t={t} onViewChange={onViewChange} />
        </nav>

        <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />

        <button className="ghost-button sidebar-action" type="button" onClick={onSignOut}>
          <LogOut size={18} />
          {t.common.signOut}
        </button>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{t.shell.workspace}</p>
            <h1>{selectedOrganization?.name ?? "Horse Show Platform"}</h1>
          </div>
          <div className="header-actions">
            <select value={selectedOrganization?.id ?? ""} onChange={(event) => onChangeOrganization(event.target.value)}>
              {organizations.length ? (
                organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))
              ) : (
                <option value="">{t.common.noOrganization}</option>
              )}
            </select>
            <button className="icon-button" title={t.common.refresh} type="button" onClick={onRefresh}>
              <RefreshCw className={loading ? "spin" : ""} size={18} />
            </button>
          </div>
        </header>

        {notice ? <NoticeBanner notice={notice} /> : null}

        {effectiveView === "overview" ? (
          <OverviewView
            openShows={openShows}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            contacts={selectedOrganizationContacts}
            horses={selectedOrganizationHorses}
            classes={selectedOrganizationClasses}
            entries={selectedOrganizationEntries}
            stallOptions={selectedOrganizationStallOptions}
            stallBookings={selectedOrganizationStallBookings}
            invoices={selectedOrganizationInvoices}
            unpaidBalance={unpaidBalance}
            onCreateOrganization={onCreateOrganization}
          />
        ) : null}

        {effectiveView === "shows" ? (
          <ShowsView organization={selectedOrganization} shows={selectedOrganizationShows} onCreateShow={onCreateShow} onUpdateShow={onUpdateShow} />
        ) : null}

        {effectiveView === "people" ? (
          <PeopleView
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onUpdateContact={onUpdateContact}
            onUpdateHorse={onUpdateHorse}
          />
        ) : null}

        {effectiveView === "classes" ? (
          <ClassesView
            classes={selectedOrganizationClasses}
            divisions={selectedOrganizationDivisions}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            onCreateClass={onCreateClass}
            onCreateDivision={onCreateDivision}
            onUpdateClass={onUpdateClass}
            onUpdateDivision={onUpdateDivision}
          />
        ) : null}

        {effectiveView === "entries" ? (
          <EntriesView
            classes={selectedOrganizationClasses}
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            divisions={selectedOrganizationDivisions}
            entries={selectedOrganizationEntries}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            shows={selectedOrganizationShows}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onUpdateEntry={onUpdateEntry}
          />
        ) : null}

        {effectiveView === "stalls" ? (
          <StallsView
            bookings={selectedOrganizationStallBookings}
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            currency={selectedOrganization?.currency ?? "CAD"}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            showDays={selectedOrganizationShowDays}
            shows={selectedOrganizationShows}
            stallOptions={selectedOrganizationStallOptions}
            onCreateContact={onCreateContact}
            onCreateStallBooking={onCreateStallBooking}
            onCreateStallOption={onCreateStallOption}
            onUpdateStallBooking={onUpdateStallBooking}
            onUpdateStallOption={onUpdateStallOption}
          />
        ) : null}

        {effectiveView === "scoring" ? (
          <ScoringView
            classes={selectedOrganizationClasses}
            contacts={selectedOrganizationContacts}
            divisions={selectedOrganizationDivisions}
            entries={selectedOrganizationEntries}
            horses={selectedOrganizationHorses}
            showDays={selectedOrganizationShowDays}
            showScoreClassSetups={selectedOrganizationShowScoreSetups}
            shows={selectedOrganizationShows}
            onPrepareShowScoreClass={onPrepareShowScoreClass}
          />
        ) : null}

        {effectiveView === "billing" ? (
          <BillingView
            currency={selectedOrganization?.currency ?? "CAD"}
            invoices={selectedOrganizationInvoices}
            lineItems={selectedOrganizationInvoiceLineItems}
            unpaidBalance={unpaidBalance}
          />
        ) : null}

        {effectiveView === "my-horses" ? (
          <MyHorsesView
            contacts={personalContacts}
            contactRoles={selectedOrganizationContactRoles}
            horses={personalHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onUpdateHorse={onUpdateHorse}
          />
        ) : null}

        {effectiveView === "my-riders" ? (
          <MyContactsView
            contacts={personalContacts}
            contactRoles={selectedOrganizationContactRoles}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onCreateContact={onCreateContact}
            onUpdateContact={onUpdateContact}
          />
        ) : null}

        {effectiveView === "my-entries" ? (
          <MyEntriesView
            classes={selectedOrganizationClasses}
            contacts={personalContacts}
            contactRoles={selectedOrganizationContactRoles}
            divisions={selectedOrganizationDivisions}
            entries={personalEntries}
            horses={personalHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            shows={selectedOrganizationShows}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onUpdateEntry={onUpdateEntry}
          />
        ) : null}

        {effectiveView === "my-stalls" ? (
          <MyStallsView
            bookings={personalStallBookings}
            contacts={personalContacts}
            contactRoles={selectedOrganizationContactRoles}
            currency={selectedOrganization?.currency ?? "CAD"}
            horses={personalHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            showDays={selectedOrganizationShowDays}
            shows={selectedOrganizationShows}
            stallOptions={selectedOrganizationStallOptions}
            onCreateContact={onCreateContact}
            onCreateStallBooking={onCreateStallBooking}
            onUpdateStallBooking={onUpdateStallBooking}
          />
        ) : null}

        {effectiveView === "my-invoices" ? (
          <BillingView
            currency={selectedOrganization?.currency ?? "CAD"}
            invoices={personalInvoices}
            lineItems={personalInvoiceLineItems}
            unpaidBalance={personalInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0)}
          />
        ) : null}

        {effectiveView === "settings" ? <SettingsView context={context} organization={selectedOrganization} /> : null}
      </section>
    </main>
  );
}

function NavigationSection({
  activeView,
  items,
  label,
  t,
  onViewChange,
}: {
  activeView: ViewKey;
  items: NavItem[];
  label: string;
  t: Translation;
  onViewChange: (view: ViewKey) => void;
}) {
  return (
    <div className="nav-section">
      <span>{label}</span>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button className={activeView === item.key ? "active" : ""} key={item.key} type="button" onClick={() => onViewChange(item.key)}>
            <Icon size={18} />
            {t.nav[item.labelKey]}
          </button>
        );
      })}
    </div>
  );
}

function OverviewView({
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
  const actionItems = [
    {
      detail: upcomingShow
        ? `${upcomingShows.length} upcoming show${upcomingShows.length === 1 ? "" : "s"} on the calendar.`
        : "Create dates, venue and open status before inviting exhibitors.",
      icon: upcomingShow ? CheckCircle2 : AlertCircle,
      state: upcomingShow ? "Ready" : "Next",
      title: upcomingShow ? "Calendar is started" : "Create the first show",
    },
    {
      detail: contacts.length && horses.length ? `${contacts.length} contacts and ${horses.length} horses available.` : "Add owners, riders and horses before entries.",
      icon: contacts.length && horses.length ? CheckCircle2 : Users,
      state: contacts.length && horses.length ? "Ready" : "Build",
      title: "People and horses",
    },
    {
      detail: showEntries.length ? `${activeEntries} active or pending entries for the next show.` : "Classes are ready, but no entries have been started.",
      icon: showEntries.length ? CheckCircle2 : ClipboardList,
      state: showEntries.length ? "Moving" : "Waiting",
      title: "Entry pipeline",
    },
    {
      detail: stallCapacity ? `${stallsBooked} of ${stallCapacity} units reserved across stalls, extras and camping.` : "Publish reservation options for stalls, bedding, hay or camping.",
      icon: stallCapacity ? Warehouse : Tent,
      state: stallCapacity ? `${stallUsage}%` : "Setup",
      title: "Reservations",
    },
  ];

  return (
    <div className="overview-layout">
      <section className="overview-command span-2">
        <div className="overview-command-main">
          <p className="eyebrow">Command center</p>
          <h2>{upcomingShow?.name ?? organization?.name ?? "Build the show office"}</h2>
          <p>
            {upcomingShow
              ? `${formatDate(upcomingShow.start_date)} to ${formatDate(upcomingShow.end_date)}${showLocation ? ` at ${showLocation}` : ""}.`
              : "Create the first association and show to unlock entries, reservations, scoring and billing."}
          </p>
          <div className="show-meta">
            <span>
              <CalendarDays size={16} />
              {upcomingShow ? upcomingShow.status : "No show yet"}
            </span>
            <span>
              <MapPin size={16} />
              {showLocation || organization?.primary_contact_email || "Venue pending"}
            </span>
            <span>
              <Trophy size={16} />
              {showClasses.length} class{showClasses.length === 1 ? "" : "es"}
            </span>
          </div>
        </div>
        <div className="overview-command-aside">
          <span className={`badge ${upcomingShow?.status ?? "draft"}`}>{upcomingShow ? upcomingShow.status : "setup"}</span>
          <strong>{formatCurrency(invoiceBalance || unpaidBalance, currency)}</strong>
          <small>{upcomingShow ? "Balance tied to next show" : "Total open balance"}</small>
        </div>
      </section>

      <section className="metric-grid span-2">
        <Metric detail={upcomingShow ? `Next: ${formatDate(upcomingShow.start_date)}` : "No active calendar"} icon={CalendarDays} label="Open shows" value={String(openShows)} />
        <Metric detail={`${contacts.length} people, ${horses.length} horses`} icon={Users} label="Registry" value={String(contacts.length + horses.length)} />
        <Metric detail={`${draftEntries} draft${draftEntries === 1 ? "" : "s"} need review`} icon={ClipboardList} label="Entries" value={String(entries.length)} />
        <Metric detail={`${stallsBooked} reserved of ${stallCapacity || 0}`} icon={Warehouse} label="Reservation usage" value={`${stallUsage}%`} />
        <Metric detail={`${showInvoices.length} invoice${showInvoices.length === 1 ? "" : "s"} in scope`} icon={CircleDollarSign} label="Balance due" value={formatCurrency(unpaidBalance, currency)} />
      </section>

      <section className="panel action-panel">
        <div className="panel-header">
          <div>
            <h2>Action queue</h2>
            <p>The next useful moves for this workspace.</p>
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
            <h2>Upcoming shows</h2>
            <p>{upcomingShows.length ? "The visible runway for secretaries and exhibitors." : "No upcoming shows yet."}</p>
          </div>
        </div>
        <div className="timeline-list">
          {upcomingShows.map((show) => (
            <div className="timeline-row" key={show.id}>
              <div>
                <strong>{show.name}</strong>
                <span>{show.location || show.venue || "Location pending"}</span>
              </div>
              <div>
                <span>{formatDate(show.start_date)}</span>
                <span className={`badge ${show.status}`}>{show.status}</span>
              </div>
            </div>
          ))}
          {!upcomingShows.length ? <EmptyState label="Create a show to start the operating calendar." /> : null}
        </div>
      </section>

      <section className="panel capacity-panel">
        <div className="panel-header">
          <div>
            <h2>Operational pulse</h2>
            <p>Quick read on the next show's readiness.</p>
          </div>
        </div>
        <div className="progress-stack">
          <ProgressMeter label="Entries vs classes" value={entryProgress} detail={`${showEntries.length} entries across ${showClasses.length} classes`} />
          <ProgressMeter label="Reservation inventory used" value={stallUsage} detail={`${stallsBooked} booked, ${stallsAvailable} available`} />
          <ProgressMeter label="Invoices paid" value={invoiceProgress} detail={`${paidInvoices} paid of ${showInvoices.length} invoices`} />
        </div>
      </section>

      <OrganizationForm onCreateOrganization={onCreateOrganization} />
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

function contactRoleSummary(contact: Contact, contactRoles: ContactRole[]) {
  const roles = contactRoles.filter((role) => role.contact_id === contact.id).map((role) => role.role);
  const unique = Array.from(new Set(roles.length ? roles : [contact.type]));

  return unique.map((role) => role.replace("_", " ")).join(" / ");
}

function ShowsView({
  organization,
  shows,
  onCreateShow,
  onUpdateShow,
}: {
  organization: Organization | null;
  shows: Show[];
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<void>;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
}) {
  const [editingShow, setEditingShow] = useState<Show | null>(null);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Calendrier"
        title="Shows"
        description="Planifie les concours, leurs dates et leur statut public avant d'ouvrir les inscriptions."
        stats={[
          { label: "Shows", value: String(shows.length) },
          { label: "Ouverts", value: String(shows.filter((show) => show.status === "open").length) },
        ]}
      />

      <ShowForm organization={organization} onCreateShow={onCreateShow} />

      {editingShow ? (
        <ShowEditForm
          show={editingShow}
          onCancel={() => setEditingShow(null)}
          onUpdateShow={async (id, input) => {
            await onUpdateShow(id, input);
            setEditingShow(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Shows</h2>
            <p>{shows.length ? `${shows.length} show${shows.length === 1 ? "" : "s"} in this organization.` : "No shows yet."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Dates</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {shows.map((show) => (
            <div className="table-row" key={show.id}>
              <strong>{show.name}</strong>
              <span>
                {formatDate(show.start_date)} - {formatDate(show.end_date)}
              </span>
              <span className={`badge ${show.status}`}>{show.status}</span>
              <button className="text-button" type="button" onClick={() => setEditingShow(show)}>
                Edit
              </button>
            </div>
          ))}
          {!shows.length ? <EmptyState label="Create the first show for this organization." /> : null}
        </div>
      </section>
    </div>
  );
}

function PeopleView({
  contacts,
  contactRoles,
  horses,
  organization,
  onCreateContact,
  onCreateHorse,
  onUpdateContact,
  onUpdateHorse,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  horses: Horse[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
}) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Registre"
        title="Contacts et chevaux"
        description="Centralise les proprietaires, cavaliers, payeurs et chevaux qui serviront aux inscriptions."
        stats={[
          { label: "Contacts", value: String(contacts.length) },
          { label: "Chevaux", value: String(horses.length) },
        ]}
      />

      <ContactForm organization={organization} onCreateContact={onCreateContact} />
      <HorseForm contacts={contacts} contactRoles={contactRoles} organization={organization} onCreateContact={onCreateContact} onCreateHorse={onCreateHorse} />

      {editingContact ? (
        <ContactEditForm
          contact={editingContact}
          onCancel={() => setEditingContact(null)}
          onUpdateContact={async (id, input) => {
            await onUpdateContact(id, input);
            setEditingContact(null);
          }}
        />
      ) : null}

      {editingHorse ? (
        <HorseEditForm
          contacts={contacts}
          contactRoles={contactRoles}
          organization={organization}
          horse={editingHorse}
          onCancel={() => setEditingHorse(null)}
          onCreateContact={onCreateContact}
          onUpdateHorse={async (id, input) => {
            await onUpdateHorse(id, input);
            setEditingHorse(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Contacts</h2>
            <p>{contacts.length ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"} ready for entries.` : "Owners, agents, riders and payers."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Roles</span>
            <span>Email</span>
            <span>Action</span>
          </div>
          {contacts.map((contact) => (
            <div className="table-row" key={contact.id}>
              <strong>{contactLabel(contact)}</strong>
              <span>{contactRoleSummary(contact, contactRoles)}</span>
              <span>{contact.email || "No email"}</span>
              <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                Edit
              </button>
            </div>
          ))}
          {!contacts.length ? <EmptyState label="Create an owner or rider contact first." /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Horses</h2>
            <p>{horses.length ? `${horses.length} horse${horses.length === 1 ? "" : "s"} in the organization.` : "Horses connect owners to entries."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Owner</span>
            <span>Gender</span>
            <span>Action</span>
          </div>
          {horses.map((horse) => (
            <div className="table-row" key={horse.id}>
              <strong>{horse.name}</strong>
              <span>{contactLabel(findById(contacts, horse.primary_owner_contact_id))}</span>
              <span>{horse.gender || "Unset"}</span>
              <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                Edit
              </button>
            </div>
          ))}
          {!horses.length ? <EmptyState label="Create a horse after adding an owner contact." /> : null}
        </div>
      </section>
    </div>
  );
}

function ClassesView({
  classes,
  divisions,
  organization,
  shows,
  onCreateClass,
  onCreateDivision,
  onUpdateClass,
  onUpdateDivision,
}: {
  classes: ClassRecord[];
  divisions: Division[];
  organization: Organization | null;
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
}) {
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Programme"
        title="Classes et divisions"
        description="Structure le programme sportif: classes, divisions, frais et statuts d'ouverture."
        stats={[
          { label: "Classes", value: String(classes.length) },
          { label: "Divisions", value: String(divisions.length) },
        ]}
      />

      <ClassForm organization={organization} shows={shows} onCreateClass={onCreateClass} />
      <DivisionForm classes={classes} organization={organization} shows={shows} onCreateDivision={onCreateDivision} />

      {editingClass ? (
        <ClassEditForm
          classRecord={editingClass}
          onCancel={() => setEditingClass(null)}
          onUpdateClass={async (id, input) => {
            await onUpdateClass(id, input);
            setEditingClass(null);
          }}
        />
      ) : null}

      {editingDivision ? (
        <DivisionEditForm
          classes={classes}
          division={editingDivision}
          onCancel={() => setEditingDivision(null)}
          onUpdateDivision={async (id, input) => {
            await onUpdateDivision(id, input);
            setEditingDivision(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Class book</h2>
            <p>{classes.length ? `${classes.length} class${classes.length === 1 ? "" : "es"} configured.` : "Classes and divisions define what people can enter."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Class</span>
            <span>Show</span>
            <span>Fee</span>
            <span>Action</span>
          </div>
          {classes.map((classRecord) => {
            const classDivisions = divisions.filter((division) => division.class_id === classRecord.id);
            return (
              <div className="table-row" key={classRecord.id}>
                <strong>{classRecord.name}</strong>
                <span>{showLabel(findById(shows, classRecord.show_id))}</span>
                <span>{classRecord.entry_fee == null ? "No fee" : formatCurrency(classRecord.entry_fee, organization?.currency ?? "CAD")}</span>
                <button className="text-button" type="button" onClick={() => setEditingClass(classRecord)}>
                  Edit
                </button>
              </div>
            );
          })}
          {!classes.length ? <EmptyState label="Create the first class for a show." /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Divisions</h2>
            <p>{divisions.length ? `${divisions.length} division${divisions.length === 1 ? "" : "s"} configured.` : "Divisions sit under classes."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Division</span>
            <span>Class</span>
            <span>Fee</span>
            <span>Action</span>
          </div>
          {divisions.map((division) => (
            <div className="table-row" key={division.id}>
              <strong>{division.name}</strong>
              <span>{findById(classes, division.class_id)?.name ?? "Unknown class"}</span>
              <span>{division.entry_fee == null ? "Class fee" : formatCurrency(division.entry_fee, organization?.currency ?? "CAD")}</span>
              <button className="text-button" type="button" onClick={() => setEditingDivision(division)}>
                Edit
              </button>
            </div>
          ))}
          {!divisions.length ? <EmptyState label="Create a division after creating a class." /> : null}
        </div>
      </section>
    </div>
  );
}

function EntriesView({
  classes,
  contacts,
  contactRoles,
  divisions,
  entries,
  horses,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
  onUpdateEntry,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
}) {
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Inscriptions"
        title="Gestion des inscriptions"
        description="Cree et ajuste les brouillons avant checkout, facturation ou preparation du scoring."
        stats={[
          { label: "Inscriptions", value: String(entries.length) },
          { label: "Brouillons", value: String(entries.filter((entry) => entry.status === "draft").length) },
        ]}
      />

      <EntryForm
        classes={classes}
        contacts={contacts}
        contactRoles={contactRoles}
        divisions={divisions}
        horses={horses}
        organization={organization}
        profileId={profileId}
        shows={shows}
        onCreateContact={onCreateContact}
        onCreateEntry={onCreateEntry}
      />

      {editingEntry ? (
        <EntryEditForm
          classes={classes}
          contacts={contacts}
          contactRoles={contactRoles}
          divisions={divisions}
          entry={editingEntry}
          horses={horses}
          organization={organization}
          profileId={profileId}
          onCancel={() => setEditingEntry(null)}
          onCreateContact={onCreateContact}
          onUpdateEntry={async (id, input) => {
            await onUpdateEntry(id, input);
            setEditingEntry(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Entries</h2>
            <p>{entries.length ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"} created.` : "Draft entries appear here before checkout."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Horse</span>
            <span>Division</span>
            <span>Owner</span>
            <span>Action</span>
          </div>
          {entries.map((entry) => (
            <div className="table-row" key={entry.id}>
              <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
              <span>{divisionLabel(findById(divisions, entry.division_id), classes)}</span>
              <span>{contactLabel(findById(contacts, entry.owner_contact_id))}</span>
              <button className="text-button" type="button" onClick={() => setEditingEntry(entry)}>
                Edit
              </button>
            </div>
          ))}
          {!entries.length ? <EmptyState label="Create a draft entry after adding contacts, horses, classes and divisions." /> : null}
        </div>
      </section>
    </div>
  );
}

function ScoringView({
  classes,
  contacts,
  divisions,
  entries,
  horses,
  showDays,
  showScoreClassSetups,
  shows,
  onPrepareShowScoreClass,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  shows: Show[];
  onPrepareShowScoreClass: (classRecord: ClassRecord) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [busyClassId, setBusyClassId] = useState("");
  const selectedShowId = showId || shows[0]?.id || "";
  const visibleClasses = selectedShowId ? classes.filter((classRecord) => classRecord.show_id === selectedShowId) : classes;
  const preparedClassIds = new Set(showScoreClassSetups.map((setup) => setup.class_id));
  const totalRuns = visibleClasses.reduce(
    (sum, classRecord) =>
      sum +
      buildShowScoreRunsForClass(classRecord.id, entries, {
        contacts,
        divisions,
        horses,
      }).length,
    0,
  );

  async function handlePrepare(classRecord: ClassRecord) {
    setBusyClassId(classRecord.id);

    try {
      await onPrepareShowScoreClass(classRecord);
    } finally {
      setBusyClassId("");
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Scoring"
        title="Preparation ShowScore"
        description="Prepare les classes, runs, chevaux et cavaliers qui doivent etre envoyes vers le scoring."
        stats={[
          { label: "Classes", value: String(visibleClasses.length) },
          { label: "Runs", value: String(totalRuns) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label="Scoring classes" value={String(visibleClasses.length)} />
        <Metric label="Runs from entries" value={String(totalRuns)} />
        <Metric label="Prepared setups" value={String(visibleClasses.filter((classRecord) => preparedClassIds.has(classRecord.id)).length)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>ShowScore bridge</h2>
            <p>Prepare scoring setup runs from HSP entries while keeping associations, classes, horses and riders aligned.</p>
          </div>
          <select value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </div>
        <div className="table scoring-table">
          <div className="table-row table-head">
            <span>Class</span>
            <span>Schedule</span>
            <span>Runs</span>
            <span>ShowScore</span>
          </div>
          {visibleClasses.map((classRecord) => {
            const setup = showScoreClassSetups.find((candidate) => candidate.class_id === classRecord.id);
            const runs = buildShowScoreRunsForClass(classRecord.id, entries, {
              contacts,
              divisions,
              horses,
            });
            const day = findById(showDays, classRecord.show_day_id);
            const show = findById(shows, classRecord.show_id);
            const preparedRunCount = setup?.runs.length ?? 0;
            const status = setup?.finalized ? "Finalized" : setup ? "Prepared" : runs.length ? "Ready" : "No entries";
            const canPrepare = runs.length > 0 && !setup?.locked_at && !setup?.finalized;

            return (
              <div className="table-row" key={classRecord.id}>
                <div>
                  <strong>{classRecord.name}</strong>
                  <span className="muted-line">{classRecord.code || "No code"}</span>
                </div>
                <div>
                  <span>{showLabel(show)}</span>
                  <span className="muted-line">{day ? `${day.day_name || "Day"} - ${formatDate(day.day_date)}` : "No day assigned"}</span>
                </div>
                <div>
                  <strong>{runs.length}</strong>
                  <span className="muted-line">{preparedRunCount ? `${preparedRunCount} saved` : "Not saved yet"}</span>
                </div>
                <div className="row-actions">
                  <span className={`badge ${status.toLowerCase().replace(" ", "-")}`}>{status}</span>
                  <button className="text-button" disabled={!canPrepare || busyClassId === classRecord.id} type="button" onClick={() => handlePrepare(classRecord)}>
                    {busyClassId === classRecord.id ? "Preparing" : setup ? "Refresh setup" : "Prepare setup"}
                  </button>
                </div>
              </div>
            );
          })}
          {!visibleClasses.length ? <EmptyState label="Create classes before preparing ShowScore setups." /> : null}
        </div>
      </section>
    </div>
  );
}

function MyHorsesView({
  contacts,
  contactRoles,
  horses,
  organization,
  profileId,
  onCreateContact,
  onCreateHorse,
  onUpdateHorse,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
}) {
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Mon espace"
        title="Mes chevaux"
        description="Gere les chevaux lies a ton profil avant de les inscrire a un show."
        stats={[
          { label: "Chevaux", value: String(horses.length) },
          { label: "Contacts", value: String(contacts.length) },
        ]}
      />

      <HorseForm
        contacts={contacts}
        contactRoles={contactRoles}
        createdByUserId={profileId}
        organization={organization}
        onCreateContact={onCreateContact}
        onCreateHorse={onCreateHorse}
      />

      {editingHorse ? (
        <HorseEditForm
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={profileId}
          organization={organization}
          horse={editingHorse}
          onCancel={() => setEditingHorse(null)}
          onCreateContact={onCreateContact}
          onUpdateHorse={async (id, input) => {
            await onUpdateHorse(id, input);
            setEditingHorse(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Mes chevaux</h2>
            <p>Chevaux liés à mon profil utilisateur.</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Nom</span>
            <span>Owner</span>
            <span>Genre</span>
            <span>Action</span>
          </div>
          {horses.map((horse) => (
            <div className="table-row" key={horse.id}>
              <strong>{horse.name}</strong>
              <span>{contactLabel(findById(contacts, horse.primary_owner_contact_id))}</span>
              <span>{horse.gender || "Unset"}</span>
              <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                Edit
              </button>
            </div>
          ))}
          {!horses.length ? <EmptyState label="Aucun cheval lié à ton profil pour l'instant." /> : null}
        </div>
      </section>
    </div>
  );
}

function MyContactsView({
  contacts,
  contactRoles,
  organization,
  profileId,
  onCreateContact,
  onUpdateContact,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const canCreateLinkedContact = Boolean(organization && profileId && contacts.length === 0);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Mon espace"
        title="Mes cavaliers et contacts"
        description="Gere le contact lie a ton compte pour les inscriptions, reservations et factures."
        stats={[{ label: "Contacts", value: String(contacts.length) }]}
      />

      {canCreateLinkedContact ? (
        <ContactForm
          createdByUserId={profileId}
          defaultType="owner"
          linkedUserId={profileId}
          organization={organization}
          title="Nouveau contact"
          description="Crée ton contact personnel avant d'ajouter chevaux et inscriptions."
          onCreateContact={onCreateContact}
        />
      ) : null}

      {editingContact ? (
        <ContactEditForm
          contact={editingContact}
          onCancel={() => setEditingContact(null)}
          onUpdateContact={async (id, input) => {
            await onUpdateContact(id, input);
            setEditingContact(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Mes cavaliers</h2>
            <p>Contact lié à mon compte.</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Nom</span>
            <span>Roles</span>
            <span>Email</span>
            <span>Action</span>
          </div>
          {contacts.map((contact) => (
            <div className="table-row" key={contact.id}>
              <strong>{contactLabel(contact)}</strong>
              <span>{contactRoleSummary(contact, contactRoles)}</span>
              <span>{contact.email || "No email"}</span>
              <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                Edit
              </button>
            </div>
          ))}
          {!contacts.length ? <EmptyState label="Crée ton contact personnel pour commencer." /> : null}
        </div>
      </section>
    </div>
  );
}

function MyEntriesView({
  classes,
  contacts,
  contactRoles,
  divisions,
  entries,
  horses,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
  onUpdateEntry,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
}) {
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Mon espace"
        title="Mes inscriptions"
        description="Consulte et modifie les inscriptions rattachees a tes chevaux ou contacts."
        stats={[
          { label: "Inscriptions", value: String(entries.length) },
          { label: "Chevaux", value: String(horses.length) },
        ]}
      />

      <EntryForm
        classes={classes}
        contacts={contacts}
        contactRoles={contactRoles}
        divisions={divisions}
        horses={horses}
        organization={organization}
        profileId={profileId}
        shows={shows}
        onCreateContact={onCreateContact}
        onCreateEntry={onCreateEntry}
      />

      {editingEntry ? (
        <EntryEditForm
          classes={classes}
          contacts={contacts}
          contactRoles={contactRoles}
          divisions={divisions}
          entry={editingEntry}
          horses={horses}
          organization={organization}
          profileId={profileId}
          onCancel={() => setEditingEntry(null)}
          onCreateContact={onCreateContact}
          onUpdateEntry={async (id, input) => {
            await onUpdateEntry(id, input);
            setEditingEntry(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Mes inscriptions</h2>
            <p>Inscriptions liées à mes chevaux ou contacts.</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Cheval</span>
            <span>Division</span>
            <span>Statut</span>
            <span>Action</span>
          </div>
          {entries.map((entry) => (
            <div className="table-row" key={entry.id}>
              <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
              <span>{divisionLabel(findById(divisions, entry.division_id), classes)}</span>
              <span className={`badge ${entry.status}`}>{entry.status.replace("_", " ")}</span>
              <button className="text-button" type="button" onClick={() => setEditingEntry(entry)}>
                Edit
              </button>
            </div>
          ))}
          {!entries.length ? <EmptyState label="Aucune inscription liée à ton profil pour l'instant." /> : null}
        </div>
      </section>
    </div>
  );
}

function BillingView({
  currency,
  invoices,
  lineItems,
  unpaidBalance,
}: {
  currency: string;
  invoices: AppContext["invoices"];
  lineItems: AppContext["invoiceLineItems"];
  unpaidBalance: number;
}) {
  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Facturation"
        title="Factures"
        description="Suis les factures, soldes ouverts et lignes creees par les inscriptions ou reservations."
        stats={[
          { label: "Factures", value: String(invoices.length) },
          { label: "Solde", value: formatCurrency(unpaidBalance, currency) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label="Invoices" value={String(invoices.length)} />
        <Metric label="Open balance" value={formatCurrency(unpaidBalance, currency)} />
        <Metric label="Paid invoices" value={String(invoices.filter((invoice) => invoice.status === "paid").length)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Recent invoices</h2>
            <p>Draft, sent, partial and paid invoice records.</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Invoice</span>
            <span>Status</span>
            <span>Total</span>
            <span>Balance</span>
          </div>
          {invoices.map((invoice) => {
            const invoiceLineItems = lineItems.filter((item) => item.invoice_id === invoice.id);
            return (
              <div className="invoice-group" key={invoice.id}>
                <div className="table-row">
                  <strong>{invoice.invoice_number}</strong>
                  <span className={`badge ${invoice.status}`}>{invoice.status.replace("_", " ")}</span>
                  <span>{formatCurrency(invoice.total_amount, currency)}</span>
                  <span>{formatCurrency(invoice.balance_due, currency)}</span>
                </div>
                {invoiceLineItems.map((item) => (
                  <div className="table-row invoice-line-row" key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <span className="muted-line">{item.item_type}</span>
                    </div>
                    <span>{Number(item.quantity).toLocaleString("en-CA")} x</span>
                    <span>{formatCurrency(item.unit_price, currency)}</span>
                    <span>{formatCurrency(item.total_price + item.tax_amount, currency)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {!invoices.length ? <EmptyState label="Invoice records will appear after checkout or manual billing." /> : null}
        </div>
      </section>
    </div>
  );
}

function SettingsView({ context, organization }: { context: AppContext | null; organization: Organization | null }) {
  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Parametres"
        title="Profil et association"
        description="Verifie le profil connecte, le role, la devise, la taxe et le plan de l'association."
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Profile</h2>
            <p>{context?.profile ? `${context.profile.first_name ?? ""} ${context.profile.last_name ?? ""}`.trim() || "Signed in user" : "Loading"}</p>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Role type</dt>
            <dd>{context?.profile.type_user ?? "Unset"}</dd>
          </div>
          <div>
            <dt>Profile ID</dt>
            <dd>{context?.profile.id ?? "Pending"}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Organization</h2>
            <p>{organization?.slug ?? "No organization selected"}</p>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Currency</dt>
            <dd>{organization?.currency ?? "CAD"}</dd>
          </div>
          <div>
            <dt>Tax rate</dt>
            <dd>{organization ? `${organization.tax_rate}%` : "0%"}</dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{organization?.subscription_plan ?? "free"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function OrganizationForm({ onCreateOrganization }: { onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void> }) {
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
          <h2>New organization</h2>
          <p>Tenant root for shows, contacts, entries and billing.</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input placeholder={slugify(name) || "spring-circuit"} value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <label>
          Contact email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          <Plus size={18} />
          Create organization
        </button>
      </form>
    </section>
  );
}

function ShowForm({
  organization,
  onCreateShow,
}: {
  organization: Organization | null;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateShow({
        organization_id: organization.id,
        name,
        slug: slug || slugify(name),
        start_date: startDate,
        end_date: endDate,
        location,
        status: "draft",
      });
      setName("");
      setSlug("");
      setLocation("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New show</h2>
          <p>{organization ? organization.name : "Create an organization first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Name
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input disabled={!organization} placeholder={slugify(name) || "spring-classic"} value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Start
            <input disabled={!organization} required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            End
            <input disabled={!organization} required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <label>
          Location
          <input disabled={!organization} value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization} type="submit">
          <Plus size={18} />
          Create show
        </button>
      </form>
    </section>
  );
}

function ShowEditForm({
  show,
  onCancel,
  onUpdateShow,
}: {
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
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Edit show</h2>
          <p>{show.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Start
            <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            End
            <input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as Show["status"])}>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            Location
            <input value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>
        </div>
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </section>
  );
}

function ContactForm({
  createdByUserId,
  defaultType = "owner",
  description,
  linkedUserId,
  organization,
  title = "New contact",
  onCreateContact,
}: {
  createdByUserId?: string;
  defaultType?: Contact["type"];
  description?: string;
  linkedUserId?: string;
  organization: Organization | null;
  title?: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
}) {
  const [type, setType] = useState<Contact["type"]>(defaultType);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [barnName, setBarnName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateContact({
        organization_id: organization.id,
        type,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        barn_name: barnName,
        linked_user_id: linkedUserId,
        created_by_user_id: createdByUserId,
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBarnName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{description ?? (organization ? organization.name : "Create an organization first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Type
          <select disabled={!organization} value={type} onChange={(event) => setType(event.target.value as Contact["type"])}>
            <option value="owner">Owner</option>
            <option value="agent">Agent</option>
            <option value="rider">Rider</option>
            <option value="payer">Payer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            First name
            <input disabled={!organization} required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            Last name
            <input disabled={!organization} required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <label>
          Email
          <input disabled={!organization} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Phone
            <input disabled={!organization} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label>
            Barn
            <input disabled={!organization} value={barnName} onChange={(event) => setBarnName(event.target.value)} />
          </label>
        </div>
        <button className="primary-button" disabled={busy || !organization} type="submit">
          <Plus size={18} />
          Create contact
        </button>
      </form>
    </section>
  );
}

function HorseForm({
  contacts,
  contactRoles,
  createdByUserId,
  organization,
  onCreateContact,
  onCreateHorse,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [ownerContactId, setOwnerContactId] = useState("");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedOwnerId = ownerContactId;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedOwnerId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateHorse({
        organization_id: organization.id,
        name,
        primary_owner_contact_id: selectedOwnerId,
        breed,
        gender: gender || null,
        registration_number: registrationNumber,
        created_by_user_id: createdByUserId,
      });
      setName("");
      setBreed("");
      setGender("");
      setRegistrationNumber("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New horse</h2>
          <p>{contacts.length ? "Connect a horse to an owner." : "Create an owner contact from this form."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Horse name
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <ContactPicker
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          disabled={!organization}
          label="Owner"
          organization={organization}
          role="owner"
          value={selectedOwnerId}
          onChange={setOwnerContactId}
          onCreateContact={onCreateContact}
        />
        <div className="form-grid">
          <label>
            Breed
            <input disabled={!organization} value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            Gender
            <select disabled={!organization} value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
              <option value="">Unset</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="G">G</option>
            </select>
          </label>
        </div>
        <label>
          Registration
          <input disabled={!organization} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !selectedOwnerId} type="submit">
          <Plus size={18} />
          Create horse
        </button>
      </form>
    </section>
  );
}

function ContactEditForm({
  contact,
  onCancel,
  onUpdateContact,
}: {
  contact: Contact;
  onCancel: () => void;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [type, setType] = useState<Contact["type"]>(contact.type);
  const [firstName, setFirstName] = useState(contact.first_name);
  const [lastName, setLastName] = useState(contact.last_name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [barnName, setBarnName] = useState(contact.barn_name ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateContact(contact.id, {
        type,
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        barn_name: barnName || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Edit contact</h2>
          <p>{contactLabel(contact)}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as Contact["type"])}>
            <option value="owner">Owner</option>
            <option value="agent">Agent</option>
            <option value="rider">Rider</option>
            <option value="payer">Payer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            First name
            <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            Last name
            <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
        </div>
        <label>
          Barn
          <input value={barnName} onChange={(event) => setBarnName(event.target.value)} />
        </label>
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </section>
  );
}

function HorseEditForm({
  contacts,
  contactRoles,
  createdByUserId,
  horse,
  organization,
  onCancel,
  onCreateContact,
  onUpdateHorse,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  horse: Horse;
  organization: Organization | null;
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(horse.name);
  const [ownerContactId, setOwnerContactId] = useState(horse.primary_owner_contact_id);
  const [breed, setBreed] = useState(horse.breed ?? "");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>(horse.gender ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(horse.registration_number ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateHorse(horse.id, {
        name,
        primary_owner_contact_id: ownerContactId,
        breed: breed || null,
        gender: gender || null,
        registration_number: registrationNumber || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Edit horse</h2>
          <p>{horse.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Horse name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <ContactPicker
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          label="Owner"
          organization={organization}
          role="owner"
          value={ownerContactId}
          onChange={setOwnerContactId}
          onCreateContact={onCreateContact}
        />
        <div className="form-grid">
          <label>
            Breed
            <input value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            Gender
            <select value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
              <option value="">Unset</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="G">G</option>
            </select>
          </label>
        </div>
        <label>
          Registration
          <input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
        </label>
        <FormActions busy={busy || !ownerContactId} onCancel={onCancel} />
      </form>
    </section>
  );
}

function ClassForm({
  organization,
  shows,
  onCreateClass,
}: {
  organization: Organization | null;
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedShowId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClass({
        organization_id: organization.id,
        show_id: selectedShowId,
        name,
        code,
        entry_fee: numericValue(entryFee),
      });
      setName("");
      setCode("");
      setEntryFee("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New class</h2>
          <p>{shows.length ? "Create classes for a show." : "Create a show first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Show
          <select disabled={!organization || !shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class name
          <input disabled={!organization || !shows.length} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input disabled={!organization || !shows.length} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            Entry fee
            <input disabled={!organization || !shows.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
        </div>
        <button className="primary-button" disabled={busy || !organization || !shows.length} type="submit">
          <Plus size={18} />
          Create class
        </button>
      </form>
    </section>
  );
}

function DivisionForm({
  classes,
  organization,
  shows,
  onCreateDivision,
}: {
  classes: ClassRecord[];
  organization: Organization | null;
  shows: Show[];
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
}) {
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(classes, classId) ?? null;
  const selectedShow = selectedClass ? findById(shows, selectedClass.show_id) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedClass) {
      return;
    }

    setBusy(true);

    try {
      await onCreateDivision({
        organization_id: organization.id,
        show_id: selectedClass.show_id,
        class_id: selectedClass.id,
        name,
        entry_fee: numericValue(entryFee),
      });
      setName("");
      setEntryFee("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New division</h2>
          <p>{selectedShow ? selectedShow.name : "Create a class first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Class
          <SearchSelect
            disabled={!organization || !classes.length}
            items={classes.map((classRecord) => ({ id: classRecord.id, label: classRecord.name, detail: showLabel(findById(shows, classRecord.show_id)) }))}
            placeholder="Search class"
            value={selectedClass?.id ?? ""}
            onChange={setClassId}
          />
        </label>
        <label>
          Division name
          <input disabled={!organization || !classes.length} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Fee override
          <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !classes.length} type="submit">
          <Plus size={18} />
          Create division
        </button>
      </form>
    </section>
  );
}

function ClassEditForm({
  classRecord,
  onCancel,
  onUpdateClass,
}: {
  classRecord: ClassRecord;
  onCancel: () => void;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(classRecord.name);
  const [code, setCode] = useState(classRecord.code ?? "");
  const [entryFee, setEntryFee] = useState(classRecord.entry_fee == null ? "" : String(classRecord.entry_fee));
  const [status, setStatus] = useState<ClassRecord["status"]>(classRecord.status);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateClass(classRecord.id, {
        name,
        code: code || null,
        entry_fee: numericValue(entryFee) ?? null,
        status,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Edit class</h2>
          <p>{classRecord.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Class name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            Entry fee
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
        </div>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as ClassRecord["status"])}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="running">Running</option>
            <option value="finished">Finished</option>
          </select>
        </label>
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </section>
  );
}

function DivisionEditForm({
  classes,
  division,
  onCancel,
  onUpdateDivision,
}: {
  classes: ClassRecord[];
  division: Division;
  onCancel: () => void;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
}) {
  const [classId, setClassId] = useState(division.class_id);
  const [name, setName] = useState(division.name);
  const [entryFee, setEntryFee] = useState(division.entry_fee == null ? "" : String(division.entry_fee));
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(classes, classId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClass) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateDivision(division.id, {
        class_id: selectedClass.id,
        show_id: selectedClass.show_id,
        name,
        entry_fee: numericValue(entryFee) ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Edit division</h2>
          <p>{division.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Class
          <SearchSelect
            items={classes.map((classRecord) => ({ id: classRecord.id, label: classRecord.name, detail: classRecord.code ?? "" }))}
            placeholder="Search class"
            value={classId}
            onChange={setClassId}
          />
        </label>
        <label>
          Division name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Fee override
          <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <FormActions busy={busy || !selectedClass} onCancel={onCancel} />
      </form>
    </section>
  );
}

function EntryForm({
  classes,
  contacts,
  contactRoles,
  divisions,
  horses,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  divisions: Division[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [horseId, setHorseId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [payerContactId, setPayerContactId] = useState("");
  const [riderContactId, setRiderContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const availableDivisions = selectedShowId ? divisions.filter((division) => division.show_id === selectedShowId) : divisions;
  const selectedHorse = findById(horses, horseId) ?? null;
  const selectedDivision = findById(availableDivisions, divisionId) ?? null;
  const selectedClass = selectedDivision ? findById(classes, selectedDivision.class_id) : null;
  const selectedPayerId = payerContactId || selectedHorse?.primary_owner_contact_id || contacts[0]?.id || "";
  const canCreate = Boolean(organization && profileId && selectedShowId && selectedHorse && selectedDivision && selectedPayerId);
  const baseFee = selectedDivision?.entry_fee ?? selectedClass?.entry_fee ?? undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !profileId || !selectedHorse || !selectedDivision || !selectedShowId || !selectedPayerId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateEntry({
        organization_id: organization.id,
        show_id: selectedShowId,
        horse_id: selectedHorse.id,
        division_id: selectedDivision.id,
        created_by_user_id: profileId,
        owner_contact_id: selectedHorse.primary_owner_contact_id,
        rider_contact_id: riderContactId || undefined,
        payer_contact_id: selectedPayerId,
        base_fee: baseFee,
      });
      setRiderContactId("");
      setPayerContactId("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New draft entry</h2>
          <p>{canCreate ? "Draft now, checkout later." : "Add a show, horse and division first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Show
          <select disabled={!shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horse
          <SearchSelect
            disabled={!horses.length}
            items={horses.map((horse) => ({ id: horse.id, label: horse.name, detail: contactLabel(findById(contacts, horse.primary_owner_contact_id)) }))}
            placeholder="Search horse"
            value={selectedHorse?.id ?? ""}
            onChange={setHorseId}
          />
        </label>
        <label>
          Division
          <SearchSelect
            disabled={!availableDivisions.length}
            items={availableDivisions.map((division) => ({ id: division.id, label: divisionLabel(division, classes), detail: "" }))}
            placeholder="Search division"
            value={selectedDivision?.id ?? ""}
            onChange={setDivisionId}
          />
        </label>
        <div className="form-grid">
          <ContactPicker
            allowEmpty
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            disabled={!organization}
            label="Rider"
            organization={organization}
            role="rider"
            value={riderContactId}
            onChange={setRiderContactId}
            onCreateContact={onCreateContact}
          />
          <ContactPicker
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            disabled={!organization}
            label="Payer"
            organization={organization}
            role="payer"
            value={selectedPayerId}
            onChange={setPayerContactId}
            onCreateContact={onCreateContact}
          />
        </div>
        <button className="primary-button" disabled={busy || !canCreate} type="submit">
          <Plus size={18} />
          Create draft entry
        </button>
      </form>
    </section>
  );
}

function EntryEditForm({
  classes,
  contacts,
  contactRoles,
  divisions,
  entry,
  horses,
  organization,
  profileId,
  onCancel,
  onCreateContact,
  onUpdateEntry,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entry: Entry;
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
}) {
  const [horseId, setHorseId] = useState(entry.horse_id);
  const [divisionId, setDivisionId] = useState(entry.division_id);
  const [riderContactId, setRiderContactId] = useState(entry.rider_contact_id ?? "");
  const [payerContactId, setPayerContactId] = useState(entry.payer_contact_id);
  const [status, setStatus] = useState<Entry["status"]>(entry.status);
  const [baseFee, setBaseFee] = useState(entry.base_fee == null ? "" : String(entry.base_fee));
  const [busy, setBusy] = useState(false);
  const selectedHorse = findById(horses, horseId);
  const selectedDivision = findById(divisions, divisionId);
  const selectedClass = selectedDivision ? findById(classes, selectedDivision.class_id) : null;
  const effectiveFee = numericValue(baseFee) ?? selectedDivision?.entry_fee ?? selectedClass?.entry_fee ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedHorse || !selectedDivision || !payerContactId) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateEntry(entry.id, {
        horse_id: selectedHorse.id,
        division_id: selectedDivision.id,
        owner_contact_id: selectedHorse.primary_owner_contact_id,
        rider_contact_id: riderContactId || null,
        payer_contact_id: payerContactId,
        status,
        base_fee: effectiveFee,
        total_fees: effectiveFee,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Edit entry</h2>
          <p>{horseLabel(selectedHorse)}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Horse
          <SearchSelect
            items={horses.map((horse) => ({ id: horse.id, label: horse.name, detail: contactLabel(findById(contacts, horse.primary_owner_contact_id)) }))}
            placeholder="Search horse"
            value={horseId}
            onChange={setHorseId}
          />
        </label>
        <label>
          Division
          <SearchSelect
            items={divisions.map((division) => ({ id: division.id, label: divisionLabel(division, classes), detail: "" }))}
            placeholder="Search division"
            value={divisionId}
            onChange={setDivisionId}
          />
        </label>
        <div className="form-grid">
          <ContactPicker
            allowEmpty
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            label="Rider"
            organization={organization}
            role="rider"
            value={riderContactId}
            onChange={setRiderContactId}
            onCreateContact={onCreateContact}
          />
          <ContactPicker
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            label="Payer"
            organization={organization}
            role="payer"
            value={payerContactId}
            onChange={setPayerContactId}
            onCreateContact={onCreateContact}
          />
        </div>
        <div className="form-grid">
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as Entry["status"])}>
              <option value="draft">Draft</option>
              <option value="pending_checkout">Pending checkout</option>
              <option value="active">Active</option>
              <option value="scratched_pending_refund">Scratch pending refund</option>
              <option value="scratched">Scratched</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            Base fee
            <input min="0" step="0.01" type="number" value={baseFee} onChange={(event) => setBaseFee(event.target.value)} />
          </label>
        </div>
        <FormActions busy={busy || !selectedHorse || !selectedDivision || !payerContactId} onCancel={onCancel} />
      </form>
    </section>
  );
}
