import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
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
  createShowAnnouncement,
  deleteShowAnnouncement,
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
  deleteShowScorePaidWarmup,
  getHorseHealthDocumentFileUrl,
  releaseBackNumber,
  reviewHorseHealthDocument,
  saveShowScorePaidWarmup,
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
  updateShowScorePaidWarmup,
  updateStallBooking,
  updateStallOption,
  updateUserProfile,
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
  ScheduleStartMode,
  Show,
  ShowDay,
  ShowScoreClassSetup,
  StallOption,
} from "../../types/domain";
import type { NavItem, Notice, ViewKey } from "../../types/ui";
import { sortRecordsForOrganization, buildNotificationItems } from "./shared";
import { NotificationsView } from "../notifications/NotificationsView";
import { OverviewView } from "../overview/OverviewView";
import { ShowsView } from "../shows/ShowsView";
import { PeopleView } from "../people/PeopleView";
import { MyContactsView } from "../people/MyContactsView";
import { MyHorsesView } from "../horses/MyHorsesView";
import { HealthCenterView } from "../health/HealthCenterView";
import { ClassesView } from "../classes/ClassesView";
import { EntriesView } from "../entries/EntriesView";
import { MyEntriesView } from "../entries/MyEntriesView";
import { ScoringView } from "../scoring/ScoringView";
import { BackNumbersView, MyBackNumbersView } from "../backNumbers/BackNumbersView";
import { BillingView } from "../billing/BillingView";
import { SettingsView } from "../settings/SettingsView";
import { ProfileView, profileIsComplete } from "../profile/ProfileView";
import { ClientDashboardView } from "./ClientDashboardView";

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
  onCreateShowAnnouncement,
  onDeleteShowAnnouncement,
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
  onSaveShowScorePaidWarmup,
  onDeleteShowScorePaidWarmup,
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
  onUpdateShowScorePaidWarmup,
  onUpdateStallBooking,
  onUpdateStallOption,
  onUpdateUserProfile,
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
  onCreateShowAnnouncement: (input: Parameters<typeof createShowAnnouncement>[0]) => Promise<void>;
  onDeleteShowAnnouncement: (id: string) => Promise<void>;
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
  onSaveShowScorePaidWarmup: (input: Parameters<typeof saveShowScorePaidWarmup>[0]) => Promise<void>;
  onDeleteShowScorePaidWarmup: (id: Parameters<typeof deleteShowScorePaidWarmup>[0]) => Promise<void>;
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
  onUpdateShowScorePaidWarmup: (id: string, input: Parameters<typeof updateShowScorePaidWarmup>[1]) => Promise<void>;
  onUpdateStallBooking: (id: string, input: Parameters<typeof updateStallBooking>[1]) => Promise<void>;
  onUpdateStallOption: (id: string, input: Parameters<typeof updateStallOption>[1]) => Promise<void>;
  onUpdateUserProfile: (id: string, input: Parameters<typeof updateUserProfile>[1]) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const organizations = context?.organizations ?? [];
  const organizationMembers = context?.organizationMembers ?? [];
  const shows = context?.shows ?? [];
  const showDays = context?.showDays ?? [];
  const showAnnouncements = context?.showAnnouncements ?? [];
  const showScoreClassSetups = context?.showScoreClassSetups ?? [];
  const showScorePaidWarmups = context?.showScorePaidWarmups ?? [];
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
  const profileIncomplete = context ? !profileIsComplete(context.profile) : false;
  const rawEffectiveView = canManageAssociation || !associationViewKeys.has(activeView) ? activeView : "my-overview";
  const effectiveView: ViewKey = !canManageAssociation && profileIncomplete && rawEffectiveView === "my-overview" ? "my-profile" : rawEffectiveView;
  const selectedOrganizationShows = selectedOrganization
    ? shows.filter((show) => show.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationShowDays = selectedOrganization
    ? showDays.filter((day) => day.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationShowAnnouncements = selectedOrganization
    ? showAnnouncements.filter((a) => a.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationShowScoreSetups = selectedOrganization
    ? showScoreClassSetups.filter((setup) => setup.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationShowScorePaidWarmups = selectedOrganization
    ? showScorePaidWarmups.filter((warmup) => warmup.organization_id === selectedOrganization.id)
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
            {effectiveView.startsWith("my-") ? (
              <>
                <p className="eyebrow">{t.nav.mySpace}</p>
                <h1>{[context?.profile.first_name, context?.profile.last_name].filter(Boolean).join(" ") || "Horse Show Platform"}</h1>
              </>
            ) : (
              <>
                <p className="eyebrow">{t.shell.workspace}</p>
                <h1>{selectedOrganization?.name ?? "Horse Show Platform"}</h1>
              </>
            )}
          </div>
          <div className="header-actions">
            {!effectiveView.startsWith("my-") && organizations.length > 1 ? (
              <select value={selectedOrganization?.id ?? ""} onChange={(event) => onChangeOrganization(event.target.value)}>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            ) : null}
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
            showAnnouncements={selectedOrganizationShowAnnouncements}
            showDays={selectedOrganizationShowDays}
            showScoreClassSetups={selectedOrganizationShowScoreSetups}
            shows={selectedOrganizationShows}
            stallOptions={selectedOrganizationStallOptions}
            onCreateShow={onCreateShow}
            onCreateShowAnnouncement={onCreateShowAnnouncement}
            onDeleteShowAnnouncement={onDeleteShowAnnouncement}
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
            contacts={selectedOrganizationContacts}
            divisions={selectedOrganizationDivisions}
            entries={selectedOrganizationEntries}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            sanctioningBodies={sanctioningBodies}
            showDays={selectedOrganizationShowDays}
            showScorePaidWarmups={selectedOrganizationShowScorePaidWarmups}
            shows={selectedOrganizationShows}
            onCreateClass={onCreateClass}
            onCreateClassTemplate={onCreateClassTemplate}
            onCreateClassTemplateDivision={onCreateClassTemplateDivision}
            onCreateDivision={onCreateDivision}
            onDeleteClass={onDeleteClass}
            onDeleteClassTemplate={onDeleteClassTemplate}
            onDeleteClassTemplateDivision={onDeleteClassTemplateDivision}
            onDeleteDivision={onDeleteDivision}
            onDeleteShowScorePaidWarmup={onDeleteShowScorePaidWarmup}
            onSaveShowScorePaidWarmup={onSaveShowScorePaidWarmup}
            onUpdateClass={onUpdateClass}
            onUpdateClassTemplate={onUpdateClassTemplate}
            onUpdateClassTemplateDivision={onUpdateClassTemplateDivision}
            onUpdateDivision={onUpdateDivision}
            onUpdateShowScorePaidWarmup={onUpdateShowScorePaidWarmup}
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
            showScorePaidWarmups={selectedOrganizationShowScorePaidWarmups}
            shows={selectedOrganizationShows}
            onDeleteShowScorePaidWarmup={onDeleteShowScorePaidWarmup}
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

        {effectiveView === "my-overview" && context ? (
          <ClientDashboardView
            locale={locale}
            contacts={personalContacts}
            divisions={selectedOrganizationDivisions}
            entries={personalEntries}
            horses={personalHorses}
            invoices={personalInvoices}
            organizations={organizations}
            profile={context.profile}
            shows={selectedOrganizationShows}
            showDays={selectedOrganizationShowDays}
            stallBookings={personalStallBookings}
            stallOptions={selectedOrganizationStallOptions}
            onViewChange={onViewChange}
          />
        ) : null}

        {effectiveView === "my-profile" && context ? (
          <ProfileView
            locale={locale}
            horses={personalHorses}
            horseHealthDocuments={personalHorseHealthDocuments}
            profile={context.profile}
            onUpdateUserProfile={onUpdateUserProfile}
            onViewChange={onViewChange}
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
