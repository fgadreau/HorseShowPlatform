import {FinanceView} from '../finance/FinanceView';
import {financeRoute,navigateBilling,showSections} from '../finance/navigation';
import {billingRpc} from '../../services/billingFolio';
import { Brand } from "../../components/Brand";
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
  Download,
  FileText,
  LogOut,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Tent,
  Trophy,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { ContactPicker, EmptyState, FormActions, LanguageToggle, Metric, ModalDialog, NoticeBanner, SearchSelect, UpgradePrompt, ViewIntro } from "../../components/ui";
import { hasPlanFeature } from "../../utils/planFeatures";
import { canadianProvinceOptions, countryOptions, currencyOptions, taxPresetById, taxPresetForLocation, taxPresetIdForValues, taxPresetsForLocation, type TaxPreset } from "../../lib/billingSettings";
import { contactLabel, classLabel, errorMessage, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import type { Locale, Translation } from "../../lib/i18n";
import { buildEntryShowReadiness, readinessItemClassName, readinessTone, type ReadinessResult } from "../../lib/readiness";
import { associationNavigation, associationViewKeys, personalNavigation } from "../navigation";
import { MyStallsView, StallsView } from "./StallsViews";
import { buildShowScoreRunsForClass, type ShowScoreRun } from "../../services/showScoreAdapters";
import {
  assignBackNumber,
  assignNextBackNumber,
  claimHorseBackNumber,
  cancelManualSale,
  createBlock,
  createBlockTemplate,
  createClassTemplate,
  createBackNumberRange,
  createContact,
  createContactOrganizationMembership,
  createManualSale,
  createClass,
  createEntry,
  createHorse,
  createUploadedHorseHealthDocument,
  createOrganization,
  createOrganizationHealthDocumentReview,
  createOrganizationMembershipType,
  createOrganizationProduct,
  createShow,
  createSlate,
  createShowAnnouncement,
  deleteShowAnnouncement,
  deleteSlate,
  createStallBooking,
  createStallOption,
  deleteBlock,
  deleteBlockTemplate,
  deleteClassTemplate,
  deleteBackNumber,
  deleteEntry,
  deleteContact,
  deleteClass,
  deleteHorse,
  deleteStallBooking,
  deleteShowScorePaidWarmup,
  getHorseHealthDocumentFileUrl,
  linkContactToDirectory,
  linkHorseToDirectory,
  releaseBackNumber,
  replaceNrhaRiderRankings,
  savePayoutCalculationDraft,
  saveShowScorePaidWarmup,
  setOrganizationExternalCredentialRequirement,
  setOrganizationHealthPolicy,
  slugify,
  updateBlock,
  updateBlockTemplate,
  updateClassTemplate,
  updateBackNumberStatus,
  updateContact,
  updateClass,
  updateEntry,
  updateHorse,
  updateOrganizationHealthSettings,
  updateOrganizationMembershipType,
  updateOrganizationProduct,
  updatePayoutAwardPayee,
  updatePayoutCalculationStatus,
  updateShow,
  updateSlate,
  updateShowScorePaidWarmup,
  updateStallBooking,
  updateStallOption,
  updateUserProfile,
  unlinkContactFromDirectory,
  unlinkHorseFromDirectory,
  verifyGvlCogginsDocument,
  verifyNrhaEligibility,
  verifyNrhaHorse,
  verifyNrhaMember,
  type AppContext,
} from "../../services/supabaseServices";
import type {
  BackNumberPolicy,
  Block,
  BlockTemplate,
  ClassTemplate,
  Contact,
  ContactExternalIdentifier,
  ContactOrganizationMembership,
  ContactRole,
  ContactRoleName,
  ClassRecord,
  EligibilityRules,
  Entry,
  ExternalCredentialIssuer,
  Horse,
  HorseContact,
  HorseExternalIdentifier,
  HorseHealthDocument,
  Invoice,
  InvoiceLineItem,
  ManualSale,
  Organization,
  OrganizationBackNumber,
  OrganizationExternalCredentialRequirement,
  OrganizationHealthPolicy,
  OrganizationMembershipType,
  OrganizationProduct,
  PayoutScheduleType,
  SanctioningBody,
  ScheduleStartMode,
  Show,
  ShowDay,
  ShowScoreBlockSetup,
  StallOption,
} from "../../types/domain";
import type { NavItem, Notice, ViewKey } from "../../types/ui";
import { sortRecordsForOrganization, buildNotificationItems, todayDateValue } from "./shared";
import { NotificationsView } from "../notifications/NotificationsView";
import { OverviewView } from "../overview/OverviewView";
import { ShowsView } from "../shows/ShowsView";
import { PeopleView } from "../people/PeopleView";
import { MyContactsView } from "../people/MyContactsView";
import { MyHorsesView } from "../horses/MyHorsesView";
import { HealthCenterView } from "../health/HealthCenterView";
import { useHorseHealthComplianceOverview } from "../health/HealthComplianceSummary";
import { ClassesView } from "../classes/ClassesView";
import { EntriesView } from "../entries/EntriesView";
import { MyEntriesView } from "../entries/MyEntriesView";
import { ScoringView } from "../scoring/ScoringView";
import { ResultsView } from "../results/ResultsView";
import { BackNumbersView, MyBackNumbersView } from "../backNumbers/BackNumbersView";
import { BillingView } from "../billing/BillingView";
import { SettingsView } from "../settings/SettingsView";
import { IncentiveProgramsSettings } from "../settings/IncentiveProgramsSettings";
import { ProfileView, profileIsComplete } from "../profile/ProfileView";
import { ClientDashboardView } from "./ClientDashboardView";
import { PlatformAdminView } from "../platformAdmin/PlatformAdminView";

const SHOW_CONTEXT_VIEW_KEYS = new Set<ViewKey>([
  "blocks",
  "entries",
  "stalls",
  "scoring",
  "results",
  "shows",
  "show-accounts",
  "my-overview",
  "my-entries",
  "my-stalls",
]);

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
  onCancelManualSale,
  onCreateBlock,
  onCreateBlockTemplate,
  onCreateClassTemplate,
  onCreateContact,
  onCreateContactOrganizationMembership,
  onCreateManualSale,
  onLinkContactToDirectory,
  onLinkHorseToDirectory,
  onCreateClass,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onCreateOrganization,
  onCreateOrganizationMembershipType,
  onCreateOrganizationProduct,
  onCreateShow,
  onCreateSlate,
  onCreateShowAnnouncement,
  onDeleteShowAnnouncement,
  onDeleteSlate,
  onCreateStallBooking,
  onCreateStallOption,
  onDeleteBlock,
  onDeleteBlockTemplate,
  onDeleteClassTemplate,
  onDeleteContact,
  onDeleteClass,
  onDeleteEntry,
  onDeleteHorse,
  onDeleteStallBooking,
  onLocaleChange,
  onPrepareShowScoreClass,
  onSaveShowScorePaidWarmup,
  onShowScorePaidWarmupSaveError,
  onDeleteShowScorePaidWarmup,
  onRefresh,
  onReplaceNrhaRiderRankings,
  onReviewOrganizationHealthDocuments,
  onSavePayoutCalculationDraft,
  onSignOut,
  onUnlinkContactFromDirectory,
  onUnlinkHorseFromDirectory,
  onSetExternalMembershipRequirement,
  onSetOrganizationHealthPolicy,
  onUpdateBlock,
  onUpdateBlockTemplate,
  onUpdateClassTemplate,
  onUpdateContact,
  onUpdateClass,
  onUpdateEntry,
  onUpdateHorse,
  onUpdateOrganizationHealthSettings,
  onUpdateOrganizationMembershipType,
  onUpdateOrganizationProduct,
  onUpdatePayoutAwardPayee,
  onUpdatePayoutCalculationStatus,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaEligibility,
  onVerifyNrhaHorse,
  onVerifyNrhaMember,
  onUpdateShow,
  onUpdateSlate,
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
  onCancelManualSale: (id: Parameters<typeof cancelManualSale>[0]) => Promise<void>;
  onCreateBlock: (input: Parameters<typeof createBlock>[0]) => Promise<Block>;
  onCreateBlockTemplate: (input: Parameters<typeof createBlockTemplate>[0]) => Promise<void>;
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateContactOrganizationMembership: (input: Parameters<typeof createContactOrganizationMembership>[0]) => Promise<ContactOrganizationMembership>;
  onCreateManualSale: (input: Parameters<typeof createManualSale>[0]) => Promise<ManualSale>;
  onLinkContactToDirectory: (input: Parameters<typeof linkContactToDirectory>[0]) => Promise<void>;
  onLinkHorseToDirectory: (input: Parameters<typeof linkHorseToDirectory>[0]) => Promise<void>;
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
  onCreateOrganizationMembershipType: (input: Parameters<typeof createOrganizationMembershipType>[0]) => Promise<void>;
  onCreateOrganizationProduct: (input: Parameters<typeof createOrganizationProduct>[0]) => Promise<void>;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<Show>;
  onCreateSlate: (input: Parameters<typeof createSlate>[0]) => Promise<void>;
  onCreateShowAnnouncement: (input: Parameters<typeof createShowAnnouncement>[0]) => Promise<void>;
  onDeleteShowAnnouncement: (id: string) => Promise<void>;
  onDeleteSlate: (id: Parameters<typeof deleteSlate>[0]) => Promise<void>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
  onDeleteBlock: (id: Parameters<typeof deleteBlock>[0]) => Promise<void>;
  onDeleteBlockTemplate: (id: Parameters<typeof deleteBlockTemplate>[0]) => Promise<void>;
  onDeleteClassTemplate: (id: Parameters<typeof deleteClassTemplate>[0]) => Promise<void>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onDeleteClass: (id: Parameters<typeof deleteClass>[0]) => Promise<void>;
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onDeleteStallBooking: (id: Parameters<typeof deleteStallBooking>[0]) => Promise<void>;
  onLocaleChange: (locale: Locale) => void;
  onPrepareShowScoreClass: (block: Block) => Promise<void>;
  onSaveShowScorePaidWarmup: (input: Parameters<typeof saveShowScorePaidWarmup>[0]) => Promise<void>;
  onShowScorePaidWarmupSaveError: (error: unknown) => void;
  onDeleteShowScorePaidWarmup: (id: Parameters<typeof deleteShowScorePaidWarmup>[0]) => Promise<void>;
  onRefresh: () => void;
  onReplaceNrhaRiderRankings: (input: Parameters<typeof replaceNrhaRiderRankings>[0]) => Promise<void>;
  onReviewOrganizationHealthDocuments: (inputs: Parameters<typeof createOrganizationHealthDocumentReview>[0][]) => Promise<void>;
  onSavePayoutCalculationDraft: (input: Parameters<typeof savePayoutCalculationDraft>[0]) => Promise<void>;
  onSignOut: () => void;
  onUnlinkContactFromDirectory: (...args: Parameters<typeof unlinkContactFromDirectory>) => Promise<void>;
  onUnlinkHorseFromDirectory: (...args: Parameters<typeof unlinkHorseFromDirectory>) => Promise<void>;
  onSetExternalMembershipRequirement: (input: Parameters<typeof setOrganizationExternalCredentialRequirement>[0]) => Promise<void>;
  onSetOrganizationHealthPolicy: (input: Parameters<typeof setOrganizationHealthPolicy>[0]) => Promise<void>;
  onUpdateBlock: (id: string, input: Parameters<typeof updateBlock>[1]) => Promise<void>;
  onUpdateBlockTemplate: (id: string, input: Parameters<typeof updateBlockTemplate>[1]) => Promise<void>;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onUpdateOrganizationHealthSettings: (id: string, input: Parameters<typeof updateOrganizationHealthSettings>[1]) => Promise<void>;
  onUpdateOrganizationMembershipType: (id: string, input: Parameters<typeof updateOrganizationMembershipType>[1]) => Promise<void>;
  onUpdateOrganizationProduct: (id: string, input: Parameters<typeof updateOrganizationProduct>[1]) => Promise<void>;
  onUpdatePayoutAwardPayee: (id: string, input: Parameters<typeof updatePayoutAwardPayee>[1]) => Promise<void>;
  onUpdatePayoutCalculationStatus: (id: string, status: Parameters<typeof updatePayoutCalculationStatus>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
  onVerifyNrhaMember: (input: Parameters<typeof verifyNrhaMember>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaMember>>>;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
  onUpdateSlate: (id: string, input: Parameters<typeof updateSlate>[1]) => Promise<void>;
  onUpdateShowScorePaidWarmup: (id: string, input: Parameters<typeof updateShowScorePaidWarmup>[1]) => Promise<void>;
  onUpdateStallBooking: (id: string, input: Parameters<typeof updateStallBooking>[1]) => Promise<void>;
  onUpdateStallOption: (id: string, input: Parameters<typeof updateStallOption>[1]) => Promise<void>;
  onUpdateUserProfile: (id: string, input: Parameters<typeof updateUserProfile>[1]) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const [selectedShowId, setSelectedShowId] = useState(()=>financeRoute()?.show??'');
  const [navigationStaff,setNavigationStaff]=useState(false);
  useEffect(()=>{let live=true;setNavigationStaff(false);if(selectedOrganizationId)void billingRpc('billing_navigation_scope',{p_org:selectedOrganizationId}).then(r=>{if(live)setNavigationStaff(r.staff);}).catch(()=>{});return()=>{live=false;};},[selectedOrganizationId]);
  useEffect(()=>{const read=()=>{const r=financeRoute();if(r?.show)setSelectedShowId(r.show);};window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
  const organizations = context?.organizations ?? [];
  const organizationMembers = context?.organizationMembers ?? [];
  const shows = context?.shows ?? [];
  const showDays = context?.showDays ?? [];
  const disciplines = context?.disciplines ?? [];
  const organizationDisciplines = context?.organizationDisciplines ?? [];
  const slates = context?.slates ?? [];
  const showAnnouncements = context?.showAnnouncements ?? [];
  const showScoreClassSetups = context?.showScoreClassSetups ?? [];
  const showScorePaidWarmups = context?.showScorePaidWarmups ?? [];
  const entryResults = context?.entryResults ?? [];
  const payoutSchedules = context?.payoutSchedules ?? [];
  const payoutScheduleBrackets = context?.payoutScheduleBrackets ?? [];
  const payoutCalculations = context?.payoutCalculations ?? [];
  const payoutAwards = context?.payoutAwards ?? [];
  const contacts = context?.contacts ?? [];
  const contactOrganizationLinks = context?.contactOrganizationLinks ?? [];
  const directoryContacts = context?.directoryContacts ?? [];
  const contactRoles = context?.contactRoles ?? [];
  const externalCredentialIssuers = context?.externalCredentialIssuers ?? [];
  const organizationExternalCredentialRequirements = context?.organizationExternalCredentialRequirements ?? [];
  const organizationHealthPolicies = context?.organizationHealthPolicies ?? [];
  const organizationHealthDocumentReviews = context?.organizationHealthDocumentReviews ?? [];
  const organizationMembershipTypes = context?.organizationMembershipTypes ?? [];
  const contactOrganizationMemberships = context?.contactOrganizationMemberships ?? [];
  const organizationProducts = context?.organizationProducts ?? [];
  const manualSales = context?.manualSales ?? [];
  const nrhaRiderRankings = context?.nrhaRiderRankings ?? [];
  const contactExternalIdentifiers = context?.contactExternalIdentifiers ?? [];
  const horseExternalIdentifiers = context?.horseExternalIdentifiers ?? [];
  const horseHealthDocuments = context?.horseHealthDocuments ?? [];
  const horses = context?.horses ?? [];
  const horseContacts = context?.horseContacts ?? [];
  const horseOrganizationLinks = context?.horseOrganizationLinks ?? [];
  const directoryHorses = context?.directoryHorses ?? [];
  const organizationBackNumbers = context?.organizationBackNumbers ?? [];
  const blocks = context?.blocks ?? [];
  const blockJudgeAssignments = context?.blockJudgeAssignments ?? [];
  const blockConcurrencyGroupMembers = context?.blockConcurrencyGroupMembers ?? [];
  const blockTemplates = context?.blockTemplates ?? [];
  const classTemplates = context?.classTemplates ?? [];
  const classes = context?.classes ?? [];
  const sanctioningBodies = context?.sanctioningBodies ?? [];
  const entries = context?.entries ?? [];
  const stallOptions = context?.stallOptions ?? [];
  const stallBookings = context?.stallBookings ?? [];
  const invoices = context?.invoices ?? [];
  const invoiceLineItems = context?.invoiceLineItems ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? (financeRoute()?.org ? null : organizations[0] ?? null);
  const healthPolicyReferenceDate = todayDateValue();
  const selectedOrganizationHealthPolicies = selectedOrganization
    ? organizationHealthPolicies.filter((policy) => policy.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationHealthPolicy: OrganizationHealthPolicy | null = selectedOrganization
    ? selectedOrganizationHealthPolicies.find(
        (policy) =>
          policy.effective_from <= healthPolicyReferenceDate
          && (!policy.effective_until || policy.effective_until >= healthPolicyReferenceDate),
      ) ?? null
    : null;
  const healthComplianceRevision = [
    ...horseHealthDocuments.map((document) => `${document.id}:${document.status}:${document.updated_at}`),
    ...organizationHealthDocumentReviews.map((review) => `${review.id}:${review.version}:${review.status}`),
    ...organizationHealthPolicies.map((policy) => `${policy.id}:${policy.updated_at}`),
  ].join("|");
  const selectedMembership = selectedOrganization
    ? organizationMembers.find((member) => member.organization_id === selectedOrganization.id && member.user_id === context?.profile.id)
    : null;
  const canManageAssociation = navigationStaff || selectedMembership?.role === "admin" || selectedMembership?.role === "secretary";
  const isPlatformAdmin = context?.isPlatformAdmin ?? false;
  const profileIncomplete = context ? !profileIsComplete(context.profile) : false;
  const rawEffectiveView = canManageAssociation || isPlatformAdmin || !associationViewKeys.has(activeView) ? activeView : "my-overview";
  const effectiveView: ViewKey = !canManageAssociation && profileIncomplete && rawEffectiveView === "my-overview" ? "my-profile" : rawEffectiveView;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const selectedOrganizationShows = selectedOrganization
    ? shows.filter((show) => show.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationShowIds = new Set(selectedOrganizationShows.map((show) => show.id));
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
  const selectedOrganizationEntryResults = selectedOrganization
    ? entryResults.filter((result) => selectedOrganizationShowIds.has(result.show_id))
    : [];
  const selectedOrganizationPayoutCalculations = selectedOrganization
    ? payoutCalculations.filter((calculation) => selectedOrganizationShowIds.has(calculation.show_id))
    : [];
  const selectedOrganizationContactIds = selectedOrganization
    ? new Set(
        contactOrganizationLinks
          .filter((link) => link.organization_id === selectedOrganization.id)
          .map((link) => link.contact_id),
      )
    : new Set<string>();
  const selectedOrganizationHorseIds = selectedOrganization
    ? new Set(
        horseOrganizationLinks
          .filter((link) => link.organization_id === selectedOrganization.id)
          .map((link) => link.horse_id),
      )
    : new Set<string>();
  const selectedOrganizationHorseHealthDocuments = selectedOrganization
    ? horseHealthDocuments.filter((document) => selectedOrganizationHorseIds.has(document.horse_id))
    : [];
  const selectedOrganizationContacts = selectedOrganization
    ? sortRecordsForOrganization(contacts, selectedOrganizationContactIds)
    : [];
  const selectedOrganizationContactRoles = selectedOrganization
    ? contactRoles.filter((role) => role.organization_id === selectedOrganization.id || selectedOrganizationContactIds.has(role.contact_id))
    : [];
  const selectedOrganizationMembershipRequirements = selectedOrganization
    ? organizationExternalCredentialRequirements.filter((requirement) => requirement.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationMembershipTypes = selectedOrganization
    ? organizationMembershipTypes.filter((type: OrganizationMembershipType) => type.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationContactMemberships = selectedOrganization
    ? contactOrganizationMemberships.filter((membership: ContactOrganizationMembership) => membership.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationProducts = selectedOrganization
    ? organizationProducts.filter((product: OrganizationProduct) => product.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationManualSales = selectedOrganization
    ? manualSales.filter((sale: ManualSale) => sale.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationHorses = selectedOrganization
    ? sortRecordsForOrganization(horses, selectedOrganizationHorseIds)
    : [];
  const selectedOrganizationHorseContacts = selectedOrganization
    ? horseContacts.filter((horseContact) => selectedOrganizationHorseIds.has(horseContact.horse_id))
    : [];
  const selectedOrganizationBackNumbers = selectedOrganization
    ? organizationBackNumbers.filter((backNumber) => backNumber.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationBlocks = selectedOrganization
    ? blocks.filter((block) => block.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationBlockIds = new Set(selectedOrganizationBlocks.map((block) => block.id));
  const selectedOrganizationBlockJudgeAssignments = blockJudgeAssignments.filter((assignment) => selectedOrganizationBlockIds.has(assignment.block_id));
  const selectedOrganizationBlockConcurrencyGroupMembers = blockConcurrencyGroupMembers.filter((member) => selectedOrganizationBlockIds.has(member.block_id));
  const selectedOrganizationDisciplines = selectedOrganization
    ? organizationDisciplines.filter((discipline) => discipline.organization_id === selectedOrganization.id && discipline.is_active)
    : [];
  const selectedOrganizationDisciplineIds = new Set(selectedOrganizationDisciplines.map((discipline) => discipline.id));
  const selectedOrganizationDirectoryContacts = directoryContacts.filter((directoryContact) => selectedOrganizationDisciplineIds.has(directoryContact.organization_discipline_id));
  const selectedOrganizationDirectoryHorses = directoryHorses.filter((directoryHorse) => selectedOrganizationDisciplineIds.has(directoryHorse.organization_discipline_id));
  const selectedOrganizationSlates = selectedOrganization
    ? slates.filter((slate) => slate.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationBlockTemplates = selectedOrganization
    ? blockTemplates.filter((template) => template.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationClassTemplates = selectedOrganization
    ? classTemplates.filter((classTemplate) => classTemplate.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationClasses = selectedOrganization
    ? classes.filter((classRecord) => classRecord.organization_id === selectedOrganization.id)
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
  const selectedShow = selectedOrganizationShows.find((show) => show.id === selectedShowId) ?? (financeRoute()?.show ? null : ([...selectedOrganizationShows].filter(s=>s.status!=='archived'&&s.end_date>=todayDateValue()).sort((a,b)=>a.start_date.localeCompare(b.start_date))[0]??[...selectedOrganizationShows].sort((a,b)=>b.start_date.localeCompare(a.start_date))[0]??null));
  const showRouteUnavailable = Boolean(financeRoute()?.show && !selectedShow);
  const activeShowId = selectedShow?.id ?? "";
  const activeShowList = selectedShow ? [selectedShow] : selectedOrganizationShows;
  const selectedShowBlocks = selectedShow
    ? selectedOrganizationBlocks.filter((block) => block.show_id === selectedShow.id)
    : selectedOrganizationBlocks;
  const selectedShowBlockIds = new Set(selectedShowBlocks.map((block) => block.id));
  const selectedShowBlockJudgeAssignments = selectedOrganizationBlockJudgeAssignments.filter((assignment) => selectedShowBlockIds.has(assignment.block_id));
  const selectedShowBlockConcurrencyGroupMembers = selectedOrganizationBlockConcurrencyGroupMembers.filter((member) => selectedShowBlockIds.has(member.block_id));
  const selectedShowSlates = selectedShow
    ? selectedOrganizationSlates.filter((slate) => slate.show_id === selectedShow.id)
    : selectedOrganizationSlates;
  const selectedShowClasses = selectedShow
    ? selectedOrganizationClasses.filter((classRecord) => classRecord.show_id === selectedShow.id)
    : selectedOrganizationClasses;
  const selectedShowEntries = selectedShow
    ? selectedOrganizationEntries.filter((entry) => entry.show_id === selectedShow.id)
    : selectedOrganizationEntries;
  const selectedShowShowDays = selectedShow
    ? selectedOrganizationShowDays.filter((day) => day.show_id === selectedShow.id)
    : selectedOrganizationShowDays;
  const selectedShowShowScoreSetups = selectedShow
    ? selectedOrganizationShowScoreSetups.filter((setup) => setup.show_id === selectedShow.id)
    : selectedOrganizationShowScoreSetups;
  const selectedShowShowScorePaidWarmups = selectedShow
    ? selectedOrganizationShowScorePaidWarmups.filter((warmup) => warmup.show_id === selectedShow.id)
    : selectedOrganizationShowScorePaidWarmups;
  const selectedShowEntryResults = selectedShow
    ? selectedOrganizationEntryResults.filter((result) => result.show_id === selectedShow.id)
    : selectedOrganizationEntryResults;
  const selectedShowPayoutCalculations = selectedShow
    ? selectedOrganizationPayoutCalculations.filter((calculation) => calculation.show_id === selectedShow.id)
    : selectedOrganizationPayoutCalculations;
  const selectedShowPayoutCalculationIds = new Set(selectedShowPayoutCalculations.map((calculation) => calculation.id));
  const selectedShowPayoutAwards = payoutAwards.filter((award) => selectedShowPayoutCalculationIds.has(award.calculation_id));
  const selectedShowStallOptions = selectedShow
    ? selectedOrganizationStallOptions.filter((option) => option.show_id === selectedShow.id)
    : selectedOrganizationStallOptions;
  const selectedShowStallBookings = selectedShow
    ? selectedOrganizationStallBookings.filter((booking) => booking.show_id === selectedShow.id)
    : selectedOrganizationStallBookings;
  const selectedShowInvoices = selectedShow
    ? selectedOrganizationInvoices.filter((invoice) => !invoice.show_id || invoice.show_id === selectedShow.id)
    : selectedOrganizationInvoices;
  const selectedShowInvoiceIds = new Set(selectedShowInvoices.map((invoice) => invoice.id));
  const selectedShowInvoiceLineItems = selectedShow
    ? selectedOrganizationInvoiceLineItems.filter((item) => selectedShowInvoiceIds.has(item.invoice_id))
    : selectedOrganizationInvoiceLineItems;
  const selectedShowManualSales = selectedShow
    ? selectedOrganizationManualSales.filter((sale) => !sale.show_id || sale.show_id === selectedShow.id)
    : selectedOrganizationManualSales;
  const personalContacts = contacts.filter((contact) => contact.linked_user_id === context?.profile.id);
  const personalContactIds = new Set(personalContacts.map((contact) => contact.id));
  const personalHorseIdsFromContacts = new Set(
    horseContacts
      .filter((horseContact) => personalContactIds.has(horseContact.contact_id) && (horseContact.role === "owner" || horseContact.role === "co-owner" || horseContact.role === "agent"))
      .map((horseContact) => horseContact.horse_id),
  );
  const personalHorses = horses.filter((horse) => personalContactIds.has(horse.primary_owner_contact_id) || personalHorseIdsFromContacts.has(horse.id));
  const personalHorseIds = new Set(personalHorses.map((horse) => horse.id));
  const personalContactMemberships = contactOrganizationMemberships.filter((membership) => personalContactIds.has(membership.contact_id));
  const selectedOrganizationPersonalContacts = selectedOrganization
    ? personalContacts.filter((contact) => selectedOrganizationContactIds.has(contact.id))
    : personalContacts;
  const selectedOrganizationPersonalHorses = selectedOrganization
    ? personalHorses.filter((horse) => selectedOrganizationHorseIds.has(horse.id))
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
  const selectedShowPersonalEntries = selectedShow
    ? personalEntries.filter((entry) => entry.show_id === selectedShow.id)
    : personalEntries;
  const selectedShowPersonalStallBookings = selectedShow
    ? personalStallBookings.filter((booking) => booking.show_id === selectedShow.id)
    : personalStallBookings;
  const selectedShowPersonalInvoices = selectedShow
    ? personalInvoices.filter((invoice) => !invoice.show_id || invoice.show_id === selectedShow.id)
    : personalInvoices;
  const selectedShowPersonalInvoiceIds = new Set(selectedShowPersonalInvoices.map((invoice) => invoice.id));
  const selectedShowPersonalInvoiceLineItems = selectedShow
    ? personalInvoiceLineItems.filter((item) => selectedShowPersonalInvoiceIds.has(item.invoice_id))
    : personalInvoiceLineItems;
  const openShows = selectedOrganizationShows.filter((show) => show.status === "open").length;
  const unpaidBalance = selectedOrganizationInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);
  const selectedShowUnpaidBalance = selectedShowInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);
  const selectedShowPersonalUnpaidBalance = selectedShowPersonalInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);
  const shouldShowShowContext = selectedOrganizationShows.length > 0 && SHOW_CONTEXT_VIEW_KEYS.has(effectiveView);
  const notificationToday = todayDateValue();
  const notificationReferenceShow = [...selectedOrganizationShows]
    .filter((show) => show.status !== "archived" && show.end_date >= notificationToday)
    .sort((first, second) => first.start_date.localeCompare(second.start_date))[0] ?? null;
  const notificationHealthCompliance = useHorseHealthComplianceOverview({
    horseIds: selectedOrganizationHorses.map((horse) => horse.id),
    organizationId: selectedOrganization?.id,
    referenceDate: notificationReferenceShow?.start_date ?? notificationToday,
    refreshToken: healthComplianceRevision,
  });
  const selectedOrganizationNotifications = buildNotificationItems({
    backNumbers: selectedOrganizationBackNumbers,
    blocks: selectedOrganizationBlocks,
    contactExternalIdentifiers,
    contacts: selectedOrganizationContacts,
    classes: selectedOrganizationClasses,
    entries: selectedOrganizationEntries,
    externalCredentialIssuers,
    healthComplianceResults: notificationHealthCompliance.results,
    horses: selectedOrganizationHorses,
    invoices: selectedOrganizationInvoices,
    membershipRequirements: selectedOrganizationMembershipRequirements,
    organization: selectedOrganization,
    showDays: selectedOrganizationShowDays,
    showScoreClassSetups: selectedOrganizationShowScoreSetups,
    shows: selectedOrganizationShows,
    stallOptions: selectedOrganizationStallOptions,
  });
  const activeNavItem = [...associationNavigation, ...personalNavigation].find((item) => item.key === effectiveView);
  const activeViewLabel = effectiveView === "show-accounts" ? (locale === "fr" ? "Comptes du concours" : "Show accounts") : effectiveView === "platform-admin" ? "Admin plans" : activeNavItem ? t.nav[activeNavItem.labelKey] : t.shell.productName;

  const handleViewChange = (view: ViewKey) => {
    setIsMobileMenuOpen(false);
    if(view==='billing')navigateBilling(`/associations/${selectedOrganization?.id}/finance`);
    else if(view==='my-invoices')navigateBilling('/me/accounts');
    else if(Object.values(showSections).includes(view)&&activeShowId)navigateBilling(`/associations/${selectedOrganization?.id}/shows/${activeShowId}/${Object.keys(showSections).find(k=>showSections[k]===view)}`);
    else {window.history.pushState({},'', '/');onViewChange(view);}

  };

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const mediaQuery = window.matchMedia("(min-width: 641px)");
    if (mediaQuery.matches) {
      setIsMobileMenuOpen(false);
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileMenuOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  return (
    <main className="app-shell">
      <aside className={`sidebar${isMobileMenuOpen ? " open" : ""}`}>
        <div className="mobile-menu-bar">
          <Brand symbol />
          <div className="mobile-menu-title">
            <strong>{t.shell.productName}</strong>
            <span>{activeViewLabel}</span>
          </div>
          <button
            aria-controls="primary-navigation"
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? "Fermer la navigation" : "Ouvrir la navigation"}
            className="mobile-menu-toggle"
            onClick={() => setIsMobileMenuOpen((value) => !value)}
            type="button"
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <div className="brand-lockup compact"><Brand /></div>

        <nav className="nav-list" id="primary-navigation" aria-label="Main navigation">
          {canManageAssociation || isPlatformAdmin ? (
            <NavigationSection activeView={effectiveView} items={associationNavigation} label={t.nav.association} t={t} onViewChange={handleViewChange} />
          ) : null}
          <NavigationSection activeView={effectiveView} items={personalNavigation} label={t.nav.mySpace} t={t} onViewChange={handleViewChange} />
          {isPlatformAdmin ? (
            <div className="nav-section">
              <p className="nav-section-label">Platform</p>
              <button
                type="button"
                className={`nav-item${effectiveView === "platform-admin" ? " active" : ""}`}
                onClick={() => handleViewChange("platform-admin")}
              >
                <Shield size={18} />
                Admin plans
              </button>
            </div>
          ) : null}
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
              <select value={selectedOrganization?.id ?? ""} onChange={(event) => {onChangeOrganization(event.target.value);if(effectiveView==='billing'||effectiveView==='show-accounts')navigateBilling(`/associations/${event.target.value}/finance`);else if(financeRoute())navigateBilling(`/associations/${event.target.value}/shows`);}}>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            ) : null}
            {shouldShowShowContext ? (
              <select
                aria-label={locale === "fr" ? "Show actuel" : "Current show"}
                title={locale === "fr" ? "Show actuel" : "Current show"}
                value={activeShowId}
                onChange={(event) => {setSelectedShowId(event.target.value);if(!effectiveView.startsWith('my-'))navigateBilling(`/associations/${selectedOrganization?.id}/shows/${event.target.value}/${Object.keys(showSections).find(k=>showSections[k]===effectiveView)??'overview'}`);}}
              >
                <option value="" disabled>{locale==='fr'?'Choisir un concours':'Select a show'}</option>
                {selectedOrganizationShows.map((show) => (
                  <option key={show.id} value={show.id}>
                    {showLabel(show)}
                  </option>
                ))}
              </select>
            ) : null}
            <button className="icon-button" title={t.common.refresh} type="button" onClick={onRefresh}>
              <RefreshCw className={loading ? "spin" : ""} size={18} />
            </button>
          </div>
        </header>

        {shouldShowShowContext && !effectiveView.startsWith('my-') && <div className="finance"><p>{selectedShow?.name} · {selectedShow?.start_date} — {selectedShow?.end_date} · {selectedShow?.status}</p><nav className="finance-tabs" aria-label={locale==='fr'?'Concours sélectionné':'Selected show'}>{[['shows',locale==='fr'?'Aperçu':'Overview'],['entries',locale==='fr'?'Inscriptions':'Entries'],['stalls',locale==='fr'?'Réservations':'Reservations'],['blocks',locale==='fr'?'Horaire':'Schedule'],['show-accounts',locale==='fr'?'Comptes du concours':'Show accounts']].map(([key,label])=><button key={key} aria-current={effectiveView===key?'page':undefined} onClick={()=>handleViewChange(key as ViewKey)}>{label}</button>)}<label>{locale==='fr'?'Plus':'More'}<select value="" onChange={e=>handleViewChange(e.target.value as ViewKey)}><option value="">—</option><option value="health">{locale==='fr'?'Santé et conformité':'Health and compliance'}</option><option value="scoring">ShowScore</option><option value="results">{locale==='fr'?'Résultats':'Results'}</option></select></label></nav></div>}
        {notice ? <NoticeBanner notice={notice} /> : null}
        {showRouteUnavailable && <p role="alert">{locale==='fr'?'Concours indisponible ou non autorisé. Sélectionnez un concours accessible.':'Show unavailable or unauthorized. Select an accessible show.'}</p>}

        {!showRouteUnavailable && effectiveView === "overview" ? (
          <OverviewView
            locale={locale}
            openShows={openShows}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            contacts={selectedOrganizationContacts}
            horses={selectedOrganizationHorses}
            blocks={selectedOrganizationBlocks}
            entries={selectedOrganizationEntries}
            stallOptions={selectedOrganizationStallOptions}
            stallBookings={selectedOrganizationStallBookings}
            invoices={selectedOrganizationInvoices}
            unpaidBalance={unpaidBalance}
            disciplines={disciplines}
            onCreateOrganization={onCreateOrganization}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "notifications" ? (
          <NotificationsView
            notifications={selectedOrganizationNotifications}
            organization={selectedOrganization}
            onViewChange={onViewChange}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "shows" ? (
          <ShowsView
            locale={locale}
            blocks={selectedOrganizationBlocks}
            classes={selectedOrganizationClasses}
            entries={selectedOrganizationEntries}
            invoices={selectedOrganizationInvoices}
            organization={selectedOrganization}
            showAnnouncements={selectedOrganizationShowAnnouncements}
            showDays={selectedOrganizationShowDays}
            showScoreClassSetups={selectedOrganizationShowScoreSetups}
            shows={financeRoute()?.show?activeShowList:selectedOrganizationShows}
            stallOptions={selectedOrganizationStallOptions}
            onCreateShow={onCreateShow}
            onCreateShowAnnouncement={onCreateShowAnnouncement}
            onDeleteShowAnnouncement={onDeleteShowAnnouncement}
            onUpdateShow={onUpdateShow}
            onViewChange={handleViewChange}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "people" ? (
          <PeopleView
            locale={locale}
            contacts={selectedOrganizationContacts}
            contactExternalIdentifiers={contactExternalIdentifiers}
            contactInsuranceEvidence={context?.contactInsuranceEvidence ?? []}
            contactOrganizationMemberships={selectedOrganizationContactMemberships}
            contactRoles={selectedOrganizationContactRoles}
            createdByUserId={context?.profile.id ?? ""}
            directoryContacts={selectedOrganizationDirectoryContacts}
            directoryHorses={selectedOrganizationDirectoryHorses}
            disciplines={disciplines}
            externalCredentialIssuers={externalCredentialIssuers}
            externalCredentialProducts={context?.externalCredentialProducts ?? []}
            horseExternalIdentifiers={horseExternalIdentifiers}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            horseContacts={selectedOrganizationHorseContacts}
            healthComplianceRevision={healthComplianceRevision}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organizationMembershipTypes={selectedOrganizationMembershipTypes}
            organization={selectedOrganization}
            organizationDisciplines={selectedOrganizationDisciplines}
            onCreateContact={onCreateContact}
            onCreateContactOrganizationMembership={onCreateContactOrganizationMembership}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onLinkContactToDirectory={onLinkContactToDirectory}
            onLinkHorseToDirectory={onLinkHorseToDirectory}
            onDeleteContact={onDeleteContact}
            onDeleteHorse={onDeleteHorse}
            onUnlinkContactFromDirectory={onUnlinkContactFromDirectory}
            onUnlinkHorseFromDirectory={onUnlinkHorseFromDirectory}
            onUpdateContact={onUpdateContact}
            onUpdateHorse={onUpdateHorse}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
            onVerifyNrhaMember={onVerifyNrhaMember}
            onRefresh={onRefresh}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "health" ? (
          <HealthCenterView
            locale={locale}
            canManageHealthDocuments={canManageAssociation || isPlatformAdmin}
            complianceRevision={healthComplianceRevision}
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            createdByUserId={context?.profile.id ?? ""}
            externalCredentialIssuers={externalCredentialIssuers}
            horseContacts={selectedOrganizationHorseContacts}
            horseExternalIdentifiers={horseExternalIdentifiers}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            onCreateContact={onCreateContact}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onReviewOrganizationHealthDocuments={onReviewOrganizationHealthDocuments}
            onUpdateHorse={onUpdateHorse}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "blocks" ? (
          <ClassesView
            locale={locale}
            blocks={selectedShowBlocks}
            blockConcurrencyGroupMembers={selectedShowBlockConcurrencyGroupMembers}
            blockJudgeAssignments={selectedShowBlockJudgeAssignments}
            classTemplates={selectedOrganizationClassTemplates}
            blockTemplates={selectedOrganizationBlockTemplates}
            contacts={selectedOrganizationContacts}
            disciplines={disciplines}
            disciplineCredentialIssuers={context?.disciplineCredentialIssuers ?? []}
            eligibilityRequirements={context?.eligibilityRequirements ?? []}
            incentivePrograms={context?.incentivePrograms ?? []}
            externalCredentialIssuers={externalCredentialIssuers}
            externalCredentialProducts={context?.externalCredentialProducts ?? []}
            classes={selectedShowClasses}
            entries={selectedShowEntries}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            organizationDisciplines={selectedOrganizationDisciplines}
            organizationDisciplineGoverningBodies={context?.organizationDisciplineGoverningBodies ?? []}
            sanctioningBodies={sanctioningBodies}
            showDays={selectedShowShowDays}
            showScorePaidWarmups={selectedShowShowScorePaidWarmups}
            slates={selectedShowSlates}
            shows={activeShowList}
            onCreateBlock={onCreateBlock}
            onCreateBlockTemplate={onCreateBlockTemplate}
            onCreateClassTemplate={onCreateClassTemplate}
            onCreateClass={onCreateClass}
            onCreateSlate={onCreateSlate}
            onDeleteBlock={onDeleteBlock}
            onDeleteBlockTemplate={onDeleteBlockTemplate}
            onDeleteClassTemplate={onDeleteClassTemplate}
            onDeleteClass={onDeleteClass}
            onDeleteSlate={onDeleteSlate}
            onDeleteShowScorePaidWarmup={onDeleteShowScorePaidWarmup}
            onSaveShowScorePaidWarmup={onSaveShowScorePaidWarmup}
            onShowScorePaidWarmupSaveError={onShowScorePaidWarmupSaveError}
            onUpdateBlock={onUpdateBlock}
            onUpdateBlockTemplate={onUpdateBlockTemplate}
            onUpdateClassTemplate={onUpdateClassTemplate}
            onUpdateClass={onUpdateClass}
            onUpdateSlate={onUpdateSlate}
            currentUserProfileId={context?.profile.id ?? ""}
            onRefresh={onRefresh}
            onUpdateShowScorePaidWarmup={onUpdateShowScorePaidWarmup}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "entries" ? (
          <EntriesView
            locale={locale}
            blocks={selectedShowBlocks}
            contacts={selectedOrganizationContacts}
            contactExternalIdentifiers={contactExternalIdentifiers}
            contactRoles={selectedOrganizationContactRoles}
            classes={selectedShowClasses}
            entries={selectedShowEntries}
            externalCredentialIssuers={externalCredentialIssuers}
            horseExternalIdentifiers={horseExternalIdentifiers}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            nrhaRiderRankings={nrhaRiderRankings}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            showDays={selectedShowShowDays}
            shows={activeShowList}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDeleteEntry={onDeleteEntry}
            onUpdateEntry={onUpdateEntry}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaEligibility={onVerifyNrhaEligibility}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "back-numbers" ? (
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

        {!showRouteUnavailable && effectiveView === "stalls" ? (
          <StallsView
            locale={locale}
            bookings={selectedShowStallBookings}
            contacts={selectedOrganizationContacts}
            contactRoles={selectedOrganizationContactRoles}
            currency={selectedOrganization?.currency ?? "CAD"}
            horseHealthDocuments={selectedOrganizationHorseHealthDocuments}
            horses={selectedOrganizationHorses}
            invoiceLineItems={selectedShowInvoiceLineItems}
            invoices={selectedShowInvoices}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            products={selectedOrganizationProducts}
            showDays={selectedShowShowDays}
            shows={activeShowList}
            stallOptions={selectedShowStallOptions}
            onCreateContact={onCreateContact}
            onCreateStallBooking={onCreateStallBooking}
            onCreateStallOption={onCreateStallOption}
            onDeleteStallBooking={onDeleteStallBooking}
            onUpdateStallBooking={onUpdateStallBooking}
            onUpdateStallOption={onUpdateStallOption}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "scoring" ? (
          selectedOrganization && hasPlanFeature(selectedOrganization, 'show_score') ? (
            <ScoringView
              locale={locale}
              blocks={selectedShowBlocks}
              contacts={selectedOrganizationContacts}
              classes={selectedShowClasses}
              entries={selectedShowEntries}
              horses={selectedOrganizationHorses}
              showDays={selectedShowShowDays}
              showScoreClassSetups={selectedShowShowScoreSetups}
              showScorePaidWarmups={selectedShowShowScorePaidWarmups}
              shows={activeShowList}
              onDeleteShowScorePaidWarmup={onDeleteShowScorePaidWarmup}
              onPrepareShowScoreClass={onPrepareShowScoreClass}
            />
          ) : (
            <UpgradePrompt feature="ShowScore Live Scoring" requiredPlan="professional" />
          )
        ) : null}

        {!showRouteUnavailable && effectiveView === "results" ? (
          <ResultsView
            locale={locale}
            blocks={selectedShowBlocks}
            contacts={selectedOrganizationContacts}
            classes={selectedShowClasses}
            entries={selectedShowEntries}
            entryResults={selectedShowEntryResults}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            payoutAwards={selectedShowPayoutAwards}
            payoutCalculations={selectedShowPayoutCalculations}
            payoutScheduleBrackets={payoutScheduleBrackets}
            payoutSchedules={payoutSchedules}
            profileId={context?.profile.user_id ?? ""}
            shows={activeShowList}
            onSavePayoutCalculationDraft={onSavePayoutCalculationDraft}
            onUpdatePayoutAwardPayee={onUpdatePayoutAwardPayee}
            onUpdatePayoutCalculationStatus={onUpdatePayoutCalculationStatus}
          />
        ) : null}

        {!showRouteUnavailable && (effectiveView === "billing" || effectiveView === "show-accounts") ? <FinanceView key={effectiveView+selectedOrganizationId} org={selectedOrganization?.id??''} show={effectiveView==='show-accounts'?(financeRoute()?.show??activeShowId):''} personal={false} identity={context?.profile.id??''} locale={locale} contacts={selectedOrganizationContacts} organizations={organizations} horses={selectedOrganizationHorses} legacy={<BillingView
            locale={locale}
            contacts={selectedOrganizationContacts}
            currency={selectedOrganization?.currency ?? "CAD"}
            entries={selectedShowEntries}
            horseContacts={selectedOrganizationHorseContacts}
            horses={selectedOrganizationHorses}
            invoices={selectedShowInvoices}
            lineItems={selectedShowInvoiceLineItems}
            manualSales={selectedShowManualSales}
            organization={selectedOrganization}
            products={selectedOrganizationProducts}
            profileId={context?.profile.id ?? ""}
            shows={activeShowList}
            unpaidBalance={selectedShowUnpaidBalance}
            onCancelManualSale={onCancelManualSale}
            onCreateManualSale={onCreateManualSale}
          />}/> : null}

        {!showRouteUnavailable && effectiveView === "my-overview" && context ? (
          <ClientDashboardView
            locale={locale}
            contacts={personalContacts}
            classes={selectedShowClasses}
            entries={selectedShowPersonalEntries}
            horses={personalHorses}
            invoices={selectedShowPersonalInvoices}
            organizations={organizations}
            profile={context.profile}
            shows={activeShowList}
            showDays={selectedShowShowDays}
            stallBookings={selectedShowPersonalStallBookings}
            stallOptions={selectedShowStallOptions}
            onViewChange={onViewChange}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "my-profile" && context ? (
          <ProfileView
            locale={locale}
            horses={personalHorses}
            horseHealthDocuments={personalHorseHealthDocuments}
            profile={context.profile}
            onUpdateUserProfile={onUpdateUserProfile}
            onViewChange={onViewChange}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "my-horses" ? (
          <MyHorsesView
            locale={locale}
            contacts={personalContacts}
            contactRoles={contactRoles}
            externalCredentialIssuers={externalCredentialIssuers}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            horses={personalHorses}
            horseExternalIdentifiers={horseExternalIdentifiers}
            horseHealthDocuments={personalHorseHealthDocuments}
            horseContacts={horseContacts}
            incentivePrograms={context?.incentivePrograms ?? []}
            incentiveProgramNominations={context?.incentiveProgramNominations ?? []}
            payerContacts={selectedOrganizationPersonalContacts}
            programHorses={selectedOrganizationPersonalHorses}
            healthComplianceRevision={healthComplianceRevision}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDeleteHorse={onDeleteHorse}
            onUpdateHorse={onUpdateHorse}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
            onRefresh={onRefresh}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "my-riders" ? (
          <MyContactsView
            locale={locale}
            contacts={personalContacts}
            contactExternalIdentifiers={contactExternalIdentifiers}
            contactOrganizationMemberships={personalContactMemberships}
            externalCredentialIssuers={externalCredentialIssuers}
            externalCredentialProducts={context?.externalCredentialProducts ?? []}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            organizationMembershipTypes={organizationMembershipTypes}
            organizations={organizations}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            onCreateContact={onCreateContact}
            onCreateContactOrganizationMembership={onCreateContactOrganizationMembership}
            onDeleteContact={onDeleteContact}
            onUpdateContact={onUpdateContact}
            onVerifyNrhaMember={onVerifyNrhaMember}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "my-entries" ? (
          <MyEntriesView
            locale={locale}
            blocks={selectedShowBlocks}
            contacts={selectedOrganizationPersonalContacts}
            contactExternalIdentifiers={contactExternalIdentifiers}
            contactRoles={selectedOrganizationContactRoles}
            classes={selectedShowClasses}
            entries={selectedShowPersonalEntries}
            externalCredentialIssuers={externalCredentialIssuers}
            horseExternalIdentifiers={horseExternalIdentifiers}
            horseHealthDocuments={personalHorseHealthDocuments}
            horses={selectedOrganizationPersonalHorses}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            nrhaRiderRankings={nrhaRiderRankings}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            showDays={selectedShowShowDays}
            shows={activeShowList}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDeleteEntry={onDeleteEntry}
            onUpdateEntry={onUpdateEntry}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaEligibility={onVerifyNrhaEligibility}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "my-back-numbers" ? (
          <MyBackNumbersView
            locale={locale}
            backNumbers={personalBackNumbers}
            contacts={selectedOrganizationPersonalContacts}
            horses={selectedOrganizationPersonalHorses}
            organization={selectedOrganization}
            onClaimHorseBackNumber={onClaimHorseBackNumber}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "my-stalls" ? (
          <MyStallsView
            locale={locale}
            bookings={selectedShowPersonalStallBookings}
            contacts={selectedOrganizationPersonalContacts}
            contactRoles={selectedOrganizationContactRoles}
            currency={selectedOrganization?.currency ?? "CAD"}
            horseHealthDocuments={personalHorseHealthDocuments}
            horses={selectedOrganizationPersonalHorses}
            invoiceLineItems={selectedShowPersonalInvoiceLineItems}
            invoices={selectedShowPersonalInvoices}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            showDays={selectedShowShowDays}
            shows={activeShowList}
            stallOptions={selectedShowStallOptions}
            onCreateContact={onCreateContact}
            onCreateStallBooking={onCreateStallBooking}
            onDeleteStallBooking={onDeleteStallBooking}
            onUpdateStallBooking={onUpdateStallBooking}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "my-invoices" ? <FinanceView key={effectiveView+selectedOrganizationId} org={selectedOrganization?.id??''} show={''} personal={true} identity={context?.profile.id??''} locale={locale} contacts={selectedOrganizationContacts} organizations={organizations} horses={selectedOrganizationHorses} legacy={<BillingView
            locale={locale}
            contacts={selectedOrganizationPersonalContacts}
            currency={selectedOrganization?.currency ?? "CAD"}
            entries={selectedShowPersonalEntries}
            horseContacts={selectedOrganizationHorseContacts}
            horses={selectedOrganizationPersonalHorses}
            invoices={selectedShowPersonalInvoices}
            lineItems={selectedShowPersonalInvoiceLineItems}
            manualSales={[]}
            organization={selectedOrganization}
            products={[]}
            profileId={context?.profile.id ?? ""}
            shows={activeShowList}
            unpaidBalance={selectedShowPersonalUnpaidBalance}
          />}/> : null}

        {!showRouteUnavailable && effectiveView === "programs" && context && selectedOrganization ? (
          <div className="content-grid">
            <ViewIntro
              eyebrow={locale === "fr" ? "Association" : "Association"}
              title={locale === "fr" ? "Programmes" : "Programs"}
              description={locale === "fr" ? "Gère les programmes incitatifs, les tarifs selon l’âge, les nominations et les imports NRHA." : "Manage incentive programs, age-based pricing, nominations, and NRHA imports."}
              stats={[
                { label: locale === "fr" ? "Programmes actifs" : "Active programs", value: String(context.incentivePrograms.filter((program) => program.organization_id === selectedOrganization.id && program.is_active).length) },
                { label: locale === "fr" ? "Nominations" : "Nominations", value: String(context.incentiveProgramNominations.filter((nomination) => nomination.organization_id === selectedOrganization.id).length) },
              ]}
            />
            <IncentiveProgramsSettings
              context={context}
              locale={locale}
              organization={selectedOrganization}
              onRefresh={onRefresh}
            />
          </div>
        ) : null}

        {!showRouteUnavailable && effectiveView === "settings" ? (
          <SettingsView
            locale={locale}
            context={context}
            externalCredentialIssuers={externalCredentialIssuers}
            healthPolicy={selectedOrganizationHealthPolicy}
            healthPolicies={selectedOrganizationHealthPolicies}
            membershipRequirements={selectedOrganizationMembershipRequirements}
            membershipTypes={selectedOrganizationMembershipTypes}
            organization={selectedOrganization}
            onCreateOrganizationMembershipType={onCreateOrganizationMembershipType}
            onCreateOrganizationProduct={onCreateOrganizationProduct}
            onSetExternalMembershipRequirement={onSetExternalMembershipRequirement}
            onSetOrganizationHealthPolicy={onSetOrganizationHealthPolicy}
            onUpdateOrganizationHealthSettings={onUpdateOrganizationHealthSettings}
            onUpdateOrganizationMembershipType={onUpdateOrganizationMembershipType}
            onUpdateOrganizationProduct={onUpdateOrganizationProduct}
            onRefresh={onRefresh}
            products={selectedOrganizationProducts}
          />
        ) : null}

        {!showRouteUnavailable && effectiveView === "platform-admin" && isPlatformAdmin ? (
          <PlatformAdminView
            currentUserProfileId={context?.profile.id ?? null}
            nrhaRiderRankings={nrhaRiderRankings}
            organizations={organizations}
            disciplines={disciplines}
            disciplineCredentialIssuers={context?.disciplineCredentialIssuers ?? []}
            disciplineGoverningBodies={context?.disciplineGoverningBodies ?? []}
            externalCredentialIssuers={externalCredentialIssuers}
            externalCredentialProducts={context?.externalCredentialProducts ?? []}
            governingBodies={sanctioningBodies}
            onImportNrhaRiderRankings={onReplaceNrhaRiderRankings}
            onRefresh={onRefresh}
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
          <button className={activeView === item.key ? "active" : ""} data-view={item.key} key={item.key} type="button" onClick={() => onViewChange(item.key)}>
            <Icon size={18} />
            {t.nav[item.labelKey]}
          </button>
        );
      })}
    </div>
  );
}
