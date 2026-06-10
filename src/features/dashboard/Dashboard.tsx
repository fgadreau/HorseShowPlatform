import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileText,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Tent,
  Trophy,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { ContactPicker, EmptyState, FormActions, LanguageToggle, Metric, ModalDialog, NoticeBanner, SearchSelect, ViewIntro } from "../../components/ui";
import { canadianProvinceOptions, countryOptions, currencyOptions, taxPresetById, taxPresetForLocation, taxPresetIdForValues, taxPresetsForLocation, type TaxPreset } from "../../lib/billingSettings";
import { contactLabel, divisionLabel, errorMessage, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import { getHorseCogginsValidity, getHorseVaccineValidity, organizationCogginsValidityMonths, organizationRequiresHealthVerification, type HealthGateStatus, type HorseCogginsValidity, type HorseVaccineValidity } from "../../lib/health";
import type { Locale, Translation } from "../../lib/i18n";
import { buildEntryShowReadiness, readinessItemClassName, readinessTone, type ReadinessResult } from "../../lib/readiness";
import { associationNavigation, associationViewKeys, personalNavigation } from "../navigation";
import { MyStallsView, StallsView } from "./StallsViews";
import { buildShowScoreRunsForClass, type ShowScoreRun } from "../../services/showScoreAdapters";
import {
  assignBackNumber,
  assignNextBackNumber,
  claimHorseBackNumber,
  createClass,
  createClassTemplate,
  createClassTemplateDivision,
  createBackNumberRange,
  createContact,
  createDivision,
  createEntry,
  createHorse,
  createUploadedHorseHealthDocument,
  createOrganization,
  createShow,
  createStallBooking,
  createStallOption,
  deleteClass,
  deleteClassTemplate,
  deleteClassTemplateDivision,
  deleteBackNumber,
  deleteEntry,
  deleteContact,
  deleteDivision,
  deleteHorse,
  deleteStallBooking,
  getHorseHealthDocumentFileUrl,
  releaseBackNumber,
  reviewHorseHealthDocument,
  setOrganizationExternalMembershipRequirement,
  slugify,
  updateClass,
  updateClassTemplate,
  updateClassTemplateDivision,
  updateBackNumberStatus,
  updateContact,
  updateDivision,
  updateEntry,
  updateHorse,
  updateOrganizationHealthSettings,
  updateShow,
  updateStallBooking,
  updateStallOption,
  verifyGvlCogginsDocument,
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
  ContactRoleName,
  Division,
  EligibilityRules,
  Entry,
  ExternalOrganization,
  Horse,
  HorseContact,
  HorseExternalMembership,
  HorseHealthDocument,
  Invoice,
  InvoiceLineItem,
  Organization,
  OrganizationBackNumber,
  OrganizationExternalMembershipRequirement,
  PayoutScheduleType,
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
  onCreateBackNumberRange,
  onAssignBackNumber,
  onClaimHorseBackNumber,
  onAssignNextBackNumber,
  onReleaseBackNumber,
  onUpdateBackNumberStatus,
  onDeleteBackNumber,
  onCreateClass,
  onCreateClassTemplate,
  onCreateClassTemplateDivision,
  onCreateContact,
  onCreateDivision,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onCreateOrganization,
  onCreateShow,
  onCreateStallBooking,
  onCreateStallOption,
  onDeleteClass,
  onDeleteClassTemplate,
  onDeleteClassTemplateDivision,
  onDeleteContact,
  onDeleteDivision,
  onDeleteEntry,
  onDeleteHorse,
  onDeleteStallBooking,
  onLocaleChange,
  onPrepareShowScoreClass,
  onRefresh,
  onReviewHorseHealthDocument,
  onSignOut,
  onSetExternalMembershipRequirement,
  onUpdateClass,
  onUpdateClassTemplate,
  onUpdateClassTemplateDivision,
  onUpdateContact,
  onUpdateDivision,
  onUpdateEntry,
  onUpdateHorse,
  onUpdateOrganizationHealthSettings,
  onVerifyGvlCogginsDocument,
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
  onCreateBackNumberRange: (input: Parameters<typeof createBackNumberRange>[0]) => Promise<void>;
  onAssignBackNumber: (input: Parameters<typeof assignBackNumber>[0]) => Promise<void>;
  onClaimHorseBackNumber: (input: Parameters<typeof claimHorseBackNumber>[0]) => Promise<void>;
  onAssignNextBackNumber: (input: Parameters<typeof assignNextBackNumber>[0]) => Promise<void>;
  onReleaseBackNumber: (id: Parameters<typeof releaseBackNumber>[0]) => Promise<void>;
  onUpdateBackNumberStatus: (id: string, status: Parameters<typeof updateBackNumberStatus>[1]) => Promise<void>;
  onDeleteBackNumber: (id: Parameters<typeof deleteBackNumber>[0]) => Promise<void>;
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<Show>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
  onDeleteClass: (id: Parameters<typeof deleteClass>[0]) => Promise<void>;
  onDeleteClassTemplate: (id: Parameters<typeof deleteClassTemplate>[0]) => Promise<void>;
  onDeleteClassTemplateDivision: (id: Parameters<typeof deleteClassTemplateDivision>[0]) => Promise<void>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onDeleteDivision: (id: Parameters<typeof deleteDivision>[0]) => Promise<void>;
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onDeleteStallBooking: (id: Parameters<typeof deleteStallBooking>[0]) => Promise<void>;
  onLocaleChange: (locale: Locale) => void;
  onPrepareShowScoreClass: (classRecord: ClassRecord) => Promise<void>;
  onRefresh: () => void;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onSignOut: () => void;
  onSetExternalMembershipRequirement: (input: Parameters<typeof setOrganizationExternalMembershipRequirement>[0]) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
  onUpdateClassTemplateDivision: (id: string, input: Parameters<typeof updateClassTemplateDivision>[1]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onUpdateOrganizationHealthSettings: (id: string, input: Parameters<typeof updateOrganizationHealthSettings>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
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
  const horseHealthDocuments = context?.horseHealthDocuments ?? [];
  const horses = context?.horses ?? [];
  const horseContacts = context?.horseContacts ?? [];
  const horseOrganizationLinks = context?.horseOrganizationLinks ?? [];
  const organizationBackNumbers = context?.organizationBackNumbers ?? [];
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
  const selectedOrganizationHorseHealthDocuments = selectedOrganization
    ? horseHealthDocuments.filter((document) => document.organization_id === selectedOrganization.id || selectedOrganizationHorseIds.has(document.horse_id))
    : [];
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
    ? horseContacts.filter((horseContact) => horseContact.organization_id === selectedOrganization.id || selectedOrganizationHorseIds.has(horseContact.horse_id))
    : [];
  const selectedOrganizationBackNumbers = selectedOrganization
    ? organizationBackNumbers.filter((backNumber) => backNumber.organization_id === selectedOrganization.id)
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
  const personalContacts = contacts.filter((contact) => contact.linked_user_id === context?.profile.id);
  const personalContactIds = new Set(personalContacts.map((contact) => contact.id));
  const personalHorseIdsFromContacts = new Set(
    horseContacts
      .filter((horseContact) => personalContactIds.has(horseContact.contact_id) && (horseContact.role === "owner" || horseContact.role === "co-owner" || horseContact.role === "agent"))
      .map((horseContact) => horseContact.horse_id),
  );
  const personalHorses = horses.filter((horse) => personalContactIds.has(horse.primary_owner_contact_id) || personalHorseIdsFromContacts.has(horse.id));
  const personalHorseIds = new Set(personalHorses.map((horse) => horse.id));
  const selectedOrganizationPersonalContacts = selectedOrganization
    ? personalContacts.filter((contact) => selectedOrganizationContactIds.has(contact.id) || contact.organization_id === selectedOrganization.id)
    : personalContacts;
  const selectedOrganizationPersonalHorses = selectedOrganization
    ? personalHorses.filter((horse) => selectedOrganizationHorseIds.has(horse.id) || horse.organization_id === selectedOrganization.id)
    : personalHorses;
  const personalBackNumbers = selectedOrganizationBackNumbers.filter(
    (backNumber) =>
      (backNumber.assigned_horse_id ? personalHorseIds.has(backNumber.assigned_horse_id) : false) ||
      (backNumber.assigned_rider_contact_id ? personalContactIds.has(backNumber.assigned_rider_contact_id) : false),
  );
  const personalHorseHealthDocuments = horseHealthDocuments.filter((document) => personalHorseIds.has(document.horse_id));
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
  const selectedOrganizationNotifications = buildNotificationItems({
    backNumbers: selectedOrganizationBackNumbers,
    classes: selectedOrganizationClasses,
    contactExternalMemberships,
    contacts: selectedOrganizationContacts,
    divisions: selectedOrganizationDivisions,
    entries: selectedOrganizationEntries,
    externalOrganizations,
    horseHealthDocuments: selectedOrganizationHorseHealthDocuments,
    horses: selectedOrganizationHorses,
    invoices: selectedOrganizationInvoices,
    membershipRequirements: selectedOrganizationMembershipRequirements,
    organization: selectedOrganization,
    showDays: selectedOrganizationShowDays,
    showScoreClassSetups: selectedOrganizationShowScoreSetups,
    shows: selectedOrganizationShows,
    stallOptions: selectedOrganizationStallOptions,
  });

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
            locale={locale}
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

        {effectiveView === "notifications" ? (
          <NotificationsView
            notifications={selectedOrganizationNotifications}
            organization={selectedOrganization}
            onViewChange={onViewChange}
          />
        ) : null}

        {effectiveView === "shows" ? (
          <ShowsView
            locale={locale}
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
            locale={locale}
            contacts={selectedOrganizationContacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={selectedOrganizationContactRoles}
            createdByUserId={context?.profile.id ?? ""}
            externalOrganizations={externalOrganizations}
            canManageHealthDocuments={canManageAssociation}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            horseContacts={selectedOrganizationHorseContacts}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organization={selectedOrganization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDeleteContact={onDeleteContact}
            onDeleteHorse={onDeleteHorse}
            onReviewHorseHealthDocument={onReviewHorseHealthDocument}
            onUpdateContact={onUpdateContact}
            onUpdateHorse={onUpdateHorse}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
          />
        ) : null}

        {effectiveView === "health" ? (
          <HealthCenterView
            locale={locale}
            canManageHealthDocuments={canManageAssociation}
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            createdByUserId={context?.profile.id ?? ""}
            externalOrganizations={externalOrganizations}
            horseContacts={selectedOrganizationHorseContacts}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            shows={selectedOrganizationShows}
            onCreateContact={onCreateContact}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onReviewHorseHealthDocument={onReviewHorseHealthDocument}
            onUpdateHorse={onUpdateHorse}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
          />
        ) : null}

        {effectiveView === "classes" ? (
          <ClassesView
            locale={locale}
            classes={selectedOrganizationClasses}
            classTemplateDivisions={selectedOrganizationClassTemplateDivisions}
            classTemplates={selectedOrganizationClassTemplates}
            divisions={selectedOrganizationDivisions}
            entries={selectedOrganizationEntries}
            organization={selectedOrganization}
            sanctioningBodies={sanctioningBodies}
            showDays={selectedOrganizationShowDays}
            shows={selectedOrganizationShows}
            onCreateClass={onCreateClass}
            onCreateClassTemplate={onCreateClassTemplate}
            onCreateClassTemplateDivision={onCreateClassTemplateDivision}
            onCreateDivision={onCreateDivision}
            onDeleteClass={onDeleteClass}
            onDeleteClassTemplate={onDeleteClassTemplate}
            onDeleteClassTemplateDivision={onDeleteClassTemplateDivision}
            onDeleteDivision={onDeleteDivision}
            onUpdateClass={onUpdateClass}
            onUpdateClassTemplate={onUpdateClassTemplate}
            onUpdateClassTemplateDivision={onUpdateClassTemplateDivision}
            onUpdateDivision={onUpdateDivision}
          />
        ) : null}

        {effectiveView === "entries" ? (
          <EntriesView
            locale={locale}
            classes={selectedOrganizationClasses}
            contacts={selectedOrganizationContacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={selectedOrganizationContactRoles}
            divisions={selectedOrganizationDivisions}
            entries={selectedOrganizationEntries}
            externalOrganizations={externalOrganizations}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            shows={selectedOrganizationShows}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDeleteEntry={onDeleteEntry}
            onUpdateEntry={onUpdateEntry}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
          />
        ) : null}

        {effectiveView === "back-numbers" ? (
          <BackNumbersView
            locale={locale}
            backNumbers={selectedOrganizationBackNumbers}
            contacts={selectedOrganizationContacts}
            horseContacts={selectedOrganizationHorseContacts}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onAssignBackNumber={onAssignBackNumber}
            onAssignNextBackNumber={onAssignNextBackNumber}
            onCreateBackNumberRange={onCreateBackNumberRange}
            onDeleteBackNumber={onDeleteBackNumber}
            onReleaseBackNumber={onReleaseBackNumber}
            onUpdateBackNumberStatus={onUpdateBackNumberStatus}
          />
        ) : null}

        {effectiveView === "stalls" ? (
          <StallsView
            locale={locale}
            bookings={selectedOrganizationStallBookings}
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            currency={selectedOrganization?.currency ?? "CAD"}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            invoiceLineItems={selectedOrganizationInvoiceLineItems}
            invoices={selectedOrganizationInvoices}
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
            locale={locale}
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
            locale={locale}
            contacts={selectedOrganizationContacts}
            currency={selectedOrganization?.currency ?? "CAD"}
            invoices={selectedOrganizationInvoices}
            lineItems={selectedOrganizationInvoiceLineItems}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            unpaidBalance={unpaidBalance}
          />
        ) : null}

        {effectiveView === "my-horses" ? (
          <MyHorsesView
            locale={locale}
            contacts={personalContacts}
            contactRoles={contactRoles}
            externalOrganizations={externalOrganizations}
            canManageHealthDocuments={canManageAssociation}
            horses={personalHorses}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={personalHorseHealthDocuments}
            horseContacts={horseContacts}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDeleteHorse={onDeleteHorse}
            onReviewHorseHealthDocument={onReviewHorseHealthDocument}
            onUpdateHorse={onUpdateHorse}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
          />
        ) : null}

        {effectiveView === "my-riders" ? (
          <MyContactsView
            locale={locale}
            contacts={personalContacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={contactRoles}
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
            locale={locale}
            classes={selectedOrganizationClasses}
            contacts={selectedOrganizationPersonalContacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={selectedOrganizationContactRoles}
            divisions={selectedOrganizationDivisions}
            entries={personalEntries}
            externalOrganizations={externalOrganizations}
            horseHealthDocuments={personalHorseHealthDocuments}
            horses={selectedOrganizationPersonalHorses}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            shows={selectedOrganizationShows}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDeleteEntry={onDeleteEntry}
            onUpdateEntry={onUpdateEntry}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
          />
        ) : null}

        {effectiveView === "my-back-numbers" ? (
          <MyBackNumbersView
            locale={locale}
            backNumbers={personalBackNumbers}
            contacts={selectedOrganizationPersonalContacts}
            horses={selectedOrganizationPersonalHorses}
            organization={selectedOrganization}
            onClaimHorseBackNumber={onClaimHorseBackNumber}
          />
        ) : null}

        {effectiveView === "my-stalls" ? (
          <MyStallsView
            locale={locale}
            bookings={personalStallBookings}
            contacts={selectedOrganizationPersonalContacts}
            contactRoles={selectedOrganizationContactRoles}
            currency={selectedOrganization?.currency ?? "CAD"}
            horseHealthDocuments={personalHorseHealthDocuments}
            horses={selectedOrganizationPersonalHorses}
            invoiceLineItems={personalInvoiceLineItems}
            invoices={personalInvoices}
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
            locale={locale}
            contacts={selectedOrganizationPersonalContacts}
            currency={selectedOrganization?.currency ?? "CAD"}
            invoices={personalInvoices}
            lineItems={personalInvoiceLineItems}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            unpaidBalance={personalInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0)}
          />
        ) : null}

        {effectiveView === "settings" ? (
          <SettingsView
            locale={locale}
            context={context}
            externalOrganizations={externalOrganizations}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organization={selectedOrganization}
            onSetExternalMembershipRequirement={onSetExternalMembershipRequirement}
            onUpdateOrganizationHealthSettings={onUpdateOrganizationHealthSettings}
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

function uiText(locale: Locale, fr: string, en: string) {
  return locale === "en" ? en : fr;
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

function latestHorseHealthDocument(horseId: string, documents: HorseHealthDocument[], documentType: HorseHealthDocument["document_type"]) {
  return [...documents]
    .filter((document) => document.horse_id === horseId && document.document_type === documentType)
    .sort((a, b) => {
      const aDate = a.test_or_administered_on ?? a.created_at;
      const bDate = b.test_or_administered_on ?? b.created_at;
      return bDate.localeCompare(aDate);
    })[0];
}

function horseHealthStatusLabel(status: HorseHealthDocument["status"], locale: Locale = "fr") {
  const labels: Record<HorseHealthDocument["status"], { en: string; fr: string }> = {
    pending_review: { fr: "Révision", en: "Review" },
    verified: { fr: "Vérifié", en: "Verified" },
    approved: { fr: "Approuvé", en: "Approved" },
    rejected: { fr: "Refusé", en: "Rejected" },
    expired: { fr: "Expiré", en: "Expired" },
  };

  return labels[status][locale];
}

type InlineHealthMessage = {
  tone: "success" | "info" | "error";
  message: string;
};

type HorseHealthValidity = {
  coggins: HorseCogginsValidity;
  vaccine: HorseVaccineValidity;
  valid: boolean;
};

function horseHealthResultMessage(document: HorseHealthDocument): InlineHealthMessage {
  if (document.status === "verified") {
    return {
      tone: "success",
      message: "Coggins GVL vérifié. Le PDF n'a pas été conservé parce que le lien GVL suffit.",
    };
  }

  if (document.status === "approved") {
    return {
      tone: "success",
      message: "Document santé approuvé.",
    };
  }

  if (document.document_url) {
    return {
      tone: "info",
      message: "Coggins en révision manuelle. Le PDF a été conservé dans les documents santé.",
    };
  }

  return {
    tone: "info",
    message: "Coggins en révision manuelle.",
  };
}

function cogginsValidityMessage(validity: HorseCogginsValidity) {
  if (validity.status === "not_required") {
    return "Coggins non exigé par cette association.";
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `Coggins valide jusqu'au ${formatDate(validity.expiresOn)} (${validity.months} mois).`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `Coggins expiré depuis le ${formatDate(validity.expiresOn)}.`;
  }

  if (validity.status === "pending_review") {
    return "Coggins en révision manuelle.";
  }

  if (validity.status === "rejected") {
    return "Coggins refusé.";
  }

  return "Coggins manquant.";
}

function cogginsValidityTagLabel(validity: HorseCogginsValidity, locale: Locale = "fr") {
  if (validity.status === "not_required") {
    return uiText(locale, "Non exigé", "Not required");
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return uiText(locale, `Valide jusqu'au ${formatDate(validity.expiresOn)}`, `Valid until ${formatDate(validity.expiresOn)}`);
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return uiText(locale, `Expiré le ${formatDate(validity.expiresOn)}`, `Expired on ${formatDate(validity.expiresOn)}`);
  }

  if (validity.status === "pending_review") {
    return uiText(locale, "En révision", "In review");
  }

  if (validity.status === "rejected") {
    return uiText(locale, "Refusé", "Rejected");
  }

  return uiText(locale, "Manquant", "Missing");
}

function cogginsValidityBadgeClass(validity: HorseCogginsValidity) {
  if (validity.valid) {
    return "verified";
  }

  if (validity.status === "pending_review" || validity.status === "expired") {
    return validity.status;
  }

  return "rejected";
}

function cogginsValidityTone(validity: HorseCogginsValidity): InlineHealthMessage["tone"] {
  return validity.valid ? "success" : validity.status === "pending_review" || validity.status === "not_required" ? "info" : "error";
}

function vaccineValidityMessage(validity: HorseVaccineValidity) {
  if (validity.status === "not_required") {
    return "Vaccin non exigé par cette association.";
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `Vaccin valide jusqu'au ${formatDate(validity.expiresOn)} (${validity.months} mois).`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `Vaccin expiré depuis le ${formatDate(validity.expiresOn)}.`;
  }

  if (validity.status === "pending_review") {
    return "Vaccin en révision manuelle.";
  }

  if (validity.status === "rejected") {
    return "Vaccin refusé.";
  }

  return "Vaccin manquant.";
}

function getHorseHealthValidity(input: {
  documents: HorseHealthDocument[];
  horseId: string;
  organization: Organization | null | undefined;
  referenceDate?: string | null;
}): HorseHealthValidity {
  const coggins = getHorseCogginsValidity(input);
  const vaccine = getHorseVaccineValidity(input);

  return {
    coggins,
    vaccine,
    valid: coggins.valid && vaccine.valid,
  };
}

function horseHealthValidityMessage(validity: HorseHealthValidity) {
  if (!validity.coggins.valid) {
    return cogginsValidityMessage(validity.coggins);
  }

  if (!validity.vaccine.valid) {
    return vaccineValidityMessage(validity.vaccine);
  }

  if (validity.coggins.status === "not_required" && validity.vaccine.status === "not_required") {
    return "Documents santé non exigés par cette association.";
  }

  return [cogginsValidityMessage(validity.coggins), vaccineValidityMessage(validity.vaccine)].join(" · ");
}

function horseHealthValidityTone(validity: HorseHealthValidity): InlineHealthMessage["tone"] {
  if (validity.valid) {
    return "success";
  }

  return validity.coggins.status === "pending_review" || validity.vaccine.status === "pending_review" ? "info" : "error";
}

function horseHealthSummary(horse: Horse, documents: HorseHealthDocument[], organization: Organization | null | undefined) {
  const validity = getHorseHealthValidity({
    documents,
    horseId: horse.id,
    organization,
  });

  return horseHealthValidityMessage(validity);
}

type HorseStatusTone = "success" | "warning" | "error" | "neutral";

type HorseStatusChip = {
  label: string;
  tone: HorseStatusTone;
  value: string;
};

function horseHealthDisplay(horse: Horse, documents: HorseHealthDocument[], organization: Organization | null | undefined) {
  const validity = getHorseHealthValidity({
    documents,
    horseId: horse.id,
    organization,
  });
  const chips = [healthGateChip("Coggins", validity.coggins), healthGateChip("Vaccin", validity.vaccine)];
  const hasPendingReview = validity.coggins.status === "pending_review" || validity.vaccine.status === "pending_review";
  const hasMissingInfo = validity.coggins.status === "missing" || validity.vaccine.status === "missing";
  const hasRejected = validity.coggins.status === "rejected" || validity.vaccine.status === "rejected";
  const hasExpired = validity.coggins.status === "expired" || validity.vaccine.status === "expired";
  const healthRequired = organizationRequiresHealthVerification(organization);

  if (!healthRequired) {
    return {
      chips,
      summary: {
        label: "Prêt",
        tone: "success" as const,
      },
    };
  }

  if (validity.valid) {
    return {
      chips,
      summary: {
        label: "Santé vérifiée",
        tone: "success" as const,
      },
    };
  }

  if (hasPendingReview) {
    return {
      chips,
      summary: {
        label: "En révision",
        tone: "warning" as const,
      },
    };
  }

  return {
    chips,
    summary: {
      label: hasMissingInfo ? "Info manquante" : hasRejected ? "À corriger" : hasExpired ? "Expiré" : "À vérifier",
      tone: "error" as const,
    },
  };
}

function healthGateChip(label: string, validity: HorseCogginsValidity | HorseVaccineValidity): HorseStatusChip {
  if (validity.status === "not_required") {
    return { label, tone: "neutral", value: "Non requis" };
  }

  if (validity.status === "valid") {
    return { label, tone: "success", value: validity.expiresOn ? `Jusqu'au ${formatDate(validity.expiresOn)}` : "Vérifié" };
  }

  if (validity.status === "pending_review") {
    return { label, tone: "warning", value: "En révision" };
  }

  if (validity.status === "expired") {
    return { label, tone: "error", value: validity.expiresOn ? `Expiré ${formatDate(validity.expiresOn)}` : "Expiré" };
  }

  if (validity.status === "rejected") {
    return { label, tone: "error", value: "Refusé" };
  }

  return { label, tone: "error", value: "Manquant" };
}

function horseExternalReferenceChips(horse: Horse, memberships: HorseExternalMembership[], externalOrganizations: ExternalOrganization[]): HorseStatusChip[] {
  const references = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .sort((a, b) => {
      const aOrganization = externalOrganizations.find((organization) => organization.id === a.external_organization_id);
      const bOrganization = externalOrganizations.find((organization) => organization.id === b.external_organization_id);
      return (aOrganization?.code ?? "").localeCompare(bOrganization?.code ?? "");
    })
    .map((membership) => {
      const organization = externalOrganizations.find((externalOrganization) => externalOrganization.id === membership.external_organization_id);
      return {
        label: organization?.code ?? "Ext.",
        tone: horseExternalReferenceTone(membership.status),
        value: membership.reference_number || horseExternalReferenceStatusLabel(membership.status),
      };
    });

  return references.length ? references : [{ label: "Références", tone: "neutral", value: "Aucune" }];
}

function horseExternalReferenceTone(status: HorseExternalMembership["status"]): HorseStatusTone {
  if (status === "active") {
    return "success";
  }

  if (status === "pending") {
    return "warning";
  }

  if (status === "expired") {
    return "error";
  }

  return "neutral";
}

function horseExternalReferenceStatusLabel(status: HorseExternalMembership["status"]) {
  const labels: Record<HorseExternalMembership["status"], string> = {
    active: "Active",
    pending: "En révision",
    expired: "Expirée",
    unknown: "À valider",
  };

  return labels[status];
}

function horseGenderLabel(gender: Horse["gender"]) {
  if (gender === "M") {
    return "Mâle";
  }

  if (gender === "F") {
    return "Femelle";
  }

  if (gender === "G") {
    return "Hongre";
  }

  return "Genre non indiqué";
}

type HealthAlert = {
  detail: string;
  horse: Horse;
  key: string;
  label: string;
  referenceLabel: string;
  tone: "error" | "warning" | "info";
};

function buildHealthAlerts(input: {
  documents: HorseHealthDocument[];
  horses: Horse[];
  organization: Organization | null | undefined;
  referenceShow: Show | null;
  today: string;
}) {
  if (!organizationRequiresHealthVerification(input.organization)) {
    return [];
  }

  const referenceDate = input.referenceShow?.start_date ?? input.today;
  const referenceLabel = input.referenceShow ? `${input.referenceShow.name} - ${formatDate(input.referenceShow.start_date)}` : formatDate(input.today);
  const alerts: HealthAlert[] = [];

  for (const horse of input.horses) {
    const validity = getHorseCogginsValidity({
      documents: input.documents,
      horseId: horse.id,
      organization: input.organization,
      referenceDate,
    });

    if (validity.status === "not_required") {
      continue;
    }

    if (!validity.valid) {
      alerts.push({
        detail: cogginsValidityMessage(validity),
        horse,
        key: `${horse.id}-${validity.status}`,
        label: healthAlertLabel(validity.status),
        referenceLabel,
        tone: validity.status === "pending_review" ? "warning" : "error",
      });
    } else if (validity.expiresOn) {
      const daysUntilExpiry = daysBetween(input.today, validity.expiresOn);

      if (daysUntilExpiry <= 30) {
        alerts.push({
          detail: `Coggins expire dans ${Math.max(daysUntilExpiry, 0)} jour${daysUntilExpiry === 1 ? "" : "s"} (${formatDate(validity.expiresOn)}).`,
          horse,
          key: `${horse.id}-coggins-expires-${validity.expiresOn}`,
          label: "Bientôt expiré",
          referenceLabel,
          tone: "warning",
        });
      }
    }

    const vaccineValidity = getHorseVaccineValidity({
      documents: input.documents,
      horseId: horse.id,
      organization: input.organization,
      referenceDate,
    });

    if (vaccineValidity.status === "not_required") {
      continue;
    }

    if (!vaccineValidity.valid) {
      alerts.push({
        detail: vaccineValidityMessage(vaccineValidity),
        horse,
        key: `${horse.id}-vaccine-${vaccineValidity.status}`,
        label: healthAlertLabel(vaccineValidity.status),
        referenceLabel,
        tone: vaccineValidity.status === "pending_review" ? "warning" : "error",
      });
    } else if (vaccineValidity.expiresOn) {
      const daysUntilExpiry = daysBetween(input.today, vaccineValidity.expiresOn);

      if (daysUntilExpiry <= 30) {
        alerts.push({
          detail: `Vaccin expire dans ${Math.max(daysUntilExpiry, 0)} jour${daysUntilExpiry === 1 ? "" : "s"} (${formatDate(vaccineValidity.expiresOn)}).`,
          horse,
          key: `${horse.id}-vaccine-expires-${vaccineValidity.expiresOn}`,
          label: "Bientôt expiré",
          referenceLabel,
          tone: "warning",
        });
      }
    }
  }

  return alerts.sort((a, b) => {
    const toneRank = { error: 0, warning: 1, info: 2 };
    return toneRank[a.tone] - toneRank[b.tone] || a.horse.name.localeCompare(b.horse.name);
  });
}

function healthAlertLabel(status: HealthGateStatus) {
  if (status === "pending_review") {
    return "En révision";
  }

  if (status === "expired") {
    return "Expiré";
  }

  if (status === "rejected") {
    return "Refusé";
  }

  return "Bloquant";
}

function healthDocumentTypeLabel(type: HorseHealthDocument["document_type"], locale: Locale = "fr") {
  const labels: Record<HorseHealthDocument["document_type"], { en: string; fr: string }> = {
    coggins_eia: { fr: "Coggins / EIA", en: "Coggins / EIA" },
    combo_vaccine: { fr: "Vaccin influenza/rhino", en: "Influenza/rhino vaccine" },
    influenza_vaccine: { fr: "Vaccin influenza", en: "Influenza vaccine" },
    other: { fr: "Autre document", en: "Other document" },
    rhino_vaccine: { fr: "Vaccin rhino", en: "Rhino vaccine" },
  };

  return labels[type][locale];
}

function isVaccineHealthDocument(document: Pick<HorseHealthDocument, "document_type">) {
  return document.document_type === "combo_vaccine" || document.document_type === "influenza_vaccine" || document.document_type === "rhino_vaccine";
}

function healthVerificationSourceLabel(source: HorseHealthDocument["verification_source"], locale: Locale = "fr") {
  const labels: Record<HorseHealthDocument["verification_source"], { en: string; fr: string }> = {
    gvl_api: { fr: "API GVL", en: "GVL API" },
    gvl_qr: { fr: "QR GVL", en: "GVL QR" },
    gvl_url: { fr: "Lien GVL", en: "GVL link" },
    manual: { fr: "Manuel", en: "Manual" },
    upload: { fr: "Fichier déposé", en: "Uploaded file" },
  };

  return labels[source][locale];
}

function healthDocumentDateValue(document: HorseHealthDocument) {
  return document.test_or_administered_on ?? document.created_at.slice(0, 10);
}

function healthDocumentDateLabel(document: HorseHealthDocument, locale: Locale = "fr") {
  const label = document.document_type === "coggins_eia" ? "Test" : uiText(locale, "Date", "Date");
  return `${label}: ${formatDate(healthDocumentDateValue(document))}`;
}

function healthReviewNote(document: HorseHealthDocument, status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
  const action = status === "approved" ? "approuvé" : "refusé";
  return `${healthDocumentTypeLabel(document.document_type)} ${action} depuis le centre de validation santé.`;
}

function latestHorseVaccineDocument(horseId: string, documents: HorseHealthDocument[]) {
  const vaccineTypes: HorseHealthDocument["document_type"][] = ["combo_vaccine", "influenza_vaccine", "rhino_vaccine"];

  return [...documents]
    .filter((document) => document.horse_id === horseId && vaccineTypes.includes(document.document_type))
    .sort((a, b) => {
      const aDate = a.test_or_administered_on ?? a.created_at;
      const bDate = b.test_or_administered_on ?? b.created_at;
      return bDate.localeCompare(aDate);
    })[0];
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.ceil((end - start) / 86_400_000);
}

function birthYearFromDateValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

async function resolveGvlCogginsUrl(pdfFile: File | null, fallbackUrl: string) {
  if (pdfFile) {
    const { extractGvlUrlFromPdf } = await import("../../lib/gvlPdf");
    return extractGvlUrlFromPdf(pdfFile);
  }

  const cleanUrl = fallbackUrl.trim();
  return cleanUrl ? normalizeGvlUrl(cleanUrl) ?? cleanUrl : null;
}

function InlineHealthMessage({ value }: { value: InlineHealthMessage | null }) {
  if (!value) {
    return null;
  }

  return <p className={`inline-health-message ${value.tone}`}>{value.message}</p>;
}

function ReadinessChecklist({ readiness }: { readiness: ReadinessResult | null }) {
  if (!readiness?.items.length) {
    return null;
  }

  return (
    <div className={`readiness-mini-list ${readiness.status}`}>
      <div className={`inline-health-message ${readinessTone(readiness)}`}>{readiness.message}</div>
      {readiness.items.map((item) => {
        const Icon = item.blocking ? AlertCircle : CheckCircle2;

        return (
          <div className={readinessItemClassName(item)} key={item.key}>
            <Icon size={16} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

type NotificationCategory = "health" | "entries" | "back-numbers" | "billing" | "memberships" | "shows";
type NotificationPriority = "critical" | "warning" | "info";

type NotificationItem = {
  actionLabel: string;
  category: NotificationCategory;
  detail: string;
  id: string;
  meta: string;
  priority: NotificationPriority;
  title: string;
  view: ViewKey;
};

const notificationCategoryFilters: Array<{ key: "all" | NotificationCategory; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "health", label: "Santé" },
  { key: "entries", label: "Inscriptions" },
  { key: "back-numbers", label: "Dossards" },
  { key: "memberships", label: "Memberships" },
  { key: "billing", label: "Facturation" },
  { key: "shows", label: "Concours" },
];

function NotificationsView({
  notifications,
  organization,
  onViewChange,
}: {
  notifications: NotificationItem[];
  organization: Organization | null;
  onViewChange: (view: ViewKey) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | NotificationCategory>("all");
  const criticalCount = notifications.filter((notification) => notification.priority === "critical").length;
  const warningCount = notifications.filter((notification) => notification.priority === "warning").length;
  const infoCount = notifications.filter((notification) => notification.priority === "info").length;
  const visibleNotifications = categoryFilter === "all" ? notifications : notifications.filter((notification) => notification.category === categoryFilter);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Operations"
        title="Centre de notifications"
        description="Surveille les tâches calculées depuis la santé, les inscriptions, les dossards, les memberships et la facturation."
        stats={[
          { label: "Urgentes", value: String(criticalCount) },
          { label: "À traiter", value: String(warningCount) },
          { label: "Infos", value: String(infoCount) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric detail={organization?.name ?? "Association active"} label="Urgentes" value={String(criticalCount)} />
        <Metric detail="Validation ou correction requise." label="À traiter" value={String(warningCount)} />
        <Metric detail="Suivi opérationnel." label="Information" value={String(infoCount)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Tâches calculées</h2>
            <p>{notifications.length ? `${notifications.length} notification${notifications.length === 1 ? "" : "s"} active${notifications.length === 1 ? "" : "s"}.` : "Rien à traiter pour l'instant."}</p>
          </div>
        </div>

        <div className="notification-filter-row">
          {notificationCategoryFilters.map((filter) => {
            const count = filter.key === "all" ? notifications.length : notifications.filter((notification) => notification.category === filter.key).length;

            return (
              <button className={categoryFilter === filter.key ? "active" : ""} key={filter.key} type="button" onClick={() => setCategoryFilter(filter.key)}>
                {filter.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="notification-list">
          {visibleNotifications.map((notification) => (
            <article className={`notification-card ${notification.priority}`} key={notification.id}>
              <div className="notification-card-main">
                <span className={`notification-priority ${notification.priority}`}>{notificationPriorityLabel(notification.priority)}</span>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.detail}</p>
                  <small>{notification.meta}</small>
                </div>
              </div>
              <button className="text-button" type="button" onClick={() => onViewChange(notification.view)}>
                {notification.actionLabel}
              </button>
            </article>
          ))}
          {!visibleNotifications.length ? <EmptyState label={categoryFilter === "all" ? "Aucune notification active." : "Aucune notification dans cette catégorie."} /> : null}
        </div>
      </section>
    </div>
  );
}

function buildNotificationItems(input: {
  backNumbers: OrganizationBackNumber[];
  classes: ClassRecord[];
  contactExternalMemberships: ContactExternalMembership[];
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  invoices: Invoice[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  shows: Show[];
  stallOptions: StallOption[];
}) {
  const today = todayDateValue();
  const referenceShow = referenceShowForNotifications(input.shows, today);
  const activeEntries = input.entries.filter((entry) => !inactiveProgramEntryStatuses.has(entry.status));
  const notifications: NotificationItem[] = [];

  for (const document of input.horseHealthDocuments.filter((candidate) => candidate.status === "pending_review")) {
    const horse = findById(input.horses, document.horse_id);
    notifications.push({
      actionLabel: "Valider",
      category: "health",
      detail: `${healthDocumentTypeLabel(document.document_type)} pour ${horseLabel(horse)}.`,
      id: `health-document-${document.id}`,
      meta: `${healthVerificationSourceLabel(document.verification_source)} - ${healthDocumentDateLabel(document)}`,
      priority: "warning",
      title: "Document santé à valider",
      view: "health",
    });
  }

  for (const alert of buildHealthAlerts({
    documents: input.horseHealthDocuments,
    horses: input.horses,
    organization: input.organization,
    referenceShow,
    today,
  }).filter((alert) => alert.label !== "En révision")) {
    notifications.push({
      actionLabel: "Voir santé",
      category: "health",
      detail: `${alert.horse.name}: ${alert.detail}`,
      id: `health-alert-${alert.key}`,
      meta: alert.referenceLabel,
      priority: alert.tone === "error" ? "critical" : "warning",
      title: `Santé cheval - ${alert.label}`,
      view: "health",
    });
  }

  for (const entry of activeEntries.filter((candidate) => !candidate.entry_number)) {
    const division = findById(input.divisions, entry.division_id);
    const classRecord = division ? findById(input.classes, division.class_id) : null;
    const show = findById(input.shows, entry.show_id);
    const cutoffPassed = classRecord ? classEntriesAreClosed(classRecord) : false;

    notifications.push({
      actionLabel: "Assigner",
      category: "back-numbers",
      detail: `${horseLabel(findById(input.horses, entry.horse_id))} - ${divisionLabel(division, input.classes)}.`,
      id: `entry-back-number-${entry.id}`,
      meta: [show?.name, cutoffPassed ? "fermeture passée" : "avant fermeture"].filter(Boolean).join(" - "),
      priority: cutoffPassed ? "critical" : "warning",
      title: "Dossard manquant",
      view: "back-numbers",
    });
  }

  buildMembershipNotificationItems({
    activeEntries,
    contactExternalMemberships: input.contactExternalMemberships,
    contacts: input.contacts,
    divisions: input.divisions,
    externalOrganizations: input.externalOrganizations,
    horseHealthDocuments: input.horseHealthDocuments,
    horses: input.horses,
    membershipRequirements: input.membershipRequirements,
    organization: input.organization,
    shows: input.shows,
  }).forEach((notification) => notifications.push(notification));

  for (const invoice of input.invoices.filter((candidate) => !["paid", "void"].includes(candidate.status) && Number(candidate.balance_due ?? 0) > 0)) {
    const show = findById(input.shows, invoice.show_id);
    notifications.push({
      actionLabel: "Voir facture",
      category: "billing",
      detail: `#${formatInvoiceNumber(invoice.invoice_number)}: ${formatCurrency(invoice.balance_due, input.organization?.currency ?? "CAD")} à recevoir.`,
      id: `invoice-${invoice.id}`,
      meta: [show?.name, invoice.due_date ? `Échéance ${formatDate(invoice.due_date)}` : null].filter(Boolean).join(" - ") || "Facturation",
      priority: invoice.status === "overdue" ? "critical" : "warning",
      title: invoice.status === "overdue" ? "Facture en retard" : "Solde de facture ouvert",
      view: "billing",
    });
  }

  for (const classRecord of input.classes) {
    const classDivisionIds = new Set(input.divisions.filter((division) => division.class_id === classRecord.id).map((division) => division.id));
    const classEntries = activeEntries.filter((entry) => classDivisionIds.has(entry.division_id));

    if (!classEntries.length || !classEntriesAreClosed(classRecord) || classRecord.draw_prepared_at) {
      continue;
    }

    const missingBackNumberCount = classEntries.filter((entry) => !entry.entry_number).length;
    notifications.push({
      actionLabel: "Préparer",
      category: "entries",
      detail: `${classRecord.name}: ${classEntries.length} inscription${classEntries.length === 1 ? "" : "s"} prête${classEntries.length === 1 ? "" : "s"} pour l'ordre de passage.`,
      id: `draw-ready-${classRecord.id}`,
      meta: missingBackNumberCount ? `${missingBackNumberCount} dossard${missingBackNumberCount === 1 ? "" : "s"} manquant${missingBackNumberCount === 1 ? "" : "s"}` : "Fermeture passée",
      priority: missingBackNumberCount ? "critical" : "warning",
      title: "Ordre de passage à sortir",
      view: missingBackNumberCount ? "back-numbers" : "scoring",
    });
  }

  for (const show of input.shows.filter((candidate) => candidate.status !== "archived" && candidate.end_date >= today)) {
    const incompleteItems = buildShowReadinessItems(show, {
      classes: input.classes,
      divisions: input.divisions,
      entries: input.entries,
      invoices: input.invoices,
      showDays: input.showDays,
      showScoreClassSetups: input.showScoreClassSetups,
      stallOptions: input.stallOptions,
    }).filter((item) => !item.done && item.key !== "publication" && item.key !== "billing");

    if (!incompleteItems.length) {
      continue;
    }

    notifications.push({
      actionLabel: "Ouvrir concours",
      category: "shows",
      detail: `${show.name}: ${incompleteItems.map((item) => item.title.toLowerCase()).join(", ")} à compléter.`,
      id: `show-readiness-${show.id}`,
      meta: `${formatDate(show.start_date)} - ${formatDate(show.end_date)}`,
      priority: show.status === "open" ? "warning" : "info",
      title: "Concours incomplet",
      view: "shows",
    });
  }

  return notifications.sort((first, second) => notificationPriorityRank(first.priority) - notificationPriorityRank(second.priority) || first.category.localeCompare(second.category) || first.title.localeCompare(second.title));
}

function buildMembershipNotificationItems(input: {
  activeEntries: Entry[];
  contactExternalMemberships: ContactExternalMembership[];
  contacts: Contact[];
  divisions: Division[];
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  shows: Show[];
}) {
  const grouped = new Map<string, NotificationItem & { count: number }>();

  for (const entry of input.activeEntries) {
    const horse = findById(input.horses, entry.horse_id);
    const readiness = buildEntryShowReadiness({
      contactExternalMemberships: input.contactExternalMemberships,
      documents: input.horseHealthDocuments,
      externalOrganizations: input.externalOrganizations,
      horse,
      membershipRequirements: input.membershipRequirements,
      organization: input.organization,
      ownerContact: findById(input.contacts, entry.owner_contact_id),
      payerContact: findById(input.contacts, entry.payer_contact_id),
      riderContact: findById(input.contacts, entry.rider_contact_id),
      show: findById(input.shows, entry.show_id),
      skipHorseHealth: true,
    });

    for (const item of readiness.blockingItems.filter((candidate) => candidate.key.startsWith("contact."))) {
      const existing = grouped.get(item.key);

      if (existing) {
        existing.count += 1;
        existing.meta = `${existing.count} inscription${existing.count === 1 ? "" : "s"} touchée${existing.count === 1 ? "" : "s"}`;
        continue;
      }

      grouped.set(item.key, {
        actionLabel: "Corriger contact",
        category: "memberships",
        count: 1,
        detail: item.detail,
        id: `membership-${item.key}`,
        meta: "1 inscription touchée",
        priority: item.status === "pending" ? "warning" : "critical",
        title: item.title,
        view: "people",
      });
    }
  }

  return Array.from(grouped.values()).map(({ count: _count, ...notification }) => notification);
}

function referenceShowForNotifications(shows: Show[], today: string) {
  const upcomingShows = [...shows]
    .filter((show) => show.status !== "archived" && show.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return upcomingShows[0] ?? [...shows].filter((show) => show.status !== "archived").sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
}

function notificationPriorityLabel(priority: NotificationPriority) {
  if (priority === "critical") {
    return "Urgent";
  }

  if (priority === "warning") {
    return "À traiter";
  }

  return "Info";
}

function notificationPriorityRank(priority: NotificationPriority) {
  if (priority === "critical") {
    return 0;
  }

  if (priority === "warning") {
    return 1;
  }

  return 2;
}

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

function contactRoleSummary(contact: Contact, contactRoles: ContactRole[], locale: Locale = "fr") {
  const roles = contactRoles.filter((role) => role.contact_id === contact.id).map((role) => role.role);
  const unique = Array.from(new Set(roles.length ? roles : [contact.type]));

  return unique.map((role) => contactRoleDisplayLabel(role, locale)).join(" / ");
}

function contactRoleDisplayLabel(role: ContactRoleName, locale: Locale) {
  switch (role) {
    case "owner":
      return uiText(locale, "Propriétaire", "Owner");
    case "agent":
      return "Agent";
    case "rider":
      return uiText(locale, "Cavalier", "Rider");
    case "payer":
      return uiText(locale, "Payeur", "Payer");
    case "booker":
      return uiText(locale, "Réservataire", "Booker");
    case "other":
    default:
      return uiText(locale, "Autre", "Other");
  }
}

function normalizeDirectorySearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesDirectorySearch(values: Array<string | null | undefined>, query: string) {
  return values.some((value) => normalizeDirectorySearch(value ?? "").includes(query));
}

function contactMatchesDirectorySearch(contact: Contact, contactRoles: ContactRole[], query: string) {
  return matchesDirectorySearch(
    [
      contactLabel(contact),
      contactRoleSummary(contact, contactRoles),
      contact.type,
      contact.email,
      contact.phone,
      contact.barn_name,
    ],
    query,
  );
}

function horseMatchesDirectorySearch(
  horse: Horse,
  contacts: Contact[],
  memberships: HorseExternalMembership[],
  externalOrganizations: ExternalOrganization[],
  query: string,
) {
  const owner = findById(contacts, horse.primary_owner_contact_id);
  const membershipValues = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .flatMap((membership) => {
      const externalOrganization = findById(externalOrganizations, membership.external_organization_id);
      return [externalOrganization?.code, externalOrganization?.name, membership.reference_number, membership.status];
    });

  return matchesDirectorySearch(
    [
      horse.name,
      horse.breed,
      horse.color,
      horse.gender,
      horseGenderLabel(horse.gender),
      horse.registration_number,
      contactLabel(owner),
      owner?.email,
      owner?.barn_name,
      horseExternalReferenceSummary(horse, memberships, externalOrganizations),
      ...membershipValues,
    ],
    query,
  );
}

function ShowsView({
  locale,
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
  locale: Locale;
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
        eyebrow={uiText(locale, "Calendrier", "Calendar")}
        title={uiText(locale, "Concours", "Shows")}
        description={uiText(locale, "Planifie les concours, leurs dates et leur statut public avant d'ouvrir les inscriptions.", "Plan shows, dates and public status before opening entries.")}
        stats={[
          { label: uiText(locale, "Concours", "Shows"), value: String(shows.length) },
          { label: uiText(locale, "Ouverts", "Open"), value: String(shows.filter((show) => show.status === "open").length) },
        ]}
      />

      <section className="panel show-command-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Créer un concours", "Create a show")}</h2>
            <p>{organization ? uiText(locale, "Démarre un brouillon, puis complète la préparation quand tu veux.", "Start a draft, then finish readiness when you are ready.") : uiText(locale, "Crée une association d'abord.", "Create an organization first.")}</p>
          </div>
        </div>
        <button className="primary-button" disabled={!organization} type="button" onClick={() => openAssistant()}>
          <Plus size={18} />
          {uiText(locale, "Créer un concours", "Create show")}
        </button>
      </section>

      {editingShow ? (
        <ShowEditForm
          locale={locale}
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
            <h2>{uiText(locale, "Concours", "Shows")}</h2>
            <p>{shows.length ? uiText(locale, `${shows.length} concours dans cette association.`, `${shows.length} show${shows.length === 1 ? "" : "s"} in this organization.`) : uiText(locale, "Aucun concours pour l'instant.", "No shows yet.")}</p>
          </div>
        </div>
        <div className="table shows-table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Nom", "Name")}</span>
            <span>Dates</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
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
                  {show.status === "draft" ? uiText(locale, "Continuer", "Continue") : uiText(locale, "Checklist", "Checklist")}
                </button>
                <button className="text-button" type="button" onClick={() => setEditingShow(show)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
              </div>
            </div>
          ))}
          {!shows.length ? <EmptyState label={uiText(locale, "Crée le premier concours de cette association.", "Create the first show for this organization.")} /> : null}
        </div>
      </section>

      {assistantOpen ? (
        <ShowAssistant
          locale={locale}
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
  locale,
  contacts,
  contactExternalMemberships,
  contactRoles,
  canManageHealthDocuments,
  createdByUserId,
  externalOrganizations,
  horseExternalMemberships,
  horseHealthDocuments,
  horses,
  horseContacts,
  membershipRequirements,
  organization,
  onCreateContact,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteContact,
  onDeleteHorse,
  onReviewHorseHealthDocument,
  onUpdateContact,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
}: {
  locale: Locale;
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  canManageHealthDocuments: boolean;
  createdByUserId: string;
  externalOrganizations: ExternalOrganization[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  horseContacts: HorseContact[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
}) {
  const [creatingContact, setCreatingContact] = useState(false);
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [horseSearch, setHorseSearch] = useState("");
  const normalizedContactSearch = normalizeDirectorySearch(contactSearch);
  const normalizedHorseSearch = normalizeDirectorySearch(horseSearch);
  const filteredContacts = normalizedContactSearch
    ? contacts.filter((contact) => contactMatchesDirectorySearch(contact, contactRoles, normalizedContactSearch))
    : [];
  const filteredHorses = normalizedHorseSearch
    ? horses.filter((horse) => horseMatchesDirectorySearch(horse, contacts, horseExternalMemberships, externalOrganizations, normalizedHorseSearch))
    : [];

  async function handleDeleteHorse(horse: Horse) {
    if (!window.confirm(`Supprimer ${horse.name} et les inscriptions/réservations liées?`)) {
      return;
    }

    await onDeleteHorse(horse.id);
    if (editingHorse?.id === horse.id) {
      setEditingHorse(null);
    }
  }

  async function handleDeleteContact(contact: Contact) {
    const label = contactLabel(contact);

    if (!window.confirm(`Supprimer ${label}? Si ce contact est utilisé comme cavalier dans une inscription de test, il sera détaché de l'inscription.`)) {
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
        eyebrow={uiText(locale, "Répertoire", "Directory")}
        title={uiText(locale, "Répertoire", "Directory")}
        description={uiText(locale, "Centralise les propriétaires, cavaliers, payeurs et chevaux qui serviront aux inscriptions.", "Centralize owners, riders, payers and horses used for entries.")}
        stats={[
          { label: uiText(locale, "Contacts", "Contacts"), value: String(contacts.length) },
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter au répertoire", "Add to directory")}</h2>
            <p>{uiText(locale, "Ouvre le bon formulaire sans quitter la recherche de contacts et chevaux.", "Open the right form without leaving contact and horse search.")}</p>
          </div>
          <div className="row-actions">
            <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingContact(true)}>
              <Plus size={18} />
              {uiText(locale, "Contact", "Contact")}
            </button>
            <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingHorse(true)}>
              <Plus size={18} />
              {uiText(locale, "Cheval", "Horse")}
            </button>
          </div>
        </div>
      </section>

      {creatingContact ? (
        <ModalDialog description={organization ? organization.name : uiText(locale, "Crée une association d'abord.", "Create an organization first.")} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Nouveau contact", "New contact")} onClose={() => setCreatingContact(false)}>
          <ContactForm
            locale={locale}
            externalOrganizations={externalOrganizations}
            membershipRequirements={membershipRequirements}
            organization={organization}
            onCreateContact={onCreateContact}
            onCreated={() => setCreatingContact(false)}
          />
        </ModalDialog>
      ) : null}

      {creatingHorse ? (
        <ModalDialog description={contacts.length ? uiText(locale, "Connecte le cheval à un propriétaire.", "Connect the horse to an owner.") : uiText(locale, "Crée un contact propriétaire directement dans ce formulaire au besoin.", "Create an owner contact directly in this form if needed.")} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Nouveau cheval", "New horse")} onClose={() => setCreatingHorse(false)}>
          <HorseForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={createdByUserId}
            externalOrganizations={externalOrganizations}
            organization={organization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onCreated={() => setCreatingHorse(false)}
          />
        </ModalDialog>
      ) : null}

      {editingContact ? (
        <ModalDialog description={contactLabel(editingContact)} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Modifier le contact", "Edit contact")} onClose={() => setEditingContact(null)}>
          <ContactEditForm
            locale={locale}
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
        </ModalDialog>
      ) : null}

      {editingHorse ? (
        <ModalDialog className="horse-form-modal" description={editingHorse.name} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Modifier le cheval", "Edit horse")} onClose={() => setEditingHorse(null)}>
          <HorseEditForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            canManageHealthDocuments={canManageHealthDocuments}
            createdByUserId={createdByUserId}
            externalOrganizations={externalOrganizations}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={horseHealthDocuments}
            horseContacts={horseContacts}
            organization={organization}
            horse={editingHorse}
            onCancel={() => setEditingHorse(null)}
            onCreateContact={onCreateContact}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onReviewHorseHealthDocument={onReviewHorseHealthDocument}
            onUpdateHorse={async (id, input) => {
              await onUpdateHorse(id, input);
              setEditingHorse(null);
            }}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Contacts", "Contacts")}</h2>
            <p>{normalizedContactSearch ? uiText(locale, `${filteredContacts.length} résultat${filteredContacts.length === 1 ? "" : "s"} sur ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`, `${filteredContacts.length} result${filteredContacts.length === 1 ? "" : "s"} across ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`) : uiText(locale, "Recherche par nom, rôle, courriel ou écurie.", "Search by name, role, email or barn.")}</p>
          </div>
        </div>
        <label className="directory-search-field">
          <span>{uiText(locale, "Rechercher un contact", "Search contacts")}</span>
          <div>
            <Search size={16} />
            <input placeholder={uiText(locale, "Nom, rôle, courriel, écurie...", "Name, role, email, barn...")} value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} />
          </div>
        </label>
        <div className="horse-list directory-list">
          {normalizedContactSearch ? (
            <div className="horse-list-row horse-list-head">
              <span>{uiText(locale, "Contact", "Contact")}</span>
              <span>{uiText(locale, "Rôles", "Roles")}</span>
              <span>{uiText(locale, "Courriel", "Email")}</span>
              <span>Action</span>
            </div>
          ) : null}
          {filteredContacts.map((contact) => (
            <div className="horse-list-row" key={contact.id}>
              <div className="horse-list-identity">
                <strong>{contactLabel(contact)}</strong>
                <span>{[contact.type, contact.barn_name].filter(Boolean).join(" · ") || uiText(locale, "Contact", "Contact")}</span>
              </div>
              <div className="horse-chip-row">
                {contactRoleSummary(contact, contactRoles)
                  .split(" / ")
                  .map((role) => (
                    <span className="horse-status-chip neutral" key={`${contact.id}-${role}`}>
                      <span>{uiText(locale, "Rôle", "Role")}</span>
                      <strong>{role}</strong>
                    </span>
                  ))}
              </div>
              <div className="horse-chip-row">
                <span className="horse-status-chip neutral">
                  <span>{uiText(locale, "Courriel", "Email")}</span>
                  <strong>{contact.email || uiText(locale, "Aucun", "None")}</strong>
                </span>
              </div>
              <div className="row-actions horse-row-actions">
                <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteContact(contact)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!normalizedContactSearch ? <EmptyState label={uiText(locale, "Lance une recherche pour afficher les contacts de l'association.", "Search to display association contacts.")} /> : null}
          {normalizedContactSearch && !filteredContacts.length ? <EmptyState label={uiText(locale, "Aucun contact ne correspond à cette recherche.", "No contact matches this search.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Chevaux", "Horses")}</h2>
            <p>{normalizedHorseSearch ? uiText(locale, `${filteredHorses.length} résultat${filteredHorses.length === 1 ? "" : "s"} sur ${horses.length} ${horses.length === 1 ? "cheval" : "chevaux"}.`, `${filteredHorses.length} result${filteredHorses.length === 1 ? "" : "s"} across ${horses.length} horse${horses.length === 1 ? "" : "s"}.`) : uiText(locale, "Recherche par nom, propriétaire, sexe ou numéro externe.", "Search by name, owner, sex or external number.")}</p>
          </div>
        </div>
        <label className="directory-search-field">
          <span>{uiText(locale, "Rechercher un cheval", "Search horses")}</span>
          <div>
            <Search size={16} />
            <input placeholder={uiText(locale, "Nom, propriétaire, référence...", "Name, owner, reference...")} value={horseSearch} onChange={(event) => setHorseSearch(event.target.value)} />
          </div>
        </label>
        <div className="horse-list directory-list">
          {normalizedHorseSearch ? (
            <div className="horse-list-row horse-list-head">
              <span>{uiText(locale, "Cheval", "Horse")}</span>
              <span>{uiText(locale, "Statut", "Status")}</span>
              <span>{uiText(locale, "Références", "References")}</span>
              <span>Action</span>
            </div>
          ) : null}
          {filteredHorses.map((horse) => {
            const healthDisplay = horseHealthDisplay(horse, horseHealthDocuments, organization);
            const referenceChips = horseExternalReferenceChips(horse, horseExternalMemberships, externalOrganizations);

            return (
              <div className={`horse-list-row ${healthDisplay.summary.tone}`} key={horse.id}>
                <div className="horse-list-identity">
                  <strong>{horse.name}</strong>
                  <span>
                    {contactLabel(findById(contacts, horse.primary_owner_contact_id))} · {horseGenderLabel(horse.gender)}
                  </span>
                </div>
                <div className="horse-list-status">
                  <span className={`horse-summary-pill ${healthDisplay.summary.tone}`}>{healthDisplay.summary.label}</span>
                  <div className="horse-chip-row">
                    {healthDisplay.chips.map((chip) => (
                      <span className={`horse-status-chip ${chip.tone}`} key={`${horse.id}-${chip.label}`}>
                        <span>{chip.label}</span>
                        <strong>{chip.value}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="horse-chip-row reference-chip-row">
                  {referenceChips.map((chip) => (
                    <span className={`horse-status-chip ${chip.tone}`} key={`${horse.id}-${chip.label}-${chip.value}`}>
                      <span>{chip.label}</span>
                      <strong>{chip.value}</strong>
                    </span>
                  ))}
                </div>
                <div className="row-actions horse-row-actions">
                  <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteHorse(horse)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            );
          })}
          {!normalizedHorseSearch ? <EmptyState label={uiText(locale, "Lance une recherche pour afficher les chevaux de l'association.", "Search to display association horses.")} /> : null}
          {normalizedHorseSearch && !filteredHorses.length ? <EmptyState label={uiText(locale, "Aucun cheval ne correspond à cette recherche.", "No horse matches this search.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function HealthCenterView({
  locale,
  canManageHealthDocuments,
  contacts,
  contactRoles,
  createdByUserId,
  externalOrganizations,
  horseContacts,
  horseExternalMemberships,
  horseHealthDocuments,
  horses,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateHorseHealthDocument,
  onReviewHorseHealthDocument,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
}: {
  locale: Locale;
  canManageHealthDocuments: boolean;
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId: string;
  externalOrganizations: ExternalOrganization[];
  horseContacts: HorseContact[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
}) {
  const [busyDocumentId, setBusyDocumentId] = useState("");
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [fileBusyDocumentId, setFileBusyDocumentId] = useState("");
  const [fileErrorDocumentId, setFileErrorDocumentId] = useState("");
  const [fileErrorMessageByDocumentId, setFileErrorMessageByDocumentId] = useState<Record<string, string>>({});
  const [reviewDateByDocumentId, setReviewDateByDocumentId] = useState<Record<string, string>>({});
  const today = todayDateValue();
  const pendingDocuments = [...horseHealthDocuments]
    .filter((document) => document.status === "pending_review")
    .sort((a, b) => healthDocumentDateValue(b).localeCompare(healthDocumentDateValue(a)));
  const upcomingShows = [...shows]
    .filter((show) => show.status !== "archived" && show.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const referenceShow = upcomingShows[0] ?? [...shows].filter((show) => show.status !== "archived").sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  const healthAlerts = buildHealthAlerts({
    documents: horseHealthDocuments,
    horses,
    organization,
    referenceShow,
    today,
  });
  const currentEditingHorse = editingHorse ? findById(horses, editingHorse.id) ?? editingHorse : null;

  async function handleReview(document: HorseHealthDocument, status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
    const reviewDate = reviewDateByDocumentId[document.id] ?? document.test_or_administered_on ?? "";

    if (status === "approved" && isVaccineHealthDocument(document) && !reviewDate) {
      return;
    }

    setBusyDocumentId(document.id);

    try {
      await onReviewHorseHealthDocument(document.id, {
        status,
        reviewed_by_user_id: profileId,
        review_notes: healthReviewNote(document, status),
        test_or_administered_on: status === "approved" && isVaccineHealthDocument(document) ? reviewDate || null : undefined,
      });
    } finally {
      setBusyDocumentId("");
    }
  }

  async function handleOpenStoredDocument(document: HorseHealthDocument) {
    if (!document.document_url) {
      return;
    }

    const documentWindow = window.open("about:blank", "_blank");
    setFileBusyDocumentId(document.id);
    setFileErrorDocumentId("");
    setFileErrorMessageByDocumentId((current) => ({ ...current, [document.id]: "" }));

    try {
      const signedUrl = await getHorseHealthDocumentFileUrl(document.document_url);
      if (documentWindow) {
        documentWindow.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      documentWindow?.close();
      setFileErrorDocumentId(document.id);
      setFileErrorMessageByDocumentId((current) => ({ ...current, [document.id]: errorMessage(error) }));
    } finally {
      setFileBusyDocumentId("");
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Santé", "Health")}
        title={uiText(locale, "Centre de validation", "Validation center")}
        description={uiText(locale, "Traite les documents en révision et surveille les échéances avant les réservations et inscriptions.", "Review health documents and monitor deadlines before reservations and entries.")}
        stats={[
          { label: uiText(locale, "À valider", "To review"), value: String(pendingDocuments.length) },
          { label: uiText(locale, "Alertes", "Alerts"), value: String(healthAlerts.length) },
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric detail={uiText(locale, "Documents en attente d'un gestionnaire.", "Documents waiting for a manager review.")} label={uiText(locale, "À valider", "To review")} value={String(pendingDocuments.length)} />
        <Metric detail={referenceShow ? `${uiText(locale, "Référence", "Reference")}: ${referenceShow.name}` : uiText(locale, "Aucun concours actif.", "No active show.")} label={uiText(locale, "Échéances", "Deadlines")} value={String(healthAlerts.length)} />
        <Metric detail={organizationRequiresHealthVerification(organization) ? uiText(locale, "Coggins et vaccin obligatoires.", "Coggins and vaccine required.") : uiText(locale, "Vérification désactivée.", "Verification disabled.")} label={uiText(locale, "Règle santé", "Health rule")} value={`${organizationCogginsValidityMonths(organization)} ${uiText(locale, "mois", "months")}`} />
      </section>

      {currentEditingHorse ? (
        <div className="modal-backdrop">
          <section aria-labelledby="health-horse-edit-title" aria-modal="true" className="assistant-modal health-horse-modal" role="dialog">
            <div className="assistant-modal-header">
              <div>
                <p className="eyebrow">{uiText(locale, "Santé", "Health")}</p>
                <h2 id="health-horse-edit-title">{uiText(locale, "Modifier le cheval", "Edit horse")}</h2>
                <p>{uiText(locale, "Corrige la fiche, puis relance la validation GVL au besoin.", "Correct the record, then rerun GVL validation if needed.")}</p>
              </div>
              <button className="icon-button" type="button" aria-label={uiText(locale, "Fermer l'édition du cheval", "Close horse editor")} onClick={() => setEditingHorse(null)}>
                <X size={18} />
              </button>
            </div>
            <HorseEditForm
              locale={locale}
              canManageHealthDocuments={canManageHealthDocuments}
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={createdByUserId}
              externalOrganizations={externalOrganizations}
              horse={currentEditingHorse}
              horseContacts={horseContacts}
              horseExternalMemberships={horseExternalMemberships}
              horseHealthDocuments={horseHealthDocuments}
              organization={organization}
              onCancel={() => setEditingHorse(null)}
              onCreateContact={onCreateContact}
              onCreateHorseHealthDocument={onCreateHorseHealthDocument}
              onReviewHorseHealthDocument={onReviewHorseHealthDocument}
              onUpdateHorse={async (id, input) => {
                await onUpdateHorse(id, input);
                setEditingHorse(null);
              }}
              onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            />
          </section>
        </div>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Documents à valider", "Documents to review")}</h2>
            <p>{pendingDocuments.length ? uiText(locale, `${pendingDocuments.length} document${pendingDocuments.length === 1 ? "" : "s"} en attente.`, `${pendingDocuments.length} document${pendingDocuments.length === 1 ? "" : "s"} pending.`) : uiText(locale, "Aucun document en révision manuelle.", "No documents in manual review.")}</p>
          </div>
        </div>
        <div className="table health-review-table">
          <div className="table-row table-head">
            <span>Document</span>
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>Source</span>
            <span>Action</span>
          </div>
          {pendingDocuments.map((document) => {
            const horse = findById(horses, document.horse_id);
            const owner = findById(contacts, horse?.primary_owner_contact_id);
            const busy = busyDocumentId === document.id;
            const reviewDate = reviewDateByDocumentId[document.id] ?? document.test_or_administered_on ?? "";
            const needsReviewDate = isVaccineHealthDocument(document);

            return (
              <div className="table-row" key={document.id}>
              <div>
                  <strong>{healthDocumentTypeLabel(document.document_type, locale)}</strong>
                  <span className="muted-line">
                    {healthDocumentDateLabel(document, locale)}
                    {document.result ? ` - ${document.result}` : ""}
                  </span>
                  {document.review_notes ? <span className="muted-line">{document.review_notes}</span> : null}
                  {needsReviewDate ? (
                    <label className="compact-label">
                      {uiText(locale, "Date vaccin validée", "Validated vaccine date")}
                      <input
                        type="date"
                        value={reviewDate}
                        onChange={(event) =>
                          setReviewDateByDocumentId((current) => ({
                            ...current,
                            [document.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
                <div>
                  <strong>{horseLabel(horse)}</strong>
                  <span className="muted-line">{contactLabel(owner)}</span>
                  {document.horse_name ? (
                    <span className="muted-line">
                      Doc: {document.horse_name}
                      {document.horse_date_of_birth ? ` - ${formatDate(document.horse_date_of_birth)}` : ""}
                    </span>
                  ) : null}
                </div>
                <div>
                  <span className={`badge ${document.status}`}>{horseHealthStatusLabel(document.status, locale)}</span>
                  <span className="muted-line">{healthVerificationSourceLabel(document.verification_source, locale)}</span>
                  {document.warnings.length ? <span className="muted-line">{document.warnings.join(", ")}</span> : null}
                </div>
                <div className="row-actions">
                  {horse ? (
                    <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                      {uiText(locale, "Modifier le cheval", "Edit horse")}
                    </button>
                  ) : null}
                  {document.source_url ? (
                    <a className="text-button" href={document.source_url} rel="noreferrer" target="_blank">
                      Lien GVL
                    </a>
                  ) : null}
                  {document.document_url ? (
                    <button className="text-button" disabled={fileBusyDocumentId === document.id} type="button" onClick={() => void handleOpenStoredDocument(document)}>
                      {fileBusyDocumentId === document.id ? "Ouverture..." : "PDF"}
                    </button>
                  ) : null}
                  <button className="text-button" disabled={busy || (needsReviewDate && !reviewDate)} type="button" onClick={() => void handleReview(document, "approved")}>
                    {uiText(locale, "Approuver", "Approve")}
                  </button>
                  <button className="text-button danger-text" disabled={busy} type="button" onClick={() => void handleReview(document, "rejected")}>
                    {uiText(locale, "Refuser", "Reject")}
                  </button>
                  {fileErrorDocumentId === document.id ? <span className="muted-line">{uiText(locale, "Impossible d'ouvrir le fichier", "Unable to open file")}: {fileErrorMessageByDocumentId[document.id] || uiText(locale, "accès refusé.", "access denied.")}</span> : null}
                </div>
              </div>
            );
          })}
          {!pendingDocuments.length ? <EmptyState label={uiText(locale, "Aucun document santé en attente de validation.", "No health documents awaiting review.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Échéances santé", "Health deadlines")}</h2>
            <p>{referenceShow ? uiText(locale, `Calculées avec la date d'arrivée du concours ${referenceShow.name}.`, `Calculated from the arrival date for ${referenceShow.name}.`) : uiText(locale, "Crée un concours pour calculer les échéances par date d'arrivée.", "Create a show to calculate deadlines from arrival dates.")}</p>
          </div>
        </div>
        <div className="table health-alert-table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>{uiText(locale, "Référence", "Reference")}</span>
            <span>Action</span>
          </div>
          {healthAlerts.map((alert) => (
            <div className="table-row" key={alert.key}>
              <div>
                <strong>{alert.horse.name}</strong>
                <span className="muted-line">{contactLabel(findById(contacts, alert.horse.primary_owner_contact_id))}</span>
              </div>
              <div>
                <span className={`badge ${alert.tone}`}>{alert.label}</span>
                <span className="muted-line">{alert.detail}</span>
              </div>
              <span>{alert.referenceLabel}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingHorse(alert.horse)}>
                  {uiText(locale, "Modifier le cheval", "Edit horse")}
                </button>
              </div>
            </div>
          ))}
          {!healthAlerts.length ? <EmptyState label={uiText(locale, "Aucune échéance santé à surveiller pour l'instant.", "No health deadlines to watch right now.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function ClassesView({
  locale,
  classes,
  classTemplateDivisions,
  classTemplates,
  divisions,
  entries,
  organization,
  sanctioningBodies,
  showDays,
  shows,
  onCreateClass,
  onCreateClassTemplate,
  onCreateClassTemplateDivision,
  onCreateDivision,
  onDeleteClass,
  onDeleteClassTemplate,
  onDeleteClassTemplateDivision,
  onDeleteDivision,
  onUpdateClass,
  onUpdateClassTemplate,
  onUpdateClassTemplateDivision,
  onUpdateDivision,
}: {
  locale: Locale;
  classes: ClassRecord[];
  classTemplateDivisions: ClassTemplateDivision[];
  classTemplates: ClassTemplate[];
  divisions: Division[];
  entries: Entry[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onDeleteClass: (id: string) => Promise<void>;
  onDeleteClassTemplate: (id: string) => Promise<void>;
  onDeleteClassTemplateDivision: (id: string) => Promise<void>;
  onDeleteDivision: (id: string) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
  onUpdateClassTemplateDivision: (id: string, input: Parameters<typeof updateClassTemplateDivision>[1]) => Promise<void>;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
}) {
  const [creatingClassTemplate, setCreatingClassTemplate] = useState(false);
  const [creatingClassTemplateDivision, setCreatingClassTemplateDivision] = useState(false);
  const [creatingClass, setCreatingClass] = useState<"preset" | "custom" | null>(null);
  const [creatingDivision, setCreatingDivision] = useState(false);
  const [editingClassTemplate, setEditingClassTemplate] = useState<ClassTemplate | null>(null);
  const [editingClassTemplateDivision, setEditingClassTemplateDivision] = useState<ClassTemplateDivision | null>(null);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);

  async function handleDeleteClassTemplate(template: ClassTemplate) {
    const templateClassCount = classTemplateDivisions.filter((division) => division.class_template_id === template.id).length;
    const message = templateClassCount
      ? `Supprimer le bloc preset "${template.name}" et ses ${templateClassCount} classe${templateClassCount === 1 ? "" : "s"} de bloc preset?`
      : `Supprimer le bloc preset "${template.name}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteClassTemplate(template.id);
    if (editingClassTemplate?.id === template.id) {
      setEditingClassTemplate(null);
    }
  }

  async function handleDeleteClassTemplateDivision(division: ClassTemplateDivision) {
    if (!window.confirm(`Supprimer la classe de bloc preset "${division.name}"? Les classes déjà créées depuis ce bloc preset resteront dans leurs blocs.`)) {
      return;
    }

    await onDeleteClassTemplateDivision(division.id);
    if (editingClassTemplateDivision?.id === division.id) {
      setEditingClassTemplateDivision(null);
    }
  }

  async function handleDeleteClass(classRecord: ClassRecord) {
    const classDivisions = divisions.filter((division) => division.class_id === classRecord.id);
    const classDivisionIds = new Set(classDivisions.map((division) => division.id));
    const entryCount = entries.filter((entry) => classDivisionIds.has(entry.division_id)).length;
    const message = [
      `Supprimer le bloc "${classRecord.name}"?`,
      classDivisions.length ? `${classDivisions.length} classe${classDivisions.length === 1 ? " sera supprimee" : "s seront supprimees"}.` : null,
      entryCount ? `${entryCount} inscription${entryCount === 1 ? " liee sera aussi supprimee" : "s liees seront aussi supprimees"}.` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteClass(classRecord.id);
    if (editingClass?.id === classRecord.id) {
      setEditingClass(null);
    }
  }

  async function handleDeleteDivision(division: Division) {
    const entryCount = entries.filter((entry) => entry.division_id === division.id).length;
    const message = entryCount
      ? `Supprimer la classe "${division.name}"? ${entryCount} inscription${entryCount === 1 ? " liee sera aussi supprimee" : "s liees seront aussi supprimees"}.`
      : `Supprimer la classe "${division.name}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteDivision(division.id);
    if (editingDivision?.id === division.id) {
      setEditingDivision(null);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Horaire", "Schedule")}
        title={uiText(locale, "Blocs et classes", "Schedule blocks and classes")}
        description={uiText(locale, "Structure l'horaire sportif: blocs, classes, frais et statuts d'ouverture.", "Structure the show schedule: schedule blocks, classes, fees and entry status.")}
        stats={[
          { label: uiText(locale, "Blocs", "Blocks"), value: String(classes.length) },
          { label: uiText(locale, "Classes", "Classes"), value: String(divisions.length) },
          { label: "Presets", value: String(classTemplates.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter à l'horaire", "Add to schedule")}</h2>
            <p>{uiText(locale, "Crée un bloc depuis un bloc preset, un bloc libre ou une classe sans quitter l'horaire.", "Create a block from a preset, a custom block or a class without leaving the schedule.")}</p>
          </div>
          <div className="row-actions">
            <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingClassTemplate(true)}>
              <Plus size={18} />
              {uiText(locale, "Bloc preset", "Block preset")}
            </button>
            <button className="primary-button" disabled={!organization || !classTemplates.length} type="button" onClick={() => setCreatingClassTemplateDivision(true)}>
              <Plus size={18} />
              {uiText(locale, "Classe de bloc preset", "Preset block class")}
            </button>
            <button className="primary-button" disabled={!organization || !shows.length || !classTemplates.length} type="button" onClick={() => setCreatingClass("preset")}>
              <Plus size={18} />
              {uiText(locale, "Bloc preset", "Preset block")}
            </button>
            <button className="primary-button" disabled={!organization || !shows.length} type="button" onClick={() => setCreatingClass("custom")}>
              <Plus size={18} />
              {uiText(locale, "Bloc libre", "Custom block")}
            </button>
            <button className="primary-button" disabled={!organization || !classes.length} type="button" onClick={() => setCreatingDivision(true)}>
              <Plus size={18} />
              {uiText(locale, "Classe", "Class")}
            </button>
          </div>
        </div>
      </section>

      {creatingClassTemplate ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Catalogue réutilisable de l'association.", "Reusable association catalog.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouveau bloc preset", "New block preset")} onClose={() => setCreatingClassTemplate(false)}>
          <ClassTemplateForm
            locale={locale}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            onCreateClassTemplate={onCreateClassTemplate}
            onCreated={() => setCreatingClassTemplate(false)}
          />
        </ModalDialog>
      ) : null}

      {creatingClassTemplateDivision ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Classe régulière rattachée à un bloc preset.", "Reusable class attached to a block preset.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Classe de bloc preset", "Preset block class")} onClose={() => setCreatingClassTemplateDivision(false)}>
          <ClassTemplateDivisionForm
            locale={locale}
            classTemplates={classTemplates}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            onCreateClassTemplateDivision={onCreateClassTemplateDivision}
            onCreated={() => setCreatingClassTemplateDivision(false)}
          />
        </ModalDialog>
      ) : null}

      {creatingClass ? (
        <ModalDialog className="class-program-modal" description={creatingClass === "preset" ? uiText(locale, "Choisis un bloc preset ou passe en bloc libre au besoin.", "Choose a block preset or switch to custom if needed.") : uiText(locale, "Crée un bloc hors catalogue.", "Create a block outside the catalog.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={creatingClass === "preset" ? uiText(locale, "Nouveau bloc depuis bloc preset", "New block from preset") : uiText(locale, "Nouveau bloc libre", "New custom block")} onClose={() => setCreatingClass(null)}>
          <ClassForm
            locale={locale}
            classes={classes}
            classTemplateDivisions={classTemplateDivisions}
            classTemplates={classTemplates}
            defaultMode={creatingClass}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            showDays={showDays}
            shows={shows}
            onCreateClass={onCreateClass}
            onCreateDivision={onCreateDivision}
            onCreated={() => setCreatingClass(null)}
          />
        </ModalDialog>
      ) : null}

      {creatingDivision ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Ajoute une classe d'inscription sous un bloc existant.", "Add an entry class under an existing block.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouvelle classe", "New class")} onClose={() => setCreatingDivision(false)}>
          <DivisionForm locale={locale} classes={classes} organization={organization} sanctioningBodies={sanctioningBodies} shows={shows} onCreateDivision={onCreateDivision} onCreated={() => setCreatingDivision(false)} />
        </ModalDialog>
      ) : null}

      {editingClassTemplate ? (
        <ModalDialog className="class-program-modal" description={editingClassTemplate.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier le bloc preset", "Edit block preset")} onClose={() => setEditingClassTemplate(null)}>
          <ClassTemplateEditForm
            locale={locale}
            classTemplate={editingClassTemplate}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingClassTemplate(null)}
            onUpdateClassTemplate={async (id, input) => {
              await onUpdateClassTemplate(id, input);
              setEditingClassTemplate(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingClassTemplateDivision ? (
        <ModalDialog className="class-program-modal" description={editingClassTemplateDivision.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier la classe de bloc preset", "Edit preset block class")} onClose={() => setEditingClassTemplateDivision(null)}>
          <ClassTemplateDivisionEditForm
            locale={locale}
            classTemplates={classTemplates}
            classTemplateDivision={editingClassTemplateDivision}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingClassTemplateDivision(null)}
            onUpdateClassTemplateDivision={async (id, input) => {
              await onUpdateClassTemplateDivision(id, input);
              setEditingClassTemplateDivision(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingClass ? (
        <ModalDialog className="class-program-modal" description={editingClass.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier le bloc", "Edit block")} onClose={() => setEditingClass(null)}>
          <ClassEditForm
            locale={locale}
            classes={classes}
            classRecord={editingClass}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingClass(null)}
            onUpdateClass={async (id, input) => {
              await onUpdateClass(id, input);
              setEditingClass(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingDivision ? (
        <ModalDialog className="class-program-modal" description={editingDivision.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier la classe", "Edit class")} onClose={() => setEditingDivision(null)}>
          <DivisionEditForm
            locale={locale}
            classes={classes}
            division={editingDivision}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingDivision(null)}
            onUpdateDivision={async (id, input) => {
              await onUpdateDivision(id, input);
              setEditingDivision(null);
            }}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Blocs presets", "Block presets")}</h2>
            <p>{classTemplates.length ? uiText(locale, `${classTemplates.length} bloc${classTemplates.length === 1 ? "" : "s"} preset configuré${classTemplates.length === 1 ? "" : "s"}.`, `${classTemplates.length} block preset${classTemplates.length === 1 ? "" : "s"} configured.`) : uiText(locale, "Le catalogue de blocs récurrents de l'association.", "The association catalog of reusable schedule blocks.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Bloc preset", "Block preset")}</span>
            <span>{uiText(locale, "Sanctions", "Sanctioning")}</span>
            <span>{uiText(locale, "Dossard", "Back number")}</span>
            <span>{uiText(locale, "Classes", "Classes")}</span>
          </div>
          {classTemplates.map((template) => {
            const templateDivisions = classTemplateDivisions.filter((division) => division.class_template_id === template.id);
            return (
              <div className="table-row" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <span className="muted-line">
                    {[
                      template.block_label,
                      template.category,
                      template.default_pattern ? `Pattern ${template.default_pattern}` : null,
                    ]
                      .filter(Boolean)
                      .join(" - ") || template.code || uiText(locale, "Bloc preset", "Block preset")}
                  </span>
                  <button className="text-button inline-action" type="button" onClick={() => setEditingClassTemplate(template)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text inline-action" type="button" onClick={() => handleDeleteClassTemplate(template)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
                <span>{sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale)}</span>
                <span>{backNumberPolicyLabel(template.back_number_policy, locale)}</span>
                <span>
                  {templateDivisions.length
                    ? templateDivisions
                        .map((division) =>
                          [
                            division.code ? `#${division.code}` : null,
                            division.name,
                            isNrhaSanctioned(division.sanctioning_body_codes) ? nrhaClassTypeLabel(nrhaClassTypeFromRules(division.eligibility_rules)) || uiText(locale, "type NRHA à préciser", "NRHA type required") : null,
                            division.default_entry_fee == null ? null : `insc. ${formatCurrency(division.default_entry_fee, organization?.currency ?? "CAD")}`,
                            division.default_judge_fee == null ? null : `juge ${formatCurrency(division.default_judge_fee, organization?.currency ?? "CAD")}`,
                            payoutTemplateDivisionSummary(division, locale),
                          ]
                            .filter(Boolean)
                            .join(" "),
                        )
                        .join(", ")
                    : uiText(locale, "Aucune classe", "No classes")}
                </span>
              </div>
            );
          })}
          {!classTemplates.length ? <EmptyState label={uiText(locale, "Crée le premier bloc preset de cette association.", "Create the first block preset for this association.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Classes de blocs presets", "Preset block classes")}</h2>
            <p>{classTemplateDivisions.length ? uiText(locale, `${classTemplateDivisions.length} classe${classTemplateDivisions.length === 1 ? "" : "s"} de bloc preset.`, `${classTemplateDivisions.length} preset block class${classTemplateDivisions.length === 1 ? "" : "es"}.`) : uiText(locale, "Ajoute les classes régulières sous un bloc preset.", "Add reusable classes under a block preset.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Classe", "Class")}</span>
            <span>{uiText(locale, "Bloc preset", "Block preset")}</span>
            <span>{uiText(locale, "Frais", "Fees")}</span>
            <span>{uiText(locale, "Action", "Action")}</span>
          </div>
          {classTemplateDivisions.map((division) => (
            <div className="table-row" key={division.id}>
              <div>
                <strong>{division.name}</strong>
                <span className="muted-line">
                  {[
                    division.code ? `#${division.code}` : uiText(locale, "Sans code", "No code"),
                    isNrhaSanctioned(division.sanctioning_body_codes) ? nrhaClassTypeLabel(nrhaClassTypeFromRules(division.eligibility_rules)) || uiText(locale, "Type NRHA à préciser", "NRHA type required") : null,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </span>
              </div>
              <span>{findById(classTemplates, division.class_template_id)?.name ?? uiText(locale, "Bloc preset inconnu", "Unknown block preset")}</span>
              <span>
                {[
                  division.default_entry_fee == null ? null : `${uiText(locale, "Insc.", "Entry")} ${formatCurrency(division.default_entry_fee, organization?.currency ?? "CAD")}`,
                  division.default_judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.default_judge_fee, organization?.currency ?? "CAD")}`,
                  payoutTemplateDivisionSummary(division, locale),
                ]
                  .filter(Boolean)
                  .join(" - ") || uiText(locale, "Aucun frais", "No fees")}
              </span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingClassTemplateDivision(division)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteClassTemplateDivision(division)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!classTemplateDivisions.length ? <EmptyState label={uiText(locale, "Aucune classe de bloc preset pour l'instant.", "No preset block classes yet.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Blocs", "Schedule blocks")}</h2>
            <p>{classes.length ? uiText(locale, `${classes.length} bloc${classes.length === 1 ? "" : "s"} configuré${classes.length === 1 ? "" : "s"}.`, `${classes.length} schedule block${classes.length === 1 ? "" : "s"} configured.`) : uiText(locale, "Les blocs regroupent les classes qui partagent un ordre de passage.", "Schedule blocks group classes that share one draw order.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Bloc", "Block")}</span>
            <span>{uiText(locale, "Concours", "Show")}</span>
            <span>{uiText(locale, "Horaire", "Schedule")}</span>
            <span>{uiText(locale, "Action", "Action")}</span>
          </div>
          {classes.map((classRecord) => {
            const classDivisions = divisions.filter((division) => division.class_id === classRecord.id);
            return (
              <div className="table-row" key={classRecord.id}>
                <div>
                  <strong>{classRecord.name}</strong>
                  <span className="muted-line">
                    {classDivisions.length ? uiText(locale, `${classDivisions.length} classe${classDivisions.length === 1 ? "" : "s"}`, `${classDivisions.length} class${classDivisions.length === 1 ? "" : "es"}`) : uiText(locale, "Aucune classe", "No classes")}
                    {classRecord.entry_fee == null ? "" : ` - ${formatCurrency(classRecord.entry_fee, organization?.currency ?? "CAD")}`}
                  </span>
                </div>
                <div>
                  <span>{showLabel(findById(shows, classRecord.show_id))}</span>
                  <span className="muted-line">
                    {classRecord.show_day_id && findById(showDays, classRecord.show_day_id) ? showDayLabel(findById(showDays, classRecord.show_day_id) as ShowDay) : uiText(locale, "Aucune journée", "No day")}
                  </span>
                </div>
                <div>
                  <span>{sanctionLabel(classRecord.sanctioning_body_codes, sanctioningBodies, locale)}</span>
                  <span className="muted-line">
                    {[
                      classRecord.pattern ? `Pattern ${classRecord.pattern}` : null,
                      classRecord.nrha_slate_number ? `Slate / show technique ${classRecord.nrha_slate_number}` : null,
                      concurrentClassLabel(classRecord, classes, locale),
                      backNumberPolicyLabel(classRecord.back_number_policy, locale),
                      classEntriesCloseLabel(classRecord),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
                <div className="row-actions">
                  <button className="text-button" type="button" onClick={() => setEditingClass(classRecord)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteClass(classRecord)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            );
          })}
          {!classes.length ? <EmptyState label={uiText(locale, "Crée le premier bloc du concours.", "Create the first schedule block for the show.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Classes", "Classes")}</h2>
            <p>{divisions.length ? uiText(locale, `${divisions.length} classe${divisions.length === 1 ? "" : "s"} configurée${divisions.length === 1 ? "" : "s"}.`, `${divisions.length} class${divisions.length === 1 ? "" : "es"} configured.`) : uiText(locale, "Les classes sont rattachées aux blocs.", "Classes are attached to schedule blocks.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Classe", "Class")}</span>
            <span>{uiText(locale, "Bloc", "Block")}</span>
            <span>{uiText(locale, "Sanctions", "Sanctioning")}</span>
            <span>{uiText(locale, "Action", "Action")}</span>
          </div>
          {divisions.map((division) => (
            <div className="table-row" key={division.id}>
              <div>
                <strong>{division.name}</strong>
                <span className="muted-line">
                  {[
                    division.code ? `#${division.code}` : null,
                    isNrhaSanctioned(division.sanctioning_body_codes) ? nrhaClassTypeLabel(nrhaClassTypeFromRules(division.eligibility_rules)) || uiText(locale, "Type NRHA à préciser", "NRHA type required") : null,
                    division.entry_fee == null ? uiText(locale, "Frais classe", "Class fee") : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(division.entry_fee, organization?.currency ?? "CAD")}`,
                    division.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                    payoutDivisionSummary(division, locale),
                    ]
                    .filter(Boolean)
                    .join(" - ")}
                </span>
              </div>
              <span>{findById(classes, division.class_id)?.name ?? uiText(locale, "Bloc inconnu", "Unknown block")}</span>
              <span>{sanctionLabel(division.sanctioning_body_codes, sanctioningBodies, locale)}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingDivision(division)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteDivision(division)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!divisions.length ? <EmptyState label={uiText(locale, "Crée une classe après avoir créé un bloc.", "Create a class after creating a schedule block.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function EntriesView({
  locale,
  classes,
  contacts,
  contactExternalMemberships,
  contactRoles,
  divisions,
  entries,
  externalOrganizations,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteEntry,
  onUpdateEntry,
  onVerifyGvlCogginsDocument,
}: {
  locale: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
}) {
  const [creatingEntry, setCreatingEntry] = useState(false);
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
        eyebrow={uiText(locale, "Inscriptions", "Entries")}
        title={uiText(locale, "Gestion des inscriptions", "Entry management")}
        description={uiText(locale, "Crée et ajuste les brouillons avant paiement, facturation ou préparation du pointage.", "Create and adjust drafts before checkout, billing or scoring preparation.")}
        stats={[
          { label: uiText(locale, "Inscriptions", "Entries"), value: String(entries.length) },
          { label: uiText(locale, "Brouillons", "Drafts"), value: String(entries.filter((entry) => entry.status === "draft").length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Nouvelle inscription", "New entry")}</h2>
            <p>{uiText(locale, "Ouvre le formulaire et complète les contacts ou chevaux manquants sans changer de page.", "Open the form and complete missing contacts or horses without leaving the page.")}</p>
          </div>
          <button className="primary-button" disabled={!organization || !shows.length || !divisions.length} type="button" onClick={() => setCreatingEntry(true)}>
            <Plus size={18} />
            {uiText(locale, "Inscription", "Entry")}
          </button>
        </div>
      </section>

      {creatingEntry ? (
        <ModalDialog className="entry-form-modal" description={uiText(locale, "Brouillon maintenant, paiement plus tard.", "Draft now, checkout later.")} eyebrow={uiText(locale, "Inscriptions", "Entries")} title={uiText(locale, "Nouvelle inscription", "New entry")} onClose={() => setCreatingEntry(false)}>
          <EntryForm
            locale={locale}
            classes={classes}
            contacts={contacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={contactRoles}
            divisions={divisions}
            entries={entries}
            externalOrganizations={externalOrganizations}
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            membershipRequirements={membershipRequirements}
            organization={organization}
            profileId={profileId}
            shows={shows}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onCreated={() => setCreatingEntry(false)}
          />
        </ModalDialog>
      ) : null}

      {editingEntry ? (
        <ModalDialog className="entry-form-modal" description={horseLabel(findById(horses, editingEntry.horse_id))} eyebrow={uiText(locale, "Inscriptions", "Entries")} title={uiText(locale, "Modifier l'inscription", "Edit entry")} onClose={() => setEditingEntry(null)}>
          <EntryEditForm
            locale={locale}
            classes={classes}
            contacts={contacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={contactRoles}
            divisions={divisions}
            entries={entries}
            entry={editingEntry}
            externalOrganizations={externalOrganizations}
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            membershipRequirements={membershipRequirements}
            organization={organization}
            profileId={profileId}
            shows={shows}
            onCancel={() => setEditingEntry(null)}
            onCreateContact={onCreateContact}
            onUpdateEntry={async (id, input) => {
              await onUpdateEntry(id, input);
              setEditingEntry(null);
            }}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Inscriptions", "Entries")}</h2>
            <p>{entries.length ? uiText(locale, `${entries.length} inscription${entries.length === 1 ? "" : "s"} créée${entries.length === 1 ? "" : "s"}.`, `${entries.length} entr${entries.length === 1 ? "y" : "ies"} created.`) : uiText(locale, "Les brouillons d'inscription apparaissent ici avant paiement.", "Draft entries appear here before checkout.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Classe", "Class")}</span>
            <span>{uiText(locale, "Propriétaire", "Owner")}</span>
            <span>Action</span>
          </div>
          {entries.map((entry) => (
            <div className="table-row" key={entry.id}>
              <div>
                <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
                <span className="muted-line">{uiText(locale, "Dossard", "Back number")}: {entry.entry_number ?? uiText(locale, "à assigner", "to assign")}</span>
              </div>
              <span>{divisionLabel(findById(divisions, entry.division_id), classes)}</span>
              <span>{contactLabel(findById(contacts, entry.owner_contact_id))}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingEntry(entry)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteEntry(entry)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!entries.length ? <EmptyState label={uiText(locale, "Crée un brouillon après avoir ajouté les contacts, chevaux, blocs et classes.", "Create a draft after adding contacts, horses, schedule blocks and classes.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function ScoringView({
  locale,
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
  locale: Locale;
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
  const [expandedDrawClassIds, setExpandedDrawClassIds] = useState<string[]>([]);
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

  function toggleDraw(classId: string) {
    setExpandedDrawClassIds((current) => (current.includes(classId) ? current.filter((candidate) => candidate !== classId) : [...current, classId]));
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Pointage", "Scoring")}
        title={uiText(locale, "Préparation ShowScore", "ShowScore preparation")}
        description={uiText(locale, "Prépare les blocs, passages, chevaux et cavaliers qui doivent être envoyés vers le pointage.", "Prepare schedule blocks, runs, horses and riders that need to be sent to scoring.")}
        stats={[
          { label: uiText(locale, "Blocs", "Blocks"), value: String(visibleClasses.length) },
          { label: "Runs", value: String(totalRuns) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label={uiText(locale, "Blocs de pointage", "Scoring blocks")} value={String(visibleClasses.length)} />
        <Metric label={uiText(locale, "Runs depuis les inscriptions", "Runs from entries")} value={String(totalRuns)} />
        <Metric label={uiText(locale, "Préparations prêtes", "Prepared setups")} value={String(visibleClasses.filter((classRecord) => preparedClassIds.has(classRecord.id)).length)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>ShowScore bridge</h2>
            <p>{uiText(locale, "Prépare les runs de pointage depuis les inscriptions HSP en gardant associations, blocs, chevaux et cavaliers alignés.", "Prepare scoring setup runs from HSP entries while keeping associations, blocks, horses and riders aligned.")}</p>
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
            <span>Bloc</span>
            <span>{uiText(locale, "Horaire", "Schedule")}</span>
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
            const entriesClosed = classEntriesAreClosed(classRecord);
            const status = !entriesClosed ? uiText(locale, "Inscriptions ouvertes", "Entries open") : setup?.finalized ? uiText(locale, "Finalisé", "Finalized") : setup ? uiText(locale, "Ordre sorti", "Draw created") : runs.length ? uiText(locale, "Prêt à sortir", "Ready to draw") : uiText(locale, "Aucune inscription", "No entries");
            const statusClass = !entriesClosed ? "warning" : setup?.finalized ? "closed" : setup ? "info" : runs.length ? "open" : "draft";
            const canPrepare = entriesClosed && runs.length > 0 && !setup?.locked_at && !setup?.finalized;
            const prepareLabel = !entriesClosed ? uiText(locale, "Sortie après cutoff", "Draw after cutoff") : busyClassId === classRecord.id ? uiText(locale, "Préparation", "Preparing") : setup ? uiText(locale, "Rafraîchir ordre", "Refresh draw") : uiText(locale, "Sortir ordre", "Create draw");

            const drawRuns = setup?.runs.length ? normalizeShowScoreRuns(setup.runs) : runs;
            const drawIsExpanded = expandedDrawClassIds.includes(classRecord.id);
            const lateRunCount = drawRuns.filter((run) => run.isLate || run.drawGroup === "late").length;
            const regularRunCount = Math.max(0, drawRuns.length - lateRunCount);
            const lastRegularDraw = drawRuns.reduce((highest, run) => (run.draw > 0 ? Math.max(highest, run.draw) : highest), 0);
            const missingBackNumberCount = drawRuns.filter((run) => !run.backNumber.trim()).length;

            return (
              <div className="scoring-class-group" key={classRecord.id}>
                <div className="table-row">
                  <div>
                    <strong>{classRecord.name}</strong>
                    <span className="muted-line">{classRecord.code || uiText(locale, "Sans code", "No code")}</span>
                  </div>
                  <div>
                    <span>{showLabel(show)}</span>
                    <span className="muted-line">{day ? `${day.day_name || uiText(locale, "Jour", "Day")} - ${formatDate(day.day_date)}` : uiText(locale, "Aucune journée assignée", "No day assigned")}</span>
                    <span className="muted-line">{classEntriesCloseLabel(classRecord)}</span>
                  </div>
                  <div>
                    <strong>{runs.length}</strong>
                    <span className="muted-line">{preparedRunCount ? uiText(locale, `${preparedRunCount} sauvegardé${preparedRunCount === 1 ? "" : "s"}`, `${preparedRunCount} saved`) : uiText(locale, "Pas encore sauvegardé", "Not saved yet")}</span>
                  </div>
                  <div className="row-actions">
                    <span className={`badge ${statusClass}`}>{status}</span>
                    <button className="text-button" disabled={!canPrepare || busyClassId === classRecord.id} type="button" onClick={() => handlePrepare(classRecord)}>
                      {prepareLabel}
                    </button>
                    <button className="text-button" disabled={!drawRuns.length} type="button" onClick={() => toggleDraw(classRecord.id)}>
                      {drawIsExpanded ? uiText(locale, "Masquer ordre", "Hide draw") : uiText(locale, "Voir ordre", "View draw")}
                    </button>
                  </div>
                </div>
                {drawIsExpanded ? (
                  <div className="draw-detail-panel">
                    <div className="draw-detail-summary">
                      <span>{drawRuns.length} {uiText(locale, "passages", "runs")}</span>
                      <span>{lateRunCount} {uiText(locale, "tardifs", "late")}</span>
                      <span>{regularRunCount} {uiText(locale, "réguliers", "regular")}</span>
                      <span>{uiText(locale, "Dernier draw", "Last draw")} {lastRegularDraw || "-"}</span>
                      <span>{missingBackNumberCount ? uiText(locale, `${missingBackNumberCount} dossard${missingBackNumberCount === 1 ? "" : "s"} à assigner`, `${missingBackNumberCount} back number${missingBackNumberCount === 1 ? "" : "s"} to assign`) : uiText(locale, "Dossards complets", "Back numbers complete")}</span>
                    </div>
                    <div className="draw-list">
                      <div className="draw-list-row draw-list-head">
                        <span>Draw</span>
                        <span>Dossard</span>
                        <span>{uiText(locale, "Cavalier", "Rider")}</span>
                        <span>{uiText(locale, "Cheval", "Horse")}</span>
                        <span>{uiText(locale, "Propriétaire", "Owner")}</span>
                        <span>{uiText(locale, "Classes inscrites", "Entered classes")}</span>
                        <span>{uiText(locale, "Statut", "Status")}</span>
                      </div>
                      {drawRuns.map((run) => (
                        <div className="draw-list-row" key={`${run.entryId}-${run.draw}`}>
                          <strong>{formatDrawNumber(run.draw)}</strong>
                          <span className={run.backNumber.trim() ? undefined : "draw-missing-value"}>{formatBackNumber(run.backNumber)}</span>
                          <span>{run.rider || "-"}</span>
                          <span>{run.horse || "-"}</span>
                          <span>{run.owner || "-"}</span>
                          <span>{formatRunDivisionNames(run, divisions, classes)}</span>
                          <span className={`badge ${run.isLate || run.drawGroup === "late" ? "warning" : "info"}`}>
                            {run.isLate || run.drawGroup === "late" ? uiText(locale, "Tardif", "Late") : uiText(locale, "Régulier", "Regular")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!visibleClasses.length ? <EmptyState label={uiText(locale, "Crée des blocs avant de préparer ShowScore.", "Create schedule blocks before preparing ShowScore.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function normalizeShowScoreRuns(runs: Array<Record<string, unknown>>): ShowScoreRun[] {
  return runs
    .map((run, index) => {
      const entryId = stringFromRecord(run, "entryId") || stringFromRecord(run, "entry_id") || stringFromRecord(run, "id");
      const draw = numberFromRecord(run, "draw") ?? numberFromRecord(run, "order") ?? index + 1;

      if (!entryId) {
        return null;
      }

      const drawGroup = stringFromRecord(run, "drawGroup") === "late" || booleanFromRecord(run, "isLate") ? "late" : "regular";
      const divisionNames = stringArrayFromRecord(run, "divisionNames");

      return {
        id: stringFromRecord(run, "id") || entryId,
        entryId,
        classId: stringFromRecord(run, "classId") || stringFromRecord(run, "class_id"),
        divisionId: stringFromRecord(run, "divisionId") || stringFromRecord(run, "division_id"),
        horseId: stringFromRecord(run, "horseId") || stringFromRecord(run, "horse_id"),
        riderContactId: stringFromRecord(run, "riderContactId") || stringFromRecord(run, "rider_contact_id") || null,
        ownerContactId: stringFromRecord(run, "ownerContactId") || stringFromRecord(run, "owner_contact_id"),
        payerContactId: stringFromRecord(run, "payerContactId") || stringFromRecord(run, "payer_contact_id"),
        order: numberFromRecord(run, "order") ?? draw,
        draw,
        backNumber: stringFromRecord(run, "backNumber") || stringFromRecord(run, "back_number"),
        rider: stringFromRecord(run, "rider"),
        horse: stringFromRecord(run, "horse"),
        owner: stringFromRecord(run, "owner"),
        divisionNames: divisionNames.length ? divisionNames : stringArrayFromRecord(run, "division_names"),
        isLate: drawGroup === "late",
        drawGroup,
      };
    })
    .filter((run): run is ShowScoreRun => Boolean(run))
    .sort((first, second) => first.draw - second.draw);
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : false;
}

function formatDrawNumber(draw: number) {
  return draw < 0 ? String(draw) : `#${draw}`;
}

function formatBackNumber(backNumber: string) {
  return backNumber.trim() || "A assigner";
}

function formatRunDivisionNames(run: ShowScoreRun, divisions: Division[], classes: ClassRecord[]) {
  if (run.divisionNames.length) {
    return run.divisionNames.join(", ");
  }

  const division = findById(divisions, run.divisionId);
  return division ? divisionLabel(division, classes) : run.divisionId || "-";
}

function entryNumberValue(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : null;
}

function organizationBackNumberMode(organization: Organization | null | undefined): OrganizationBackNumber["assignment_mode"] {
  return organization?.back_number_policy === "rider" || organization?.back_number_policy === "horse_rider_team" ? organization.back_number_policy : "horse";
}

function backNumberModeNeedsHorse(mode: OrganizationBackNumber["assignment_mode"]) {
  return mode === "horse" || mode === "horse_rider_team";
}

function backNumberModeNeedsRider(mode: OrganizationBackNumber["assignment_mode"]) {
  return mode === "rider" || mode === "horse_rider_team";
}

function backNumberAssignmentMatchesTarget(
  backNumber: OrganizationBackNumber,
  mode: OrganizationBackNumber["assignment_mode"],
  horseId: string | null,
  riderContactId: string | null,
) {
  if (backNumber.assignment_mode !== mode) {
    return false;
  }

  if (mode === "horse") {
    return backNumber.assigned_horse_id === horseId;
  }

  if (mode === "rider") {
    return backNumber.assigned_rider_contact_id === riderContactId;
  }

  return backNumber.assigned_horse_id === horseId && backNumber.assigned_rider_contact_id === riderContactId;
}

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

function backNumberAssigneeLabel(backNumber: OrganizationBackNumber, horses: Horse[], contacts: Contact[], locale: Locale = "fr") {
  const horse = backNumber.assigned_horse_id ? findById(horses, backNumber.assigned_horse_id) : undefined;
  const rider = backNumber.assigned_rider_contact_id ? findById(contacts, backNumber.assigned_rider_contact_id) : undefined;

  if (backNumber.status !== "assigned") {
    return uiText(locale, "Non assigné", "Unassigned");
  }

  if (backNumber.assignment_mode === "horse_rider_team") {
    return `${horseLabel(horse)} + ${contactLabel(rider)}`;
  }

  if (backNumber.assignment_mode === "rider") {
    return contactLabel(rider);
  }

  return horseLabel(horse);
}

function backNumberAssignmentMeta(backNumber: OrganizationBackNumber, locale: Locale = "fr") {
  if (backNumber.status === "assigned" && backNumber.assigned_at) {
    return uiText(locale, `Assigné le ${formatDate(backNumber.assigned_at.slice(0, 10))}`, `Assigned on ${formatDate(backNumber.assigned_at.slice(0, 10))}`);
  }

  return uiText(locale, "Inventaire association", "Association inventory");
}

function backNumberModeLabel(mode: OrganizationBackNumber["assignment_mode"], locale: Locale = "fr") {
  if (mode === "horse_rider_team") {
    return uiText(locale, "Équipe cheval+cavalier", "Horse+rider team");
  }

  if (mode === "rider") {
    return uiText(locale, "Cavalier", "Rider");
  }

  return uiText(locale, "Cheval", "Horse");
}

function backNumberStatusLabel(status: OrganizationBackNumber["status"], locale: Locale = "fr") {
  if (status === "available") {
    return uiText(locale, "Disponible", "Available");
  }

  if (status === "assigned") {
    return uiText(locale, "Assigné", "Assigned");
  }

  if (status === "reserved") {
    return uiText(locale, "Réservé", "Reserved");
  }

  if (status === "lost") {
    return uiText(locale, "Perdu", "Lost");
  }

  return uiText(locale, "Retiré", "Retired");
}

function backNumberStatusBadgeClass(status: OrganizationBackNumber["status"]) {
  if (status === "available" || status === "assigned") {
    return "info";
  }

  if (status === "reserved") {
    return "warning";
  }

  return "error";
}

function contactBackNumberDetail(contact: Contact, selectedHorse: Horse | null, horseContacts: HorseContact[]) {
  if (!selectedHorse) {
    return contact.email || contact.type;
  }

  const horseContact = horseContacts.find((candidate) => candidate.horse_id === selectedHorse.id && candidate.contact_id === contact.id);
  return horseContact ? `Lie au cheval - ${horseContact.role}` : contact.email || contact.type;
}

function MyHorsesView({
  locale,
  contacts,
  contactRoles,
  canManageHealthDocuments,
  externalOrganizations,
  horses,
  horseExternalMemberships,
  horseHealthDocuments,
  horseContacts,
  organization,
  profileId,
  onCreateContact,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteHorse,
  onReviewHorseHealthDocument,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
}: {
  locale: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  canManageHealthDocuments: boolean;
  externalOrganizations: ExternalOrganization[];
  horses: Horse[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horseContacts: HorseContact[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
}) {
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);

  async function handleDeleteHorse(horse: Horse) {
    if (!window.confirm(uiText(locale, `Supprimer ${horse.name} et les inscriptions/réservations liées?`, `Delete ${horse.name} and linked entries/reservations?`))) {
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
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes chevaux", "My horses")}
        description={uiText(locale, "Gère les chevaux liés à ton profil avant de les inscrire à un concours.", "Manage horses linked to your profile before entering them in a show.")}
        stats={[
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
          { label: "Contacts", value: String(contacts.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter un cheval", "Add horse")}</h2>
            <p>{uiText(locale, "Ajoute ses infos, ses contacts et ses documents santé sans sortir de cette page.", "Add details, contacts and health documents without leaving this page.")}</p>
          </div>
          <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingHorse(true)}>
            <Plus size={18} />
            {uiText(locale, "Cheval", "Horse")}
          </button>
        </div>
      </section>

      {creatingHorse ? (
        <ModalDialog description={uiText(locale, "Ajoute le cheval à ton profil et complète les documents requis.", "Add the horse to your profile and complete required documents.")} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Nouveau cheval", "New horse")} onClose={() => setCreatingHorse(false)}>
          <HorseForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            externalOrganizations={externalOrganizations}
            organization={organization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onCreated={() => setCreatingHorse(false)}
          />
        </ModalDialog>
      ) : null}

      {editingHorse ? (
        <ModalDialog className="horse-form-modal" description={editingHorse.name} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier le cheval", "Edit horse")} onClose={() => setEditingHorse(null)}>
          <HorseEditForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            canManageHealthDocuments={canManageHealthDocuments}
            createdByUserId={profileId}
            externalOrganizations={externalOrganizations}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={horseHealthDocuments}
            horseContacts={horseContacts}
            organization={organization}
            horse={editingHorse}
            onCancel={() => setEditingHorse(null)}
            onCreateContact={onCreateContact}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onReviewHorseHealthDocument={onReviewHorseHealthDocument}
            onUpdateHorse={async (id, input) => {
              await onUpdateHorse(id, input);
              setEditingHorse(null);
            }}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Mes chevaux", "My horses")}</h2>
            <p>{uiText(locale, "Chevaux liés à mon profil utilisateur.", "Horses linked to my user profile.")}</p>
          </div>
        </div>
        <div className="horse-list">
          <div className="horse-list-row horse-list-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>{uiText(locale, "Références", "References")}</span>
            <span>Action</span>
          </div>
          {horses.map((horse) => {
            const healthDisplay = horseHealthDisplay(horse, horseHealthDocuments, organization);
            const referenceChips = horseExternalReferenceChips(horse, horseExternalMemberships, externalOrganizations);

            return (
              <div className={`horse-list-row ${healthDisplay.summary.tone}`} key={horse.id}>
                <div className="horse-list-identity">
                  <strong>{horse.name}</strong>
                  <span>
                    {contactLabel(findById(contacts, horse.primary_owner_contact_id))} · {horseGenderLabel(horse.gender)}
                  </span>
                </div>
                <div className="horse-list-status">
                  <span className={`horse-summary-pill ${healthDisplay.summary.tone}`}>{healthDisplay.summary.label}</span>
                  <div className="horse-chip-row">
                    {healthDisplay.chips.map((chip) => (
                      <span className={`horse-status-chip ${chip.tone}`} key={`${horse.id}-${chip.label}`}>
                        <span>{chip.label}</span>
                        <strong>{chip.value}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="horse-chip-row reference-chip-row">
                  {referenceChips.map((chip) => (
                    <span className={`horse-status-chip ${chip.tone}`} key={`${horse.id}-${chip.label}-${chip.value}`}>
                      <span>{chip.label}</span>
                      <strong>{chip.value}</strong>
                    </span>
                  ))}
                </div>
                <div className="row-actions horse-row-actions">
                  <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteHorse(horse)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            );
          })}
          {!horses.length ? <EmptyState label={uiText(locale, "Aucun cheval lié à ton profil pour l'instant.", "No horse linked to your profile yet.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function MyContactsView({
  locale,
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
  locale: Locale;
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
  const [creatingContact, setCreatingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const canCreateLinkedContact = Boolean(organization && profileId);
  const defaultContactType: Contact["type"] = contacts.length ? "rider" : "owner";

  async function handleDeleteContact(contact: Contact) {
    const label = contactLabel(contact);

    if (!window.confirm(uiText(locale, `Supprimer ${label}? Si ce contact est utilisé comme cavalier dans une inscription de test, il sera détaché de l'inscription.`, `Delete ${label}? If this contact is used as a rider in a test entry, it will be detached from the entry.`))) {
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
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes cavaliers et contacts", "My riders and contacts")}
        description={uiText(locale, "Gère les propriétaires, cavaliers et payeurs liés à ton compte.", "Manage owners, riders and payers linked to your account.")}
        stats={[
          { label: "Contacts", value: String(contacts.length) },
          { label: uiText(locale, "Cavaliers", "Riders"), value: String(contacts.filter((contact) => contact.type === "rider").length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{contacts.length ? uiText(locale, "Ajouter un cavalier / contact", "Add rider / contact") : uiText(locale, "Créer mon premier contact", "Create my first contact")}</h2>
            <p>{contacts.length ? uiText(locale, "Ajoute autant de cavaliers ou contacts que nécessaire sous ce compte.", "Add as many riders or contacts as needed under this account.") : uiText(locale, "Crée d'abord le contact principal du compte.", "Create the account's primary contact first.")}</p>
          </div>
          <button className="primary-button" disabled={!canCreateLinkedContact} type="button" onClick={() => setCreatingContact(true)}>
            <Plus size={18} />
            Contact
          </button>
        </div>
      </section>

      {creatingContact && canCreateLinkedContact ? (
        <ModalDialog eyebrow={uiText(locale, "Mon espace", "My space")} title={contacts.length ? uiText(locale, "Nouveau cavalier / contact", "New rider / contact") : uiText(locale, "Premier contact", "First contact")} onClose={() => setCreatingContact(false)}>
          <ContactForm
            locale={locale}
            key={defaultContactType}
            createdByUserId={profileId}
            defaultType={defaultContactType}
            linkedUserId={profileId}
            externalOrganizations={externalOrganizations}
            membershipRequirements={membershipRequirements}
            organization={organization}
            title={contacts.length ? uiText(locale, "Ajouter un cavalier / contact", "Add rider / contact") : uiText(locale, "Créer mon premier contact", "Create my first contact")}
            description={contacts.length ? uiText(locale, "Ajoute autant de cavaliers ou contacts que nécessaire sous ce compte.", "Add as many riders or contacts as needed under this account.") : uiText(locale, "Crée d'abord le contact principal du compte.", "Create the account's primary contact first.")}
            onCreateContact={onCreateContact}
            onCreated={() => setCreatingContact(false)}
          />
        </ModalDialog>
      ) : null}

      {editingContact ? (
        <ModalDialog description={contactLabel(editingContact)} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier le contact", "Edit contact")} onClose={() => setEditingContact(null)}>
          <ContactEditForm
            locale={locale}
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
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Mes cavaliers", "My riders")}</h2>
            <p>{uiText(locale, "Contacts liés à mon compte.", "Contacts linked to my account.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Nom", "Name")}</span>
            <span>{uiText(locale, "Rôles", "Roles")}</span>
            <span>{uiText(locale, "Courriel", "Email")}</span>
            <span>Action</span>
          </div>
          {contacts.map((contact) => (
            <div className="table-row" key={contact.id}>
              <strong>{contactLabel(contact)}</strong>
              <span>{contactRoleSummary(contact, contactRoles, locale)}</span>
              <span>{contact.email || uiText(locale, "Aucun courriel", "No email")}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteContact(contact)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!contacts.length ? <EmptyState label={uiText(locale, "Crée ton premier contact pour commencer.", "Create your first contact to get started.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function MyEntriesView({
  locale,
  classes,
  contacts,
  contactExternalMemberships,
  contactRoles,
  divisions,
  entries,
  externalOrganizations,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteEntry,
  onUpdateEntry,
  onVerifyGvlCogginsDocument,
}: {
  locale: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
}) {
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  async function handleDeleteEntry(entry: Entry) {
    const horseName = horseLabel(findById(horses, entry.horse_id));
    if (!window.confirm(uiText(locale, `Supprimer l'inscription de ${horseName}?`, `Delete ${horseName}'s entry?`))) {
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
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes inscriptions", "My entries")}
        description={uiText(locale, "Consulte et modifie les inscriptions rattachées à tes chevaux ou contacts.", "Review and edit entries linked to your horses or contacts.")}
        stats={[
          { label: uiText(locale, "Inscriptions", "Entries"), value: String(entries.length) },
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Nouvelle inscription", "New entry")}</h2>
            <p>{uiText(locale, "Inscris un cheval et complète les infos manquantes sans quitter la page.", "Enter a horse and complete missing information without leaving the page.")}</p>
          </div>
          <button className="primary-button" disabled={!organization || !shows.length || !divisions.length} type="button" onClick={() => setCreatingEntry(true)}>
            <Plus size={18} />
            {uiText(locale, "Inscription", "Entry")}
          </button>
        </div>
      </section>

      {creatingEntry ? (
        <ModalDialog className="entry-form-modal" description={uiText(locale, "Brouillon maintenant, paiement plus tard.", "Draft now, checkout later.")} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Nouvelle inscription", "New entry")} onClose={() => setCreatingEntry(false)}>
          <EntryForm
            locale={locale}
            classes={classes}
            contacts={contacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={contactRoles}
            divisions={divisions}
            entries={entries}
            externalOrganizations={externalOrganizations}
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            membershipRequirements={membershipRequirements}
            organization={organization}
            profileId={profileId}
            shows={shows}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onCreated={() => setCreatingEntry(false)}
          />
        </ModalDialog>
      ) : null}

      {editingEntry ? (
        <ModalDialog className="entry-form-modal" description={horseLabel(findById(horses, editingEntry.horse_id))} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier l'inscription", "Edit entry")} onClose={() => setEditingEntry(null)}>
          <EntryEditForm
            locale={locale}
            classes={classes}
            contacts={contacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={contactRoles}
            divisions={divisions}
            entries={entries}
            entry={editingEntry}
            externalOrganizations={externalOrganizations}
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            membershipRequirements={membershipRequirements}
            organization={organization}
            profileId={profileId}
            shows={shows}
            onCancel={() => setEditingEntry(null)}
            onCreateContact={onCreateContact}
            onUpdateEntry={async (id, input) => {
              await onUpdateEntry(id, input);
              setEditingEntry(null);
            }}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Mes inscriptions", "My entries")}</h2>
            <p>{uiText(locale, "Inscriptions liées à mes chevaux ou contacts.", "Entries linked to my horses or contacts.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Classe", "Class")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>Action</span>
          </div>
          {entries.map((entry) => (
            <div className="table-row" key={entry.id}>
              <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
              <div>
                <span>{divisionLabel(findById(divisions, entry.division_id), classes)}</span>
                {entry.is_late ? (
                  <span className="muted-line">
                    {uiText(locale, "Retard", "Late")} +{entry.late_fee_percent}%{entry.late_fee_amount ? ` - ${formatCurrency(entry.late_fee_amount, organization?.currency ?? "CAD")}` : ""}
                  </span>
                ) : null}
              </div>
              <span className={`badge ${entry.status}`}>{entry.status.replace("_", " ")}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingEntry(entry)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteEntry(entry)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!entries.length ? <EmptyState label={uiText(locale, "Aucune inscription liée à ton profil pour l'instant.", "No entries linked to your profile yet.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function BillingView({
  locale,
  contacts,
  currency,
  invoices,
  lineItems,
  organization,
  shows,
  unpaidBalance,
}: {
  locale: Locale;
  contacts: AppContext["contacts"];
  currency: string;
  invoices: AppContext["invoices"];
  lineItems: AppContext["invoiceLineItems"];
  organization: Organization | null;
  shows: AppContext["shows"];
  unpaidBalance: number;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const selectedInvoice = findById(invoices, selectedInvoiceId) ?? null;
  const selectedInvoiceLineItems = selectedInvoice ? lineItems.filter((item) => item.invoice_id === selectedInvoice.id) : [];
  const selectedInvoiceShow = selectedInvoice ? findById(shows, selectedInvoice.show_id) : undefined;
  const selectedInvoicePayer = selectedInvoice ? findById(contacts, selectedInvoice.payer_contact_id) : undefined;

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Facturation", "Billing")}
        title={uiText(locale, "Factures", "Invoices")}
        description={uiText(locale, "Suis les factures, soldes ouverts et lignes créées par les inscriptions ou réservations.", "Track invoices, open balances and lines created by entries or reservations.")}
        stats={[
          { label: uiText(locale, "Factures", "Invoices"), value: String(invoices.length) },
          { label: uiText(locale, "Solde", "Balance"), value: formatCurrency(unpaidBalance, currency) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label={uiText(locale, "Factures", "Invoices")} value={String(invoices.length)} />
        <Metric label={uiText(locale, "Solde ouvert", "Open balance")} value={formatCurrency(unpaidBalance, currency)} />
        <Metric label={uiText(locale, "Payées", "Paid")} value={String(invoices.filter((invoice) => invoice.status === "paid").length)} />
      </section>

      {selectedInvoice ? (
        <InvoiceDetailPanel
          locale={locale}
          currency={currency}
          invoice={selectedInvoice}
          lineItems={selectedInvoiceLineItems}
          organization={organization}
          payerContact={selectedInvoicePayer}
          show={selectedInvoiceShow}
          onClose={() => setSelectedInvoiceId("")}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Factures récentes", "Recent invoices")}</h2>
            <p>{uiText(locale, "Brouillons, factures envoyées, paiements partiels et factures payées.", "Drafts, sent invoices, partial payments and paid invoices.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Facture", "Invoice")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>Total</span>
            <span>{uiText(locale, "Solde", "Balance")}</span>
          </div>
          {invoices.map((invoice) => {
            const invoiceLineItems = lineItems.filter((item) => item.invoice_id === invoice.id);
            const invoiceShow = findById(shows, invoice.show_id);
            const payerContact = findById(contacts, invoice.payer_contact_id);
            return (
              <div className="invoice-group" key={invoice.id}>
                <div className={`table-row invoice-summary-row ${selectedInvoiceId === invoice.id ? "selected" : ""}`}>
                  <button className="invoice-number-button" type="button" onClick={() => setSelectedInvoiceId(invoice.id)}>
                    <FileText size={16} />
                    <span>
                      <strong>#{formatInvoiceNumber(invoice.invoice_number)}</strong>
                      <small>{showLabel(invoiceShow)}</small>
                    </span>
                  </button>
                  <span className={`badge ${invoice.status}`}>{invoiceStatusLabel(invoice.status, locale)}</span>
                  <span>{formatCurrency(invoice.total_amount, currency)}</span>
                  <span>
                    <strong>{formatCurrency(invoice.balance_due, currency)}</strong>
                    <span className="muted-line">{contactLabel(payerContact)}</span>
                  </span>
                </div>
                {invoiceLineItems.map((item) => (
                  <div className="table-row invoice-line-row" key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <span className="muted-line">{invoiceItemTypeLabel(item.item_type, locale)}</span>
                    </div>
                    <span>{invoiceQuantityLabel(item.quantity)} x</span>
                    <span>{formatCurrency(item.unit_price, currency)}</span>
                    <span>{formatCurrency(item.total_price + item.tax_amount, currency)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {!invoices.length ? <EmptyState label={uiText(locale, "Aucune facture pour l'instant. Les inscriptions et réservations créeront maintenant des brouillons de facture.", "No invoices yet. Entries and reservations will now create draft invoices.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function InvoiceDetailPanel({
  locale,
  currency,
  invoice,
  lineItems,
  organization,
  payerContact,
  show,
  onClose,
}: {
  locale: Locale;
  currency: string;
  invoice: AppContext["invoices"][number];
  lineItems: AppContext["invoiceLineItems"];
  organization: Organization | null;
  payerContact: Contact | undefined;
  show: Show | undefined;
  onClose: () => void;
}) {
  const invoiceDocument = buildInvoiceDocumentData({ currency, invoice, lineItems, locale, organization, payerContact, show });

  return (
    <section className="panel span-2 invoice-detail-panel">
      <div className="panel-header invoice-panel-header">
        <div>
          <p className="eyebrow">{uiText(locale, "Version numérique", "Digital version")}</p>
          <h2>{uiText(locale, "Facture", "Invoice")} #{invoiceDocument.invoiceNumber}</h2>
          <p>{invoiceDocument.organizationName} · {invoiceDocument.showName}</p>
        </div>
        <div className="invoice-panel-actions">
          <button className="ghost-button" type="button" onClick={() => exportInvoicePdf(invoiceDocument, locale)}>
            <Download size={16} />
            {uiText(locale, "Exporter PDF", "Export PDF")}
          </button>
          <button className="icon-button" type="button" aria-label={uiText(locale, "Fermer la facture", "Close invoice")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <article className="invoice-document" aria-label={`${uiText(locale, "Facture", "Invoice")} ${invoiceDocument.invoiceNumber}`}>
        <header className="invoice-document-header">
          <div>
            <span className="invoice-document-kicker">Association</span>
            <h3>{invoiceDocument.organizationName}</h3>
            {invoiceDocument.organizationContactLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <div className="invoice-document-number">
            <span>{uiText(locale, "Facture", "Invoice")}</span>
            <strong>#{invoiceDocument.invoiceNumber}</strong>
            <small>{invoiceDocument.statusLabel}</small>
          </div>
        </header>

        <section className="invoice-document-show">
          <div>
            <span className="invoice-document-kicker">{uiText(locale, "Concours", "Show")}</span>
            <strong>{invoiceDocument.showName}</strong>
            <span>{invoiceDocument.showDates}</span>
            {invoiceDocument.showLocation ? <span>{invoiceDocument.showLocation}</span> : null}
          </div>
          <div>
            <span className="invoice-document-kicker">Dates</span>
            <strong>{uiText(locale, "Émise le", "Issued on")} {invoiceDocument.issueDate}</strong>
            <span>{invoiceDocument.dueDate ? `${uiText(locale, "Échéance", "Due")} ${invoiceDocument.dueDate}` : uiText(locale, "Aucune échéance définie", "No due date set")}</span>
          </div>
        </section>

        <section className="invoice-document-parties">
          <div>
            <span className="invoice-document-kicker">{uiText(locale, "Facturé à", "Bill to")}</span>
            <strong>{invoiceDocument.payerName}</strong>
            {invoiceDocument.payerContactLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <div>
            <span className="invoice-document-kicker">{uiText(locale, "Informations de facturation", "Billing information")}</span>
            {invoiceDocument.organizationAddressLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {invoiceDocument.organizationTaxLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>

        <div className="table invoice-detail-table">
          <div className="table-row table-head invoice-detail-row">
            <span>Description</span>
            <span>{uiText(locale, "Qté", "Qty")}</span>
            <span>{uiText(locale, "Prix", "Price")}</span>
            <span>Taxes</span>
            <span>Total</span>
          </div>
          {lineItems.map((item) => (
            <div className="table-row invoice-detail-row" key={item.id}>
              <div>
                <strong>{item.description}</strong>
                <span className="muted-line">{invoiceItemTypeLabel(item.item_type, locale)}</span>
              </div>
              <span>{invoiceQuantityLabel(item.quantity)}</span>
              <span>{formatCurrency(item.unit_price, currency)}</span>
              <span>{formatCurrency(item.tax_amount, currency)}</span>
              <span>{formatCurrency(Number(item.total_price) + Number(item.tax_amount), currency)}</span>
            </div>
          ))}
          {!lineItems.length ? <EmptyState label={uiText(locale, "Aucune ligne sur cette facture.", "No lines on this invoice.")} /> : null}
        </div>

        <footer className="invoice-document-footer">
          <dl className="invoice-document-totals">
            <div>
              <dt>{uiText(locale, "Sous-total", "Subtotal")}</dt>
              <dd>{invoiceDocument.subtotal}</dd>
            </div>
            <div>
              <dt>{invoiceDocument.taxLabel}</dt>
              <dd>{invoiceDocument.taxAmount}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{invoiceDocument.totalAmount}</dd>
            </div>
            <div className="invoice-document-balance">
              <dt>{uiText(locale, "Solde", "Balance")}</dt>
              <dd>{invoiceDocument.balanceDue}</dd>
            </div>
          </dl>
        </footer>
      </article>
    </section>
  );
}

type InvoiceDocumentLine = {
  description: string;
  subtotal: string;
  tax: string;
  total: string;
  typeLabel: string;
  unitPrice: string;
  quantity: string;
};

type InvoiceDocumentData = {
  balanceDue: string;
  dueDate: string | null;
  invoiceNumber: string;
  issueDate: string;
  lineItems: InvoiceDocumentLine[];
  organizationAddressLines: string[];
  organizationContactLines: string[];
  organizationName: string;
  organizationTaxLines: string[];
  payerContactLines: string[];
  payerName: string;
  showDates: string;
  showLocation: string;
  showName: string;
  statusLabel: string;
  subtotal: string;
  taxAmount: string;
  taxLabel: string;
  totalAmount: string;
};

function buildInvoiceDocumentData({
  currency,
  invoice,
  lineItems,
  locale,
  organization,
  payerContact,
  show,
}: {
  currency: string;
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  locale: Locale;
  organization: Organization | null;
  payerContact: Contact | undefined;
  show: Show | undefined;
}): InvoiceDocumentData {
  const organizationName = organizationInvoiceName(organization);
  const taxRate = Number(show?.tax_rate ?? organization?.tax_rate ?? 0);
  const taxName = trimmedText(organization?.tax_name) ?? "Taxes";

  return {
    balanceDue: formatCurrency(invoice.balance_due, currency),
    dueDate: invoice.due_date ? formatDate(invoice.due_date) : null,
    invoiceNumber: formatInvoiceNumber(invoice.invoice_number),
    issueDate: formatDate(invoice.issue_date),
    lineItems: lineItems.map((item) => ({
      description: item.description,
      quantity: invoiceQuantityLabel(item.quantity),
      subtotal: formatCurrency(item.total_price, currency),
      tax: formatCurrency(item.tax_amount, currency),
      total: formatCurrency(Number(item.total_price) + Number(item.tax_amount), currency),
      typeLabel: invoiceItemTypeLabel(item.item_type, locale),
      unitPrice: formatCurrency(item.unit_price, currency),
    })),
    organizationAddressLines: organizationAddressLines(organization, locale),
    organizationContactLines: compactLines([organization?.billing_email, organization?.billing_phone]),
    organizationName,
    organizationTaxLines: organizationTaxLines(organization, locale),
    payerContactLines: compactLines([payerContact?.email, payerContact?.phone]),
    payerName: contactLabel(payerContact),
    showDates: showDateRange(show, locale),
    showLocation: showLocationLine(show),
    showName: showLabel(show),
    statusLabel: invoiceStatusLabel(invoice.status, locale),
    subtotal: formatCurrency(invoice.subtotal, currency),
    taxAmount: formatCurrency(invoice.tax_amount, currency),
    taxLabel: taxRate > 0 ? `${taxName} (${invoiceQuantityLabel(taxRate)}%)` : taxName,
    totalAmount: formatCurrency(invoice.total_amount, currency),
  };
}

function exportInvoicePdf(invoiceDocument: InvoiceDocumentData, locale: Locale) {
  const printWindow = window.open("", "_blank", "width=900,height=1200");

  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(renderInvoicePrintHtml(invoiceDocument, locale));
  printWindow.document.close();
  printWindow.focus();
}

function renderInvoicePrintHtml(invoiceDocument: InvoiceDocumentData, locale: Locale) {
  const lines = invoiceDocument.lineItems.length
    ? invoiceDocument.lineItems
        .map(
          (item) => `
            <tr>
              <td>
                <strong>${escapeHtml(item.description)}</strong>
                <span>${escapeHtml(item.typeLabel)}</span>
              </td>
              <td>${escapeHtml(item.quantity)}</td>
              <td>${escapeHtml(item.unitPrice)}</td>
              <td>${escapeHtml(item.tax)}</td>
              <td>${escapeHtml(item.total)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">${escapeHtml(uiText(locale, "Aucune ligne sur cette facture.", "No lines on this invoice."))}</td></tr>`;

  return `<!doctype html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(uiText(locale, "Facture", "Invoice"))} ${escapeHtml(invoiceDocument.invoiceNumber)}</title>
        <style>
          @page { margin: 18mm; size: letter; }
          * { box-sizing: border-box; }
          body {
            color: #15231f;
            font-family: Inter, Arial, sans-serif;
            margin: 0;
          }
          .invoice {
            display: grid;
            gap: 24px;
          }
          header {
            align-items: start;
            border-bottom: 2px solid #13201d;
            display: grid;
            gap: 24px;
            grid-template-columns: 1fr auto;
            padding-bottom: 18px;
          }
          h1, h2, h3, p { margin: 0; }
          h1 { font-size: 30px; }
          h2 { font-size: 20px; }
          .kicker {
            color: #5f716b;
            display: block;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0;
            margin-bottom: 6px;
            text-transform: uppercase;
          }
          .number {
            text-align: right;
          }
          .number strong {
            display: block;
            font-size: 34px;
          }
          .grid {
            display: grid;
            gap: 18px;
            grid-template-columns: 1fr 1fr;
          }
          .block {
            border-bottom: 1px solid #d8e3df;
            display: grid;
            gap: 5px;
            padding-bottom: 14px;
          }
          .block strong {
            font-size: 15px;
          }
          .muted {
            color: #5f716b;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th {
            background: #eef3f1;
            color: #51615d;
            font-size: 11px;
            text-align: left;
            text-transform: uppercase;
          }
          th, td {
            border-bottom: 1px solid #dfe8e4;
            padding: 10px;
            vertical-align: top;
          }
          td span {
            color: #697a74;
            display: block;
            font-size: 12px;
            margin-top: 3px;
          }
          th:not(:first-child), td:not(:first-child) {
            text-align: right;
            white-space: nowrap;
          }
          .totals {
            display: grid;
            gap: 8px;
            justify-self: end;
            min-width: 260px;
          }
          .totals div {
            align-items: center;
            display: flex;
            justify-content: space-between;
          }
          .totals .balance {
            border-top: 2px solid #13201d;
            font-size: 18px;
            font-weight: 800;
            margin-top: 4px;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <main class="invoice">
          <header>
            <div>
              <span class="kicker">Association</span>
              <h1>${escapeHtml(invoiceDocument.organizationName)}</h1>
              ${invoiceDocument.organizationContactLines.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("")}
            </div>
            <div class="number">
              <span class="kicker">${escapeHtml(uiText(locale, "Facture", "Invoice"))}</span>
              <strong>#${escapeHtml(invoiceDocument.invoiceNumber)}</strong>
              <p class="muted">${escapeHtml(invoiceDocument.statusLabel)}</p>
            </div>
          </header>
          <section class="grid">
            <div class="block">
              <span class="kicker">${escapeHtml(uiText(locale, "Concours", "Show"))}</span>
              <h2>${escapeHtml(invoiceDocument.showName)}</h2>
              <p>${escapeHtml(invoiceDocument.showDates)}</p>
              ${invoiceDocument.showLocation ? `<p class="muted">${escapeHtml(invoiceDocument.showLocation)}</p>` : ""}
            </div>
            <div class="block">
              <span class="kicker">Dates</span>
              <strong>${escapeHtml(uiText(locale, "Émise le", "Issued on"))} ${escapeHtml(invoiceDocument.issueDate)}</strong>
              <p>${escapeHtml(invoiceDocument.dueDate ? `${uiText(locale, "Échéance", "Due")} ${invoiceDocument.dueDate}` : uiText(locale, "Aucune échéance définie", "No due date set"))}</p>
            </div>
            <div class="block">
              <span class="kicker">${escapeHtml(uiText(locale, "Facturé à", "Bill to"))}</span>
              <strong>${escapeHtml(invoiceDocument.payerName)}</strong>
              ${invoiceDocument.payerContactLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
            </div>
            <div class="block">
              <span class="kicker">${escapeHtml(uiText(locale, "Informations de facturation", "Billing information"))}</span>
              ${invoiceDocument.organizationAddressLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
              ${invoiceDocument.organizationTaxLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
            </div>
          </section>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>${escapeHtml(uiText(locale, "Qté", "Qty"))}</th>
                <th>${escapeHtml(uiText(locale, "Prix", "Price"))}</th>
                <th>Taxes</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${lines}</tbody>
          </table>
          <section class="totals">
            <div><span>${escapeHtml(uiText(locale, "Sous-total", "Subtotal"))}</span><strong>${escapeHtml(invoiceDocument.subtotal)}</strong></div>
            <div><span>${escapeHtml(invoiceDocument.taxLabel)}</span><strong>${escapeHtml(invoiceDocument.taxAmount)}</strong></div>
            <div><span>Total</span><strong>${escapeHtml(invoiceDocument.totalAmount)}</strong></div>
            <div class="balance"><span>${escapeHtml(uiText(locale, "Solde", "Balance"))}</span><strong>${escapeHtml(invoiceDocument.balanceDue)}</strong></div>
          </section>
        </main>
        <script>
          window.addEventListener("load", () => setTimeout(() => window.print(), 150));
        </script>
      </body>
    </html>`;
}

function organizationInvoiceName(organization: Organization | null) {
  return trimmedText(organization?.billing_name) ?? organization?.name ?? "Association";
}

function organizationAddressLines(organization: Organization | null, locale: Locale = "fr") {
  const cityLine = compactInline([organization?.city, organization?.state, organization?.zip_code], " ");
  const lines = compactLines([organization?.address, organization?.address_line2, cityLine, organization?.country]);
  return lines.length ? lines : [uiText(locale, "Adresse à compléter dans les réglages", "Address to complete in settings")];
}

function organizationTaxLines(organization: Organization | null, locale: Locale = "fr") {
  return compactLines([
    organization?.tax_number ? `${trimmedText(organization.tax_name) ?? uiText(locale, "No de taxe", "Tax number")}: ${organization.tax_number}` : null,
    organization?.secondary_tax_number ? `${trimmedText(organization.secondary_tax_name) ?? uiText(locale, "No de taxe", "Tax number")}: ${organization.secondary_tax_number}` : null,
  ]);
}

function showDateRange(show: Show | undefined, locale: Locale = "fr") {
  if (!show) {
    return uiText(locale, "Concours non associé", "No linked show");
  }

  if (show.start_date === show.end_date) {
    return formatDate(show.start_date);
  }

  return `${formatDate(show.start_date)} - ${formatDate(show.end_date)}`;
}

function showLocationLine(show: Show | undefined) {
  if (!show) {
    return "";
  }

  const location = trimmedText(show.venue) ?? trimmedText(show.location);
  const cityLine = compactInline([show.city, show.state, show.country], ", ");
  return compactInline([location, cityLine], " - ");
}

function invoiceStatusLabel(status: Invoice["status"], locale: Locale = "fr") {
  switch (status) {
    case "draft":
      return uiText(locale, "Brouillon", "Draft");
    case "sent":
      return uiText(locale, "Envoyée", "Sent");
    case "viewed":
      return uiText(locale, "Consultée", "Viewed");
    case "partially_paid":
      return uiText(locale, "Partiellement payée", "Partially paid");
    case "paid":
      return uiText(locale, "Payée", "Paid");
    case "overdue":
      return uiText(locale, "En retard", "Overdue");
    case "void":
      return uiText(locale, "Annulée", "Void");
    default:
      return status;
  }
}

function formatInvoiceNumber(value: string) {
  const normalized = value.trim();
  return /^\d{1,4}$/.test(normalized) ? normalized.padStart(4, "0") : normalized;
}

function compactLines(values: Array<string | null | undefined>) {
  return values.map(trimmedText).filter((value): value is string => Boolean(value));
}

function compactInline(values: Array<string | null | undefined>, separator: string) {
  return compactLines(values).join(separator);
}

function trimmedText(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return character;
    }
  });
}

type OrganizationBillingFormState = {
  name: string;
  shortName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  billingName: string;
  billingEmail: string;
  billingPhone: string;
  address: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  currency: string;
  taxPresetId: string;
  taxName: string;
  taxRate: string;
  taxNumber: string;
  secondaryTaxName: string;
  secondaryTaxNumber: string;
};

function organizationBillingFormState(organization: Organization | null): OrganizationBillingFormState {
  const country = (organization?.country ?? "CA").toUpperCase();
  const state = (organization?.state ?? (country === "CA" ? "QC" : "")).toUpperCase();
  const locationPreset = taxPresetForLocation(country, state);
  const taxName = organization?.tax_name ?? locationPreset.taxName;
  const taxRate = organization?.tax_rate ?? locationPreset.rate ?? 0;

  return {
    name: organization?.name ?? "",
    shortName: organization?.short_name ?? "",
    primaryContactName: organization?.primary_contact_name ?? "",
    primaryContactEmail: organization?.primary_contact_email ?? "",
    primaryContactPhone: organization?.primary_contact_phone ?? "",
    billingName: organization?.billing_name ?? organization?.name ?? "",
    billingEmail: organization?.billing_email ?? organization?.primary_contact_email ?? "",
    billingPhone: organization?.billing_phone ?? organization?.primary_contact_phone ?? "",
    address: organization?.address ?? "",
    addressLine2: organization?.address_line2 ?? "",
    city: organization?.city ?? "",
    state,
    zipCode: organization?.zip_code ?? "",
    country,
    currency: organization?.currency ?? "CAD",
    taxPresetId: taxPresetIdForValues(country, state, taxRate, taxName),
    taxName,
    taxRate: taxRateValue(taxRate),
    taxNumber: organization?.tax_number ?? "",
    secondaryTaxName: organization?.secondary_tax_name ?? locationPreset.secondaryTaxName ?? "",
    secondaryTaxNumber: organization?.secondary_tax_number ?? "",
  };
}

function applyTaxPresetToBillingForm(current: OrganizationBillingFormState, preset: TaxPreset, preserveManualRate = false): OrganizationBillingFormState {
  return {
    ...current,
    taxPresetId: preset.id,
    taxName: preset.taxName,
    taxRate: preset.rate == null ? (preserveManualRate ? current.taxRate : "0") : taxRateValue(preset.rate),
    secondaryTaxName: preset.secondaryTaxName ?? "",
  };
}

function taxRateValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function taxRateNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function SettingsView({
  locale = "fr",
  context,
  externalOrganizations,
  membershipRequirements,
  organization,
  onSetExternalMembershipRequirement,
  onUpdateOrganizationHealthSettings,
}: {
  locale?: Locale;
  context: AppContext | null;
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  onSetExternalMembershipRequirement: (input: Parameters<typeof setOrganizationExternalMembershipRequirement>[0]) => Promise<void>;
  onUpdateOrganizationHealthSettings: (id: string, input: Parameters<typeof updateOrganizationHealthSettings>[1]) => Promise<void>;
}) {
  const [busyRequirementId, setBusyRequirementId] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingForm, setBillingForm] = useState<OrganizationBillingFormState>(() => organizationBillingFormState(organization));
  const [healthBusy, setHealthBusy] = useState(false);
  const [backNumberPolicy, setBackNumberPolicy] = useState<OrganizationBackNumber["assignment_mode"]>(organizationBackNumberMode(organization));
  const [healthRequired, setHealthRequired] = useState(organizationRequiresHealthVerification(organization));
  const [cogginsValidityMonths, setCogginsValidityMonths] = useState<6 | 12>(organizationCogginsValidityMonths(organization));
  const isCanadaBillingAddress = billingForm.country === "CA";
  const availableTaxPresets = taxPresetsForLocation(billingForm.country, billingForm.state);
  const selectedTaxPresetId = availableTaxPresets.some((preset) => preset.id === billingForm.taxPresetId) ? billingForm.taxPresetId : "manual";
  const riderRequirementIds = new Set(
    membershipRequirements
      .filter((requirement) => requirement.contact_type === "rider" && requirement.is_required)
      .map((requirement) => requirement.external_organization_id),
  );

  useEffect(() => {
    setBillingForm(organizationBillingFormState(organization));
    setBackNumberPolicy(organizationBackNumberMode(organization));
    setHealthRequired(organizationRequiresHealthVerification(organization));
    setCogginsValidityMonths(organizationCogginsValidityMonths(organization));
  }, [organization]);

  function handleBillingFieldChange(field: keyof OrganizationBillingFormState, value: string) {
    setBillingForm((current) => {
      let next = { ...current, [field]: value };

      if (field === "country") {
        next.country = value.toUpperCase();

        if (next.country === "CA" && !canadianProvinceOptions.some((province) => province.value === next.state)) {
          next.state = "QC";
        }

        next = applyTaxPresetToBillingForm(next, taxPresetForLocation(next.country, next.state));
      }

      if (field === "state") {
        next.state = value.toUpperCase();
        next = applyTaxPresetToBillingForm(next, taxPresetForLocation(next.country, next.state));
      }

      return next;
    });
  }

  function handleTaxPresetChange(presetId: string) {
    const preset = taxPresetById(presetId);
    setBillingForm((current) => applyTaxPresetToBillingForm({ ...current, taxPresetId: preset.id }, preset, true));
  }

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

  async function handleHealthSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setHealthBusy(true);

    try {
      await onUpdateOrganizationHealthSettings(organization.id, {
        back_number_policy: backNumberPolicy,
        health_verification_required: healthRequired,
        coggins_validity_months: cogginsValidityMonths,
      });
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleBillingSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !billingForm.name.trim()) {
      return;
    }

    setBillingBusy(true);

    try {
      await onUpdateOrganizationHealthSettings(organization.id, {
        name: billingForm.name,
        short_name: billingForm.shortName,
        primary_contact_name: billingForm.primaryContactName,
        primary_contact_email: billingForm.primaryContactEmail,
        primary_contact_phone: billingForm.primaryContactPhone,
        billing_name: billingForm.billingName,
        billing_email: billingForm.billingEmail,
        billing_phone: billingForm.billingPhone,
        address: billingForm.address,
        address_line2: billingForm.addressLine2,
        city: billingForm.city,
        state: billingForm.state,
        zip_code: billingForm.zipCode,
        country: billingForm.country,
        currency: billingForm.currency,
        tax_rate: taxRateNumber(billingForm.taxRate),
        tax_name: billingForm.taxName,
        tax_number: billingForm.taxNumber,
        secondary_tax_name: billingForm.secondaryTaxName,
        secondary_tax_number: billingForm.secondaryTaxNumber,
      });
    } finally {
      setBillingBusy(false);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Paramètres", "Settings")}
        title={uiText(locale, "Profil et association", "Profile and association")}
        description={uiText(locale, "Vérifie le profil connecté, le rôle, la devise, les taxes et les règles de l'association.", "Review the signed-in profile, role, currency, taxes and association rules.")}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Profil", "Profile")}</h2>
            <p>{context?.profile ? `${context.profile.first_name ?? ""} ${context.profile.last_name ?? ""}`.trim() || uiText(locale, "Utilisateur connecté", "Signed-in user") : uiText(locale, "Chargement", "Loading")}</p>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>{uiText(locale, "Type de rôle", "Role type")}</dt>
            <dd>{context?.profile.type_user ?? uiText(locale, "Non défini", "Unset")}</dd>
          </div>
          <div>
            <dt>{uiText(locale, "ID du profil", "Profile ID")}</dt>
            <dd>{context?.profile.id ?? uiText(locale, "En attente", "Pending")}</dd>
          </div>
        </dl>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Informations de facturation", "Billing information")}</h2>
            <p>{organization?.slug ?? uiText(locale, "Aucune association sélectionnée", "No association selected")}</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleBillingSettingsSubmit}>
          <div className="form-grid">
            <label>
              {uiText(locale, "Nom de l'association", "Association name")}
              <input disabled={!organization || billingBusy} value={billingForm.name} onChange={(event) => handleBillingFieldChange("name", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Abréviation", "Short name")}
              <input disabled={!organization || billingBusy} value={billingForm.shortName} onChange={(event) => handleBillingFieldChange("shortName", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Contact principal", "Primary contact")}
              <input disabled={!organization || billingBusy} value={billingForm.primaryContactName} onChange={(event) => handleBillingFieldChange("primaryContactName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Courriel principal", "Primary email")}
              <input disabled={!organization || billingBusy} type="email" value={billingForm.primaryContactEmail} onChange={(event) => handleBillingFieldChange("primaryContactEmail", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Téléphone principal", "Primary phone")}
              <input disabled={!organization || billingBusy} value={billingForm.primaryContactPhone} onChange={(event) => handleBillingFieldChange("primaryContactPhone", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Nom légal sur facture", "Legal billing name")}
              <input disabled={!organization || billingBusy} value={billingForm.billingName} onChange={(event) => handleBillingFieldChange("billingName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Courriel de facturation", "Billing email")}
              <input disabled={!organization || billingBusy} type="email" value={billingForm.billingEmail} onChange={(event) => handleBillingFieldChange("billingEmail", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Téléphone de facturation", "Billing phone")}
              <input disabled={!organization || billingBusy} value={billingForm.billingPhone} onChange={(event) => handleBillingFieldChange("billingPhone", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Adresse", "Address")}
              <input disabled={!organization || billingBusy} value={billingForm.address} onChange={(event) => handleBillingFieldChange("address", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Appartement, bureau ou suite", "Apartment, office or suite")}
              <input disabled={!organization || billingBusy} value={billingForm.addressLine2} onChange={(event) => handleBillingFieldChange("addressLine2", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Ville", "City")}
              <input disabled={!organization || billingBusy} value={billingForm.city} onChange={(event) => handleBillingFieldChange("city", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Pays", "Country")}
              <select disabled={!organization || billingBusy} value={billingForm.country} onChange={(event) => handleBillingFieldChange("country", event.target.value)}>
                {countryOptions.map((country) => (
                  <option key={country.value} value={country.value}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {isCanadaBillingAddress ? uiText(locale, "Province", "Province") : uiText(locale, "État / région", "State / region")}
              {isCanadaBillingAddress ? (
                <select disabled={!organization || billingBusy} value={billingForm.state} onChange={(event) => handleBillingFieldChange("state", event.target.value)}>
                  {canadianProvinceOptions.map((province) => (
                    <option key={province.value} value={province.value}>
                      {province.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input disabled={!organization || billingBusy} value={billingForm.state} onChange={(event) => handleBillingFieldChange("state", event.target.value)} />
              )}
            </label>
            <label>
              {uiText(locale, "Code postal", "Postal code")}
              <input disabled={!organization || billingBusy} value={billingForm.zipCode} onChange={(event) => handleBillingFieldChange("zipCode", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Devise", "Currency")}
              <select disabled={!organization || billingBusy} value={billingForm.currency} onChange={(event) => handleBillingFieldChange("currency", event.target.value)}>
                {currencyOptions.map((currency) => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {uiText(locale, "Taxe de vente", "Sales tax")}
              <select disabled={!organization || billingBusy} value={selectedTaxPresetId} onChange={(event) => handleTaxPresetChange(event.target.value)}>
                {availableTaxPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <span className="input-help">{uiText(locale, "Le taux reste modifiable pour les exemptions, exceptions ou taxes locales.", "The rate remains editable for exemptions, exceptions or local taxes.")}</span>
            </label>
            <label>
              {uiText(locale, "Taux de taxe effectif (%)", "Effective tax rate (%)")}
              <input disabled={!organization || billingBusy} min="0" step="0.001" type="number" value={billingForm.taxRate} onChange={(event) => handleBillingFieldChange("taxRate", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Libellé de taxe principale", "Primary tax label")}
              <input disabled={!organization || billingBusy} value={billingForm.taxName} onChange={(event) => handleBillingFieldChange("taxName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "No de taxe principale", "Primary tax number")}
              <input disabled={!organization || billingBusy} value={billingForm.taxNumber} onChange={(event) => handleBillingFieldChange("taxNumber", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Libellé de taxe secondaire", "Secondary tax label")}
              <input disabled={!organization || billingBusy} placeholder="TVQ, PST, RST..." value={billingForm.secondaryTaxName} onChange={(event) => handleBillingFieldChange("secondaryTaxName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "No de taxe secondaire", "Secondary tax number")}
              <input disabled={!organization || billingBusy} value={billingForm.secondaryTaxNumber} onChange={(event) => handleBillingFieldChange("secondaryTaxNumber", event.target.value)} />
            </label>
          </div>
          <button className="primary-button" disabled={!organization || billingBusy || !billingForm.name.trim()} type="submit">
            {billingBusy ? uiText(locale, "Enregistrement...", "Saving...") : uiText(locale, "Enregistrer les infos de facturation", "Save billing information")}
          </button>
        </form>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Numéros externes obligatoires", "Required external numbers")}</h2>
            <p>{uiText(locale, "Exigences appliquées aux fiches de cavalier de cette association.", "Requirements applied to rider records for this association.")}</p>
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
                <small>{externalOrganization.verification_enabled ? uiText(locale, "Validation externe prête", "External validation ready") : uiText(locale, "Validation manuelle", "Manual validation")}</small>
              </label>
            );
          })}
          {!externalOrganizations.length ? <EmptyState label={uiText(locale, "Aucune organisation externe configurée.", "No external organization configured.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Dossards et statut santé", "Back numbers and health status")}</h2>
            <p>{uiText(locale, "Règles utilisées pour les dossards, les inscriptions et les réservations de stalls.", "Rules used for back numbers, entries and stall reservations.")}</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleHealthSettingsSubmit}>
          <label>
            {uiText(locale, "Politique de dossard de l'association", "Association back number policy")}
            <select disabled={!organization || healthBusy} value={backNumberPolicy} onChange={(event) => setBackNumberPolicy(event.target.value as OrganizationBackNumber["assignment_mode"])}>
              <option value="horse">{uiText(locale, "Par cheval", "By horse")}</option>
              <option value="rider">{uiText(locale, "Par cavalier", "By rider")}</option>
              <option value="horse_rider_team">{uiText(locale, "Par équipe cheval+cavalier", "By horse+rider team")}</option>
            </select>
            <span className="input-help">{uiText(locale, "Les utilisateurs ne choisissent pas ce mode: l'app applique automatiquement la politique de l'association active.", "Users do not choose this mode: the app automatically applies the active association policy.")}</span>
          </label>
          <label className="requirement-row">
            <input checked={healthRequired} disabled={!organization || healthBusy} type="checkbox" onChange={(event) => setHealthRequired(event.target.checked)} />
            <span>
              <strong>{uiText(locale, "Exiger les documents santé valides", "Require valid health documents")}</strong>
              {uiText(locale, "Bloque les inscriptions et les stalls rattachés à un cheval si le Coggins ou le vaccin influenza/rhino ne couvre pas la date du concours.", "Blocks entries and stalls linked to a horse if the Coggins or influenza/rhino vaccine does not cover the show date.")}
            </span>
            <small>{healthRequired ? uiText(locale, "Validation obligatoire", "Validation required") : uiText(locale, "Validation non exigée", "Validation not required")}</small>
          </label>
          <label>
            {uiText(locale, "Durée de validité des documents santé", "Health document validity period")}
            <select disabled={!organization || healthBusy || !healthRequired} value={cogginsValidityMonths} onChange={(event) => setCogginsValidityMonths(Number(event.target.value) === 6 ? 6 : 12)}>
              <option value={6}>6 mois</option>
              <option value={12}>12 mois</option>
            </select>
          </label>
          <button className="primary-button" disabled={!organization || healthBusy} type="submit">
            {healthBusy ? uiText(locale, "Enregistrement...", "Saving...") : uiText(locale, "Enregistrer les règles", "Save rules")}
          </button>
        </form>
      </section>
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

function buildShowReadinessItems(
  show: Show,
  context: {
    locale?: Locale;
    classes: ClassRecord[];
    divisions: Division[];
    entries: Entry[];
    invoices: Invoice[];
    showDays: ShowDay[];
    showScoreClassSetups: ShowScoreClassSetup[];
    stallOptions: StallOption[];
  },
): ShowReadinessItem[] {
  const locale = context.locale ?? "fr";
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
      title: uiText(locale, "Journées", "Show days"),
      detail: showDays.length ? uiText(locale, `${showDays.length} journée${showDays.length === 1 ? "" : "s"} générée${showDays.length === 1 ? "" : "s"}.`, `${showDays.length} day${showDays.length === 1 ? "" : "s"} generated.`) : uiText(locale, "Les journées apparaîtront depuis les dates du concours.", "Days will be generated from show dates."),
      done: showDays.length > 0,
      view: "shows",
      actionLabel: uiText(locale, "Vérifier", "Review"),
    },
    {
      key: "classes",
      title: uiText(locale, "Blocs", "Schedule blocks"),
      detail: showClasses.length ? uiText(locale, `${showClasses.length} bloc${showClasses.length === 1 ? "" : "s"} à l'horaire.`, `${showClasses.length} schedule block${showClasses.length === 1 ? "" : "s"} in the schedule.`) : uiText(locale, "Aucun bloc créé.", "No schedule blocks created."),
      done: showClasses.length > 0,
      view: "classes",
      actionLabel: showClasses.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Ajouter", "Add"),
    },
    {
      key: "divisions",
      title: uiText(locale, "Classes", "Classes"),
      detail: showDivisions.length ? uiText(locale, `${showDivisions.length} classe${showDivisions.length === 1 ? "" : "s"} disponible${showDivisions.length === 1 ? "" : "s"}.`, `${showDivisions.length} class${showDivisions.length === 1 ? "" : "es"} available.`) : uiText(locale, "Aucune classe disponible.", "No classes available."),
      done: showDivisions.length > 0,
      view: "classes",
      actionLabel: showDivisions.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Ajouter", "Add"),
    },
    {
      key: "stalls",
      title: uiText(locale, "Stalls et extras", "Stalls and extras"),
      detail: showStallOptions.length ? uiText(locale, `${showStallOptions.length} produit${showStallOptions.length === 1 ? "" : "s"} réservable${showStallOptions.length === 1 ? "" : "s"}.`, `${showStallOptions.length} reservable item${showStallOptions.length === 1 ? "" : "s"}.`) : uiText(locale, "Aucun produit de réservation.", "No reservation products."),
      done: showStallOptions.length > 0,
      view: "stalls",
      actionLabel: showStallOptions.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Configurer", "Configure"),
    },
    {
      key: "entries",
      title: uiText(locale, "Inscriptions", "Entries"),
      detail: showEntries.length ? uiText(locale, `${showEntries.length} inscription${showEntries.length === 1 ? "" : "s"} créée${showEntries.length === 1 ? "" : "s"}.`, `${showEntries.length} entr${showEntries.length === 1 ? "y" : "ies"} created.`) : uiText(locale, "Les inscriptions arriveront ici.", "Entries will appear here."),
      done: showEntries.length > 0,
      view: "entries",
      actionLabel: uiText(locale, "Ouvrir", "Open"),
    },
    {
      key: "scoring",
      title: uiText(locale, "Pointage", "Scoring"),
      detail: showClasses.length ? uiText(locale, `${preparedClasses}/${showClasses.length} bloc${showClasses.length === 1 ? "" : "s"} préparé${showClasses.length === 1 ? "" : "s"}.`, `${preparedClasses}/${showClasses.length} schedule block${showClasses.length === 1 ? "" : "s"} prepared.`) : uiText(locale, "Crée des blocs avant le pointage.", "Create schedule blocks before scoring."),
      done: showClasses.length > 0 && preparedClasses === showClasses.length,
      view: "scoring",
      actionLabel: uiText(locale, "Préparer", "Prepare"),
    },
    {
      key: "billing",
      title: uiText(locale, "Facturation", "Billing"),
      detail: showInvoices.length ? uiText(locale, `${showInvoices.length} facture${showInvoices.length === 1 ? "" : "s"} liée${showInvoices.length === 1 ? "" : "s"} au concours.`, `${showInvoices.length} invoice${showInvoices.length === 1 ? "" : "s"} linked to the show.`) : uiText(locale, "Aucune facture liée au concours.", "No invoices linked to the show."),
      done: showInvoices.length > 0,
      view: "billing",
      actionLabel: uiText(locale, "Voir", "View"),
    },
    {
      key: "publication",
      title: "Publication",
      detail: show.status === "open" ? uiText(locale, "Les inscriptions sont ouvertes.", "Entries are open.") : uiText(locale, "Le concours est encore en brouillon.", "The show is still in draft."),
      done: show.status === "open",
    },
  ];
}

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

function ContactForm({
  locale = "fr",
  createdByUserId,
  defaultType = "owner",
  description,
  externalOrganizations = [],
  linkedUserId,
  membershipRequirements = [],
  organization,
  title,
  onCreateContact,
  onCreated,
}: {
  locale?: Locale;
  createdByUserId?: string;
  defaultType?: Contact["type"];
  description?: string;
  externalOrganizations?: ExternalOrganization[];
  linkedUserId?: string;
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  title?: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreated?: () => void;
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
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title ?? uiText(locale, "Nouveau contact", "New contact")}</h2>
          <p>{description ?? (organization ? organization.name : uiText(locale, "Crée une association d'abord.", "Create an organization first."))}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Type
          <select disabled={!organization} value={type} onChange={(event) => setType(event.target.value as Contact["type"])}>
            <option value="owner">{uiText(locale, "Propriétaire", "Owner")}</option>
            <option value="agent">Agent</option>
            <option value="rider">{uiText(locale, "Cavalier", "Rider")}</option>
            <option value="payer">{uiText(locale, "Payeur", "Payer")}</option>
            <option value="other">{uiText(locale, "Autre", "Other")}</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Prénom", "First name")}
            <input disabled={!organization} required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Nom", "Last name")}
            <input disabled={!organization} required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Courriel", "Email")}
          <input disabled={!organization} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Téléphone", "Phone")}
            <input disabled={!organization} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Écurie", "Barn")}
            <input disabled={!organization} value={barnName} onChange={(event) => setBarnName(event.target.value)} />
          </label>
        </div>
        {externalMembershipFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Numéros de membre externes", "External membership numbers")}</strong>
              <span>{uiText(locale, "Les champs obligatoires dépendent de l'association active.", "Required fields depend on the active association.")}</span>
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
          {uiText(locale, "Créer le contact", "Create contact")}
        </button>
      </form>
    </section>
  );
}

function HorseForm({
  locale = "fr",
  contacts,
  contactRoles,
  createdByUserId,
  externalOrganizations = [],
  organization,
  onCreateContact,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onVerifyGvlCogginsDocument,
  onCreated,
}: {
  locale?: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  externalOrganizations?: ExternalOrganization[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onCreated?: (horse: Horse) => void;
}) {
  const [name, setName] = useState("");
  const [ownerContactId, setOwnerContactId] = useState("");
  const [agentContactId, setAgentContactId] = useState<string | null>(null);
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [gvlCogginsUrl, setGvlCogginsUrl] = useState("");
  const [cogginsPdfFile, setCogginsPdfFile] = useState<File | null>(null);
  const [preparedGvlUrl, setPreparedGvlUrl] = useState("");
  const [vaccineCertificateFile, setVaccineCertificateFile] = useState<File | null>(null);
  const [vaccineAdministeredOn, setVaccineAdministeredOn] = useState("");
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
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
    setHealthMessage(null);

    try {
      const horse = await onCreateHorse({
        organization_id: organization.id,
        name,
        primary_owner_contact_id: selectedOwnerId,
        agent_contact_id: selectedAgentId && selectedAgentId !== selectedOwnerId ? selectedAgentId : null,
        breed,
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        registration_number: registrationNumber,
        created_by_user_id: createdByUserId,
        external_memberships: externalReferenceFields.map((organization) => ({
          external_organization_id: organization.id,
          reference_type: horseReferenceTypeForOrganization(organization),
          reference_number: externalReferenceNumbers[organization.id] ?? "",
          status: "unknown",
        })),
      });

      if (preparedGvlUrl || cogginsPdfFile || gvlCogginsUrl.trim()) {
        try {
          const sourceUrl = preparedGvlUrl || (await resolveGvlCogginsUrl(cogginsPdfFile, gvlCogginsUrl));

          if (sourceUrl) {
            const document = await onVerifyGvlCogginsDocument({
              organization_id: organization.id,
              horse_id: horse.id,
              source_url: sourceUrl,
              document_file: cogginsPdfFile,
              horse_name: name,
              horse_date_of_birth: dateOfBirth || null,
              horse_birth_year: birthYearFromDateValue(dateOfBirth),
              created_by_user_id: createdByUserId,
            });
            setHealthMessage(horseHealthResultMessage(document));
          }
        } catch (error) {
          if (cogginsPdfFile) {
            const document = await onCreateHorseHealthDocument({
              organization_id: organization.id,
              horse_id: horse.id,
              document_type: "coggins_eia",
              file: cogginsPdfFile,
              source_url: normalizeGvlUrl(gvlCogginsUrl) ?? (gvlCogginsUrl.trim() || null),
              created_by_user_id: createdByUserId,
              review_notes: `Validation GVL impossible: ${errorMessage(error)}`,
            });
            setHealthMessage(horseHealthResultMessage(document));
          } else {
            setHealthMessage({
              tone: "error",
              message: uiText(locale, `Cheval créé, mais Coggins GVL non valide: ${errorMessage(error)}`, `Horse created, but GVL Coggins is not valid: ${errorMessage(error)}`),
            });
          }
        }
      }

      if (vaccineCertificateFile) {
        await onCreateHorseHealthDocument({
          organization_id: organization.id,
          horse_id: horse.id,
          document_type: "combo_vaccine",
          file: vaccineCertificateFile,
          test_or_administered_on: vaccineAdministeredOn || null,
          created_by_user_id: createdByUserId,
        });
      }

      setName("");
      setOwnerContactId("");
      setAgentContactId(null);
      setBreed("");
      setGender("");
      setDateOfBirth("");
      setRegistrationNumber("");
      setGvlCogginsUrl("");
      setCogginsPdfFile(null);
      setPreparedGvlUrl("");
      setVaccineCertificateFile(null);
      setVaccineAdministeredOn("");
      setExternalReferenceNumbers({});
      onCreated?.(horse);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrepareCogginsUrl() {
    setHealthMessage(null);
    setBusy(true);

    try {
      const sourceUrl = await resolveGvlCogginsUrl(cogginsPdfFile, gvlCogginsUrl);

      if (!sourceUrl) {
        setHealthMessage({
          tone: "error",
          message: uiText(locale, "Ajoute un PDF Coggins GVL ou colle un lien GVL avant de valider.", "Add a GVL Coggins PDF or paste a GVL link before validating."),
        });
        return;
      }

      setPreparedGvlUrl(sourceUrl);
      setGvlCogginsUrl(sourceUrl);
      setHealthMessage({
        tone: "success",
        message: uiText(locale, "Lien GVL prêt. Il sera validé et enregistré quand tu créeras le cheval.", "GVL link ready. It will be validated and saved when you create the horse."),
      });
    } catch (error) {
      setPreparedGvlUrl("");
      setHealthMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouveau cheval", "New horse")}</h2>
          <p>{contacts.length ? uiText(locale, "Connecte le cheval à un propriétaire.", "Connect a horse to an owner.") : uiText(locale, "Crée un contact propriétaire depuis ce formulaire.", "Create an owner contact from this form.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du cheval", "Horse name")}
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <ContactPicker
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          disabled={!organization}
          label={uiText(locale, "Propriétaire", "Owner")}
          locale={locale}
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
          locale={locale}
          organization={organization}
          role="agent"
          value={selectedAgentId}
          onChange={setAgentContactId}
          onCreateContact={onCreateContact}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Race", "Breed")}
            <input disabled={!organization} value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Sexe", "Sex")}
            <select disabled={!organization} value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
              <option value="">{uiText(locale, "Non défini", "Unset")}</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="G">G</option>
            </select>
          </label>
        </div>
        <label>
          {uiText(locale, "Date de naissance", "Date of birth")}
          <input disabled={!organization} type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Enregistrement", "Registration")}
          <input disabled={!organization} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
        </label>
        <div className="external-membership-fields health-document-fields">
          <div className="inline-form-header">
            <strong>{uiText(locale, "Documents santé initiaux", "Initial health documents")}</strong>
            <span>{uiText(locale, "Ajoute le Coggins GVL et le certificat de vaccin pendant la création du cheval.", "Add the GVL Coggins and vaccine certificate while creating the horse.")}</span>
          </div>
          <label>
            PDF Coggins GVL
            <input accept="application/pdf" disabled={!organization} type="file" onChange={(event) => setCogginsPdfFile(event.target.files?.[0] ?? null)} />
            {cogginsPdfFile ? <span className="muted-line">{cogginsPdfFile.name}</span> : null}
          </label>
          <label>
            {uiText(locale, "Lien GVL en secours", "Backup GVL link")}
            <input disabled={!organization} placeholder="https://gvlcertcheck.ai/check/..." type="url" value={gvlCogginsUrl} onChange={(event) => setGvlCogginsUrl(event.target.value)} />
          </label>
          <div className="row-actions">
            <button className="primary-button" disabled={busy || !organization || (!cogginsPdfFile && !gvlCogginsUrl.trim())} type="button" onClick={handlePrepareCogginsUrl}>
              <CheckCircle2 size={18} />
              {uiText(locale, "Valider le lien GVL", "Validate GVL link")}
            </button>
            {preparedGvlUrl ? <span className="muted-line">{uiText(locale, "Lien détecté", "Detected link")}: {preparedGvlUrl}</span> : null}
          </div>
          <InlineHealthMessage value={healthMessage} />
          <div className="health-document-actions">
            <label>
              {uiText(locale, "Certificat vaccin influenza/rhino", "Influenza/rhino vaccine certificate")}
              <input accept="application/pdf,image/*" disabled={!organization} type="file" onChange={(event) => setVaccineCertificateFile(event.target.files?.[0] ?? null)} />
              {vaccineCertificateFile ? <span className="muted-line">{vaccineCertificateFile.name}</span> : null}
            </label>
            <label>
              {uiText(locale, "Date du vaccin", "Vaccine date")}
              <input disabled={!organization} type="date" value={vaccineAdministeredOn} onChange={(event) => setVaccineAdministeredOn(event.target.value)} />
            </label>
          </div>
        </div>
        {externalReferenceFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Références externes du cheval", "External horse references")}</strong>
              <span>{uiText(locale, "Ex.: licence de compétition NRHA. Ces références pourront être validées par intégration externe plus tard.", "Example: NRHA competition license. These references can be validated through an external integration later.")}</span>
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
          {uiText(locale, "Créer le cheval", "Create horse")}
        </button>
      </form>
    </section>
  );
}

function ContactEditForm({
  locale = "fr",
  contact,
  contactExternalMemberships,
  externalOrganizations = [],
  membershipRequirements = [],
  onCancel,
  onUpdateContact,
}: {
  locale?: Locale;
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
          <h2>{uiText(locale, "Modifier le contact", "Edit contact")}</h2>
          <p>{contactLabel(contact)}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as Contact["type"])}>
            <option value="owner">{uiText(locale, "Propriétaire", "Owner")}</option>
            <option value="agent">Agent</option>
            <option value="rider">{uiText(locale, "Cavalier", "Rider")}</option>
            <option value="payer">{uiText(locale, "Payeur", "Payer")}</option>
            <option value="other">{uiText(locale, "Autre", "Other")}</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Prénom", "First name")}
            <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Nom", "Last name")}
            <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Courriel", "Email")}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Téléphone", "Phone")}
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Écurie", "Barn")}
          <input value={barnName} onChange={(event) => setBarnName(event.target.value)} />
        </label>
        {externalMembershipFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Numéros de membre externes", "External membership numbers")}</strong>
              <span>{uiText(locale, "Ces informations pourront être vérifiées par intégration externe plus tard.", "This information can be verified through an external integration later.")}</span>
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
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} disabled={missingRequiredMembership} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function HorseEditForm({
  locale = "fr",
  contacts,
  contactRoles,
  canManageHealthDocuments,
  createdByUserId,
  externalOrganizations = [],
  horse,
  horseExternalMemberships = [],
  horseHealthDocuments = [],
  horseContacts,
  organization,
  onCancel,
  onCreateContact,
  onCreateHorseHealthDocument,
  onReviewHorseHealthDocument,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
}: {
  locale?: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  canManageHealthDocuments: boolean;
  createdByUserId?: string;
  externalOrganizations?: ExternalOrganization[];
  horse: Horse;
  horseExternalMemberships?: HorseExternalMembership[];
  horseHealthDocuments?: HorseHealthDocument[];
  horseContacts: HorseContact[];
  organization: Organization | null;
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
}) {
  const currentAgentContactId = horseContacts.find((horseContact) => horseContact.horse_id === horse.id && horseContact.role === "agent")?.contact_id ?? "";
  const [name, setName] = useState(horse.name);
  const [ownerContactId, setOwnerContactId] = useState(horse.primary_owner_contact_id);
  const [agentContactId, setAgentContactId] = useState<string | null>(currentAgentContactId || null);
  const [breed, setBreed] = useState(horse.breed ?? "");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>(horse.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(horse.date_of_birth ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(horse.registration_number ?? "");
  const [gvlCogginsUrl, setGvlCogginsUrl] = useState("");
  const [cogginsPdfFile, setCogginsPdfFile] = useState<File | null>(null);
  const [vaccineCertificateFile, setVaccineCertificateFile] = useState<File | null>(null);
  const [vaccineAdministeredOn, setVaccineAdministeredOn] = useState("");
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(horseExternalMemberships.filter((membership) => membership.horse_id === horse.id).map((membership) => [membership.external_organization_id, membership.reference_number])),
  );
  const [busy, setBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [fileBusyDocumentId, setFileBusyDocumentId] = useState("");
  const [fileErrorDocumentId, setFileErrorDocumentId] = useState("");
  const [fileErrorMessageByDocumentId, setFileErrorMessageByDocumentId] = useState<Record<string, string>>({});
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const becameAgentByOwnerChange = currentUserContact && horse.primary_owner_contact_id === currentUserContact.id && ownerContactId !== currentUserContact.id;
  const defaultAgentId = becameAgentByOwnerChange ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(
    () => buildHorseExternalMembershipFields(externalOrganizations, horseExternalMemberships.filter((membership) => membership.horse_id === horse.id)),
    [externalOrganizations, horse.id, horseExternalMemberships],
  );
  const latestCoggins = useMemo(() => latestHorseHealthDocument(horse.id, horseHealthDocuments, "coggins_eia"), [horse.id, horseHealthDocuments]);
  const cogginsValidity = useMemo(
    () =>
      getHorseCogginsValidity({
        documents: horseHealthDocuments,
        horseId: horse.id,
        organization,
      }),
    [horse.id, horseHealthDocuments, organization],
  );
  const latestVaccine = useMemo(() => latestHorseVaccineDocument(horse.id, horseHealthDocuments), [horse.id, horseHealthDocuments]);
  const [vaccineReviewDate, setVaccineReviewDate] = useState(latestVaccine?.test_or_administered_on ?? "");

  useEffect(() => {
    setVaccineReviewDate(latestVaccine?.test_or_administered_on ?? "");
  }, [latestVaccine?.id, latestVaccine?.test_or_administered_on]);

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
        date_of_birth: dateOfBirth || null,
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

  async function handleVerifyGvlCoggins() {
    if (!organization || (!gvlCogginsUrl.trim() && !cogginsPdfFile)) {
      return;
    }

    setHealthBusy(true);
    setHealthMessage(null);

    try {
      const sourceUrl = await resolveGvlCogginsUrl(cogginsPdfFile, gvlCogginsUrl);

      if (!sourceUrl) {
        return;
      }

      const document = await onVerifyGvlCogginsDocument({
        organization_id: organization.id,
        horse_id: horse.id,
        source_url: sourceUrl,
        document_file: cogginsPdfFile,
        horse_name: name.trim() || horse.name,
        horse_date_of_birth: dateOfBirth || horse.date_of_birth,
        horse_birth_year: birthYearFromDateValue(dateOfBirth) ?? horse.birth_year,
        created_by_user_id: createdByUserId,
      });
      setHealthMessage(horseHealthResultMessage(document));
      setGvlCogginsUrl("");
      setCogginsPdfFile(null);
    } catch (error) {
      if (organization && cogginsPdfFile) {
        const document = await onCreateHorseHealthDocument({
          organization_id: organization.id,
          horse_id: horse.id,
          document_type: "coggins_eia",
          file: cogginsPdfFile,
          source_url: normalizeGvlUrl(gvlCogginsUrl) ?? (gvlCogginsUrl.trim() || null),
          created_by_user_id: createdByUserId,
          review_notes: `Validation GVL impossible: ${errorMessage(error)}`,
        });
        setHealthMessage(horseHealthResultMessage(document));
        setGvlCogginsUrl("");
        setCogginsPdfFile(null);
      } else {
        setHealthMessage({
          tone: "error",
          message: errorMessage(error),
        });
      }
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleReverifyLatestGvlCoggins() {
    if (!organization || !latestCoggins?.source_url) {
      return;
    }

    setHealthBusy(true);
    setHealthMessage(null);

    try {
      const document = await onVerifyGvlCogginsDocument({
        organization_id: organization.id,
        horse_id: horse.id,
        source_url: latestCoggins.source_url,
        horse_name: name.trim() || horse.name,
        horse_date_of_birth: dateOfBirth || horse.date_of_birth,
        horse_birth_year: birthYearFromDateValue(dateOfBirth) ?? horse.birth_year,
        created_by_user_id: createdByUserId,
      });
      setHealthMessage(horseHealthResultMessage(document));
    } catch (error) {
      setHealthMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleReviewCoggins(status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
    if (!latestCoggins) {
      return;
    }

    await handleReviewHealthDocument(latestCoggins, status, "Coggins");
  }

  async function handleReviewVaccine(status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
    if (!latestVaccine) {
      return;
    }

    if (status === "approved" && !vaccineReviewDate) {
      setHealthMessage({
        tone: "error",
        message: uiText(locale, "Entre la date du vaccin vue sur le certificat avant d'approuver.", "Enter the vaccine date shown on the certificate before approving."),
      });
      return;
    }

    await handleReviewHealthDocument(latestVaccine, status, "certificat vaccin", status === "approved" ? vaccineReviewDate || null : undefined);
  }

  async function handleReviewHealthDocument(
    document: HorseHealthDocument,
    status: Extract<HorseHealthDocument["status"], "approved" | "rejected">,
    label: string,
    testOrAdministeredOn?: string | null,
  ) {
    setHealthBusy(true);
    setHealthMessage(null);

    try {
      await onReviewHorseHealthDocument(document.id, {
        status,
        reviewed_by_user_id: createdByUserId,
        review_notes:
          status === "approved"
            ? `${label} approuvé manuellement par un gestionnaire de l'association.`
            : `${label} refusé manuellement par un gestionnaire de l'association.`,
        test_or_administered_on: testOrAdministeredOn,
      });
      setHealthMessage({
        tone: status === "approved" ? "success" : "info",
        message: status === "approved" ? `${label} approuvé.` : `${label} refusé.`,
      });
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleUploadVaccineCertificate() {
    if (!organization || !vaccineCertificateFile) {
      return;
    }

    setHealthBusy(true);
    setHealthMessage(null);

    try {
      const document = await onCreateHorseHealthDocument({
        organization_id: organization.id,
        horse_id: horse.id,
        document_type: "combo_vaccine",
        file: vaccineCertificateFile,
        test_or_administered_on: vaccineAdministeredOn || null,
        created_by_user_id: createdByUserId,
      });
      setHealthMessage(horseHealthResultMessage(document));
      setVaccineCertificateFile(null);
      setVaccineAdministeredOn("");
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleOpenStoredDocument(document: HorseHealthDocument) {
    if (!document.document_url) {
      return;
    }

    const documentWindow = window.open("about:blank", "_blank");
    setFileBusyDocumentId(document.id);
    setFileErrorDocumentId("");
    setFileErrorMessageByDocumentId((current) => ({ ...current, [document.id]: "" }));

    try {
      const signedUrl = await getHorseHealthDocumentFileUrl(document.document_url);
      if (documentWindow) {
        documentWindow.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      documentWindow?.close();
      setFileErrorDocumentId(document.id);
      setFileErrorMessageByDocumentId((current) => ({ ...current, [document.id]: errorMessage(error) }));
    } finally {
      setFileBusyDocumentId("");
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier le cheval", "Edit horse")}</h2>
          <p>{horse.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du cheval", "Horse name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <ContactPicker
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          label={uiText(locale, "Propriétaire", "Owner")}
          locale={locale}
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
          locale={locale}
          organization={organization}
          role="agent"
          value={selectedAgentId}
          onChange={setAgentContactId}
          onCreateContact={onCreateContact}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Race", "Breed")}
            <input value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Sexe", "Sex")}
            <select value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
              <option value="">{uiText(locale, "Non défini", "Unset")}</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="G">G</option>
            </select>
          </label>
        </div>
        <label>
          {uiText(locale, "Date de naissance", "Date of birth")}
          <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Enregistrement", "Registration")}
          <input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
        </label>
        <div className="external-membership-fields health-document-fields">
          <div className="inline-form-header">
            <strong>Coggins / EIA GVL</strong>
            <span>{uiText(locale, "Validation automatique du résultat GVL.", "Automatic GVL result validation.")}</span>
          </div>
          {latestCoggins ? (
            <div className="health-document-summary">
              <div className="health-document-title">
                <span className={`badge ${latestCoggins.status}`}>{horseHealthStatusLabel(latestCoggins.status, locale)}</span>
                <span className={`badge ${cogginsValidityBadgeClass(cogginsValidity)}`}>{cogginsValidityTagLabel(cogginsValidity, locale)}</span>
                <strong>{latestCoggins.certificate_number ?? uiText(locale, "Certificat GVL", "GVL certificate")}</strong>
              </div>
              <span className="muted-line">
                {latestCoggins.test_or_administered_on ? `Test: ${formatDate(latestCoggins.test_or_administered_on)}` : uiText(locale, "Date de test inconnue", "Unknown test date")}
                {latestCoggins.result ? ` - ${latestCoggins.result}` : ""}
              </span>
              {latestCoggins.horse_name ? (
                <span className="muted-line">
                  GVL: {latestCoggins.horse_name}
                  {latestCoggins.horse_date_of_birth ? ` - ${uiText(locale, "né(e)", "born")} ${formatDate(latestCoggins.horse_date_of_birth)}` : ""}
                </span>
              ) : null}
              {latestCoggins.document_url ? <span className="muted-line">{uiText(locale, "PDF Coggins conservé pour révision.", "Coggins PDF stored for review.")}</span> : null}
              {latestCoggins.source_url ? (
                <a className="text-button inline-action" href={latestCoggins.source_url} rel="noreferrer" target="_blank">
                  {uiText(locale, "Ouvrir le lien GVL", "Open GVL link")}
                </a>
              ) : null}
              {latestCoggins.warnings.length ? <span className="muted-line">{uiText(locale, "Révision", "Review")}: {latestCoggins.warnings.join(", ")}</span> : null}
              <div className="row-actions health-review-actions">
                {latestCoggins.document_url ? (
                  <button className="text-button" disabled={fileBusyDocumentId === latestCoggins.id} type="button" onClick={() => void handleOpenStoredDocument(latestCoggins)}>
                    {fileBusyDocumentId === latestCoggins.id ? "Ouverture..." : "PDF"}
                  </button>
                ) : null}
                {latestCoggins.source_url ? (
                  <button className="text-button" disabled={healthBusy} type="button" onClick={() => void handleReverifyLatestGvlCoggins()}>
                    {uiText(locale, "Revérifier GVL", "Reverify GVL")}
                  </button>
                ) : null}
                {canManageHealthDocuments && latestCoggins.status === "pending_review" ? (
                  <>
                  <button className="text-button" disabled={healthBusy} type="button" onClick={() => handleReviewCoggins("approved")}>
                    {uiText(locale, "Approuver", "Approve")}
                  </button>
                  <button className="text-button danger-text" disabled={healthBusy} type="button" onClick={() => handleReviewCoggins("rejected")}>
                    {uiText(locale, "Refuser", "Reject")}
                  </button>
                  </>
                ) : null}
              </div>
              {fileErrorDocumentId === latestCoggins.id ? <span className="muted-line">{uiText(locale, "Impossible d'ouvrir le fichier", "Unable to open file")}: {fileErrorMessageByDocumentId[latestCoggins.id] || uiText(locale, "accès refusé.", "access denied.")}</span> : null}
            </div>
          ) : (
            <span className="muted-line">{uiText(locale, "Aucun Coggins GVL valide.", "No valid GVL Coggins.")}</span>
          )}
          <div className="health-document-actions">
            <label>
              PDF Coggins GVL
              <input accept="application/pdf" type="file" onChange={(event) => setCogginsPdfFile(event.target.files?.[0] ?? null)} />
              {cogginsPdfFile ? <span className="muted-line">{cogginsPdfFile.name}</span> : null}
            </label>
            <label>
              {uiText(locale, "Lien GVL en secours", "Fallback GVL link")}
              <input placeholder="https://gvlcertcheck.ai/check/..." type="url" value={gvlCogginsUrl} onChange={(event) => setGvlCogginsUrl(event.target.value)} />
            </label>
            <button className="primary-button" disabled={healthBusy || !organization || (!gvlCogginsUrl.trim() && !cogginsPdfFile)} type="button" onClick={handleVerifyGvlCoggins}>
              <CheckCircle2 size={18} />
              {healthBusy ? uiText(locale, "Validation...", "Validating...") : uiText(locale, "Valider GVL", "Validate GVL")}
            </button>
          </div>
          <InlineHealthMessage value={healthMessage} />
          <div className="inline-form-header">
            <strong>{uiText(locale, "Vaccin influenza/rhino", "Influenza/rhino vaccine")}</strong>
            <span>{uiText(locale, "Dépôt du certificat pour révision manuelle.", "Upload the certificate for manual review.")}</span>
          </div>
          {latestVaccine ? (
            <div className="health-document-summary">
              <div className="health-document-title">
                <span className={`badge ${latestVaccine.status}`}>{horseHealthStatusLabel(latestVaccine.status, locale)}</span>
                <strong>{uiText(locale, "Certificat vaccin", "Vaccine certificate")}</strong>
              </div>
              <span className="muted-line">
                {latestVaccine.test_or_administered_on ? `${uiText(locale, "Vaccin", "Vaccine")}: ${formatDate(latestVaccine.test_or_administered_on)}` : uiText(locale, "Date du vaccin inconnue", "Unknown vaccine date")}
                {latestVaccine.document_url ? uiText(locale, " - fichier déposé", " - file uploaded") : ""}
              </span>
              {canManageHealthDocuments && latestVaccine.status === "pending_review" ? (
                <label className="compact-label">
                  {uiText(locale, "Date vaccin validée", "Validated vaccine date")}
                  <input type="date" value={vaccineReviewDate} onChange={(event) => setVaccineReviewDate(event.target.value)} />
                </label>
              ) : null}
              <div className="row-actions health-review-actions">
                {latestVaccine.document_url ? (
                  <button className="text-button" disabled={fileBusyDocumentId === latestVaccine.id} type="button" onClick={() => void handleOpenStoredDocument(latestVaccine)}>
                    {fileBusyDocumentId === latestVaccine.id ? "Ouverture..." : "PDF"}
                  </button>
                ) : null}
              {canManageHealthDocuments && latestVaccine.status === "pending_review" ? (
                  <>
                  <button className="text-button" disabled={healthBusy || !vaccineReviewDate} type="button" onClick={() => handleReviewVaccine("approved")}>
                    {uiText(locale, "Approuver", "Approve")}
                  </button>
                  <button className="text-button danger-text" disabled={healthBusy} type="button" onClick={() => handleReviewVaccine("rejected")}>
                    {uiText(locale, "Refuser", "Reject")}
                  </button>
                  </>
              ) : null}
              </div>
              {fileErrorDocumentId === latestVaccine.id ? <span className="muted-line">{uiText(locale, "Impossible d'ouvrir le fichier", "Unable to open file")}: {fileErrorMessageByDocumentId[latestVaccine.id] || uiText(locale, "accès refusé.", "access denied.")}</span> : null}
            </div>
          ) : (
            <span className="muted-line">{uiText(locale, "Aucun certificat vaccin déposé.", "No vaccine certificate uploaded.")}</span>
          )}
          <div className="health-document-actions">
            <label>
              Certificat vaccin
              <input accept="application/pdf,image/*" type="file" onChange={(event) => setVaccineCertificateFile(event.target.files?.[0] ?? null)} />
              {vaccineCertificateFile ? <span className="muted-line">{vaccineCertificateFile.name}</span> : null}
            </label>
            <label>
              {uiText(locale, "Date du vaccin", "Vaccine date")}
              <input type="date" value={vaccineAdministeredOn} onChange={(event) => setVaccineAdministeredOn(event.target.value)} />
            </label>
            <button className="primary-button" disabled={healthBusy || !organization || !vaccineCertificateFile} type="button" onClick={handleUploadVaccineCertificate}>
              <FileText size={18} />
              {uiText(locale, "Ajouter vaccin", "Add vaccine")}
            </button>
          </div>
        </div>
        {externalReferenceFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Références externes du cheval", "External horse references")}</strong>
              <span>{uiText(locale, "Ex.: licence de compétition NRHA. Ces références pourront être validées par intégration externe plus tard.", "Example: NRHA competition license. These references can be validated through an external integration later.")}</span>
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
        <FormActions busy={busy || !ownerContactId} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function SanctioningFields({
  locale = "fr",
  backNumberPolicy,
  disabled = false,
  hideBackNumberPolicy = false,
  label,
  sanctioningBodies,
  sanctioningBodyCodes,
  onBackNumberPolicyChange,
  onSanctioningBodyCodesChange,
}: {
  locale?: Locale;
  backNumberPolicy: BackNumberPolicy;
  disabled?: boolean;
  hideBackNumberPolicy?: boolean;
  label?: string;
  sanctioningBodies: SanctioningBody[];
  sanctioningBodyCodes: string[];
  onBackNumberPolicyChange: (policy: BackNumberPolicy) => void;
  onSanctioningBodyCodesChange: (codes: string[]) => void;
}) {
  const fieldLabel = label ?? uiText(locale, "Sanctions", "Sanctioning");

  return (
    <div className="stack compact-stack">
      <div className="field-group">
        <span className="contact-picker-label">{fieldLabel}</span>
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
          {!sanctioningBodies.length ? <span className="muted-line">{uiText(locale, "Aucun organisme de sanction configuré.", "No sanctioning bodies configured.")}</span> : null}
        </div>
      </div>
      {hideBackNumberPolicy ? null : (
        <label>
          {uiText(locale, "Politique de dossard", "Back number policy")}
          <select disabled={disabled} value={backNumberPolicy} onChange={(event) => onBackNumberPolicyChange(event.target.value as BackNumberPolicy)}>
            <option value="horse">{uiText(locale, "Par cheval", "By horse")}</option>
            <option value="rider">{uiText(locale, "Par cavalier", "By rider")}</option>
            <option value="horse_rider_team">{uiText(locale, "Par équipe cheval / cavalier", "By horse / rider team")}</option>
            <option value="entry">{uiText(locale, "Par inscription", "By entry")}</option>
            <option value="custom">{uiText(locale, "Personnalisée", "Custom")}</option>
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
  if (codes.some((code) => sanctioningBodies.find((body) => body.code === code)?.back_number_policy === "rider")) {
    return "rider";
  }

  return codes.some((code) => sanctioningBodies.find((body) => body.code === code)?.back_number_policy === "horse_rider_team") ? "horse_rider_team" : "horse";
}

function isNrhaSanctioned(codes: string[] | null | undefined) {
  return Boolean(codes?.includes("NRHA"));
}

function sanctionLabel(codes: string[] | null | undefined, sanctioningBodies: SanctioningBody[], locale: Locale = "fr") {
  if (!codes?.length) {
    return uiText(locale, "Aucune sanction", "No sanction");
  }

  return codes.map((code) => sanctioningBodies.find((body) => body.code === code)?.name ?? code).join(", ");
}

function backNumberPolicyLabel(policy: BackNumberPolicy | null | undefined, locale: Locale = "fr") {
  switch (policy) {
    case "rider":
      return uiText(locale, "Dossard par cavalier", "Back number by rider");
    case "horse_rider_team":
      return uiText(locale, "Dossard par équipe cheval / cavalier", "Back number by horse / rider team");
    case "entry":
      return uiText(locale, "Dossard par inscription", "Back number by entry");
    case "custom":
      return uiText(locale, "Dossard personnalisé", "Custom back number");
    case "horse":
    default:
      return uiText(locale, "Dossard par cheval", "Back number by horse");
  }
}

const nrhaClassTypes = [
  { label: "Category 1 - Ancillary, year-end eligible", value: "category_1_ancillary_year_end" },
  { label: "Category 2 - Aged show", value: "category_2_aged_show" },
  { label: "Category 3 - Youth", value: "category_3_youth" },
  { label: "Category 4 - Breed or alliance", value: "category_4_breed_alliance" },
  { label: "Category 5 - Ancillary, non year-end", value: "category_5_ancillary_non_year_end" },
  { label: "Category 6 - Closed aged show", value: "category_6_closed_aged_show" },
  { label: "Category 7 - Affiliate championship", value: "category_7_affiliate_championship" },
  { label: "Category 8 - International / NGB", value: "category_8_international_ngb" },
  { label: "Category 9 - Freestyle reining", value: "category_9_freestyle" },
  { label: "Category 10 - Entry level", value: "category_10_entry_level" },
  { label: "Category 11 - Other approved", value: "category_11_other_approved" },
  { label: "Category 12 - Nominator incentive earnings", value: "category_12_nominator_incentive" },
  { label: "Category 13 - Earnings/status limitations", value: "category_13_earnings_status_limited" },
];

function payoutScheduleOptions(locale: Locale = "fr"): Array<{ description: string; label: string; value: PayoutScheduleType }> {
  return [
    {
      description: uiText(locale, "Classe sans bourse. Les frais ne génèrent pas de paiement aux concurrents.", "Class without purse. Fees do not generate competitor payouts."),
      label: uiText(locale, "Aucun paiement", "No payout"),
      value: "none",
    },
    {
      description: uiText(locale, "Standard NRHA pour la majorité des classes ancillary. Paiements plus concentrés selon les tableaux officiels.", "NRHA standard for most ancillary classes. More concentrated payouts based on official schedules."),
      label: "NRHA Schedule A",
      value: "nrha_schedule_a",
    },
    {
      description: uiText(locale, "NRHA Category 1 avec 2 000 $ ou plus en added money. Utilise le Schedule B officiel.", "NRHA Category 1 with $2,000 or more in added money. Uses the official Schedule B."),
      label: "NRHA Schedule B",
      value: "nrha_schedule_b",
    },
    {
      description: uiText(locale, "Moins de places payées, montants plus élevés aux premières positions.", "Fewer paid places, higher amounts for the top positions."),
      label: uiText(locale, "Paiement maison concentré", "House concentrated payout"),
      value: "house_concentrated",
    },
    {
      description: uiText(locale, "Plus de places payées, montants plus petits par place pour encourager la participation.", "More paid places, smaller amounts per place to encourage participation."),
      label: uiText(locale, "Paiement maison réparti", "House distributed payout"),
      value: "house_distributed",
    },
    {
      description: uiText(locale, "Tableau maison à définir par l'association avec ses propres tranches et pourcentages.", "House table defined by the association with its own brackets and percentages."),
      label: uiText(locale, "Paiement maison personnalisé", "Custom house payout"),
      value: "house_custom",
    },
    {
      description: uiText(locale, "La portion admissible retourne aux concurrents selon le tableau choisi, avec retenue à 0 % ou configurée clairement.", "The eligible portion returns to competitors based on the selected table, with retainage at 0% or clearly configured."),
      label: "Jackpot 100%",
      value: "jackpot_100",
    },
  ];
}

type PayoutRuleBracket = {
  max_entries?: number | string | null;
  min_entries?: number | string | null;
  percentages?: number[] | string;
};

type PayoutRules = {
  custom_brackets?: PayoutRuleBracket[];
  [key: string]: unknown;
};

function payoutScheduleOption(value: PayoutScheduleType | null | undefined, locale: Locale = "fr") {
  const options = payoutScheduleOptions(locale);
  return options.find((option) => option.value === value) ?? options[0];
}

function payoutScheduleLabel(value: PayoutScheduleType | null | undefined, locale: Locale = "fr") {
  return payoutScheduleOption(value, locale).label;
}

function payoutScheduleUsesCustomTable(value: PayoutScheduleType) {
  return value === "house_concentrated" || value === "house_distributed" || value === "house_custom" || value === "jackpot_100";
}

function payoutRulesFromValue(value: Record<string, unknown> | null | undefined): PayoutRules {
  return value && typeof value === "object" ? (value as PayoutRules) : {};
}

function payoutRulesHaveStoredRows(value: Record<string, unknown> | null | undefined) {
  return Boolean(payoutRulesFromValue(value).custom_brackets?.length);
}

function defaultPayoutRulesFor(type: PayoutScheduleType): PayoutRules {
  if (type === "house_concentrated") {
    return {
      preset: type,
      custom_brackets: [
        { min_entries: "1", max_entries: "1", percentages: "100" },
        { min_entries: "2", max_entries: "5", percentages: "70, 30" },
        { min_entries: "6", max_entries: "10", percentages: "50, 30, 20" },
        { min_entries: "11", max_entries: "20", percentages: "45, 25, 15, 10, 5" },
        { min_entries: "21", max_entries: "", percentages: "35, 25, 18, 12, 10" },
      ],
    };
  }

  if (type === "house_distributed" || type === "jackpot_100") {
    return {
      preset: type,
      custom_brackets: [
        { min_entries: "1", max_entries: "1", percentages: "100" },
        { min_entries: "2", max_entries: "5", percentages: "60, 40" },
        { min_entries: "6", max_entries: "10", percentages: "40, 30, 20, 10" },
        { min_entries: "11", max_entries: "20", percentages: "30, 24, 18, 12, 10, 6" },
        { min_entries: "21", max_entries: "", percentages: "25, 20, 16, 13, 10, 8, 5, 3" },
      ],
    };
  }

  return {
    preset: type,
    custom_brackets: [{ min_entries: "1", max_entries: "", percentages: "100" }],
  };
}

function payoutRuleRows(rules: Record<string, unknown> | null | undefined) {
  const parsedRules = payoutRulesFromValue(rules);
  return parsedRules.custom_brackets?.length ? parsedRules.custom_brackets : defaultPayoutRulesFor("house_custom").custom_brackets ?? [];
}

function parsePayoutPercentages(value: PayoutRuleBracket["percentages"]) {
  if (Array.isArray(value)) {
    return value.filter((percent) => Number.isFinite(percent));
  }

  return String(value ?? "")
    .split(/[,;\s]+/)
    .map((part) => Number(part.trim()))
    .filter((percent) => Number.isFinite(percent) && percent > 0);
}

function parseNullableRuleNumber(value: number | string | null | undefined) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchingPayoutBracket(rules: Record<string, unknown> | null | undefined, entryCount: number) {
  return payoutRuleRows(rules).find((row) => {
    const minEntries = parseNullableRuleNumber(row.min_entries) ?? 1;
    const maxEntries = parseNullableRuleNumber(row.max_entries);
    return entryCount >= minEntries && (maxEntries == null || entryCount <= maxEntries);
  });
}

function payoutPercentageTotal(row: PayoutRuleBracket) {
  return parsePayoutPercentages(row.percentages).reduce((total, percent) => total + percent, 0);
}

function payoutPreview({
  addedMoney,
  entryCount,
  entryFee,
  payoutRules,
  retainagePercent,
  sanctioningFeePercent,
  trophyOrPlaqueFee,
}: {
  addedMoney: string;
  entryCount: string;
  entryFee: string;
  payoutRules: Record<string, unknown>;
  retainagePercent: string;
  sanctioningFeePercent: string;
  trophyOrPlaqueFee: string;
}) {
  const parsedEntryCount = Math.max(1, Math.round(numericValue(entryCount) ?? 1));
  const grossEntryFees = (numericValue(entryFee) ?? 0) * parsedEntryCount;
  const baseAfterTrophy = Math.max(0, grossEntryFees - (numericValue(trophyOrPlaqueFee) ?? 0));
  const sanctioningFee = baseAfterTrophy * ((numericValue(sanctioningFeePercent) ?? 0) / 100);
  const netEntryFee = Math.max(0, baseAfterTrophy - sanctioningFee);
  const retainage = netEntryFee * ((numericValue(retainagePercent) ?? 0) / 100);
  const purse = Math.max(0, netEntryFee - retainage + (numericValue(addedMoney) ?? 0));
  const bracket = matchingPayoutBracket(payoutRules, parsedEntryCount);
  const percentages = bracket ? parsePayoutPercentages(bracket.percentages) : [];

  return {
    bracket,
    entryCount: parsedEntryCount,
    grossEntryFees,
    paidPlaces: percentages.length,
    payouts: percentages.map((percent, index) => ({
      amount: purse * (percent / 100),
      percent,
      place: index + 1,
    })),
    purse,
  };
}

type NrhaApprovedClass = {
  code: string;
  name: string;
  nrhaClassType: string;
};

const nrhaApprovedClasses: NrhaApprovedClass[] = [
  { code: "1100", name: "Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1110", name: "Prime Time Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1200", name: "Intermediate Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1301", name: "Limited Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1350", name: "Rookie Professional", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1400", name: "Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1500", name: "Intermediate Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1600", name: "Limited Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1650", name: "Prime Time Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1660", name: "Masters Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1700", name: "Novice Horse Open Level 1", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1750", name: "Novice Horse Open Level 2", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1775", name: "Novice Horse Open Level 3", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1800", name: "Novice Horse Non Pro Level 1", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1850", name: "Novice Horse Non Pro Level 2", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1875", name: "Novice Horse Non Pro Level 3", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "2100", name: "Level 4 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2200", name: "Level 3 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2300", name: "Level 2 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2325", name: "Level 1 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2350", name: "Prime Time Open-Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2400", name: "Level 4 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2500", name: "Level 3 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2600", name: "Level 2 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2621", name: "Masters Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2625", name: "Level 1 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2650", name: "Prime Time Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2700", name: "Youth Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2720", name: "Youth 13 & Under - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2730", name: "Youth 14-18 - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2800", name: "Amateur Derby", nrhaClassType: "category_2_aged_show" },
  { code: "2900", name: "Snaffle Bit/Hackamore (3 YO) Open", nrhaClassType: "category_2_aged_show" },
  { code: "2920", name: "Snaffle Bit/Hackamore (4 & U) Open", nrhaClassType: "category_2_aged_show" },
  { code: "2930", name: "Snaffle Bit/Hackamore (5 & U) Open", nrhaClassType: "category_2_aged_show" },
  { code: "2940", name: "Snaffle Bit/Hackamore (3 YO) Non Pro", nrhaClassType: "category_2_aged_show" },
  { code: "2950", name: "Snaffle Bit/Hackamore (4 & U) Non Pro", nrhaClassType: "category_2_aged_show" },
  { code: "2960", name: "Snaffle Bit/Hackamore (5 & U) Non Pro", nrhaClassType: "category_2_aged_show" },
  { code: "3100", name: "Youth 13 & Under", nrhaClassType: "category_3_youth" },
  { code: "3200", name: "Youth 14-18", nrhaClassType: "category_3_youth" },
  { code: "3300", name: "Youth Rookie", nrhaClassType: "category_3_youth" },
  { code: "3400", name: "Unrestricted Youth", nrhaClassType: "category_3_youth" },
  { code: "3500", name: "10 & Under Short Stirrup", nrhaClassType: "category_3_youth" },
  { code: "4670", name: "Open", nrhaClassType: "category_4_breed_alliance" },
  { code: "4680", name: "Junior Horse", nrhaClassType: "category_4_breed_alliance" },
  { code: "4681", name: "Senior Horse", nrhaClassType: "category_4_breed_alliance" },
  { code: "4690", name: "Non Pro", nrhaClassType: "category_4_breed_alliance" },
  { code: "4691", name: "Amateur", nrhaClassType: "category_4_breed_alliance" },
  { code: "4692", name: "Youth", nrhaClassType: "category_4_breed_alliance" },
  { code: "4693", name: "Youth 13 & Under", nrhaClassType: "category_4_breed_alliance" },
  { code: "4694", name: "Youth 14-18", nrhaClassType: "category_4_breed_alliance" },
  { code: "4695", name: "Novice Amateur", nrhaClassType: "category_4_breed_alliance" },
  { code: "5270", name: "Legends Non Pro", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "5300", name: "Rookie Level 1", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "5301", name: "Prime Time Rookie", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "5310", name: "Rookie Level 2", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "6210", name: "Level 4 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6220", name: "Level 3 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6230", name: "Level 2 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6231", name: "Level 1 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6234", name: "Masters Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6235", name: "Prime Time Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6236", name: "Open Gelding - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6237", name: "Open Mare - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6240", name: "Level 4 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6250", name: "Level 3 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6260", name: "Level 2 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6261", name: "Level 1 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6265", name: "Prime Time Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6266", name: "Non Pro Gelding - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6267", name: "Non Pro Mare - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6700", name: "Youth Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6720", name: "Youth 13 & Under - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6730", name: "Youth 14-18 - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6800", name: "Amateur Derby", nrhaClassType: "category_6_closed_aged_show" },
  { code: "9100", name: "Freestyle Open", nrhaClassType: "category_9_freestyle" },
  { code: "9200", name: "Freestyle Non Pro", nrhaClassType: "category_9_freestyle" },
  { code: "9300", name: "Freestyle Invitational", nrhaClassType: "category_9_freestyle" },
  { code: "9400", name: "Freestyle Youth", nrhaClassType: "category_9_freestyle" },
  { code: "10001", name: "Green Reiner Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "10002", name: "Green Reiner Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10100", name: "Ride & Slide Open Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10101", name: "Ride & Slide Non Pro Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10102", name: "Ride & Slide Youth Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10200", name: "Ride & Slide Open Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "10201", name: "Ride & Slide Non Pro Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "10202", name: "Ride & Slide Youth Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "11011", name: "Para-Reining", nrhaClassType: "category_11_other_approved" },
  { code: "111100", name: "Other Open", nrhaClassType: "category_11_other_approved" },
  { code: "111400", name: "Other Non Pro", nrhaClassType: "category_11_other_approved" },
].sort((a, b) => Number(a.code) - Number(b.code));

function findNrhaApprovedClass(code: string | null | undefined) {
  return nrhaApprovedClasses.find((approvedClass) => approvedClass.code === code?.trim()) ?? null;
}

function NrhaApprovedClassSelect({
  locale = "fr",
  disabled = false,
  value,
  onChange,
}: {
  locale?: Locale;
  disabled?: boolean;
  value: string;
  onChange: (code: string) => void;
}) {
  const items = useMemo(() => {
    const approvedClassItems = nrhaApprovedClasses.map((approvedClass) => ({
      id: approvedClass.code,
      label: `${approvedClass.code} ${approvedClass.name}`,
      detail: nrhaClassTypeLabel(approvedClass.nrhaClassType),
    }));

    if (value && !findNrhaApprovedClass(value)) {
      return [{ id: value, label: value, detail: uiText(locale, "Code NRHA hors liste", "NRHA code outside list") }, ...approvedClassItems];
    }

    return approvedClassItems;
  }, [locale, value]);

  return <SearchSelect allowEmpty disabled={disabled} items={items} maxVisibleItems={items.length} placeholder={uiText(locale, "Rechercher par numéro ou nom", "Search by number or name")} value={value} onChange={onChange} />;
}

function applyNrhaApprovedClassChoice(
  nextCode: string,
  {
    setCode,
    setName,
    setNrhaClassType,
  }: {
    setCode: (value: string) => void;
    setName: (value: string) => void;
    setNrhaClassType: (value: string) => void;
  },
) {
  setCode(nextCode);

  const approvedClass = findNrhaApprovedClass(nextCode);

  if (approvedClass) {
    setName(approvedClass.name);
    setNrhaClassType(approvedClass.nrhaClassType);
    return;
  }

  if (!nextCode) {
    setNrhaClassType("");
  }
}

function PayoutSettingsFields({
  locale = "fr",
  addedMoney,
  currency = "CAD",
  disabled = false,
  entryFee,
  payoutNotes,
  payoutRules,
  payoutScheduleType,
  retainagePercent,
  sanctioningFeePercent,
  trophyOrPlaqueFee,
  onAddedMoneyChange,
  onPayoutNotesChange,
  onPayoutRulesChange,
  onPayoutScheduleTypeChange,
  onRetainagePercentChange,
  onSanctioningFeePercentChange,
  onTrophyOrPlaqueFeeChange,
}: {
  locale?: Locale;
  addedMoney: string;
  currency?: string;
  disabled?: boolean;
  entryFee: string;
  payoutNotes: string;
  payoutRules: Record<string, unknown>;
  payoutScheduleType: PayoutScheduleType;
  retainagePercent: string;
  sanctioningFeePercent: string;
  trophyOrPlaqueFee: string;
  onAddedMoneyChange: (value: string) => void;
  onPayoutNotesChange: (value: string) => void;
  onPayoutRulesChange: (value: Record<string, unknown>) => void;
  onPayoutScheduleTypeChange: (value: PayoutScheduleType) => void;
  onRetainagePercentChange: (value: string) => void;
  onSanctioningFeePercentChange: (value: string) => void;
  onTrophyOrPlaqueFeeChange: (value: string) => void;
}) {
  const payoutOptions = payoutScheduleOptions(locale);
  const selectedPayout = payoutScheduleOption(payoutScheduleType, locale);
  const [previewEntryCount, setPreviewEntryCount] = useState("10");
  const customRows = payoutRuleRows(payoutRules);
  const preview = payoutPreview({
    addedMoney,
    entryCount: previewEntryCount,
    entryFee,
    payoutRules,
    retainagePercent,
    sanctioningFeePercent,
    trophyOrPlaqueFee,
  });

  function handlePayoutScheduleTypeChange(nextType: PayoutScheduleType) {
    onPayoutScheduleTypeChange(nextType);

    if (payoutScheduleUsesCustomTable(nextType) && !payoutRulesHaveStoredRows(payoutRules)) {
      onPayoutRulesChange(defaultPayoutRulesFor(nextType));
    }
  }

  function handleLoadPreset(nextType = payoutScheduleType) {
    onPayoutRulesChange(defaultPayoutRulesFor(nextType));
  }

  function handleRowChange(index: number, key: keyof PayoutRuleBracket, value: string) {
    onPayoutRulesChange({
      ...payoutRules,
      custom_brackets: customRows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    });
  }

  function handleAddRow() {
    onPayoutRulesChange({
      ...payoutRules,
      custom_brackets: [...customRows, { min_entries: "", max_entries: "", percentages: "" }],
    });
  }

  function handleRemoveRow(index: number) {
    onPayoutRulesChange({
      ...payoutRules,
      custom_brackets: customRows.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  return (
    <fieldset className="stack nested-fieldset">
      <legend>{uiText(locale, "Bourses et paiements", "Purses and payouts")}</legend>
      <label>
        {uiText(locale, "Type de paiement", "Payout type")}
        <select disabled={disabled} value={payoutScheduleType} onChange={(event) => handlePayoutScheduleTypeChange(event.target.value as PayoutScheduleType)}>
          {payoutOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="input-help">{selectedPayout.description}</span>
      </label>
      <div className="form-grid">
        <label>
          {uiText(locale, "Added money", "Added money")}
          <input disabled={disabled} min="0" step="0.01" type="number" value={addedMoney} onChange={(event) => onAddedMoneyChange(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Trophée / plaque", "Trophy / plaque")}
          <input disabled={disabled} min="0" step="0.01" type="number" value={trophyOrPlaqueFee} onChange={(event) => onTrophyOrPlaqueFeeChange(event.target.value)} />
        </label>
      </div>
      <div className="form-grid">
        <label>
          {uiText(locale, "Retenue personnalisée (%)", "Retainage override (%)")}
          <input disabled={disabled} max="100" min="0" step="0.01" type="number" value={retainagePercent} onChange={(event) => onRetainagePercentChange(event.target.value)} />
          <span className="input-help">{uiText(locale, "Vide = utilise le réglage du concours ou de l'association.", "Blank = uses the show or association setting.")}</span>
        </label>
        <label>
          {uiText(locale, "Frais d'organisme (%)", "Sanctioning body fee (%)")}
          <input disabled={disabled} max="100" min="0" step="0.01" type="number" value={sanctioningFeePercent} onChange={(event) => onSanctioningFeePercentChange(event.target.value)} />
          <span className="input-help">{uiText(locale, "Ex.: NRHA 5 %. Vide = aucun frais défini ici.", "Example: NRHA 5%. Blank = no fee defined here.")}</span>
        </label>
      </div>
      {payoutScheduleUsesCustomTable(payoutScheduleType) ? (
        <div className="payout-editor">
          <div className="payout-editor-header">
            <span className="contact-picker-label">{uiText(locale, "Tableau maison", "House table")}</span>
            <button className="text-button" disabled={disabled} type="button" onClick={() => handleLoadPreset()}>
              {uiText(locale, "Charger un modèle", "Load preset")}
            </button>
          </div>
          <div className="payout-rule-table">
            <div className="payout-rule-row payout-rule-head">
              <span>Min</span>
              <span>Max</span>
              <span>{uiText(locale, "Places %", "Places %")}</span>
              <span>Total</span>
              <span />
            </div>
            {customRows.map((row, index) => {
              const total = payoutPercentageTotal(row);

              return (
                <div className="payout-rule-row" key={index}>
                  <input disabled={disabled} min="1" type="number" value={String(row.min_entries ?? "")} onChange={(event) => handleRowChange(index, "min_entries", event.target.value)} />
                  <input disabled={disabled} min="1" placeholder="+" type="number" value={String(row.max_entries ?? "")} onChange={(event) => handleRowChange(index, "max_entries", event.target.value)} />
                  <input
                    disabled={disabled}
                    placeholder={uiText(locale, "Ex.: 50, 30, 20", "Example: 50, 30, 20")}
                    value={Array.isArray(row.percentages) ? row.percentages.join(", ") : String(row.percentages ?? "")}
                    onChange={(event) => handleRowChange(index, "percentages", event.target.value)}
                  />
                  <span className={Math.abs(total - 100) < 0.01 ? "payout-total-ok" : "payout-total-warning"}>{total ? `${total}%` : "-"}</span>
                  <button aria-label={uiText(locale, "Supprimer la tranche", "Remove bracket")} className="text-button danger" disabled={disabled || customRows.length <= 1} type="button" onClick={() => handleRemoveRow(index)}>
                    X
                  </button>
                </div>
              );
            })}
          </div>
          <button className="ghost-button" disabled={disabled} type="button" onClick={handleAddRow}>
            <Plus size={16} />
            {uiText(locale, "Ajouter une tranche", "Add bracket")}
          </button>
          <label>
            {uiText(locale, "Aperçu avec", "Preview with")}
            <input disabled={disabled} min="1" step="1" type="number" value={previewEntryCount} onChange={(event) => setPreviewEntryCount(event.target.value)} />
          </label>
          <div className="payout-preview">
            <span>{uiText(locale, "Inscriptions", "Entries")}: {preview.entryCount}</span>
            <span>{uiText(locale, "Brut", "Gross")}: {formatCurrency(preview.grossEntryFees, currency)}</span>
            <span>{uiText(locale, "Bourse", "Purse")}: {formatCurrency(preview.purse, currency)}</span>
            <span>{uiText(locale, "Places payées", "Paid places")}: {preview.paidPlaces || uiText(locale, "aucune", "none")}</span>
            {preview.payouts.length ? (
              <ol>
                {preview.payouts.map((payout) => (
                  <li key={payout.place}>
                    {payout.place}. {payout.percent}% - {formatCurrency(payout.amount, currency)}
                  </li>
                ))}
              </ol>
            ) : (
              <span className="input-help">{uiText(locale, "Aucune tranche ne correspond au nombre d'inscriptions choisi.", "No bracket matches the selected number of entries.")}</span>
            )}
          </div>
        </div>
      ) : null}
      <label>
        {uiText(locale, "Notes de paiement", "Payout notes")}
        <textarea disabled={disabled} rows={2} value={payoutNotes} onChange={(event) => onPayoutNotesChange(event.target.value)} />
      </label>
    </fieldset>
  );
}

function payoutAmountSummary(value: number | null | undefined, label: string) {
  return value ? `${label} ${formatCurrency(value, "CAD")}` : "";
}

function payoutDivisionSummary(division: Pick<Division, "added_money" | "payout_schedule_type" | "retainage_percent" | "trophy_or_plaque_fee">, locale: Locale = "fr") {
  return [
    payoutScheduleLabel(division.payout_schedule_type, locale),
    payoutAmountSummary(division.added_money, uiText(locale, "Ajouté", "Added")),
    payoutAmountSummary(division.trophy_or_plaque_fee, uiText(locale, "Trophée", "Trophy")),
    division.retainage_percent == null ? null : `${uiText(locale, "Retenue", "Retainage")} ${division.retainage_percent}%`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function payoutTemplateDivisionSummary(
  division: Pick<ClassTemplateDivision, "default_added_money" | "default_payout_schedule_type" | "default_retainage_percent" | "default_trophy_or_plaque_fee">,
  locale: Locale = "fr",
) {
  return [
    payoutScheduleLabel(division.default_payout_schedule_type, locale),
    payoutAmountSummary(division.default_added_money, uiText(locale, "Ajouté", "Added")),
    payoutAmountSummary(division.default_trophy_or_plaque_fee, uiText(locale, "Trophée", "Trophy")),
    division.default_retainage_percent == null ? null : `${uiText(locale, "Retenue", "Retainage")} ${division.default_retainage_percent}%`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function nrhaClassTypeLabel(value: string | null | undefined) {
  return nrhaClassTypes.find((type) => type.value === value)?.label ?? "";
}

function nrhaClassTypeFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.nrha_class_type === "string" ? rules.nrha_class_type : "";
}

function concurrentClassIdFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.concurrent_class_id === "string" ? rules.concurrent_class_id : "";
}

function concurrentGroupLabelFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.concurrent_group_label === "string" ? rules.concurrent_group_label : "";
}

function concurrentClassLabel(classRecord: ClassRecord, classes: ClassRecord[], locale: Locale = "fr") {
  const concurrentClassId = concurrentClassIdFromRules(classRecord.eligibility_rules);
  const linkedClass = findById(classes, concurrentClassId);

  if (linkedClass) {
    return uiText(locale, `Bloc concurrent avec ${linkedClass.name}`, `Concurrent with ${linkedClass.name}`);
  }

  const groupLabel = concurrentGroupLabelFromRules(classRecord.eligibility_rules);
  return groupLabel ? uiText(locale, `Bloc concurrent: ${groupLabel}`, `Concurrent block: ${groupLabel}`) : "";
}

function classProgramRules(
  notes: string,
  {
    concurrentClass,
  }: {
    concurrentClass?: ClassRecord | null;
  } = {},
) {
  const extras: EligibilityRules = {};

  if (concurrentClass) {
    extras.concurrent_class_id = concurrentClass.id;
    extras.concurrent_group_label = concurrentClass.block_label || concurrentClass.name;
  }

  return eligibilityRulesFromNotes(notes, extras);
}

function showTimeInputValue(value: string | null | undefined, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

function datetimeLocalInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultEntriesCloseAtForShowDay(day: ShowDay | null | undefined) {
  if (!day?.day_date) {
    return "";
  }

  const date = new Date(`${day.day_date}T18:00:00`);
  date.setDate(date.getDate() - 1);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function classEntriesCloseLabel(classRecord: ClassRecord) {
  if (!classRecord.entries_close_at) {
    return "Inscriptions sans fermeture";
  }

  const closeDate = new Date(classRecord.entries_close_at);

  if (Number.isNaN(closeDate.getTime())) {
    return "Fermeture invalide";
  }

  const lateLabel = classRecord.late_entries_allowed ? `tardives +${classRecord.late_entry_fee_percent ?? 50}%` : "tardives refusées";

  return `Fermeture ${closeDate.toLocaleString("fr-CA", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  })} - ${lateLabel}`;
}

function classEntriesCloseDate(classRecord: ClassRecord | null | undefined) {
  if (!classRecord?.entries_close_at) {
    return null;
  }

  const closeDate = new Date(classRecord.entries_close_at);
  return Number.isNaN(closeDate.getTime()) ? null : closeDate;
}

function classEntriesAreClosed(classRecord: ClassRecord | null | undefined) {
  const closeDate = classEntriesCloseDate(classRecord);
  return !closeDate || Date.now() >= closeDate.getTime();
}

function buildEntryDeadlineReadiness(classRecord: ClassRecord | null, entryFee: number | null | undefined, currency: string): { canProceed: boolean; message: InlineHealthMessage | null } {
  const closeDate = classEntriesCloseDate(classRecord);

  if (!classRecord || !closeDate) {
    return { canProceed: true, message: null };
  }

  const closeLabel = closeDate.toLocaleString("fr-CA", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (Date.now() <= closeDate.getTime()) {
    return {
      canProceed: true,
      message: {
        tone: "info",
        message: `Inscriptions ouvertes jusqu'au ${closeLabel}.`,
      },
    };
  }

  if (!classRecord.late_entries_allowed) {
    return {
      canProceed: false,
      message: {
        tone: "error",
        message: `Les inscriptions sont fermees depuis le ${closeLabel}. Les inscriptions tardives ne sont pas acceptees pour cette classe.`,
      },
    };
  }

  const lateFeePercent = classRecord.late_entry_fee_percent ?? 50;
  const lateFeeAmount = entryFee == null ? null : Math.round(entryFee * (lateFeePercent / 100) * 100) / 100;

  return {
    canProceed: true,
    message: {
      tone: "info",
      message: `Inscription tardive: penalite de ${lateFeePercent}%${lateFeeAmount == null ? "" : ` (${formatCurrency(lateFeeAmount, currency)})`}.`,
    },
  };
}

const inactiveProgramEntryStatuses = new Set<Entry["status"]>(["cancelled", "scratched", "scratched_pending_refund"]);

function buildEntryProgramLimitReadiness({
  division,
  divisions,
  entries,
  existingEntryId,
  horse,
  ownerContact,
  riderContact,
  skip,
}: {
  division: Division | null | undefined;
  divisions: Division[];
  entries: Entry[];
  existingEntryId?: string;
  horse: Horse | null | undefined;
  ownerContact: Contact | null | undefined;
  riderContact: Contact | null | undefined;
  skip?: boolean;
}): { canProceed: boolean; message: InlineHealthMessage | null } {
  if (skip || !division || !horse) {
    return { canProceed: true, message: null };
  }

  const activeEntries = entries.filter((entry) => entry.id !== existingEntryId && !inactiveProgramEntryStatuses.has(entry.status));
  const classDivisionIds = new Set(divisions.filter((candidate) => candidate.class_id === division.class_id).map((candidate) => candidate.id));
  const duplicateHorseEntry = activeEntries.find((entry) => entry.horse_id === horse.id && classDivisionIds.has(entry.division_id));

  if (duplicateHorseEntry) {
    return {
      canProceed: false,
      message: {
        tone: "error",
        message: "Ce cheval est déjà inscrit dans ce bloc.",
      },
    };
  }

  const riderContactId = riderContact?.id ?? ownerContact?.id ?? null;

  if (!riderContactId) {
    return { canProceed: true, message: null };
  }

  const riderEntryCount = activeEntries.filter((entry) => entry.division_id === division.id && (entry.rider_contact_id ?? entry.owner_contact_id) === riderContactId).length;

  if (riderEntryCount >= 3) {
    return {
      canProceed: false,
      message: {
        tone: "error",
        message: "Ce cavalier a déjà trois inscriptions dans cette classe.",
      },
    };
  }

  if (riderEntryCount === 2) {
    return {
      canProceed: true,
      message: {
        tone: "info",
        message: "Ce sera la 3e inscription de ce cavalier dans cette classe.",
      },
    };
  }

  return { canProceed: true, message: null };
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

function invoiceItemTypeLabel(type: InvoiceLineItem["item_type"], locale: Locale = "fr") {
  switch (type) {
    case "entry":
      return uiText(locale, "Inscription", "Entry");
    case "judge_fee":
      return uiText(locale, "Frais de juge", "Judge fee");
    case "stall":
      return "Stall";
    case "extra":
      return "Extra";
    case "membership":
      return "Membership";
    case "fee":
      return uiText(locale, "Frais", "Fee");
    case "discount":
      return uiText(locale, "Rabais", "Discount");
    case "tax":
      return uiText(locale, "Taxe", "Tax");
    case "manual":
    default:
      return uiText(locale, "Manuel", "Manual");
  }
}

function invoiceQuantityLabel(quantity: number) {
  return Number(quantity).toLocaleString("en-CA", { maximumFractionDigits: 2 });
}

function eligibilityRulesFromNotes(notes: string, extras: EligibilityRules = {}): EligibilityRules {
  const rules = { ...extras };

  if (notes.trim()) {
    rules.notes = notes.trim();
  }

  return rules;
}

function eligibilityNotesFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.notes === "string" ? rules.notes : "";
}

function ClassTemplateForm({
  locale = "fr",
  organization,
  sanctioningBodies,
  onCreateClassTemplate,
  onCreated,
}: {
  locale?: Locale;
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreated?: () => void;
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
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouveau bloc preset", "New block preset")}</h2>
          <p>{uiText(locale, "Catalogue régulier de l'association.", "Reusable association catalog.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input disabled={!organization} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Catégorie du bloc", "Block category")}
            <input disabled={!organization} value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input disabled={!organization} value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input disabled={!organization} value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Frais par défaut", "Default fee")}
          <input disabled={!organization} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          disabled={!organization}
          label={uiText(locale, "Sanctions par défaut du bloc", "Default block sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea disabled={!organization} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          Notes
          <textarea disabled={!organization} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer le bloc preset", "Create block preset")}
        </button>
      </form>
    </section>
  );
}

function ClassTemplateDivisionForm({
  locale = "fr",
  classTemplates,
  organization,
  sanctioningBodies,
  onCreateClassTemplateDivision,
  onCreated,
}: {
  locale?: Locale;
  classTemplates: ClassTemplate[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [judgeFee, setJudgeFee] = useState("");
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>("none");
  const [addedMoney, setAddedMoney] = useState("");
  const [retainagePercent, setRetainagePercent] = useState("");
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState("");
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState("");
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>({});
  const [payoutNotes, setPayoutNotes] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[] | null>(null);
  const [nrhaClassType, setNrhaClassType] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedTemplateId = templateId || classTemplates[0]?.id || "";
  const selectedTemplate = findById(classTemplates, selectedTemplateId);
  const selectedSanctioningBodyCodes = sanctioningBodyCodes ?? selectedTemplate?.sanctioning_body_codes ?? [];
  const divisionIsNrha = isNrhaSanctioned(selectedSanctioningBodyCodes);

  function handleDivisionSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);

    if (!isNrhaSanctioned(nextCodes)) {
      setNrhaClassType("");
    }
  }

  function handleNrhaApprovedClassChange(nextCode: string) {
    applyNrhaApprovedClassChoice(nextCode, {
      setCode,
      setName,
      setNrhaClassType,
    });
  }

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
        default_payout_schedule_type: payoutScheduleType,
        default_added_money: numericValue(addedMoney) ?? 0,
        default_retainage_percent: numericValue(retainagePercent) ?? null,
        default_trophy_or_plaque_fee: numericValue(trophyOrPlaqueFee) ?? 0,
        default_sanctioning_fee_percent: numericValue(sanctioningFeePercent) ?? null,
        default_payout_rules: payoutRules,
        default_payout_notes: payoutNotes.trim() || null,
        sanctioning_body_codes: selectedSanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes, divisionIsNrha && nrhaClassType ? { nrha_class_type: nrhaClassType } : {}),
      });
      setName("");
      setCode("");
      setEntryFee("");
      setJudgeFee("");
      setPayoutScheduleType("none");
      setAddedMoney("");
      setRetainagePercent("");
      setTrophyOrPlaqueFee("");
      setSanctioningFeePercent("");
      setPayoutRules({});
      setPayoutNotes("");
      setEligibilityNotes("");
      setSanctioningBodyCodes(null);
      setNrhaClassType("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Classe de bloc preset", "Preset block class")}</h2>
          <p>{selectedTemplate ? selectedTemplate.name : uiText(locale, "Crée un bloc preset d'abord.", "Create a block preset first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc preset", "Block preset")}
          <SearchSelect
            disabled={!organization || !classTemplates.length}
            items={classTemplates.map((template) => ({ id: template.id, label: template.name, detail: sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale) }))}
            placeholder={uiText(locale, "Rechercher un bloc preset", "Search block preset")}
            value={selectedTemplate?.id ?? ""}
            onChange={setTemplateId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedTemplate?.back_number_policy ?? "horse"}
          disabled={!organization || !classTemplates.length}
          hideBackNumberPolicy
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={selectedSanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={handleDivisionSanctioningBodyCodes}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Nom de classe", "Class name")}
            <input disabled={!organization || !classTemplates.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {divisionIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {divisionIsNrha ? (
              <NrhaApprovedClassSelect locale={locale} disabled={!organization || !classTemplates.length} value={code} onChange={handleNrhaApprovedClassChange} />
            ) : (
              <input disabled={!organization || !classTemplates.length} value={code} onChange={(event) => setCode(event.target.value)} />
            )}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !classTemplates.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input disabled={!organization || !classTemplates.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          currency={organization?.currency ?? "CAD"}
          disabled={!organization || !classTemplates.length}
          entryFee={entryFee}
          payoutNotes={payoutNotes}
          payoutRules={payoutRules}
          payoutScheduleType={payoutScheduleType}
          retainagePercent={retainagePercent}
          sanctioningFeePercent={sanctioningFeePercent}
          trophyOrPlaqueFee={trophyOrPlaqueFee}
          onAddedMoneyChange={setAddedMoney}
          onPayoutNotesChange={setPayoutNotes}
          onPayoutRulesChange={setPayoutRules}
          onPayoutScheduleTypeChange={setPayoutScheduleType}
          onRetainagePercentChange={setRetainagePercent}
          onSanctioningFeePercentChange={setSanctioningFeePercent}
          onTrophyOrPlaqueFeeChange={setTrophyOrPlaqueFee}
        />
        {divisionIsNrha ? (
          <label>
            {uiText(locale, "Type de classe NRHA", "NRHA class type")}
            <select disabled={!organization || !classTemplates.length} value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
              <option value="">{uiText(locale, "À préciser", "To be specified")}</option>
              {nrhaClassTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea disabled={!organization || !classTemplates.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !classTemplates.length} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer la classe de bloc preset", "Create preset block class")}
        </button>
      </form>
    </section>
  );
}

function ClassTemplateEditForm({
  locale = "fr",
  classTemplate,
  sanctioningBodies,
  onCancel,
  onUpdateClassTemplate,
}: {
  locale?: Locale;
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
          <h2>{uiText(locale, "Modifier le bloc preset", "Edit block preset")}</h2>
          <p>{classTemplate.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Catégorie du bloc", "Block category")}
            <input value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Frais par défaut", "Default fee")}
          <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          label={uiText(locale, "Sanctions par défaut du bloc", "Default block sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label className="check-row">
          <input checked={isActive} type="checkbox" onChange={(event) => setIsActive(event.target.checked)} />
          <span>{uiText(locale, "Bloc preset actif", "Active block preset")}</span>
        </label>
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function ClassTemplateDivisionEditForm({
  locale = "fr",
  classTemplates,
  classTemplateDivision,
  sanctioningBodies,
  onCancel,
  onUpdateClassTemplateDivision,
}: {
  locale?: Locale;
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
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>(classTemplateDivision.default_payout_schedule_type ?? "none");
  const [addedMoney, setAddedMoney] = useState(classTemplateDivision.default_added_money == null ? "" : String(classTemplateDivision.default_added_money));
  const [retainagePercent, setRetainagePercent] = useState(classTemplateDivision.default_retainage_percent == null ? "" : String(classTemplateDivision.default_retainage_percent));
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState(classTemplateDivision.default_trophy_or_plaque_fee == null ? "" : String(classTemplateDivision.default_trophy_or_plaque_fee));
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState(
    classTemplateDivision.default_sanctioning_fee_percent == null ? "" : String(classTemplateDivision.default_sanctioning_fee_percent),
  );
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>(classTemplateDivision.default_payout_rules ?? {});
  const [payoutNotes, setPayoutNotes] = useState(classTemplateDivision.default_payout_notes ?? "");
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classTemplateDivision.eligibility_rules));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(classTemplateDivision.sanctioning_body_codes ?? []);
  const [nrhaClassType, setNrhaClassType] = useState(nrhaClassTypeFromRules(classTemplateDivision.eligibility_rules));
  const [busy, setBusy] = useState(false);
  const selectedTemplate = findById(classTemplates, templateId);
  const divisionIsNrha = isNrhaSanctioned(sanctioningBodyCodes);

  function handleDivisionSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);

    if (!isNrhaSanctioned(nextCodes)) {
      setNrhaClassType("");
    }
  }

  function handleNrhaApprovedClassChange(nextCode: string) {
    applyNrhaApprovedClassChoice(nextCode, {
      setCode,
      setName,
      setNrhaClassType,
    });
  }

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
        default_payout_schedule_type: payoutScheduleType,
        default_added_money: numericValue(addedMoney) ?? 0,
        default_retainage_percent: numericValue(retainagePercent) ?? null,
        default_trophy_or_plaque_fee: numericValue(trophyOrPlaqueFee) ?? 0,
        default_sanctioning_fee_percent: numericValue(sanctioningFeePercent) ?? null,
        default_payout_rules: payoutRules,
        default_payout_notes: payoutNotes.trim() || null,
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes, divisionIsNrha && nrhaClassType ? { nrha_class_type: nrhaClassType } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel span-2">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier la classe de bloc preset", "Edit preset block class")}</h2>
          <p>{classTemplateDivision.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc preset", "Block preset")}
          <SearchSelect
            items={classTemplates.map((template) => ({ id: template.id, label: template.name, detail: sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale) }))}
            placeholder={uiText(locale, "Rechercher un bloc preset", "Search block preset")}
            value={templateId}
            onChange={setTemplateId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedTemplate?.back_number_policy ?? "horse"}
          hideBackNumberPolicy
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={handleDivisionSanctioningBodyCodes}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Nom de classe", "Class name")}
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {divisionIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {divisionIsNrha ? <NrhaApprovedClassSelect locale={locale} value={code} onChange={handleNrhaApprovedClassChange} /> : <input value={code} onChange={(event) => setCode(event.target.value)} />}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          entryFee={entryFee}
          payoutNotes={payoutNotes}
          payoutRules={payoutRules}
          payoutScheduleType={payoutScheduleType}
          retainagePercent={retainagePercent}
          sanctioningFeePercent={sanctioningFeePercent}
          trophyOrPlaqueFee={trophyOrPlaqueFee}
          onAddedMoneyChange={setAddedMoney}
          onPayoutNotesChange={setPayoutNotes}
          onPayoutRulesChange={setPayoutRules}
          onPayoutScheduleTypeChange={setPayoutScheduleType}
          onRetainagePercentChange={setRetainagePercent}
          onSanctioningFeePercentChange={setSanctioningFeePercent}
          onTrophyOrPlaqueFeeChange={setTrophyOrPlaqueFee}
        />
        {divisionIsNrha ? (
          <label>
            {uiText(locale, "Type de classe NRHA", "NRHA class type")}
            <select value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
              <option value="">{uiText(locale, "À préciser", "To be specified")}</option>
              {nrhaClassTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <FormActions busy={busy || !selectedTemplate} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function ClassForm({
  locale = "fr",
  classes,
  classTemplateDivisions,
  classTemplates,
  defaultMode = "preset",
  organization,
  sanctioningBodies,
  showDays,
  shows,
  onCreateClass,
  onCreateDivision,
  onCreated,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  classTemplateDivisions: ClassTemplateDivision[];
  classTemplates: ClassTemplate[];
  defaultMode?: "preset" | "custom";
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [creationMode, setCreationMode] = useState<"preset" | "custom">(defaultMode);
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
  const [entriesCloseAt, setEntriesCloseAt] = useState("");
  const [lateEntriesAllowed, setLateEntriesAllowed] = useState(true);
  const [lateEntryFeePercent, setLateEntryFeePercent] = useState("50");
  const [concurrentClassId, setConcurrentClassId] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const selectedShowDays = showDays.filter((day) => day.show_id === selectedShowId);
  const selectedShowDayId = showDayId && selectedShowDays.some((day) => day.id === showDayId) ? showDayId : selectedShowDays[0]?.id || "";
  const selectedShowDay = findById(showDays, selectedShowDayId) ?? null;
  const effectiveEntriesCloseAt = entriesCloseAt || defaultEntriesCloseAtForShowDay(selectedShowDay);
  const activeClassTemplates = classTemplates.filter((template) => template.is_active);
  const selectedTemplate = findById(classTemplates, templateId);
  const selectedTemplateDivisions = selectedTemplate ? classTemplateDivisions.filter((division) => division.class_template_id === selectedTemplate.id) : [];
  const concurrentClassChoices = classes.filter((classRecord) => classRecord.show_id === selectedShowId);
  const selectedConcurrentClass = findById(classes, concurrentClassId) ?? null;

  function handleShowChange(nextShowId: string) {
    setShowId(nextShowId);
    setShowDayId("");
    setConcurrentClassId("");
  }

  function handleCreationModeChange(nextMode: "preset" | "custom") {
    setCreationMode(nextMode);

    if (nextMode === "custom") {
      setTemplateId("");
    }
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
  }

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
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
        nrha_slate_number: nrhaSlateNumber.trim() || null,
        entries_close_at: datetimeLocalToIso(effectiveEntriesCloseAt),
        late_entries_allowed: lateEntriesAllowed,
        late_entry_fee_percent: numericValue(lateEntryFeePercent) ?? 50,
        eligibility_rules: classProgramRules(eligibilityNotes, {
          concurrentClass: selectedConcurrentClass,
        }),
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
          payout_schedule_type: templateDivision.default_payout_schedule_type ?? "none",
          added_money: templateDivision.default_added_money ?? 0,
          retainage_percent: templateDivision.default_retainage_percent ?? null,
          trophy_or_plaque_fee: templateDivision.default_trophy_or_plaque_fee ?? 0,
          sanctioning_fee_percent: templateDivision.default_sanctioning_fee_percent ?? null,
          payout_rules: templateDivision.default_payout_rules ?? {},
          payout_notes: templateDivision.default_payout_notes ?? null,
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
      setEntriesCloseAt("");
      setLateEntriesAllowed(true);
      setLateEntryFeePercent("50");
      setConcurrentClassId("");
      setEligibilityNotes("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouveau bloc", "New block")}</h2>
          <p>{shows.length ? uiText(locale, "Crée des blocs pour un concours.", "Create schedule blocks for a show.") : uiText(locale, "Crée un concours d'abord.", "Create a show first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="segmented-control">
          <button className={creationMode === "preset" ? "active" : ""} disabled={!organization || !activeClassTemplates.length} type="button" onClick={() => handleCreationModeChange("preset")}>
            {uiText(locale, "Depuis un bloc preset", "From block preset")}
          </button>
          <button className={creationMode === "custom" ? "active" : ""} disabled={!organization} type="button" onClick={() => handleCreationModeChange("custom")}>
            {uiText(locale, "Bloc libre", "Custom block")}
          </button>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Concours", "Show")}
            <select disabled={!organization || !shows.length} value={selectedShowId} onChange={(event) => handleShowChange(event.target.value)}>
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {uiText(locale, "Journée", "Day")}
            <select disabled={!organization || !selectedShowDays.length} value={selectedShowDayId} onChange={(event) => setShowDayId(event.target.value)}>
              {!selectedShowDays.length ? <option value="">{uiText(locale, "Aucune journée", "No day")}</option> : null}
              {selectedShowDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {showDayLabel(day)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {creationMode === "preset" ? (
          <label>
            {uiText(locale, "Bloc preset", "Block preset")}
            <SearchSelect
              allowEmpty
              disabled={!organization || !activeClassTemplates.length}
              items={activeClassTemplates.map((template) => {
                const templateDivisions = classTemplateDivisions.filter((division) => division.class_template_id === template.id);

                return {
                  id: template.id,
                  label: template.name,
                  detail: [
                    template.default_pattern ? `${uiText(locale, "Patron", "Pattern")} ${template.default_pattern}` : null,
                    uiText(locale, `${templateDivisions.length} classe${templateDivisions.length === 1 ? "" : "s"}`, `${templateDivisions.length} class${templateDivisions.length === 1 ? "" : "es"}`),
                    sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale),
                  ]
                    .filter(Boolean)
                    .join(" - "),
                };
              })}
              placeholder={uiText(locale, "Rechercher un bloc preset", "Search block preset")}
              value={templateId}
              onChange={handleTemplateChange}
            />
          </label>
        ) : null}
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input disabled={!organization || !shows.length} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input disabled={!organization || !shows.length} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !shows.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input disabled={!organization || !shows.length} value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input disabled={!organization || !shows.length} value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          disabled={!organization || !shows.length}
          label={uiText(locale, "Sanctions du bloc (optionnel)", "Block sanctioning (optional)")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Slate / concours technique", "Slate / technical show")}
          <input disabled={!organization || !shows.length} placeholder="Ex.: Slate 1, Slate 2, NRHA A" value={nrhaSlateNumber} onChange={(event) => setNrhaSlateNumber(event.target.value)} />
        </label>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Inscriptions", "Entries")}</legend>
          <div className="form-grid">
            <label>
              {uiText(locale, "Fermeture des inscriptions", "Entries close at")}
              <input disabled={!organization || !shows.length} type="datetime-local" value={effectiveEntriesCloseAt} onChange={(event) => setEntriesCloseAt(event.target.value)} />
              <span className="input-help">{uiText(locale, "Par défaut: veille du bloc à 18 h.", "Default: day before the block at 6 p.m.")}</span>
            </label>
            <label>
              {uiText(locale, "Pénalité d'inscription tardive (%)", "Late entry penalty (%)")}
              <input disabled={!organization || !shows.length || !lateEntriesAllowed} min="0" step="0.01" type="number" value={lateEntryFeePercent} onChange={(event) => setLateEntryFeePercent(event.target.value)} />
              <span className="input-help">{uiText(locale, "Ex.: 50 = 50 % du frais d'inscription.", "Example: 50 = 50% of the entry fee.")}</span>
            </label>
          </div>
          <label className="checkbox-row">
            <input checked={lateEntriesAllowed} disabled={!organization || !shows.length} type="checkbox" onChange={(event) => setLateEntriesAllowed(event.target.checked)} />
            <span>{uiText(locale, "Accepter les inscriptions tardives après la fermeture", "Allow late entries after closing")}</span>
          </label>
        </fieldset>
        <label>
          {uiText(locale, "Court en même temps qu'un autre bloc", "Runs at the same time as another block")}
          <SearchSelect
            allowEmpty
            disabled={!organization || !concurrentClassChoices.length}
            items={concurrentClassChoices.map((classRecord) => ({
              id: classRecord.id,
              label: classRecord.name,
              detail: [
                classRecord.block_label || uiText(locale, "Libellé d'horaire absent", "Missing schedule label"),
                classRecord.show_day_id && findById(showDays, classRecord.show_day_id) ? showDayLabel(findById(showDays, classRecord.show_day_id) as ShowDay) : null,
              ]
                .filter(Boolean)
                .join(" - "),
            }))}
            placeholder={uiText(locale, "Rechercher un bloc concurrent", "Search concurrent block")}
            value={concurrentClassId}
            onChange={setConcurrentClassId}
          />
        </label>
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea disabled={!organization || !shows.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !shows.length} type="submit">
          <Plus size={18} />
          {selectedTemplate ? uiText(locale, `Créer le bloc + ${selectedTemplateDivisions.length} classes`, `Create block + ${selectedTemplateDivisions.length} classes`) : uiText(locale, "Créer le bloc", "Create block")}
        </button>
      </form>
    </section>
  );
}

function DivisionForm({
  locale = "fr",
  classes,
  organization,
  sanctioningBodies,
  shows,
  onCreateDivision,
  onCreated,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  shows: Show[];
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [judgeFee, setJudgeFee] = useState("");
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>("none");
  const [addedMoney, setAddedMoney] = useState("");
  const [retainagePercent, setRetainagePercent] = useState("");
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState("");
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState("");
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>({});
  const [payoutNotes, setPayoutNotes] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>([]);
  const [nrhaClassType, setNrhaClassType] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(classes, classId) ?? null;
  const selectedShow = selectedClass ? findById(shows, selectedClass.show_id) : null;
  const divisionIsNrha = isNrhaSanctioned(sanctioningBodyCodes);

  function handleDivisionSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);

    if (!isNrhaSanctioned(nextCodes)) {
      setNrhaClassType("");
    }
  }

  function handleNrhaApprovedClassChange(nextCode: string) {
    applyNrhaApprovedClassChoice(nextCode, {
      setCode,
      setName,
      setNrhaClassType,
    });
  }

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
        payout_schedule_type: payoutScheduleType,
        added_money: numericValue(addedMoney) ?? 0,
        retainage_percent: numericValue(retainagePercent) ?? null,
        trophy_or_plaque_fee: numericValue(trophyOrPlaqueFee) ?? 0,
        sanctioning_fee_percent: numericValue(sanctioningFeePercent) ?? null,
        payout_rules: payoutRules,
        payout_notes: payoutNotes.trim() || null,
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes, divisionIsNrha && nrhaClassType ? { nrha_class_type: nrhaClassType } : {}),
      });
      setName("");
      setCode("");
      setEntryFee("");
      setJudgeFee("");
      setPayoutScheduleType("none");
      setAddedMoney("");
      setRetainagePercent("");
      setTrophyOrPlaqueFee("");
      setSanctioningFeePercent("");
      setPayoutRules({});
      setPayoutNotes("");
      setSanctioningBodyCodes([]);
      setNrhaClassType("");
      setEligibilityNotes("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouvelle classe", "New class")}</h2>
          <p>{selectedShow ? selectedShow.name : uiText(locale, "Crée un bloc d'abord.", "Create a block first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc", "Block")}
          <SearchSelect
            disabled={!organization || !classes.length}
            items={classes.map((classRecord) => ({ id: classRecord.id, label: classRecord.name, detail: showLabel(findById(shows, classRecord.show_id)) }))}
            placeholder={uiText(locale, "Rechercher un bloc", "Search block")}
            value={selectedClass?.id ?? ""}
            onChange={setClassId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedClass?.back_number_policy ?? "horse"}
          disabled={!organization || !classes.length}
          hideBackNumberPolicy
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={handleDivisionSanctioningBodyCodes}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Nom de classe", "Class name")}
            <input disabled={!organization || !classes.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {divisionIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {divisionIsNrha ? (
              <NrhaApprovedClassSelect locale={locale} disabled={!organization || !classes.length} value={code} onChange={handleNrhaApprovedClassChange} />
            ) : (
              <input disabled={!organization || !classes.length} value={code} onChange={(event) => setCode(event.target.value)} />
            )}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          currency={organization?.currency ?? "CAD"}
          disabled={!organization || !classes.length}
          entryFee={entryFee}
          payoutNotes={payoutNotes}
          payoutRules={payoutRules}
          payoutScheduleType={payoutScheduleType}
          retainagePercent={retainagePercent}
          sanctioningFeePercent={sanctioningFeePercent}
          trophyOrPlaqueFee={trophyOrPlaqueFee}
          onAddedMoneyChange={setAddedMoney}
          onPayoutNotesChange={setPayoutNotes}
          onPayoutRulesChange={setPayoutRules}
          onPayoutScheduleTypeChange={setPayoutScheduleType}
          onRetainagePercentChange={setRetainagePercent}
          onSanctioningFeePercentChange={setSanctioningFeePercent}
          onTrophyOrPlaqueFeeChange={setTrophyOrPlaqueFee}
        />
        {divisionIsNrha ? (
          <label>
            {uiText(locale, "Type de classe NRHA", "NRHA class type")}
            <select disabled={!organization || !classes.length} value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
              <option value="">{uiText(locale, "À préciser", "To be specified")}</option>
              {nrhaClassTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea disabled={!organization || !classes.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !classes.length} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer la classe", "Create class")}
        </button>
      </form>
    </section>
  );
}

function ClassEditForm({
  locale = "fr",
  classes,
  classRecord,
  sanctioningBodies,
  onCancel,
  onUpdateClass,
}: {
  locale?: Locale;
  classes: ClassRecord[];
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
  const [entriesCloseAt, setEntriesCloseAt] = useState(datetimeLocalInputValue(classRecord.entries_close_at));
  const [lateEntriesAllowed, setLateEntriesAllowed] = useState(classRecord.late_entries_allowed ?? true);
  const [lateEntryFeePercent, setLateEntryFeePercent] = useState(classRecord.late_entry_fee_percent == null ? "50" : String(classRecord.late_entry_fee_percent));
  const [concurrentClassId, setConcurrentClassId] = useState(concurrentClassIdFromRules(classRecord.eligibility_rules));
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classRecord.eligibility_rules));
  const [status, setStatus] = useState<ClassRecord["status"]>(classRecord.status);
  const [busy, setBusy] = useState(false);
  const concurrentClassChoices = classes.filter((candidate) => candidate.show_id === classRecord.show_id && candidate.id !== classRecord.id);
  const selectedConcurrentClass = findById(classes, concurrentClassId) ?? null;

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
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
        nrha_slate_number: nrhaSlateNumber.trim() || null,
        entries_close_at: datetimeLocalToIso(entriesCloseAt),
        late_entries_allowed: lateEntriesAllowed,
        late_entry_fee_percent: numericValue(lateEntryFeePercent) ?? 50,
        eligibility_rules: classProgramRules(eligibilityNotes, {
          concurrentClass: selectedConcurrentClass,
        }),
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
          <h2>{uiText(locale, "Modifier le bloc", "Edit block")}</h2>
          <p>{classRecord.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <input value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
        </div>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          label={uiText(locale, "Sanctions du bloc (optionnel)", "Block sanctioning (optional)")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Slate / concours technique", "Slate / technical show")}
          <input placeholder="Ex.: Slate 1, Slate 2, NRHA A" value={nrhaSlateNumber} onChange={(event) => setNrhaSlateNumber(event.target.value)} />
        </label>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Inscriptions", "Entries")}</legend>
          <div className="form-grid">
            <label>
              {uiText(locale, "Fermeture des inscriptions", "Entries close at")}
              <input type="datetime-local" value={entriesCloseAt} onChange={(event) => setEntriesCloseAt(event.target.value)} />
              <span className="input-help">{uiText(locale, "L'ordre de passage peut être sorti manuellement après cette heure.", "The draw can be generated manually after this time.")}</span>
            </label>
            <label>
              {uiText(locale, "Pénalité d'inscription tardive (%)", "Late entry penalty (%)")}
              <input disabled={!lateEntriesAllowed} min="0" step="0.01" type="number" value={lateEntryFeePercent} onChange={(event) => setLateEntryFeePercent(event.target.value)} />
              <span className="input-help">{uiText(locale, "Ex.: 50 = 50 % du frais d'inscription.", "Example: 50 = 50% of the entry fee.")}</span>
            </label>
          </div>
          <label className="checkbox-row">
            <input checked={lateEntriesAllowed} type="checkbox" onChange={(event) => setLateEntriesAllowed(event.target.checked)} />
            <span>{uiText(locale, "Accepter les inscriptions tardives après la fermeture", "Allow late entries after closing")}</span>
          </label>
        </fieldset>
        <label>
          {uiText(locale, "Court en même temps qu'un autre bloc", "Runs at the same time as another block")}
          <SearchSelect
            allowEmpty
            disabled={!concurrentClassChoices.length}
            items={concurrentClassChoices.map((candidate) => ({
              id: candidate.id,
              label: candidate.name,
              detail: candidate.block_label || uiText(locale, "Libellé d'horaire absent", "Missing schedule label"),
            }))}
            placeholder={uiText(locale, "Rechercher un bloc concurrent", "Search concurrent block")}
            value={concurrentClassId}
            onChange={setConcurrentClassId}
          />
        </label>
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Statut", "Status")}
          <select value={status} onChange={(event) => setStatus(event.target.value as ClassRecord["status"])}>
            <option value="open">{uiText(locale, "Ouvert", "Open")}</option>
            <option value="closed">{uiText(locale, "Fermé", "Closed")}</option>
            <option value="running">{uiText(locale, "En cours", "Running")}</option>
            <option value="finished">{uiText(locale, "Terminé", "Finished")}</option>
          </select>
        </label>
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function DivisionEditForm({
  locale = "fr",
  classes,
  division,
  sanctioningBodies,
  onCancel,
  onUpdateDivision,
}: {
  locale?: Locale;
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
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>(division.payout_schedule_type ?? "none");
  const [addedMoney, setAddedMoney] = useState(division.added_money == null ? "" : String(division.added_money));
  const [retainagePercent, setRetainagePercent] = useState(division.retainage_percent == null ? "" : String(division.retainage_percent));
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState(division.trophy_or_plaque_fee == null ? "" : String(division.trophy_or_plaque_fee));
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState(division.sanctioning_fee_percent == null ? "" : String(division.sanctioning_fee_percent));
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>(division.payout_rules ?? {});
  const [payoutNotes, setPayoutNotes] = useState(division.payout_notes ?? "");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(division.sanctioning_body_codes ?? []);
  const [nrhaClassType, setNrhaClassType] = useState(nrhaClassTypeFromRules(division.eligibility_rules));
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(division.eligibility_rules));
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(classes, classId);
  const divisionIsNrha = isNrhaSanctioned(sanctioningBodyCodes);

  function handleDivisionSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);

    if (!isNrhaSanctioned(nextCodes)) {
      setNrhaClassType("");
    }
  }

  function handleNrhaApprovedClassChange(nextCode: string) {
    applyNrhaApprovedClassChoice(nextCode, {
      setCode,
      setName,
      setNrhaClassType,
    });
  }

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
        payout_schedule_type: payoutScheduleType,
        added_money: numericValue(addedMoney) ?? 0,
        retainage_percent: numericValue(retainagePercent) ?? null,
        trophy_or_plaque_fee: numericValue(trophyOrPlaqueFee) ?? 0,
        sanctioning_fee_percent: numericValue(sanctioningFeePercent) ?? null,
        payout_rules: payoutRules,
        payout_notes: payoutNotes.trim() || null,
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes, divisionIsNrha && nrhaClassType ? { nrha_class_type: nrhaClassType } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier la classe", "Edit class")}</h2>
          <p>{division.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc", "Block")}
          <SearchSelect
            items={classes.map((classRecord) => ({ id: classRecord.id, label: classRecord.name, detail: classRecord.code ?? "" }))}
            placeholder={uiText(locale, "Rechercher un bloc", "Search block")}
            value={classId}
            onChange={setClassId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedClass?.back_number_policy ?? "horse"}
          hideBackNumberPolicy
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={handleDivisionSanctioningBodyCodes}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Nom de classe", "Class name")}
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {divisionIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {divisionIsNrha ? <NrhaApprovedClassSelect locale={locale} value={code} onChange={handleNrhaApprovedClassChange} /> : <input value={code} onChange={(event) => setCode(event.target.value)} />}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          entryFee={entryFee}
          payoutNotes={payoutNotes}
          payoutRules={payoutRules}
          payoutScheduleType={payoutScheduleType}
          retainagePercent={retainagePercent}
          sanctioningFeePercent={sanctioningFeePercent}
          trophyOrPlaqueFee={trophyOrPlaqueFee}
          onAddedMoneyChange={setAddedMoney}
          onPayoutNotesChange={setPayoutNotes}
          onPayoutRulesChange={setPayoutRules}
          onPayoutScheduleTypeChange={setPayoutScheduleType}
          onRetainagePercentChange={setRetainagePercent}
          onSanctioningFeePercentChange={setSanctioningFeePercent}
          onTrophyOrPlaqueFeeChange={setTrophyOrPlaqueFee}
        />
        {divisionIsNrha ? (
          <label>
            {uiText(locale, "Type de classe NRHA", "NRHA class type")}
            <select value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
              <option value="">{uiText(locale, "À préciser", "To be specified")}</option>
              {nrhaClassTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <FormActions busy={busy || !selectedClass} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function EntryForm({
  locale = "fr",
  classes,
  contacts,
  contactExternalMemberships,
  contactRoles,
  divisions,
  entries,
  externalOrganizations,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onVerifyGvlCogginsDocument,
  onCreated,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onCreated?: () => void;
}) {
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [createdHorse, setCreatedHorse] = useState<Horse | null>(null);
  const [showId, setShowId] = useState("");
  const [horseId, setHorseId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [payerContactId, setPayerContactId] = useState("");
  const [riderContactId, setRiderContactId] = useState("");
  const [entryNumber, setEntryNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const availableDivisions = selectedShowId ? divisions.filter((division) => division.show_id === selectedShowId) : divisions;
  const selectedShow = findById(shows, selectedShowId) ?? null;
  const visibleHorses = useMemo(() => {
    if (!createdHorse || horses.some((horse) => horse.id === createdHorse.id)) {
      return horses;
    }

    return [createdHorse, ...horses];
  }, [createdHorse, horses]);
  const selectedHorse = findById(visibleHorses, horseId) ?? null;
  const selectedDivision = findById(availableDivisions, divisionId) ?? null;
  const selectedClass = selectedDivision ? findById(classes, selectedDivision.class_id) ?? null : null;
  const selectedPayerId = payerContactId || selectedHorse?.primary_owner_contact_id || contacts[0]?.id || "";
  const selectedOwnerContact = findById(contacts, selectedHorse?.primary_owner_contact_id) ?? null;
  const selectedRiderContact = findById(contacts, riderContactId) ?? null;
  const selectedPayerContact = findById(contacts, selectedPayerId) ?? null;
  const selectedHealthValidity = selectedHorse
    ? getHorseHealthValidity({
        documents: horseHealthDocuments,
        horseId: selectedHorse.id,
        organization,
        referenceDate: selectedShow?.start_date ?? null,
      })
    : null;
  const entryReadiness = buildEntryShowReadiness({
    contactExternalMemberships,
    documents: horseHealthDocuments,
    externalOrganizations,
    horse: selectedHorse,
    membershipRequirements,
    organization,
    ownerContact: selectedOwnerContact,
    payerContact: selectedPayerContact,
    riderContact: selectedRiderContact,
    show: selectedShow,
  });
  const baseFee = selectedDivision?.entry_fee ?? selectedClass?.entry_fee ?? undefined;
  const entryDeadlineReadiness = buildEntryDeadlineReadiness(selectedClass, baseFee, organization?.currency ?? "CAD");
  const entryProgramLimitReadiness = buildEntryProgramLimitReadiness({
    division: selectedDivision,
    divisions,
    entries,
    horse: selectedHorse,
    ownerContact: selectedOwnerContact,
    riderContact: selectedRiderContact,
  });
  const canCreate = Boolean(
    organization &&
      profileId &&
      selectedShowId &&
      selectedHorse &&
      selectedDivision &&
      selectedPayerId &&
      entryReadiness.canProceed &&
      entryDeadlineReadiness.canProceed &&
      entryProgramLimitReadiness.canProceed,
  );
  const entryHeaderMessage = canCreate
    ? uiText(locale, "Brouillon maintenant, paiement plus tard.", "Draft now, checkout later.")
    : selectedHorse
      ? entryReadiness.canProceed
        ? entryDeadlineReadiness.canProceed
          ? entryProgramLimitReadiness.message?.message ?? uiText(locale, "Choisis une classe et un payeur.", "Choose a class and payer.")
          : entryDeadlineReadiness.message?.message ?? uiText(locale, "Choisis une classe et un payeur.", "Choose a class and payer.")
        : entryReadiness.message
      : uiText(locale, "Ajoute un concours, un cheval et une classe d'abord.", "Add a show, horse and class first.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate || !organization || !profileId || !selectedHorse || !selectedDivision || !selectedShowId || !selectedPayerId) {
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
        entry_number: entryNumberValue(entryNumber) ?? undefined,
        base_fee: baseFee,
      });
      setEntryNumber("");
      setRiderContactId("");
      setPayerContactId("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouvelle inscription brouillon", "New draft entry")}</h2>
          <p>{entryHeaderMessage}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Concours", "Show")}
          <select disabled={!shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-picker-field">
          <span className="contact-picker-label">{uiText(locale, "Cheval", "Horse")}</span>
          <div className="contact-picker-row">
            <SearchSelect
              disabled={!visibleHorses.length}
              items={visibleHorses.map((horse) => {
                const validity = getHorseHealthValidity({
                  documents: horseHealthDocuments,
                  horseId: horse.id,
                  organization,
                  referenceDate: selectedShow?.start_date ?? null,
                });

                return {
                  id: horse.id,
                  label: horse.name,
                  detail: `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${horseHealthValidityMessage(validity)}`,
                };
              })}
              placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
              value={selectedHorse?.id ?? ""}
              onChange={setHorseId}
            />
            <button className="ghost-button" disabled={!organization} type="button" onClick={() => setCreatingHorse(true)}>
              {uiText(locale, "+ Cheval", "+ Horse")}
            </button>
          </div>
        </div>
        {creatingHorse ? (
          <ModalDialog className="horse-form-modal" description={uiText(locale, "Le cheval sera sélectionné dans l'inscription après sa création.", "The horse will be selected in the entry after it is created.")} eyebrow={uiText(locale, "Inscriptions", "Entries")} title={uiText(locale, "Ajouter un cheval", "Add horse")} onClose={() => setCreatingHorse(false)}>
            <HorseForm
              locale={locale}
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={profileId}
              externalOrganizations={externalOrganizations}
              organization={organization}
              onCreateContact={onCreateContact}
              onCreateHorse={onCreateHorse}
              onCreateHorseHealthDocument={onCreateHorseHealthDocument}
              onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
              onCreated={(horse) => {
                setCreatedHorse(horse);
                setHorseId(horse.id);
                setCreatingHorse(false);
              }}
            />
          </ModalDialog>
        ) : null}
        <InlineHealthMessage
          value={
            selectedHealthValidity
              ? {
                  tone: horseHealthValidityTone(selectedHealthValidity),
                  message: `${horseHealthValidityMessage(selectedHealthValidity)} ${uiText(locale, "Référence", "Reference")}: ${selectedShow ? formatDate(selectedShow.start_date) : uiText(locale, "concours", "show")}.`,
                }
              : null
          }
        />
        <label>
          {uiText(locale, "Classe", "Class")}
          <SearchSelect
            disabled={!availableDivisions.length}
            items={availableDivisions.map((division) => {
              const classRecord = findById(classes, division.class_id);
              const effectiveEntryFee = division.entry_fee ?? classRecord?.entry_fee ?? null;

              return {
                id: division.id,
                label: divisionLabel(division, classes),
                detail: [
                  effectiveEntryFee == null ? null : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(effectiveEntryFee, organization?.currency ?? "CAD")}`,
                  division.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
            placeholder={uiText(locale, "Rechercher une classe", "Search class")}
            value={selectedDivision?.id ?? ""}
            onChange={setDivisionId}
          />
        </label>
        <InlineHealthMessage value={selectedDivision ? entryDeadlineReadiness.message : null} />
        <InlineHealthMessage value={selectedDivision ? entryProgramLimitReadiness.message : null} />
        <div className="form-grid">
          <label>
            {uiText(locale, "Numéro de dossard", "Back number")}
            <input min="1" step="1" type="number" value={entryNumber} onChange={(event) => setEntryNumber(event.target.value)} />
            <span className="input-help">{uiText(locale, "Peut être ajouté plus tard si le dossard n'est pas encore assigné.", "Can be added later if the back number is not assigned yet.")}</span>
          </label>
        </div>
        <div className="form-grid">
          <ContactPicker
            allowEmpty
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            disabled={!organization}
            label={uiText(locale, "Cavalier", "Rider")}
            locale={locale}
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
            label={uiText(locale, "Payeur", "Payer")}
            locale={locale}
            organization={organization}
            role="payer"
            value={selectedPayerId}
            onChange={setPayerContactId}
            onCreateContact={onCreateContact}
          />
        </div>
        <ReadinessChecklist readiness={selectedHorse ? entryReadiness : null} />
        <button className="primary-button" disabled={busy || !canCreate} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer le brouillon", "Create draft entry")}
        </button>
      </form>
    </section>
  );
}

function EntryEditForm({
  locale = "fr",
  classes,
  contacts,
  contactExternalMemberships,
  contactRoles,
  divisions,
  entries,
  entry,
  externalOrganizations,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  organization,
  profileId,
  shows,
  onCancel,
  onCreateContact,
  onUpdateEntry,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  entry: Entry;
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
}) {
  const [horseId, setHorseId] = useState(entry.horse_id);
  const [divisionId, setDivisionId] = useState(entry.division_id);
  const [riderContactId, setRiderContactId] = useState(entry.rider_contact_id ?? "");
  const [payerContactId, setPayerContactId] = useState(entry.payer_contact_id);
  const [entryNumber, setEntryNumber] = useState(entry.entry_number == null ? "" : String(entry.entry_number));
  const [status, setStatus] = useState<Entry["status"]>(entry.status);
  const [baseFee, setBaseFee] = useState(entry.base_fee == null ? "" : String(entry.base_fee));
  const [busy, setBusy] = useState(false);
  const selectedHorse = findById(horses, horseId);
  const selectedDivision = findById(divisions, divisionId);
  const selectedClass = selectedDivision ? findById(classes, selectedDivision.class_id) : null;
  const selectedShow = findById(shows, entry.show_id) ?? null;
  const selectedOwnerContact = findById(contacts, selectedHorse?.primary_owner_contact_id) ?? null;
  const selectedRiderContact = findById(contacts, riderContactId) ?? null;
  const selectedPayerContact = findById(contacts, payerContactId) ?? null;
  const skipsEntryReadiness = ["cancelled", "scratched", "scratched_pending_refund"].includes(status);
  const selectedHealthValidity = selectedHorse
    ? getHorseHealthValidity({
        documents: horseHealthDocuments,
        horseId: selectedHorse.id,
        organization,
        referenceDate: selectedShow?.start_date ?? null,
      })
    : null;
  const entryReadiness = buildEntryShowReadiness({
    contactExternalMemberships,
    documents: horseHealthDocuments,
    externalOrganizations,
    horse: selectedHorse,
    membershipRequirements,
    organization,
    ownerContact: selectedOwnerContact,
    payerContact: selectedPayerContact,
    riderContact: selectedRiderContact,
    show: selectedShow,
    skipContactRequirements: skipsEntryReadiness,
    skipHorseHealth: skipsEntryReadiness,
  });
  const entryProgramLimitReadiness = buildEntryProgramLimitReadiness({
    division: selectedDivision,
    divisions,
    entries,
    existingEntryId: entry.id,
    horse: selectedHorse,
    ownerContact: selectedOwnerContact,
    riderContact: selectedRiderContact,
    skip: skipsEntryReadiness,
  });
  const effectiveFee = numericValue(baseFee) ?? selectedDivision?.entry_fee ?? selectedClass?.entry_fee ?? null;
  const canUpdate = Boolean(selectedHorse && selectedDivision && payerContactId && entryReadiness.canProceed && entryProgramLimitReadiness.canProceed);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canUpdate || !selectedHorse || !selectedDivision || !payerContactId) {
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
        entry_number: entryNumberValue(entryNumber),
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
          <h2>{uiText(locale, "Modifier l'inscription", "Edit entry")}</h2>
          <p>{entryReadiness.canProceed ? entryProgramLimitReadiness.message?.message ?? horseLabel(selectedHorse) : entryReadiness.message}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Cheval", "Horse")}
          <SearchSelect
            items={horses.map((horse) => {
              const validity = getHorseHealthValidity({
                documents: horseHealthDocuments,
                horseId: horse.id,
                organization,
                referenceDate: selectedShow?.start_date ?? null,
              });

              return {
                id: horse.id,
                label: horse.name,
                detail: `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${horseHealthValidityMessage(validity)}`,
              };
            })}
            placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
            value={horseId}
            onChange={setHorseId}
          />
        </label>
        <InlineHealthMessage
          value={
            selectedHealthValidity
              ? {
                  tone: horseHealthValidityTone(selectedHealthValidity),
                  message: `${horseHealthValidityMessage(selectedHealthValidity)} ${uiText(locale, "Référence", "Reference")}: ${selectedShow ? formatDate(selectedShow.start_date) : uiText(locale, "concours", "show")}.`,
                }
              : null
          }
        />
        <label>
          {uiText(locale, "Classe", "Class")}
          <SearchSelect
            items={divisions.map((division) => {
              const classRecord = findById(classes, division.class_id);
              const effectiveEntryFee = division.entry_fee ?? classRecord?.entry_fee ?? null;

              return {
                id: division.id,
                label: divisionLabel(division, classes),
                detail: [
                  effectiveEntryFee == null ? null : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(effectiveEntryFee, organization?.currency ?? "CAD")}`,
                  division.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
            placeholder={uiText(locale, "Rechercher une classe", "Search class")}
            value={divisionId}
            onChange={setDivisionId}
          />
        </label>
        <InlineHealthMessage value={selectedDivision ? entryProgramLimitReadiness.message : null} />
        <div className="form-grid">
          <ContactPicker
            allowEmpty
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            label={uiText(locale, "Cavalier", "Rider")}
            locale={locale}
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
            label={uiText(locale, "Payeur", "Payer")}
            locale={locale}
            organization={organization}
            role="payer"
            value={payerContactId}
            onChange={setPayerContactId}
            onCreateContact={onCreateContact}
          />
        </div>
        <ReadinessChecklist readiness={selectedHorse ? entryReadiness : null} />
        <div className="form-grid">
          <label>
            {uiText(locale, "Statut", "Status")}
            <select value={status} onChange={(event) => setStatus(event.target.value as Entry["status"])}>
              <option value="draft">{uiText(locale, "Brouillon", "Draft")}</option>
              <option value="pending_checkout">{uiText(locale, "Paiement en attente", "Pending checkout")}</option>
              <option value="active">{uiText(locale, "Active", "Active")}</option>
              <option value="scratched_pending_refund">{uiText(locale, "Scratch avec remboursement en attente", "Scratch pending refund")}</option>
              <option value="scratched">{uiText(locale, "Scratch", "Scratched")}</option>
              <option value="completed">{uiText(locale, "Terminée", "Completed")}</option>
              <option value="cancelled">{uiText(locale, "Annulée", "Cancelled")}</option>
            </select>
          </label>
          <label>
            {uiText(locale, "Numéro de dossard", "Back number")}
            <input min="1" step="1" type="number" value={entryNumber} onChange={(event) => setEntryNumber(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de base", "Base fee")}
            <input min="0" step="0.01" type="number" value={baseFee} onChange={(event) => setBaseFee(event.target.value)} />
          </label>
        </div>
        <FormActions busy={busy || !canUpdate} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}
