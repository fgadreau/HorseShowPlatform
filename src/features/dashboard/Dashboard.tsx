import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Tent,
  Trophy,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { ContactPicker, EmptyState, FormActions, LanguageToggle, Metric, NoticeBanner, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, divisionLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import type { Locale, Translation } from "../../lib/i18n";
import { associationNavigation, associationViewKeys, personalNavigation } from "../navigation";
import { MyStallsView, StallsView } from "./StallsViews";
import { buildShowScoreRunsForClass } from "../../services/showScoreAdapters";
import {
  createClass,
  createClassTemplate,
  createClassTemplateDivision,
  createContact,
  createDivision,
  createEntry,
  createHorse,
  createOrganization,
  createShow,
  createStallBooking,
  createStallOption,
  deleteEntry,
  deleteContact,
  deleteHorse,
  deleteStallBooking,
  setOrganizationExternalMembershipRequirement,
  slugify,
  updateClass,
  updateClassTemplate,
  updateClassTemplateDivision,
  updateContact,
  updateDivision,
  updateEntry,
  updateHorse,
  updateShow,
  updateStallBooking,
  updateStallOption,
  type AppContext,
} from "../../services/supabaseServices";
import type {
  BackNumberPolicy,
  ClassRecord,
  ClassTemplate,
  ClassTemplateDivision,
  Contact,
  ContactExternalMembership,
  ContactRole,
  Division,
  EligibilityRules,
  Entry,
  ExternalOrganization,
  Horse,
  HorseContact,
  HorseExternalMembership,
  Invoice,
  InvoiceLineItem,
  Organization,
  OrganizationExternalMembershipRequirement,
  SanctioningBody,
  Show,
  ShowDay,
  ShowScoreClassSetup,
  StallOption,
} from "../../types/domain";
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
  onCreateClassTemplate,
  onCreateClassTemplateDivision,
  onCreateContact,
  onCreateDivision,
  onCreateEntry,
  onCreateHorse,
  onCreateOrganization,
  onCreateShow,
  onCreateStallBooking,
  onCreateStallOption,
  onDeleteEntry,
  onDeleteContact,
  onDeleteHorse,
  onDeleteStallBooking,
  onLocaleChange,
  onPrepareShowScoreClass,
  onRefresh,
  onSignOut,
  onSetExternalMembershipRequirement,
  onUpdateClass,
  onUpdateClassTemplate,
  onUpdateClassTemplateDivision,
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
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<Show>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onDeleteStallBooking: (id: Parameters<typeof deleteStallBooking>[0]) => Promise<void>;
  onLocaleChange: (locale: Locale) => void;
  onPrepareShowScoreClass: (classRecord: ClassRecord) => Promise<void>;
  onRefresh: () => void;
  onSignOut: () => void;
  onSetExternalMembershipRequirement: (input: Parameters<typeof setOrganizationExternalMembershipRequirement>[0]) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
  onUpdateClassTemplateDivision: (id: string, input: Parameters<typeof updateClassTemplateDivision>[1]) => Promise<void>;
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
  const contactOrganizationLinks = context?.contactOrganizationLinks ?? [];
  const contactRoles = context?.contactRoles ?? [];
  const externalOrganizations = context?.externalOrganizations ?? [];
  const organizationExternalMembershipRequirements = context?.organizationExternalMembershipRequirements ?? [];
  const contactExternalMemberships = context?.contactExternalMemberships ?? [];
  const horseExternalMemberships = context?.horseExternalMemberships ?? [];
  const horses = context?.horses ?? [];
  const horseOrganizationLinks = context?.horseOrganizationLinks ?? [];
  const classes = context?.classes ?? [];
  const classTemplates = context?.classTemplates ?? [];
  const classTemplateDivisions = context?.classTemplateDivisions ?? [];
  const divisions = context?.divisions ?? [];
  const sanctioningBodies = context?.sanctioningBodies ?? [];
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
  const selectedOrganizationContactIds = selectedOrganization
    ? new Set(
        contactOrganizationLinks
          .filter((link) => link.organization_id === selectedOrganization.id)
          .map((link) => link.contact_id)
          .concat(contacts.filter((contact) => contact.organization_id === selectedOrganization.id).map((contact) => contact.id)),
      )
    : new Set<string>();
  const selectedOrganizationHorseIds = selectedOrganization
    ? new Set(
        horseOrganizationLinks
          .filter((link) => link.organization_id === selectedOrganization.id)
          .map((link) => link.horse_id)
          .concat(horses.filter((horse) => horse.organization_id === selectedOrganization.id).map((horse) => horse.id)),
      )
    : new Set<string>();
  const selectedOrganizationContacts = selectedOrganization
    ? sortRecordsForOrganization(contacts, selectedOrganizationContactIds)
    : [];
  const selectedOrganizationContactRoles = selectedOrganization
    ? contactRoles.filter((role) => role.organization_id === selectedOrganization.id || selectedOrganizationContactIds.has(role.contact_id))
    : [];
  const selectedOrganizationMembershipRequirements = selectedOrganization
    ? organizationExternalMembershipRequirements.filter((requirement) => requirement.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationHorses = selectedOrganization
    ? sortRecordsForOrganization(horses, selectedOrganizationHorseIds)
    : [];
  const selectedOrganizationHorseContacts = selectedOrganization
    ? context?.horseContacts.filter((horseContact) => horseContact.organization_id === selectedOrganization.id || selectedOrganizationHorseIds.has(horseContact.horse_id)) ?? []
    : [];
  const selectedOrganizationClasses = selectedOrganization
    ? classes.filter((classRecord) => classRecord.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationClassTemplates = selectedOrganization
    ? classTemplates.filter((template) => template.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationClassTemplateDivisions = selectedOrganization
    ? classTemplateDivisions.filter((division) => division.organization_id === selectedOrganization.id)
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
  const personalHorseIdsFromContacts = new Set(
    selectedOrganizationHorseContacts
      .filter((horseContact) => personalContactIds.has(horseContact.contact_id) && (horseContact.role === "owner" || horseContact.role === "co-owner" || horseContact.role === "agent"))
      .map((horseContact) => horseContact.horse_id),
  );
  const personalHorses = selectedOrganizationHorses.filter((horse) => personalContactIds.has(horse.primary_owner_contact_id) || personalHorseIdsFromContacts.has(horse.id));
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
          <ShowsView
            classes={selectedOrganizationClasses}
            divisions={selectedOrganizationDivisions}
            entries={selectedOrganizationEntries}
            invoices={selectedOrganizationInvoices}
            organization={selectedOrganization}
            showDays={selectedOrganizationShowDays}
            showScoreClassSetups={selectedOrganizationShowScoreSetups}
            shows={selectedOrganizationShows}
            stallOptions={selectedOrganizationStallOptions}
            onCreateShow={onCreateShow}
            onUpdateShow={onUpdateShow}
            onViewChange={onViewChange}
          />
        ) : null}

        {effectiveView === "people" ? (
          <PeopleView
            contacts={selectedOrganizationContacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={selectedOrganizationContactRoles}
            createdByUserId={context?.profile.id ?? ""}
            externalOrganizations={externalOrganizations}
            horseExternalMemberships={horseExternalMemberships}
            horses={selectedOrganizationHorses}
            horseContacts={selectedOrganizationHorseContacts}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organization={selectedOrganization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onDeleteContact={onDeleteContact}
            onDeleteHorse={onDeleteHorse}
            onUpdateContact={onUpdateContact}
            onUpdateHorse={onUpdateHorse}
          />
        ) : null}

        {effectiveView === "classes" ? (
          <ClassesView
            classes={selectedOrganizationClasses}
            classTemplateDivisions={selectedOrganizationClassTemplateDivisions}
            classTemplates={selectedOrganizationClassTemplates}
            divisions={selectedOrganizationDivisions}
            organization={selectedOrganization}
            sanctioningBodies={sanctioningBodies}
            showDays={selectedOrganizationShowDays}
            shows={selectedOrganizationShows}
            onCreateClass={onCreateClass}
            onCreateClassTemplate={onCreateClassTemplate}
            onCreateClassTemplateDivision={onCreateClassTemplateDivision}
            onCreateDivision={onCreateDivision}
            onUpdateClass={onUpdateClass}
            onUpdateClassTemplate={onUpdateClassTemplate}
            onUpdateClassTemplateDivision={onUpdateClassTemplateDivision}
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
            onDeleteEntry={onDeleteEntry}
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
            onDeleteStallBooking={onDeleteStallBooking}
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
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            externalOrganizations={externalOrganizations}
            horses={personalHorses}
            horseExternalMemberships={horseExternalMemberships}
            horseContacts={selectedOrganizationHorseContacts}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onDeleteHorse={onDeleteHorse}
            onUpdateHorse={onUpdateHorse}
          />
        ) : null}

        {effectiveView === "my-riders" ? (
          <MyContactsView
            contacts={personalContacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={selectedOrganizationContactRoles}
            externalOrganizations={externalOrganizations}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onCreateContact={onCreateContact}
            onDeleteContact={onDeleteContact}
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
            onDeleteEntry={onDeleteEntry}
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
            onDeleteStallBooking={onDeleteStallBooking}
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

        {effectiveView === "settings" ? (
          <SettingsView
            context={context}
            externalOrganizations={externalOrganizations}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organization={selectedOrganization}
            onSetExternalMembershipRequirement={onSetExternalMembershipRequirement}
          />
        ) : null}
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

function sortRecordsForOrganization<T extends { id: string }>(records: T[], organizationRecordIds: Set<string>) {
  return [...records].sort((a, b) => {
    const aLocal = organizationRecordIds.has(a.id);
    const bLocal = organizationRecordIds.has(b.id);

    if (aLocal === bLocal) {
      return 0;
    }

    return aLocal ? -1 : 1;
  });
}

function buildExternalMembershipFields(
  contactType: Contact["type"],
  externalOrganizations: ExternalOrganization[],
  requirements: OrganizationExternalMembershipRequirement[],
  existingMemberships: ContactExternalMembership[] = [],
) {
  const requiredOrganizationIds = new Set(
    requirements
      .filter((requirement) => requirement.is_required && requirement.contact_type === contactType)
      .map((requirement) => requirement.external_organization_id),
  );
  const existingOrganizationIds = new Set(existingMemberships.map((membership) => membership.external_organization_id));
  const visibleOrganizations = [...externalOrganizations].sort((a, b) => {
    const aPinned = requiredOrganizationIds.has(a.id) || existingOrganizationIds.has(a.id);
    const bPinned = requiredOrganizationIds.has(b.id) || existingOrganizationIds.has(b.id);

    if (aPinned === bPinned) {
      return a.name.localeCompare(b.name);
    }

    return aPinned ? -1 : 1;
  });

  return visibleOrganizations.map((organization) => ({
    organization,
    required: requiredOrganizationIds.has(organization.id),
  }));
}

function horseReferenceTypeForOrganization(organization: ExternalOrganization): HorseExternalMembership["reference_type"] {
  return organization.code.toUpperCase() === "NRHA" ? "competition_license" : "registration";
}

function horseExternalReferenceLabel(organization: ExternalOrganization) {
  return organization.code.toUpperCase() === "NRHA" ? "NRHA Competition licence #" : `${organization.code} #`;
}

function buildHorseExternalMembershipFields(externalOrganizations: ExternalOrganization[], existingMemberships: HorseExternalMembership[] = []) {
  const existingOrganizationIds = new Set(existingMemberships.map((membership) => membership.external_organization_id));

  return [...externalOrganizations].sort((a, b) => {
    const aPinned = existingOrganizationIds.has(a.id);
    const bPinned = existingOrganizationIds.has(b.id);

    if (aPinned === bPinned) {
      return a.name.localeCompare(b.name);
    }

    return aPinned ? -1 : 1;
  });
}

function horseExternalReferenceSummary(horse: Horse, memberships: HorseExternalMembership[], externalOrganizations: ExternalOrganization[]) {
  const references = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .map((membership) => {
      const organization = externalOrganizations.find((externalOrganization) => externalOrganization.id === membership.external_organization_id);
      return `${organization?.code ?? "Ext."} ${membership.reference_number}`;
    });

  return references.length ? references.join(" · ") : "Aucune référence externe";
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
  classes,
  divisions,
  entries,
  invoices,
  organization,
  showDays,
  showScoreClassSetups,
  shows,
  stallOptions,
  onCreateShow,
  onUpdateShow,
  onViewChange,
}: {
  classes: ClassRecord[];
  divisions: Division[];
  entries: Entry[];
  invoices: Invoice[];
  organization: Organization | null;
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  shows: Show[];
  stallOptions: StallOption[];
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<Show>;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [assistantShow, setAssistantShow] = useState<Show | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  function openAssistant(show: Show | null = null) {
    setAssistantShow(show);
    setAssistantOpen(true);
  }

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

      <section className="panel show-command-panel">
        <div className="panel-header">
          <div>
            <h2>Créer un show</h2>
            <p>{organization ? "Démarre un brouillon, puis complète la préparation quand tu veux." : "Create an organization first."}</p>
          </div>
        </div>
        <button className="primary-button" disabled={!organization} type="button" onClick={() => openAssistant()}>
          <Plus size={18} />
          Créer un show
        </button>
      </section>

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
        <div className="table shows-table">
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
              <div>
                <span className={`badge ${show.status}`}>{show.status}</span>
                <span className="muted-line">{showPaymentSummary(show)}</span>
              </div>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => openAssistant(show)}>
                  {show.status === "draft" ? "Continuer" : "Checklist"}
                </button>
                <button className="text-button" type="button" onClick={() => setEditingShow(show)}>
                  Edit
                </button>
              </div>
            </div>
          ))}
          {!shows.length ? <EmptyState label="Create the first show for this organization." /> : null}
        </div>
      </section>

      {assistantOpen ? (
        <ShowAssistant
          classes={classes}
          divisions={divisions}
          entries={entries}
          initialShow={assistantShow}
          invoices={invoices}
          organization={organization}
          showDays={showDays}
          showScoreClassSetups={showScoreClassSetups}
          stallOptions={stallOptions}
          onClose={() => setAssistantOpen(false)}
          onCreateShow={onCreateShow}
          onUpdateShow={onUpdateShow}
          onViewChange={(view) => {
            setAssistantOpen(false);
            onViewChange(view);
          }}
        />
      ) : null}
    </div>
  );
}

function PeopleView({
  contacts,
  contactExternalMemberships,
  contactRoles,
  createdByUserId,
  externalOrganizations,
  horseExternalMemberships,
  horses,
  horseContacts,
  membershipRequirements,
  organization,
  onCreateContact,
  onCreateHorse,
  onDeleteContact,
  onDeleteHorse,
  onUpdateContact,
  onUpdateHorse,
}: {
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  createdByUserId: string;
  externalOrganizations: ExternalOrganization[];
  horseExternalMemberships: HorseExternalMembership[];
  horses: Horse[];
  horseContacts: HorseContact[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
}) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);

  async function handleDeleteHorse(horse: Horse) {
    if (!window.confirm(`Supprimer ${horse.name} et les inscriptions/reservations liees?`)) {
      return;
    }

    await onDeleteHorse(horse.id);
    if (editingHorse?.id === horse.id) {
      setEditingHorse(null);
    }
  }

  async function handleDeleteContact(contact: Contact) {
    const label = contactLabel(contact);

    if (!window.confirm(`Supprimer ${label}? Si ce contact est utilise comme cavalier dans une inscription de test, il sera detache de l'inscription.`)) {
      return;
    }

    await onDeleteContact(contact.id);
    if (editingContact?.id === contact.id) {
      setEditingContact(null);
    }
  }

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

      <ContactForm
        externalOrganizations={externalOrganizations}
        membershipRequirements={membershipRequirements}
        organization={organization}
        onCreateContact={onCreateContact}
      />
      <HorseForm
        contacts={contacts}
        contactRoles={contactRoles}
        createdByUserId={createdByUserId}
        externalOrganizations={externalOrganizations}
        organization={organization}
        onCreateContact={onCreateContact}
        onCreateHorse={onCreateHorse}
      />

      {editingContact ? (
        <ContactEditForm
          contact={editingContact}
          contactExternalMemberships={contactExternalMemberships}
          externalOrganizations={externalOrganizations}
          membershipRequirements={membershipRequirements}
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
          createdByUserId={createdByUserId}
          externalOrganizations={externalOrganizations}
          horseExternalMemberships={horseExternalMemberships}
          horseContacts={horseContacts}
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
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                  Edit
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteContact(contact)}>
                  Supprimer
                </button>
              </div>
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
              <strong>
                {horse.name}
                <span className="muted-line">{horseExternalReferenceSummary(horse, horseExternalMemberships, externalOrganizations)}</span>
              </strong>
              <span>{contactLabel(findById(contacts, horse.primary_owner_contact_id))}</span>
              <span>{horse.gender || "Unset"}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                  Edit
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteHorse(horse)}>
                  Supprimer
                </button>
              </div>
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
  classTemplateDivisions,
  classTemplates,
  divisions,
  organization,
  sanctioningBodies,
  showDays,
  shows,
  onCreateClass,
  onCreateClassTemplate,
  onCreateClassTemplateDivision,
  onCreateDivision,
  onUpdateClass,
  onUpdateClassTemplate,
  onUpdateClassTemplateDivision,
  onUpdateDivision,
}: {
  classes: ClassRecord[];
  classTemplateDivisions: ClassTemplateDivision[];
  classTemplates: ClassTemplate[];
  divisions: Division[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
  onUpdateClassTemplateDivision: (id: string, input: Parameters<typeof updateClassTemplateDivision>[1]) => Promise<void>;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
}) {
  const [editingClassTemplate, setEditingClassTemplate] = useState<ClassTemplate | null>(null);
  const [editingClassTemplateDivision, setEditingClassTemplateDivision] = useState<ClassTemplateDivision | null>(null);
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
          { label: "Presets", value: String(classTemplates.length) },
        ]}
      />

      <ClassTemplateForm organization={organization} sanctioningBodies={sanctioningBodies} onCreateClassTemplate={onCreateClassTemplate} />
      <ClassTemplateDivisionForm
        classTemplates={classTemplates}
        organization={organization}
        sanctioningBodies={sanctioningBodies}
        onCreateClassTemplateDivision={onCreateClassTemplateDivision}
      />
      <ClassForm
        classTemplateDivisions={classTemplateDivisions}
        classTemplates={classTemplates}
        organization={organization}
        sanctioningBodies={sanctioningBodies}
        showDays={showDays}
        shows={shows}
        onCreateClass={onCreateClass}
        onCreateDivision={onCreateDivision}
      />
      <DivisionForm classes={classes} organization={organization} sanctioningBodies={sanctioningBodies} shows={shows} onCreateDivision={onCreateDivision} />

      {editingClassTemplate ? (
        <ClassTemplateEditForm
          classTemplate={editingClassTemplate}
          sanctioningBodies={sanctioningBodies}
          onCancel={() => setEditingClassTemplate(null)}
          onUpdateClassTemplate={async (id, input) => {
            await onUpdateClassTemplate(id, input);
            setEditingClassTemplate(null);
          }}
        />
      ) : null}

      {editingClassTemplateDivision ? (
        <ClassTemplateDivisionEditForm
          classTemplates={classTemplates}
          classTemplateDivision={editingClassTemplateDivision}
          sanctioningBodies={sanctioningBodies}
          onCancel={() => setEditingClassTemplateDivision(null)}
          onUpdateClassTemplateDivision={async (id, input) => {
            await onUpdateClassTemplateDivision(id, input);
            setEditingClassTemplateDivision(null);
          }}
        />
      ) : null}

      {editingClass ? (
        <ClassEditForm
          classRecord={editingClass}
          sanctioningBodies={sanctioningBodies}
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
          sanctioningBodies={sanctioningBodies}
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
            <h2>Presets réguliers</h2>
            <p>{classTemplates.length ? `${classTemplates.length} preset${classTemplates.length === 1 ? "" : "s"} configuré${classTemplates.length === 1 ? "" : "s"}.` : "Le catalogue de classes récurrentes de l'association."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Preset</span>
            <span>Sanctions</span>
            <span>Dossard</span>
            <span>Divisions</span>
          </div>
          {classTemplates.map((template) => {
            const templateDivisions = classTemplateDivisions.filter((division) => division.class_template_id === template.id);
            return (
              <div className="table-row" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <span className="muted-line">{[template.block_label, template.default_pattern ? `Pattern ${template.default_pattern}` : null].filter(Boolean).join(" - ") || template.code || "Preset"}</span>
                  <button className="text-button inline-action" type="button" onClick={() => setEditingClassTemplate(template)}>
                    Edit
                  </button>
                </div>
                <span>{sanctionLabel(template.sanctioning_body_codes, sanctioningBodies)}</span>
                <span>{backNumberPolicyLabel(template.back_number_policy)}</span>
                <span>
                  {templateDivisions.length
                    ? templateDivisions
                        .map((division) =>
                          [
                            division.name,
                            division.default_entry_fee == null ? null : `insc. ${formatCurrency(division.default_entry_fee, organization?.currency ?? "CAD")}`,
                            division.default_judge_fee == null ? null : `juge ${formatCurrency(division.default_judge_fee, organization?.currency ?? "CAD")}`,
                          ]
                            .filter(Boolean)
                            .join(" "),
                        )
                        .join(", ")
                    : "Aucune division"}
                </span>
              </div>
            );
          })}
          {!classTemplates.length ? <EmptyState label="Crée le premier preset régulier de cette association." /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Divisions de presets</h2>
            <p>{classTemplateDivisions.length ? `${classTemplateDivisions.length} division${classTemplateDivisions.length === 1 ? "" : "s"} de preset.` : "Ajoute les divisions régulières sous un preset."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Division</span>
            <span>Preset</span>
            <span>Frais</span>
            <span>Action</span>
          </div>
          {classTemplateDivisions.map((division) => (
            <div className="table-row" key={division.id}>
              <div>
                <strong>{division.name}</strong>
                <span className="muted-line">{division.code ? `#${division.code}` : "Sans code"}</span>
              </div>
              <span>{findById(classTemplates, division.class_template_id)?.name ?? "Preset inconnu"}</span>
              <span>
                {[
                  division.default_entry_fee == null ? null : `Insc. ${formatCurrency(division.default_entry_fee, organization?.currency ?? "CAD")}`,
                  division.default_judge_fee == null ? null : `Juge ${formatCurrency(division.default_judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - ") || "Aucun frais"}
              </span>
              <button className="text-button" type="button" onClick={() => setEditingClassTemplateDivision(division)}>
                Edit
              </button>
            </div>
          ))}
          {!classTemplateDivisions.length ? <EmptyState label="Aucune division de preset pour l'instant." /> : null}
        </div>
      </section>

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
            <span>Programme</span>
            <span>Action</span>
          </div>
          {classes.map((classRecord) => {
            const classDivisions = divisions.filter((division) => division.class_id === classRecord.id);
            return (
              <div className="table-row" key={classRecord.id}>
                <div>
                  <strong>{classRecord.name}</strong>
                  <span className="muted-line">
                    {classDivisions.length ? `${classDivisions.length} division${classDivisions.length === 1 ? "" : "s"}` : "No divisions"}
                    {classRecord.entry_fee == null ? "" : ` - ${formatCurrency(classRecord.entry_fee, organization?.currency ?? "CAD")}`}
                  </span>
                </div>
                <div>
                  <span>{showLabel(findById(shows, classRecord.show_id))}</span>
                  <span className="muted-line">
                    {classRecord.show_day_id && findById(showDays, classRecord.show_day_id) ? showDayLabel(findById(showDays, classRecord.show_day_id) as ShowDay) : "Aucune journée"}
                  </span>
                </div>
                <div>
                  <span>{sanctionLabel(classRecord.sanctioning_body_codes, sanctioningBodies)}</span>
                  <span className="muted-line">
                    {[
                      classRecord.pattern ? `Pattern ${classRecord.pattern}` : null,
                      isNrhaSanctioned(classRecord.sanctioning_body_codes) ? `NRHA slate ${classRecord.nrha_slate_number || "not set"}` : null,
                      backNumberPolicyLabel(classRecord.back_number_policy),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
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
            <span>Sanctions</span>
            <span>Action</span>
          </div>
          {divisions.map((division) => (
            <div className="table-row" key={division.id}>
              <div>
                <strong>{division.name}</strong>
                <span className="muted-line">
                  {[
                    division.code ? `#${division.code}` : null,
                    division.entry_fee == null ? "Frais classe" : `Inscription ${formatCurrency(division.entry_fee, organization?.currency ?? "CAD")}`,
                    division.judge_fee == null ? null : `Juge ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </span>
              </div>
              <span>{findById(classes, division.class_id)?.name ?? "Unknown class"}</span>
              <span>{sanctionLabel(division.sanctioning_body_codes, sanctioningBodies)}</span>
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
  onDeleteEntry,
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
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
}) {
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  async function handleDeleteEntry(entry: Entry) {
    const horseName = horseLabel(findById(horses, entry.horse_id));
    if (!window.confirm(`Supprimer l'inscription de ${horseName}?`)) {
      return;
    }

    await onDeleteEntry(entry.id);
    if (editingEntry?.id === entry.id) {
      setEditingEntry(null);
    }
  }

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
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingEntry(entry)}>
                  Edit
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteEntry(entry)}>
                  Supprimer
                </button>
              </div>
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
  externalOrganizations,
  horses,
  horseExternalMemberships,
  horseContacts,
  organization,
  profileId,
  onCreateContact,
  onCreateHorse,
  onDeleteHorse,
  onUpdateHorse,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  externalOrganizations: ExternalOrganization[];
  horses: Horse[];
  horseExternalMemberships: HorseExternalMembership[];
  horseContacts: HorseContact[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
}) {
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);

  async function handleDeleteHorse(horse: Horse) {
    if (!window.confirm(`Supprimer ${horse.name} et les inscriptions/reservations liees?`)) {
      return;
    }

    await onDeleteHorse(horse.id);
    if (editingHorse?.id === horse.id) {
      setEditingHorse(null);
    }
  }

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
        externalOrganizations={externalOrganizations}
        organization={organization}
        onCreateContact={onCreateContact}
        onCreateHorse={onCreateHorse}
      />

      {editingHorse ? (
        <HorseEditForm
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={profileId}
          externalOrganizations={externalOrganizations}
          horseExternalMemberships={horseExternalMemberships}
          horseContacts={horseContacts}
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
              <strong>
                {horse.name}
                <span className="muted-line">{horseExternalReferenceSummary(horse, horseExternalMemberships, externalOrganizations)}</span>
              </strong>
              <span>{contactLabel(findById(contacts, horse.primary_owner_contact_id))}</span>
              <span>{horse.gender || "Unset"}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                  Edit
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteHorse(horse)}>
                  Supprimer
                </button>
              </div>
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
  contactExternalMemberships,
  contactRoles,
  externalOrganizations,
  membershipRequirements,
  organization,
  profileId,
  onCreateContact,
  onDeleteContact,
  onUpdateContact,
}: {
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const canCreateLinkedContact = Boolean(organization && profileId);
  const defaultContactType: Contact["type"] = contacts.length ? "rider" : "owner";

  async function handleDeleteContact(contact: Contact) {
    const label = contactLabel(contact);

    if (!window.confirm(`Supprimer ${label}? Si ce contact est utilise comme cavalier dans une inscription de test, il sera detache de l'inscription.`)) {
      return;
    }

    await onDeleteContact(contact.id);
    if (editingContact?.id === contact.id) {
      setEditingContact(null);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Mon espace"
        title="Mes cavaliers et contacts"
        description="Gere les propriétaires, cavaliers et payeurs liés à ton compte."
        stats={[
          { label: "Contacts", value: String(contacts.length) },
          { label: "Cavaliers", value: String(contacts.filter((contact) => contact.type === "rider").length) },
        ]}
      />

      {canCreateLinkedContact ? (
        <ContactForm
          key={defaultContactType}
          createdByUserId={profileId}
          defaultType={defaultContactType}
          linkedUserId={profileId}
          externalOrganizations={externalOrganizations}
          membershipRequirements={membershipRequirements}
          organization={organization}
          title={contacts.length ? "Ajouter un cavalier / contact" : "Créer mon premier contact"}
          description={contacts.length ? "Ajoute autant de cavaliers ou contacts que nécessaire sous ce compte." : "Crée d'abord le contact principal du compte."}
          onCreateContact={onCreateContact}
        />
      ) : null}

      {editingContact ? (
        <ContactEditForm
          contact={editingContact}
          contactExternalMemberships={contactExternalMemberships}
          externalOrganizations={externalOrganizations}
          membershipRequirements={membershipRequirements}
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
            <p>Contacts liés à mon compte.</p>
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
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                  Edit
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteContact(contact)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
          {!contacts.length ? <EmptyState label="Crée ton premier contact pour commencer." /> : null}
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
  onDeleteEntry,
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
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
}) {
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  async function handleDeleteEntry(entry: Entry) {
    const horseName = horseLabel(findById(horses, entry.horse_id));
    if (!window.confirm(`Supprimer l'inscription de ${horseName}?`)) {
      return;
    }

    await onDeleteEntry(entry.id);
    if (editingEntry?.id === entry.id) {
      setEditingEntry(null);
    }
  }

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
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingEntry(entry)}>
                  Edit
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteEntry(entry)}>
                  Supprimer
                </button>
              </div>
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
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const selectedInvoice = findById(invoices, selectedInvoiceId) ?? null;
  const selectedInvoiceLineItems = selectedInvoice ? lineItems.filter((item) => item.invoice_id === selectedInvoice.id) : [];

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
        <Metric label="Factures" value={String(invoices.length)} />
        <Metric label="Solde ouvert" value={formatCurrency(unpaidBalance, currency)} />
        <Metric label="Payees" value={String(invoices.filter((invoice) => invoice.status === "paid").length)} />
      </section>

      {selectedInvoice ? (
        <InvoiceDetailPanel
          currency={currency}
          invoice={selectedInvoice}
          lineItems={selectedInvoiceLineItems}
          onClose={() => setSelectedInvoiceId("")}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Factures recentes</h2>
            <p>Brouillons, factures envoyees, paiements partiels et factures payees.</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Facture</span>
            <span>Statut</span>
            <span>Total</span>
            <span>Balance</span>
          </div>
          {invoices.map((invoice) => {
            const invoiceLineItems = lineItems.filter((item) => item.invoice_id === invoice.id);
            return (
              <div className="invoice-group" key={invoice.id}>
                <div className={`table-row invoice-summary-row ${selectedInvoiceId === invoice.id ? "selected" : ""}`}>
                  <button className="invoice-number-button" type="button" onClick={() => setSelectedInvoiceId(invoice.id)}>
                    <FileText size={16} />
                    <strong>{invoice.invoice_number}</strong>
                  </button>
                  <span className={`badge ${invoice.status}`}>{invoice.status.replace("_", " ")}</span>
                  <span>{formatCurrency(invoice.total_amount, currency)}</span>
                  <span>{formatCurrency(invoice.balance_due, currency)}</span>
                </div>
                {invoiceLineItems.map((item) => (
                  <div className="table-row invoice-line-row" key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <span className="muted-line">{invoiceItemTypeLabel(item.item_type)}</span>
                    </div>
                    <span>{invoiceQuantityLabel(item.quantity)} x</span>
                    <span>{formatCurrency(item.unit_price, currency)}</span>
                    <span>{formatCurrency(item.total_price + item.tax_amount, currency)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {!invoices.length ? <EmptyState label="Aucune facture pour l'instant. Les inscriptions et reservations creeront maintenant des brouillons de facture." /> : null}
        </div>
      </section>
    </div>
  );
}

function InvoiceDetailPanel({
  currency,
  invoice,
  lineItems,
  onClose,
}: {
  currency: string;
  invoice: AppContext["invoices"][number];
  lineItems: AppContext["invoiceLineItems"];
  onClose: () => void;
}) {
  return (
    <section className="panel span-2 invoice-detail-panel">
      <div className="panel-header">
        <div>
          <h2>{invoice.invoice_number}</h2>
          <p>
            {invoice.status.replace("_", " ")} · Émise le {formatDate(invoice.issue_date)}
            {invoice.due_date ? ` · Due ${formatDate(invoice.due_date)}` : ""}
          </p>
        </div>
        <button className="icon-button" type="button" aria-label="Fermer la facture" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="invoice-detail-totals">
        <Metric label="Sous-total" value={formatCurrency(invoice.subtotal, currency)} />
        <Metric label="Taxes" value={formatCurrency(invoice.tax_amount, currency)} />
        <Metric label="Total" value={formatCurrency(invoice.total_amount, currency)} />
        <Metric label="Balance" value={formatCurrency(invoice.balance_due, currency)} />
      </div>
      <div className="table invoice-detail-table">
        <div className="table-row table-head invoice-detail-row">
          <span>Description</span>
          <span>Qté</span>
          <span>Prix</span>
          <span>Total</span>
        </div>
        {lineItems.map((item) => (
          <div className="table-row invoice-detail-row" key={item.id}>
            <div>
              <strong>{item.description}</strong>
              <span className="muted-line">{invoiceItemTypeLabel(item.item_type)}</span>
            </div>
            <span>{invoiceQuantityLabel(item.quantity)} x</span>
            <span>{formatCurrency(item.unit_price, currency)}</span>
            <span>{formatCurrency(item.total_price + item.tax_amount, currency)}</span>
          </div>
        ))}
        {!lineItems.length ? <EmptyState label="Aucune ligne sur cette facture." /> : null}
      </div>
    </section>
  );
}

function SettingsView({
  context,
  externalOrganizations,
  membershipRequirements,
  organization,
  onSetExternalMembershipRequirement,
}: {
  context: AppContext | null;
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  onSetExternalMembershipRequirement: (input: Parameters<typeof setOrganizationExternalMembershipRequirement>[0]) => Promise<void>;
}) {
  const [busyRequirementId, setBusyRequirementId] = useState("");
  const riderRequirementIds = new Set(
    membershipRequirements
      .filter((requirement) => requirement.contact_type === "rider" && requirement.is_required)
      .map((requirement) => requirement.external_organization_id),
  );

  async function handleRequirementToggle(externalOrganizationId: string, isRequired: boolean) {
    if (!organization) {
      return;
    }

    setBusyRequirementId(externalOrganizationId);

    try {
      await onSetExternalMembershipRequirement({
        organization_id: organization.id,
        external_organization_id: externalOrganizationId,
        contact_type: "rider",
        is_required: isRequired,
      });
    } finally {
      setBusyRequirementId("");
    }
  }

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

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Numéros externes obligatoires</h2>
            <p>Exigences appliquées aux fiches cavalier de cette association.</p>
          </div>
        </div>
        <div className="requirement-list">
          {externalOrganizations.map((externalOrganization) => {
            const checked = riderRequirementIds.has(externalOrganization.id);
            return (
              <label className="requirement-row" key={externalOrganization.id}>
                <input
                  checked={checked}
                  disabled={!organization || busyRequirementId === externalOrganization.id}
                  type="checkbox"
                  onChange={(event) => void handleRequirementToggle(externalOrganization.id, event.target.checked)}
                />
                <span>
                  <strong>{externalOrganization.code}</strong>
                  {externalOrganization.name}
                </span>
                <small>{externalOrganization.verification_enabled ? "Validation externe prête" : "Validation manuelle"}</small>
              </label>
            );
          })}
          {!externalOrganizations.length ? <EmptyState label="Aucune organisation externe configuree." /> : null}
        </div>
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

type ShowAssistantStep = "essentials" | "payments" | "readiness";

type ShowReadinessItem = {
  actionLabel?: string;
  detail: string;
  done: boolean;
  key: string;
  title: string;
  view?: ViewKey;
};

function ShowAssistant({
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
            <p className="eyebrow">Assistant</p>
            <h2 id="show-assistant-title">{activeShow ? activeShow.name : "Nouveau show"}</h2>
            <p>{activeShow ? `${formatDate(activeShow.start_date)} - ${formatDate(activeShow.end_date)}` : organization?.name ?? "Create an organization first."}</p>
          </div>
          <button className="icon-button" title="Fermer" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="assistant-stepper">
          <button className={step === "essentials" ? "active" : ""} type="button" onClick={() => setStep("essentials")}>
            <CalendarDays size={16} />
            Essentiel
          </button>
          <button className={step === "payments" ? "active" : ""} disabled={!activeShow} type="button" onClick={() => setStep("payments")}>
            <CircleDollarSign size={16} />
            Paiements
          </button>
          <button className={step === "readiness" ? "active" : ""} disabled={!activeShow} type="button" onClick={() => setStep("readiness")}>
            <ClipboardList size={16} />
            Checklist
          </button>
        </div>

        {activeShow ? (
          <div className="assistant-save-state">
            <CheckCircle2 size={16} />
            <span>Brouillon sauvegardé</span>
          </div>
        ) : null}

        {step === "essentials" ? (
          <form className="stack assistant-form" onSubmit={handleEssentialsSubmit}>
            <div className="form-grid">
              <label>
                Name
                <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Slug
                <input disabled={!organization} placeholder={slugify(name) || "spring-classic"} value={slug} onChange={(event) => setSlug(event.target.value)} />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Start
                <input disabled={!organization} required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label>
                End
                <input disabled={!organization} min={startDate} required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
            <label>
              Location
              <input disabled={!organization} value={location} onChange={(event) => setLocation(event.target.value)} />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={busy || !organization} type="submit">
                <CheckCircle2 size={18} />
                {activeShow ? "Sauvegarder" : "Créer le brouillon"}
              </button>
              <button className="ghost-button" type="button" onClick={onClose}>
                Fermer
              </button>
            </div>
          </form>
        ) : null}

        {step === "payments" ? (
          <form className="stack assistant-form" onSubmit={handlePaymentsSubmit}>
            <div className="field-group">
              <span className="contact-picker-label">Paiements du show</span>
              <div className="form-grid">
                <label>
                  Réservations
                  <select value={reservationPaymentPolicy} onChange={(event) => setReservationPaymentPolicy(event.target.value as Show["reservation_payment_policy"])}>
                    <option value="pay_at_booking">Paiement à la réservation</option>
                    <option value="manual">Gestion manuelle</option>
                  </select>
                </label>
                <label>
                  Inscriptions
                  <select value={entryPaymentPolicy} onChange={(event) => setEntryPaymentPolicy(event.target.value as Show["entry_payment_policy"])}>
                    <option value="card_on_file_preauth">Carte + préautorisation</option>
                    <option value="manual">Gestion manuelle</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Préautorisation
                  <select disabled={entryPaymentPolicy === "manual"} value={entryPreauthTiming} onChange={(event) => setEntryPreauthTiming(event.target.value as Show["entry_preauth_timing"])}>
                    <option value="show_start">Première journée du show</option>
                    <option value="manual">Manuelle</option>
                  </select>
                </label>
                <label>
                  Heure
                  <input disabled={entryPaymentPolicy === "manual" || entryPreauthTiming === "manual"} type="time" value={entryPreauthTime} onChange={(event) => setEntryPreauthTime(event.target.value)} />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Échéance
                  <select disabled={entryPaymentPolicy === "manual"} value={entrySettlementTiming} onChange={(event) => setEntrySettlementTiming(event.target.value as Show["entry_settlement_timing"])}>
                    <option value="show_end">Dernière journée du show</option>
                    <option value="manual">Manuelle</option>
                  </select>
                </label>
                <label>
                  Heure limite
                  <input disabled={entryPaymentPolicy === "manual" || entrySettlementTiming === "manual"} type="time" value={entrySettlementDueTime} onChange={(event) => setEntrySettlementDueTime(event.target.value)} />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Montant préautorisé
                  <select disabled={entryPaymentPolicy === "manual"} value={entryPreauthAmountStrategy} onChange={(event) => setEntryPreauthAmountStrategy(event.target.value as Show["entry_preauth_amount_strategy"])}>
                    <option value="entry_balance">Solde des inscriptions</option>
                    <option value="entry_balance_with_margin">Solde + marge</option>
                  </select>
                </label>
                <label>
                  Marge %
                  <input disabled={entryPaymentPolicy === "manual" || entryPreauthAmountStrategy !== "entry_balance_with_margin"} min="0" step="0.01" type="number" value={entryPreauthMarginPercent} onChange={(event) => setEntryPreauthMarginPercent(event.target.value)} />
                </label>
              </div>
              <label className="check-row">
                <input checked={entryAutoCaptureEnabled} disabled={entryPaymentPolicy === "manual"} type="checkbox" onChange={(event) => setEntryAutoCaptureEnabled(event.target.checked)} />
                <span>Capture automatique à l'échéance</span>
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={busy || !activeShow} type="submit">
                <CheckCircle2 size={18} />
                Sauvegarder
              </button>
              <button className="ghost-button" type="button" onClick={() => setStep("essentials")}>
                Retour
              </button>
              <button className="ghost-button" type="button" onClick={onClose}>
                Fermer
              </button>
            </div>
          </form>
        ) : null}

        {step === "readiness" && activeShow ? (
          <div className="assistant-readiness">
            <div className="readiness-summary">
              <div>
                <strong>{readinessDone}/{readinessItems.length} prêts</strong>
                <span>Préparation du show</span>
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
                      {item.actionLabel ?? "Ouvrir"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={busy || activeShow.status === "open"} type="button" onClick={handleOpenShow}>
                <CheckCircle2 size={18} />
                {activeShow.status === "open" ? "Show ouvert" : "Ouvrir les inscriptions"}
              </button>
              <button className="ghost-button" type="button" onClick={() => setStep("payments")}>
                Paiements
              </button>
              <button className="ghost-button" type="button" onClick={onClose}>
                Fermer
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function buildShowReadinessItems(
  show: Show,
  context: {
    classes: ClassRecord[];
    divisions: Division[];
    entries: Entry[];
    invoices: Invoice[];
    showDays: ShowDay[];
    showScoreClassSetups: ShowScoreClassSetup[];
    stallOptions: StallOption[];
  },
): ShowReadinessItem[] {
  const showDays = context.showDays.filter((day) => day.show_id === show.id);
  const showClasses = context.classes.filter((classRecord) => classRecord.show_id === show.id);
  const showDivisions = context.divisions.filter((division) => division.show_id === show.id);
  const showEntries = context.entries.filter((entry) => entry.show_id === show.id);
  const showStallOptions = context.stallOptions.filter((option) => option.show_id === show.id);
  const showInvoices = context.invoices.filter((invoice) => invoice.show_id === show.id);
  const preparedClassIds = new Set(context.showScoreClassSetups.filter((setup) => setup.show_id === show.id).map((setup) => setup.class_id));
  const preparedClasses = showClasses.filter((classRecord) => preparedClassIds.has(classRecord.id)).length;

  return [
    {
      key: "days",
      title: "Journées",
      detail: showDays.length ? `${showDays.length} journée${showDays.length === 1 ? "" : "s"} générée${showDays.length === 1 ? "" : "s"}.` : "Les journées apparaîtront depuis les dates du show.",
      done: showDays.length > 0,
      view: "shows",
      actionLabel: "Vérifier",
    },
    {
      key: "classes",
      title: "Classes",
      detail: showClasses.length ? `${showClasses.length} classe${showClasses.length === 1 ? "" : "s"} au programme.` : "Aucune classe créée.",
      done: showClasses.length > 0,
      view: "classes",
      actionLabel: showClasses.length ? "Ajuster" : "Ajouter",
    },
    {
      key: "divisions",
      title: "Divisions",
      detail: showDivisions.length ? `${showDivisions.length} division${showDivisions.length === 1 ? "" : "s"} disponible${showDivisions.length === 1 ? "" : "s"}.` : "Aucune division disponible.",
      done: showDivisions.length > 0,
      view: "classes",
      actionLabel: showDivisions.length ? "Ajuster" : "Ajouter",
    },
    {
      key: "stalls",
      title: "Stalls et extras",
      detail: showStallOptions.length ? `${showStallOptions.length} produit${showStallOptions.length === 1 ? "" : "s"} réservable${showStallOptions.length === 1 ? "" : "s"}.` : "Aucun produit de réservation.",
      done: showStallOptions.length > 0,
      view: "stalls",
      actionLabel: showStallOptions.length ? "Ajuster" : "Configurer",
    },
    {
      key: "entries",
      title: "Inscriptions",
      detail: showEntries.length ? `${showEntries.length} inscription${showEntries.length === 1 ? "" : "s"} créée${showEntries.length === 1 ? "" : "s"}.` : "Les inscriptions arriveront ici.",
      done: showEntries.length > 0,
      view: "entries",
      actionLabel: "Ouvrir",
    },
    {
      key: "scoring",
      title: "Scoring",
      detail: showClasses.length ? `${preparedClasses}/${showClasses.length} classe${showClasses.length === 1 ? "" : "s"} préparée${showClasses.length === 1 ? "" : "s"}.` : "Crée des classes avant le scoring.",
      done: showClasses.length > 0 && preparedClasses === showClasses.length,
      view: "scoring",
      actionLabel: "Préparer",
    },
    {
      key: "billing",
      title: "Facturation",
      detail: showInvoices.length ? `${showInvoices.length} facture${showInvoices.length === 1 ? "" : "s"} liée${showInvoices.length === 1 ? "" : "s"} au show.` : "Aucune facture liée au show.",
      done: showInvoices.length > 0,
      view: "billing",
      actionLabel: "Voir",
    },
    {
      key: "publication",
      title: "Publication",
      detail: show.status === "open" ? "Les inscriptions sont ouvertes." : "Le show est encore en brouillon.",
      done: show.status === "open",
    },
  ];
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
        <div className="field-group">
          <span className="contact-picker-label">Paiements du show</span>
          <div className="form-grid">
            <label>
              Réservations
              <select value={reservationPaymentPolicy} onChange={(event) => setReservationPaymentPolicy(event.target.value as Show["reservation_payment_policy"])}>
                <option value="pay_at_booking">Paiement à la réservation</option>
                <option value="manual">Gestion manuelle</option>
              </select>
            </label>
            <label>
              Inscriptions
              <select value={entryPaymentPolicy} onChange={(event) => setEntryPaymentPolicy(event.target.value as Show["entry_payment_policy"])}>
                <option value="card_on_file_preauth">Carte + préautorisation</option>
                <option value="manual">Gestion manuelle</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Préautorisation
              <select disabled={entryPaymentPolicy === "manual"} value={entryPreauthTiming} onChange={(event) => setEntryPreauthTiming(event.target.value as Show["entry_preauth_timing"])}>
                <option value="show_start">Première journée du show</option>
                <option value="manual">Manuelle</option>
              </select>
            </label>
            <label>
              Heure
              <input disabled={entryPaymentPolicy === "manual" || entryPreauthTiming === "manual"} type="time" value={entryPreauthTime} onChange={(event) => setEntryPreauthTime(event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Échéance
              <select disabled={entryPaymentPolicy === "manual"} value={entrySettlementTiming} onChange={(event) => setEntrySettlementTiming(event.target.value as Show["entry_settlement_timing"])}>
                <option value="show_end">Dernière journée du show</option>
                <option value="manual">Manuelle</option>
              </select>
            </label>
            <label>
              Heure limite
              <input disabled={entryPaymentPolicy === "manual" || entrySettlementTiming === "manual"} type="time" value={entrySettlementDueTime} onChange={(event) => setEntrySettlementDueTime(event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Montant préautorisé
              <select disabled={entryPaymentPolicy === "manual"} value={entryPreauthAmountStrategy} onChange={(event) => setEntryPreauthAmountStrategy(event.target.value as Show["entry_preauth_amount_strategy"])}>
                <option value="entry_balance">Solde des inscriptions</option>
                <option value="entry_balance_with_margin">Solde + marge</option>
              </select>
            </label>
            <label>
              Marge %
              <input disabled={entryPaymentPolicy === "manual" || entryPreauthAmountStrategy !== "entry_balance_with_margin"} min="0" step="0.01" type="number" value={entryPreauthMarginPercent} onChange={(event) => setEntryPreauthMarginPercent(event.target.value)} />
            </label>
          </div>
          <label className="check-row">
            <input checked={entryAutoCaptureEnabled} disabled={entryPaymentPolicy === "manual"} type="checkbox" onChange={(event) => setEntryAutoCaptureEnabled(event.target.checked)} />
            <span>Capture automatique à l'échéance</span>
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
  externalOrganizations = [],
  linkedUserId,
  membershipRequirements = [],
  organization,
  title = "New contact",
  onCreateContact,
}: {
  createdByUserId?: string;
  defaultType?: Contact["type"];
  description?: string;
  externalOrganizations?: ExternalOrganization[];
  linkedUserId?: string;
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
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
  const [membershipNumbers, setMembershipNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(type, externalOrganizations, membershipRequirements),
    [externalOrganizations, membershipRequirements, type],
  );
  const missingRequiredMembership = externalMembershipFields.some((field) => field.required && !membershipNumbers[field.organization.id]?.trim());

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
        external_memberships: externalMembershipFields.map((field) => ({
          external_organization_id: field.organization.id,
          membership_number: membershipNumbers[field.organization.id] ?? "",
          status: "unknown",
        })),
      });
      setType(defaultType);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBarnName("");
      setMembershipNumbers({});
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
        {externalMembershipFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>Numéros de membre externes</strong>
              <span>Les champs obligatoires dépendent de l'association active.</span>
            </div>
            {externalMembershipFields.map((field) => (
              <label key={field.organization.id}>
                {field.organization.code} #
                <input
                  disabled={!organization}
                  required={field.required}
                  value={membershipNumbers[field.organization.id] ?? ""}
                  onChange={(event) =>
                    setMembershipNumbers((current) => ({
                      ...current,
                      [field.organization.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        ) : null}
        <button className="primary-button" disabled={busy || !organization || missingRequiredMembership} type="submit">
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
  externalOrganizations = [],
  organization,
  onCreateContact,
  onCreateHorse,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  externalOrganizations?: ExternalOrganization[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [ownerContactId, setOwnerContactId] = useState("");
  const [agentContactId, setAgentContactId] = useState<string | null>(null);
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const selectedOwnerId = ownerContactId || currentUserContact?.id || "";
  const defaultAgentId = currentUserContact && selectedOwnerId !== currentUserContact.id ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(() => buildHorseExternalMembershipFields(externalOrganizations), [externalOrganizations]);

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
        agent_contact_id: selectedAgentId && selectedAgentId !== selectedOwnerId ? selectedAgentId : null,
        breed,
        gender: gender || null,
        registration_number: registrationNumber,
        created_by_user_id: createdByUserId,
        external_memberships: externalReferenceFields.map((organization) => ({
          external_organization_id: organization.id,
          reference_type: horseReferenceTypeForOrganization(organization),
          reference_number: externalReferenceNumbers[organization.id] ?? "",
          status: "unknown",
        })),
      });
      setName("");
      setOwnerContactId("");
      setAgentContactId(null);
      setBreed("");
      setGender("");
      setRegistrationNumber("");
      setExternalReferenceNumbers({});
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
        <ContactPicker
          allowEmpty
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          disabled={!organization}
          label="Agent"
          organization={organization}
          role="agent"
          value={selectedAgentId}
          onChange={setAgentContactId}
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
        {externalReferenceFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>Références externes du cheval</strong>
              <span>Ex.: licence de compétition NRHA. Ces références pourront être validées par intégration externe plus tard.</span>
            </div>
            {externalReferenceFields.map((externalOrganization) => (
              <label key={externalOrganization.id}>
                {horseExternalReferenceLabel(externalOrganization)}
                <input
                  disabled={!organization}
                  value={externalReferenceNumbers[externalOrganization.id] ?? ""}
                  onChange={(event) =>
                    setExternalReferenceNumbers((current) => ({
                      ...current,
                      [externalOrganization.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        ) : null}
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
  contactExternalMemberships,
  externalOrganizations = [],
  membershipRequirements = [],
  onCancel,
  onUpdateContact,
}: {
  contact: Contact;
  contactExternalMemberships?: ContactExternalMembership[];
  externalOrganizations?: ExternalOrganization[];
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
  onCancel: () => void;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [type, setType] = useState<Contact["type"]>(contact.type);
  const [firstName, setFirstName] = useState(contact.first_name);
  const [lastName, setLastName] = useState(contact.last_name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [barnName, setBarnName] = useState(contact.barn_name ?? "");
  const [membershipNumbers, setMembershipNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries((contactExternalMemberships ?? []).filter((membership) => membership.contact_id === contact.id).map((membership) => [membership.external_organization_id, membership.membership_number])),
  );
  const [busy, setBusy] = useState(false);
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(type, externalOrganizations, membershipRequirements, contactExternalMemberships?.filter((membership) => membership.contact_id === contact.id) ?? []),
    [contact.id, contactExternalMemberships, externalOrganizations, membershipRequirements, type],
  );
  const missingRequiredMembership = externalMembershipFields.some((field) => field.required && !membershipNumbers[field.organization.id]?.trim());

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
        external_memberships: externalMembershipFields.map((field) => ({
          external_organization_id: field.organization.id,
          membership_number: membershipNumbers[field.organization.id] ?? "",
          status: "unknown",
        })),
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
        {externalMembershipFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>Numéros de membre externes</strong>
              <span>Ces informations pourront être vérifiées par intégration externe plus tard.</span>
            </div>
            {externalMembershipFields.map((field) => (
              <label key={field.organization.id}>
                {field.organization.code} #
                <input
                  required={field.required}
                  value={membershipNumbers[field.organization.id] ?? ""}
                  onChange={(event) =>
                    setMembershipNumbers((current) => ({
                      ...current,
                      [field.organization.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        ) : null}
        <FormActions busy={busy} disabled={missingRequiredMembership} onCancel={onCancel} />
      </form>
    </section>
  );
}

function HorseEditForm({
  contacts,
  contactRoles,
  createdByUserId,
  externalOrganizations = [],
  horse,
  horseExternalMemberships = [],
  horseContacts,
  organization,
  onCancel,
  onCreateContact,
  onUpdateHorse,
}: {
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  externalOrganizations?: ExternalOrganization[];
  horse: Horse;
  horseExternalMemberships?: HorseExternalMembership[];
  horseContacts: HorseContact[];
  organization: Organization | null;
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
}) {
  const currentAgentContactId = horseContacts.find((horseContact) => horseContact.horse_id === horse.id && horseContact.role === "agent")?.contact_id ?? "";
  const [name, setName] = useState(horse.name);
  const [ownerContactId, setOwnerContactId] = useState(horse.primary_owner_contact_id);
  const [agentContactId, setAgentContactId] = useState<string | null>(currentAgentContactId || null);
  const [breed, setBreed] = useState(horse.breed ?? "");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>(horse.gender ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(horse.registration_number ?? "");
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(horseExternalMemberships.filter((membership) => membership.horse_id === horse.id).map((membership) => [membership.external_organization_id, membership.reference_number])),
  );
  const [busy, setBusy] = useState(false);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const becameAgentByOwnerChange = currentUserContact && horse.primary_owner_contact_id === currentUserContact.id && ownerContactId !== currentUserContact.id;
  const defaultAgentId = becameAgentByOwnerChange ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(
    () => buildHorseExternalMembershipFields(externalOrganizations, horseExternalMemberships.filter((membership) => membership.horse_id === horse.id)),
    [externalOrganizations, horse.id, horseExternalMemberships],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateHorse(horse.id, {
        name,
        primary_owner_contact_id: ownerContactId,
        agent_contact_id: selectedAgentId && selectedAgentId !== ownerContactId ? selectedAgentId : null,
        breed: breed || null,
        gender: gender || null,
        registration_number: registrationNumber || null,
        external_memberships: externalReferenceFields.map((organization) => ({
          external_organization_id: organization.id,
          reference_type: horseReferenceTypeForOrganization(organization),
          reference_number: externalReferenceNumbers[organization.id] ?? "",
          status: "unknown",
        })),
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
        <ContactPicker
          allowEmpty
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          label="Agent"
          organization={organization}
          role="agent"
          value={selectedAgentId}
          onChange={setAgentContactId}
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
        {externalReferenceFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>Références externes du cheval</strong>
              <span>Ex.: licence de compétition NRHA. Ces références pourront être validées par intégration externe plus tard.</span>
            </div>
            {externalReferenceFields.map((externalOrganization) => (
              <label key={externalOrganization.id}>
                {horseExternalReferenceLabel(externalOrganization)}
                <input
                  value={externalReferenceNumbers[externalOrganization.id] ?? ""}
                  onChange={(event) =>
                    setExternalReferenceNumbers((current) => ({
                      ...current,
                      [externalOrganization.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        ) : null}
        <FormActions busy={busy || !ownerContactId} onCancel={onCancel} />
      </form>
    </section>
  );
}

function SanctioningFields({
  backNumberPolicy,
  disabled = false,
  hideBackNumberPolicy = false,
  sanctioningBodies,
  sanctioningBodyCodes,
  onBackNumberPolicyChange,
  onSanctioningBodyCodesChange,
}: {
  backNumberPolicy: BackNumberPolicy;
  disabled?: boolean;
  hideBackNumberPolicy?: boolean;
  sanctioningBodies: SanctioningBody[];
  sanctioningBodyCodes: string[];
  onBackNumberPolicyChange: (policy: BackNumberPolicy) => void;
  onSanctioningBodyCodesChange: (codes: string[]) => void;
}) {
  return (
    <div className="stack compact-stack">
      <div className="field-group">
        <span className="contact-picker-label">Sanctions</span>
        <div className="checkbox-grid">
          {sanctioningBodies.map((body) => (
            <label className="check-row" key={body.code}>
              <input
                checked={sanctioningBodyCodes.includes(body.code)}
                disabled={disabled}
                type="checkbox"
                onChange={() => onSanctioningBodyCodesChange(toggleSanctioningBodyCode(sanctioningBodyCodes, body.code))}
              />
              <span>{body.name}</span>
            </label>
          ))}
          {!sanctioningBodies.length ? <span className="muted-line">No sanctioning bodies configured.</span> : null}
        </div>
      </div>
      {hideBackNumberPolicy ? null : (
        <label>
          Politique de dossard
          <select disabled={disabled} value={backNumberPolicy} onChange={(event) => onBackNumberPolicyChange(event.target.value as BackNumberPolicy)}>
            <option value="horse">Par cheval</option>
            <option value="horse_rider_team">Par équipe cheval / cavalier</option>
            <option value="entry">Par inscription</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      )}
    </div>
  );
}

function toggleSanctioningBodyCode(currentCodes: string[], code: string) {
  return currentCodes.includes(code) ? currentCodes.filter((currentCode) => currentCode !== code) : [...currentCodes, code];
}

function defaultBackNumberPolicy(codes: string[], sanctioningBodies: SanctioningBody[]): BackNumberPolicy {
  return codes.some((code) => sanctioningBodies.find((body) => body.code === code)?.back_number_policy === "horse_rider_team") ? "horse_rider_team" : "horse";
}

function isNrhaSanctioned(codes: string[] | null | undefined) {
  return Boolean(codes?.includes("NRHA"));
}

function sanctionLabel(codes: string[] | null | undefined, sanctioningBodies: SanctioningBody[]) {
  if (!codes?.length) {
    return "No sanction";
  }

  return codes.map((code) => sanctioningBodies.find((body) => body.code === code)?.name ?? code).join(", ");
}

function backNumberPolicyLabel(policy: BackNumberPolicy | null | undefined) {
  switch (policy) {
    case "horse_rider_team":
      return "Dossard équipe cheval / cavalier";
    case "entry":
      return "Dossard par inscription";
    case "custom":
      return "Dossard custom";
    case "horse":
    default:
      return "Dossard par cheval";
  }
}

function showTimeInputValue(value: string | null | undefined, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

function showPaymentSummary(show: Show) {
  const reservationLabel = show.reservation_payment_policy === "pay_at_booking" ? "Réservations payées" : "Réservations manuelles";
  const entryLabel =
    show.entry_payment_policy === "card_on_file_preauth"
      ? `Préautorisation ${showTimeInputValue(show.entry_preauth_time, "08:00")}, capture ${showTimeInputValue(show.entry_settlement_due_time, "14:00")}`
      : "Inscriptions manuelles";

  return `${reservationLabel} - ${entryLabel}`;
}

function showDayLabel(day: ShowDay) {
  return `${day.day_name || `Day ${day.day_number ?? ""}`.trim()} - ${formatDate(day.day_date)}`;
}

function invoiceItemTypeLabel(type: InvoiceLineItem["item_type"]) {
  switch (type) {
    case "entry":
      return "Inscription";
    case "judge_fee":
      return "Frais de juge";
    case "stall":
      return "Stall";
    case "extra":
      return "Extra";
    case "membership":
      return "Membership";
    case "fee":
      return "Frais";
    case "discount":
      return "Rabais";
    case "tax":
      return "Taxe";
    case "manual":
    default:
      return "Manuel";
  }
}

function invoiceQuantityLabel(quantity: number) {
  return Number(quantity).toLocaleString("en-CA", { maximumFractionDigits: 2 });
}

function eligibilityRulesFromNotes(notes: string): EligibilityRules {
  return notes.trim() ? { notes: notes.trim() } : {};
}

function eligibilityNotesFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.notes === "string" ? rules.notes : "";
}

function ClassTemplateForm({
  organization,
  sanctioningBodies,
  onCreateClassTemplate,
}: {
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [blockLabel, setBlockLabel] = useState("");
  const [category, setCategory] = useState("");
  const [pattern, setPattern] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>([]);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>("horse");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClassTemplate({
        organization_id: organization.id,
        name,
        code,
        block_label: blockLabel,
        category,
        default_pattern: pattern,
        default_entry_fee: numericValue(entryFee),
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
        notes,
      });
      setName("");
      setCode("");
      setBlockLabel("");
      setCategory("");
      setPattern("");
      setEntryFee("");
      setSanctioningBodyCodes([]);
      setBackNumberPolicy("horse");
      setEligibilityNotes("");
      setNotes("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Nouveau preset</h2>
          <p>Catalogue régulier de l'association.</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Nom du bloc
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input disabled={!organization} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            Catégorie
            <input disabled={!organization} value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Bloc horaire
            <input disabled={!organization} value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input disabled={!organization} value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <label>
          Frais par défaut
          <input disabled={!organization} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <SanctioningFields
          backNumberPolicy={backNumberPolicy}
          disabled={!organization}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          Critères d'éligibilité
          <textarea disabled={!organization} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          Notes
          <textarea disabled={!organization} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization} type="submit">
          <Plus size={18} />
          Create preset
        </button>
      </form>
    </section>
  );
}

function ClassTemplateDivisionForm({
  classTemplates,
  organization,
  sanctioningBodies,
  onCreateClassTemplateDivision,
}: {
  classTemplates: ClassTemplate[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [judgeFee, setJudgeFee] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedTemplateId = templateId || classTemplates[0]?.id || "";
  const selectedTemplate = findById(classTemplates, selectedTemplateId);
  const selectedSanctioningBodyCodes = sanctioningBodyCodes ?? selectedTemplate?.sanctioning_body_codes ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedTemplate) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClassTemplateDivision({
        organization_id: organization.id,
        class_template_id: selectedTemplate.id,
        name,
        code,
        default_entry_fee: numericValue(entryFee),
        default_judge_fee: numericValue(judgeFee),
        sanctioning_body_codes: selectedSanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
      });
      setName("");
      setCode("");
      setEntryFee("");
      setJudgeFee("");
      setEligibilityNotes("");
      setSanctioningBodyCodes(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Division de preset</h2>
          <p>{selectedTemplate ? selectedTemplate.name : "Crée un preset d'abord."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Preset
          <SearchSelect
            disabled={!organization || !classTemplates.length}
            items={classTemplates.map((template) => ({ id: template.id, label: template.name, detail: sanctionLabel(template.sanctioning_body_codes, sanctioningBodies) }))}
            placeholder="Search preset"
            value={selectedTemplate?.id ?? ""}
            onChange={setTemplateId}
          />
        </label>
        <div className="form-grid">
          <label>
            Division
            <input disabled={!organization || !classTemplates.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Code
            <input disabled={!organization || !classTemplates.length} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Frais d'inscription
            <input disabled={!organization || !classTemplates.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            Frais de juge
            <input disabled={!organization || !classTemplates.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          backNumberPolicy={selectedTemplate?.back_number_policy ?? "horse"}
          disabled={!organization || !classTemplates.length}
          hideBackNumberPolicy
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={selectedSanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={setSanctioningBodyCodes}
        />
        <label>
          Critères d'éligibilité
          <textarea disabled={!organization || !classTemplates.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !classTemplates.length} type="submit">
          <Plus size={18} />
          Create preset division
        </button>
      </form>
    </section>
  );
}

function ClassTemplateEditForm({
  classTemplate,
  sanctioningBodies,
  onCancel,
  onUpdateClassTemplate,
}: {
  classTemplate: ClassTemplate;
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(classTemplate.name);
  const [code, setCode] = useState(classTemplate.code ?? "");
  const [blockLabel, setBlockLabel] = useState(classTemplate.block_label ?? "");
  const [category, setCategory] = useState(classTemplate.category ?? "");
  const [pattern, setPattern] = useState(classTemplate.default_pattern ?? "");
  const [entryFee, setEntryFee] = useState(classTemplate.default_entry_fee == null ? "" : String(classTemplate.default_entry_fee));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(classTemplate.sanctioning_body_codes ?? []);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>(classTemplate.back_number_policy ?? "horse");
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classTemplate.eligibility_rules));
  const [notes, setNotes] = useState(classTemplate.notes ?? "");
  const [isActive, setIsActive] = useState(classTemplate.is_active);
  const [busy, setBusy] = useState(false);

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateClassTemplate(classTemplate.id, {
        name,
        code: code || null,
        block_label: blockLabel || null,
        category: category || null,
        default_pattern: pattern || null,
        default_entry_fee: numericValue(entryFee) ?? null,
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
        notes: notes || null,
        is_active: isActive,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel span-2">
      <div className="panel-header">
        <div>
          <h2>Edit preset</h2>
          <p>{classTemplate.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Nom du bloc
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            Catégorie
            <input value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Bloc horaire
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <label>
          Frais par défaut
          <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <SanctioningFields
          backNumberPolicy={backNumberPolicy}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          Critères d'éligibilité
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label className="check-row">
          <input checked={isActive} type="checkbox" onChange={(event) => setIsActive(event.target.checked)} />
          <span>Preset actif</span>
        </label>
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </section>
  );
}

function ClassTemplateDivisionEditForm({
  classTemplates,
  classTemplateDivision,
  sanctioningBodies,
  onCancel,
  onUpdateClassTemplateDivision,
}: {
  classTemplates: ClassTemplate[];
  classTemplateDivision: ClassTemplateDivision;
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateClassTemplateDivision: (id: string, input: Parameters<typeof updateClassTemplateDivision>[1]) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState(classTemplateDivision.class_template_id);
  const [name, setName] = useState(classTemplateDivision.name);
  const [code, setCode] = useState(classTemplateDivision.code ?? "");
  const [entryFee, setEntryFee] = useState(classTemplateDivision.default_entry_fee == null ? "" : String(classTemplateDivision.default_entry_fee));
  const [judgeFee, setJudgeFee] = useState(classTemplateDivision.default_judge_fee == null ? "" : String(classTemplateDivision.default_judge_fee));
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classTemplateDivision.eligibility_rules));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(classTemplateDivision.sanctioning_body_codes ?? []);
  const [busy, setBusy] = useState(false);
  const selectedTemplate = findById(classTemplates, templateId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTemplate) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateClassTemplateDivision(classTemplateDivision.id, {
        class_template_id: selectedTemplate.id,
        name,
        code: code || null,
        default_entry_fee: numericValue(entryFee) ?? null,
        default_judge_fee: numericValue(judgeFee) ?? null,
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel span-2">
      <div className="panel-header">
        <div>
          <h2>Edit preset division</h2>
          <p>{classTemplateDivision.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Preset
          <SearchSelect
            items={classTemplates.map((template) => ({ id: template.id, label: template.name, detail: sanctionLabel(template.sanctioning_body_codes, sanctioningBodies) }))}
            placeholder="Search preset"
            value={templateId}
            onChange={setTemplateId}
          />
        </label>
        <div className="form-grid">
          <label>
            Division
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Frais d'inscription
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            Frais de juge
            <input min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          backNumberPolicy={selectedTemplate?.back_number_policy ?? "horse"}
          hideBackNumberPolicy
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={setSanctioningBodyCodes}
        />
        <label>
          Critères d'éligibilité
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <FormActions busy={busy || !selectedTemplate} onCancel={onCancel} />
      </form>
    </section>
  );
}

function ClassForm({
  classTemplateDivisions,
  classTemplates,
  organization,
  sanctioningBodies,
  showDays,
  shows,
  onCreateClass,
  onCreateDivision,
}: {
  classTemplateDivisions: ClassTemplateDivision[];
  classTemplates: ClassTemplate[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [showDayId, setShowDayId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [blockLabel, setBlockLabel] = useState("");
  const [pattern, setPattern] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>([]);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>("horse");
  const [nrhaSlateNumber, setNrhaSlateNumber] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const selectedShowDays = showDays.filter((day) => day.show_id === selectedShowId);
  const selectedShowDayId = showDayId && selectedShowDays.some((day) => day.id === showDayId) ? showDayId : selectedShowDays[0]?.id || "";
  const activeClassTemplates = classTemplates.filter((template) => template.is_active);
  const selectedTemplate = findById(classTemplates, templateId);
  const selectedTemplateDivisions = selectedTemplate ? classTemplateDivisions.filter((division) => division.class_template_id === selectedTemplate.id) : [];
  const classIsNrha = isNrhaSanctioned(sanctioningBodyCodes);

  function handleShowChange(nextShowId: string) {
    setShowId(nextShowId);
    setShowDayId("");
  }

  function handleTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);

    const template = findById(classTemplates, nextTemplateId);
    if (!template) {
      return;
    }

    setName(template.name);
    setCode(template.code ?? "");
    setBlockLabel(template.block_label ?? "");
    setPattern(template.default_pattern ?? "");
    setEntryFee(template.default_entry_fee == null ? "" : String(template.default_entry_fee));
    setSanctioningBodyCodes(template.sanctioning_body_codes ?? []);
    setBackNumberPolicy(template.back_number_policy ?? defaultBackNumberPolicy(template.sanctioning_body_codes ?? [], sanctioningBodies));
    setEligibilityNotes(eligibilityNotesFromRules(template.eligibility_rules));
    if (!isNrhaSanctioned(template.sanctioning_body_codes)) {
      setNrhaSlateNumber("");
    }
  }

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
    if (!isNrhaSanctioned(nextCodes)) {
      setNrhaSlateNumber("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedShowId) {
      return;
    }

    setBusy(true);

    try {
      const createdClass = await onCreateClass({
        organization_id: organization.id,
        show_id: selectedShowId,
        show_day_id: selectedShowDayId || undefined,
        class_template_id: selectedTemplate?.id ?? null,
        name,
        code,
        block_label: blockLabel,
        pattern,
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        nrha_slate_number: classIsNrha ? nrhaSlateNumber.trim() || null : null,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
        entry_fee: numericValue(entryFee),
      });

      for (const templateDivision of selectedTemplateDivisions) {
        await onCreateDivision({
          organization_id: organization.id,
          show_id: selectedShowId,
          class_id: createdClass.id,
          class_template_division_id: templateDivision.id,
          name: templateDivision.name,
          code: templateDivision.code ?? undefined,
          level: templateDivision.level ?? undefined,
          entry_fee: templateDivision.default_entry_fee ?? undefined,
          judge_fee: templateDivision.default_judge_fee ?? undefined,
          sanctioning_body_codes: templateDivision.sanctioning_body_codes.length ? templateDivision.sanctioning_body_codes : sanctioningBodyCodes,
          eligibility_rules: templateDivision.eligibility_rules ?? {},
        });
      }

      setTemplateId("");
      setName("");
      setCode("");
      setBlockLabel("");
      setPattern("");
      setEntryFee("");
      setSanctioningBodyCodes([]);
      setBackNumberPolicy("horse");
      setNrhaSlateNumber("");
      setEligibilityNotes("");
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
        <div className="form-grid">
          <label>
            Show
            <select disabled={!organization || !shows.length} value={selectedShowId} onChange={(event) => handleShowChange(event.target.value)}>
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Journée
            <select disabled={!organization || !selectedShowDays.length} value={selectedShowDayId} onChange={(event) => setShowDayId(event.target.value)}>
              {!selectedShowDays.length ? <option value="">Aucune journée</option> : null}
              {selectedShowDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {showDayLabel(day)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Preset
          <SearchSelect
            allowEmpty
            disabled={!organization || !activeClassTemplates.length}
            items={activeClassTemplates.map((template) => {
              const templateDivisions = classTemplateDivisions.filter((division) => division.class_template_id === template.id);

              return {
                id: template.id,
                label: template.name,
                detail: [
                  template.default_pattern ? `Pattern ${template.default_pattern}` : null,
                  `${templateDivisions.length} division${templateDivisions.length === 1 ? "" : "s"}`,
                  sanctionLabel(template.sanctioning_body_codes, sanctioningBodies),
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
            placeholder="Search preset"
            value={templateId}
            onChange={handleTemplateChange}
          />
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
        <div className="form-grid">
          <label>
            Bloc horaire
            <input disabled={!organization || !shows.length} value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input disabled={!organization || !shows.length} value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          backNumberPolicy={backNumberPolicy}
          disabled={!organization || !shows.length}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        {classIsNrha ? (
          <label>
            NRHA slate number
            <input disabled={!organization || !shows.length} value={nrhaSlateNumber} onChange={(event) => setNrhaSlateNumber(event.target.value)} />
          </label>
        ) : null}
        <label>
          Critères d'éligibilité
          <textarea disabled={!organization || !shows.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !shows.length} type="submit">
          <Plus size={18} />
          {selectedTemplate ? `Create class + ${selectedTemplateDivisions.length} divisions` : "Create class"}
        </button>
      </form>
    </section>
  );
}

function DivisionForm({
  classes,
  organization,
  sanctioningBodies,
  shows,
  onCreateDivision,
}: {
  classes: ClassRecord[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  shows: Show[];
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
}) {
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [judgeFee, setJudgeFee] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>([]);
  const [eligibilityNotes, setEligibilityNotes] = useState("");
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
        code,
        entry_fee: numericValue(entryFee),
        judge_fee: numericValue(judgeFee),
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
      });
      setName("");
      setCode("");
      setEntryFee("");
      setJudgeFee("");
      setSanctioningBodyCodes([]);
      setEligibilityNotes("");
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
        <div className="form-grid">
          <label>
            Division name
            <input disabled={!organization || !classes.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Class #
            <input disabled={!organization || !classes.length} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Frais d'inscription
            <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            Frais de juge
            <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          backNumberPolicy={selectedClass?.back_number_policy ?? "horse"}
          disabled={!organization || !classes.length}
          hideBackNumberPolicy
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={setSanctioningBodyCodes}
        />
        <label>
          Critères d'éligibilité
          <textarea disabled={!organization || !classes.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
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
  sanctioningBodies,
  onCancel,
  onUpdateClass,
}: {
  classRecord: ClassRecord;
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(classRecord.name);
  const [code, setCode] = useState(classRecord.code ?? "");
  const [blockLabel, setBlockLabel] = useState(classRecord.block_label ?? "");
  const [pattern, setPattern] = useState(classRecord.pattern ?? "");
  const [entryFee, setEntryFee] = useState(classRecord.entry_fee == null ? "" : String(classRecord.entry_fee));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(classRecord.sanctioning_body_codes ?? []);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>(classRecord.back_number_policy ?? "horse");
  const [nrhaSlateNumber, setNrhaSlateNumber] = useState(classRecord.nrha_slate_number ?? "");
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classRecord.eligibility_rules));
  const [status, setStatus] = useState<ClassRecord["status"]>(classRecord.status);
  const [busy, setBusy] = useState(false);
  const classIsNrha = isNrhaSanctioned(sanctioningBodyCodes);

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
    if (!isNrhaSanctioned(nextCodes)) {
      setNrhaSlateNumber("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateClass(classRecord.id, {
        name,
        code: code || null,
        block_label: blockLabel || null,
        pattern: pattern || null,
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        nrha_slate_number: classIsNrha ? nrhaSlateNumber.trim() || null : null,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
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
        <div className="form-grid">
          <label>
            Bloc horaire
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          backNumberPolicy={backNumberPolicy}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        {classIsNrha ? (
          <label>
            NRHA slate number
            <input value={nrhaSlateNumber} onChange={(event) => setNrhaSlateNumber(event.target.value)} />
          </label>
        ) : null}
        <label>
          Critères d'éligibilité
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
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
  sanctioningBodies,
  onCancel,
  onUpdateDivision,
}: {
  classes: ClassRecord[];
  division: Division;
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
}) {
  const [classId, setClassId] = useState(division.class_id);
  const [name, setName] = useState(division.name);
  const [code, setCode] = useState(division.code ?? "");
  const [entryFee, setEntryFee] = useState(division.entry_fee == null ? "" : String(division.entry_fee));
  const [judgeFee, setJudgeFee] = useState(division.judge_fee == null ? "" : String(division.judge_fee));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(division.sanctioning_body_codes ?? []);
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(division.eligibility_rules));
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
        code: code || null,
        entry_fee: numericValue(entryFee) ?? null,
        judge_fee: numericValue(judgeFee) ?? null,
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
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
        <div className="form-grid">
          <label>
            Division name
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Class #
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Frais d'inscription
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            Frais de juge
            <input min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          backNumberPolicy={selectedClass?.back_number_policy ?? "horse"}
          hideBackNumberPolicy
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={setSanctioningBodyCodes}
        />
        <label>
          Critères d'éligibilité
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
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
            items={availableDivisions.map((division) => {
              const classRecord = findById(classes, division.class_id);
              const effectiveEntryFee = division.entry_fee ?? classRecord?.entry_fee ?? null;

              return {
                id: division.id,
                label: divisionLabel(division, classes),
                detail: [
                  effectiveEntryFee == null ? null : `Inscription ${formatCurrency(effectiveEntryFee, organization?.currency ?? "CAD")}`,
                  division.judge_fee == null ? null : `Juge ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
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
            items={divisions.map((division) => {
              const classRecord = findById(classes, division.class_id);
              const effectiveEntryFee = division.entry_fee ?? classRecord?.entry_fee ?? null;

              return {
                id: division.id,
                label: divisionLabel(division, classes),
                detail: [
                  effectiveEntryFee == null ? null : `Inscription ${formatCurrency(effectiveEntryFee, organization?.currency ?? "CAD")}`,
                  division.judge_fee == null ? null : `Juge ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
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
