import type { User } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";
import type {
  ClassInput,
  ClassRecord,
  ClassTemplate,
  ClassTemplateDivision,
  ClassTemplateDivisionInput,
  ClassTemplateDivisionUpdateInput,
  ClassTemplateInput,
  ClassTemplateUpdateInput,
  ClassUpdateInput,
  Contact,
  ContactExternalMembership,
  ContactInput,
  ContactOrganizationMembership,
  ContactOrganizationMembershipInput,
  ContactOrganizationLink,
  ContactRole,
  ContactRoleName,
  ContactUpdateInput,
  Division,
  DivisionInput,
  DivisionUpdateInput,
  EntryImportBatch,
  EntryResult,
  Entry,
  EntryInput,
  EntryUpdateInput,
  ExternalHorseMembershipInput,
  Horse,
  HorseExternalMembership,
  HorseHealthDocument,
  HorseOrganizationLink,
  HorseContact,
  HorseInput,
  HorseUpdateInput,
  ExternalMembershipInput,
  ExternalOrganization,
  Invoice,
  InvoiceLineItem,
  ManualSale,
  ManualSaleInput,
  Organization,
  OrganizationBackNumber,
  OrganizationExternalMembershipRequirement,
  OrganizationInput,
  OrganizationMembershipType,
  OrganizationMembershipTypeInput,
  OrganizationMembershipTypeUpdateInput,
  OrganizationMember,
  OrganizationProduct,
  OrganizationProductInput,
  OrganizationProductUpdateInput,
  OrganizationSettingsInput,
  SanctioningBody,
  PayoutAward,
  PayoutCalculation,
  PayoutCalculationStatus,
  PayoutSchedule,
  PayoutScheduleBracket,
  ScheduleStartMode,
  Show,
  ShowAnnouncement,
  ShowAnnouncementInput,
  ShowDay,
  BlockRunClassEntry,
  BlockRunEntry,
  ScoredRun,
  ShowScoreClassSetup,
  ShowScorePaidWarmup,
  ShowScorePaidWarmupEntry,
  ShowScorePaidWarmupInput,
  ShowScorePaidWarmupUpdateInput,
  ShowInput,
  ShowUpdateInput,
  StallBooking,
  StallBookingInput,
  StallBookingUpdateInput,
  StallOption,
  StallOptionInput,
  StallOptionUpdateInput,
  UserProfile,
  UserProfileUpdateInput,
} from "../types/domain";
import {
  AQR_AUDIT_IMPORT_SOURCE,
  buildAqrExternalSourceKey,
  captureRunTechnicalSnapshot,
  isAqrScratchRun,
  matchRunDivisions,
  normalizeShowScoreDrawRun,
  previewShowScoreDrawEntryImport as buildAqrAuditImportPreview,
  restoreRunTechnicalSnapshot,
  type NormalizedShowScoreDrawRun,
  type RunTechnicalSnapshot,
} from "../lib/aqrAuditImport";
import { buildShowScoreRunsForClass, type ShowScoreRun } from "./showScoreAdapters";

const inactiveEntryStatuses: Entry["status"][] = ["cancelled", "scratched", "scratched_pending_refund"];

export type AppContext = {
  profile: UserProfile;
  isPlatformAdmin: boolean;
  organizations: Organization[];
  organizationMembers: OrganizationMember[];
  shows: Show[];
  showDays: ShowDay[];
  showAnnouncements: ShowAnnouncement[];
  showScoreClassSetups: ShowScoreClassSetup[];
  scoredRuns: ScoredRun[];
  blockRunEntries: BlockRunEntry[];
  blockRunClassEntries: BlockRunClassEntry[];
  entryResults: EntryResult[];
  payoutSchedules: PayoutSchedule[];
  payoutScheduleBrackets: PayoutScheduleBracket[];
  payoutCalculations: PayoutCalculation[];
  payoutAwards: PayoutAward[];
  showScorePaidWarmups: ShowScorePaidWarmup[];
  entryImportBatches: EntryImportBatch[];
  contacts: Contact[];
  contactOrganizationLinks: ContactOrganizationLink[];
  contactRoles: ContactRole[];
  externalOrganizations: ExternalOrganization[];
  organizationExternalMembershipRequirements: OrganizationExternalMembershipRequirement[];
  organizationMembershipTypes: OrganizationMembershipType[];
  contactOrganizationMemberships: ContactOrganizationMembership[];
  organizationProducts: OrganizationProduct[];
  manualSales: ManualSale[];
  contactExternalMemberships: ContactExternalMembership[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  horseOrganizationLinks: HorseOrganizationLink[];
  horseContacts: HorseContact[];
  organizationBackNumbers: OrganizationBackNumber[];
  classes: ClassRecord[];
  classTemplates: ClassTemplate[];
  classTemplateDivisions: ClassTemplateDivision[];
  divisions: Division[];
  sanctioningBodies: SanctioningBody[];
  entries: Entry[];
  stallOptions: StallOption[];
  stallBookings: StallBooking[];
  invoices: Invoice[];
  invoiceLineItems: InvoiceLineItem[];
};

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function ensureUserProfile(user: User) {
  const client = requireSupabase();
  const profileDefaults = profileDefaultsFromUser(user);
  const { data: existing, error: selectError } = await client
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<UserProfile>();

  if (selectError) {
    throw selectError;
  }

  if (existing) {
    const patch = missingUserProfileFields(existing, profileDefaults);

    if (Object.keys(patch).length) {
      const { data: updated, error: updateError } = await client
        .from("user_profiles")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single<UserProfile>();

      if (updateError) {
        throw updateError;
      }

      await claimContactsForCurrentUser();
      return updated;
    }

    await claimContactsForCurrentUser();
    return existing;
  }

  const { data: created, error: insertError } = await client
    .from("user_profiles")
    .insert({
      user_id: user.id,
      first_name: profileDefaults.first_name,
      last_name: profileDefaults.last_name,
      phone: profileDefaults.phone,
      type_user: profileDefaults.type_user,
    })
    .select("*")
    .single<UserProfile>();

  if (insertError) {
    throw insertError;
  }

  await claimContactsForCurrentUser();
  return created;
}

export async function loadAppContext(user: User): Promise<AppContext> {
  const client = requireSupabase();
  const profile = await ensureUserProfile(user);

  const [
    organizationsResult,
    organizationMembersResult,
    showsResult,
    showDaysResult,
    contactsResult,
    contactOrganizationLinksResult,
    contactRolesResult,
    externalOrganizationsResult,
    organizationExternalMembershipRequirementsResult,
    organizationMembershipTypesResult,
    contactOrganizationMembershipsResult,
    organizationProductsResult,
    manualSalesResult,
    contactExternalMembershipsResult,
    horseExternalMembershipsResult,
    horseHealthDocumentsResult,
    horsesResult,
    horseOrganizationLinksResult,
    horseContactsResult,
    organizationBackNumbersResult,
    classesResult,
    classTemplatesResult,
    classTemplateDivisionsResult,
    divisionsResult,
    sanctioningBodiesResult,
    entriesResult,
    stallOptionsResult,
    stallBookingsResult,
    invoicesResult,
    invoiceLineItemsResult,
    showAnnouncementsResult,
    scoredRunsResult,
    blockRunEntriesResult,
    blockRunClassEntriesResult,
    entryResultsResult,
    payoutSchedulesResult,
    payoutScheduleBracketsResult,
    payoutCalculationsResult,
    payoutAwardsResult,
    showScorePaidWarmupsResult,
    entryImportBatchesResult,
  ] = await Promise.all([
    client.from("organizations").select("*").order("created_at", { ascending: false }).returns<Organization[]>(),
    client.from("organization_members").select("*").order("created_at", { ascending: false }).returns<OrganizationMember[]>(),
    client.from("shows").select("*").order("start_date", { ascending: true }).returns<Show[]>(),
    client.from("show_days").select("*").order("day_date", { ascending: true }).returns<ShowDay[]>(),
    client.from("contacts").select("*").order("created_at", { ascending: false }).returns<Contact[]>(),
    client.from("contact_organization_links").select("*").order("created_at", { ascending: false }).returns<ContactOrganizationLink[]>(),
    client.from("contact_roles").select("*").order("created_at", { ascending: false }).returns<ContactRole[]>(),
    client.from("external_organizations").select("*").order("name", { ascending: true }).returns<ExternalOrganization[]>(),
    client.from("organization_external_membership_requirements").select("*").order("created_at", { ascending: false }).returns<OrganizationExternalMembershipRequirement[]>(),
    client.from("organization_membership_types").select("*").order("season_year", { ascending: false }).order("name", { ascending: true }).returns<OrganizationMembershipType[]>(),
    client.from("contact_organization_memberships").select("*").order("created_at", { ascending: false }).returns<ContactOrganizationMembership[]>(),
    client.from("organization_products").select("*").order("category", { ascending: true }).order("name", { ascending: true }).returns<OrganizationProduct[]>(),
    client.from("manual_sales").select("*").order("created_at", { ascending: false }).returns<ManualSale[]>(),
    client.from("contact_external_memberships").select("*").order("created_at", { ascending: false }).returns<ContactExternalMembership[]>(),
    client.from("horse_external_memberships").select("*").order("created_at", { ascending: false }).returns<HorseExternalMembership[]>(),
    client.from("horse_health_documents").select("*").order("created_at", { ascending: false }).returns<HorseHealthDocument[]>(),
    client.from("horses").select("*").order("created_at", { ascending: false }).returns<Horse[]>(),
    client.from("horse_organization_links").select("*").order("created_at", { ascending: false }).returns<HorseOrganizationLink[]>(),
    client.from("horse_contacts").select("*").order("created_at", { ascending: false }).returns<HorseContact[]>(),
    client.from("organization_back_numbers").select("*").order("number", { ascending: true }).returns<OrganizationBackNumber[]>(),
    client.from("classes").select("*").order("created_at", { ascending: false }).returns<ClassRecord[]>(),
    client.from("class_templates").select("*").order("sort_order", { ascending: true }).returns<ClassTemplate[]>(),
    client.from("class_template_divisions").select("*").order("sort_order", { ascending: true }).returns<ClassTemplateDivision[]>(),
    client.from("divisions").select("*").order("created_at", { ascending: false }).returns<Division[]>(),
    client.from("sanctioning_bodies").select("*").order("name", { ascending: true }).returns<SanctioningBody[]>(),
    client.from("entries").select("*").order("created_at", { ascending: false }).returns<Entry[]>(),
    client.from("stall_options").select("*").order("created_at", { ascending: false }).returns<StallOption[]>(),
    client.from("stall_bookings").select("*").order("created_at", { ascending: false }).returns<StallBooking[]>(),
    client.from("invoices").select("*").order("created_at", { ascending: false }).limit(20).returns<Invoice[]>(),
    client.from("invoice_line_items").select("*").order("created_at", { ascending: false }).returns<InvoiceLineItem[]>(),
    client.from("show_announcements").select("*").order("created_at", { ascending: false }).returns<ShowAnnouncement[]>(),
    client.from("scored_runs").select("*").order("scored_at", { ascending: false }).returns<ScoredRun[]>(),
    client.from("block_run_entries").select("*").order("order_of_go", { ascending: true }).returns<BlockRunEntry[]>(),
    client.from("block_run_class_entries").select("*").returns<BlockRunClassEntry[]>(),
    client.from("entry_results").select("*").order("synced_at", { ascending: false }).returns<EntryResult[]>(),
    client.from("payout_schedules").select("*").order("federation", { ascending: true }).order("name", { ascending: true }).returns<PayoutSchedule[]>(),
    client.from("payout_schedule_brackets").select("*").order("min_entries", { ascending: true }).order("place", { ascending: true }).returns<PayoutScheduleBracket[]>(),
    client.from("payout_calculations").select("*").order("calculated_at", { ascending: false }).returns<PayoutCalculation[]>(),
    client.from("payout_awards").select("*").order("rank", { ascending: true }).returns<PayoutAward[]>(),
    client.from("show_score_paid_warmups").select("*").order("sort_order", { ascending: true }).returns<ShowScorePaidWarmup[]>(),
    client.from("entry_import_batches").select("*").order("created_at", { ascending: false }).returns<EntryImportBatch[]>(),
  ]);
  const showScoreClassSetups = await loadShowScoreClassSetups();

  const { data: isPlatformAdminData } = await client.rpc("is_platform_admin").returns<boolean>();
  const isPlatformAdmin = Boolean(isPlatformAdminData);

  if (organizationsResult.error) {
    throw organizationsResult.error;
  }

  if (organizationMembersResult.error) {
    throw organizationMembersResult.error;
  }

  if (showsResult.error) {
    throw showsResult.error;
  }

  if (showDaysResult.error) {
    throw showDaysResult.error;
  }

  if (contactsResult.error) {
    throw contactsResult.error;
  }

  const contactOrganizationLinks = contactOrganizationLinksResult.error
    ? isMissingSchemaError(contactOrganizationLinksResult.error, "contact_organization_links")
      ? deriveContactOrganizationLinksFromContacts(contactsResult.data ?? [])
      : null
    : contactOrganizationLinksResult.data ?? [];

  if (!contactOrganizationLinks) {
    throw contactOrganizationLinksResult.error;
  }

  const contactRoles = contactRolesResult.error
    ? isMissingSchemaError(contactRolesResult.error, "contact_roles")
      ? deriveContactRolesFromContacts(contactsResult.data ?? [])
      : null
    : contactRolesResult.data ?? [];

  if (!contactRoles) {
    throw contactRolesResult.error;
  }

  const externalOrganizations = externalOrganizationsResult.error
    ? isMissingSchemaError(externalOrganizationsResult.error, "external_organizations")
      ? []
      : null
    : externalOrganizationsResult.data ?? [];

  if (!externalOrganizations) {
    throw externalOrganizationsResult.error;
  }

  const organizationExternalMembershipRequirements = organizationExternalMembershipRequirementsResult.error
    ? isMissingSchemaError(organizationExternalMembershipRequirementsResult.error, "organization_external_membership_requirements")
      ? []
      : null
    : organizationExternalMembershipRequirementsResult.data ?? [];

  if (!organizationExternalMembershipRequirements) {
    throw organizationExternalMembershipRequirementsResult.error;
  }

  const organizationMembershipTypes = organizationMembershipTypesResult.error
    ? isMissingSchemaError(organizationMembershipTypesResult.error, "organization_membership_types")
      ? []
      : null
    : organizationMembershipTypesResult.data ?? [];

  if (!organizationMembershipTypes) {
    throw organizationMembershipTypesResult.error;
  }

  const contactOrganizationMemberships = contactOrganizationMembershipsResult.error
    ? isMissingSchemaError(contactOrganizationMembershipsResult.error, "contact_organization_memberships")
      ? []
      : null
    : contactOrganizationMembershipsResult.data ?? [];

  if (!contactOrganizationMemberships) {
    throw contactOrganizationMembershipsResult.error;
  }

  const organizationProducts = organizationProductsResult.error
    ? isMissingSchemaError(organizationProductsResult.error, "organization_products")
      ? []
      : null
    : organizationProductsResult.data ?? [];

  if (!organizationProducts) {
    throw organizationProductsResult.error;
  }

  const manualSales = manualSalesResult.error
    ? isMissingSchemaError(manualSalesResult.error, "manual_sales")
      ? []
      : null
    : manualSalesResult.data ?? [];

  if (!manualSales) {
    throw manualSalesResult.error;
  }

  const contactExternalMemberships = contactExternalMembershipsResult.error
    ? isMissingSchemaError(contactExternalMembershipsResult.error, "contact_external_memberships")
      ? []
      : null
    : contactExternalMembershipsResult.data ?? [];

  if (!contactExternalMemberships) {
    throw contactExternalMembershipsResult.error;
  }

  const horseExternalMemberships = horseExternalMembershipsResult.error
    ? isMissingSchemaError(horseExternalMembershipsResult.error, "horse_external_memberships")
      ? []
      : null
    : horseExternalMembershipsResult.data ?? [];

  if (!horseExternalMemberships) {
    throw horseExternalMembershipsResult.error;
  }

  const horseHealthDocuments = horseHealthDocumentsResult.error
    ? isMissingSchemaError(horseHealthDocumentsResult.error, "horse_health_documents")
      ? []
      : null
    : horseHealthDocumentsResult.data ?? [];

  if (!horseHealthDocuments) {
    throw horseHealthDocumentsResult.error;
  }

  if (horsesResult.error) {
    throw horsesResult.error;
  }

  const horseOrganizationLinks = horseOrganizationLinksResult.error
    ? isMissingSchemaError(horseOrganizationLinksResult.error, "horse_organization_links")
      ? deriveHorseOrganizationLinksFromHorses(horsesResult.data ?? [])
      : null
    : horseOrganizationLinksResult.data ?? [];

  if (!horseOrganizationLinks) {
    throw horseOrganizationLinksResult.error;
  }

  if (horseContactsResult.error) {
    throw horseContactsResult.error;
  }

  const organizationBackNumbers = organizationBackNumbersResult.error
    ? isMissingSchemaError(organizationBackNumbersResult.error, "organization_back_numbers")
      ? []
      : null
    : organizationBackNumbersResult.data ?? [];

  if (!organizationBackNumbers) {
    throw organizationBackNumbersResult.error;
  }

  if (classesResult.error) {
    throw classesResult.error;
  }

  const classTemplates = classTemplatesResult.error
    ? isMissingSchemaError(classTemplatesResult.error, "class_templates")
      ? []
      : null
    : classTemplatesResult.data ?? [];

  if (!classTemplates) {
    throw classTemplatesResult.error;
  }

  const classTemplateDivisions = classTemplateDivisionsResult.error
    ? isMissingSchemaError(classTemplateDivisionsResult.error, "class_template_divisions")
      ? []
      : null
    : classTemplateDivisionsResult.data ?? [];

  if (!classTemplateDivisions) {
    throw classTemplateDivisionsResult.error;
  }

  if (divisionsResult.error) {
    throw divisionsResult.error;
  }

  const sanctioningBodies = sanctioningBodiesResult.error
    ? isMissingSchemaError(sanctioningBodiesResult.error, "sanctioning_bodies")
      ? []
      : null
    : sanctioningBodiesResult.data ?? [];

  if (!sanctioningBodies) {
    throw sanctioningBodiesResult.error;
  }

  if (entriesResult.error) {
    throw entriesResult.error;
  }

  if (stallOptionsResult.error) {
    throw stallOptionsResult.error;
  }

  if (stallBookingsResult.error) {
    throw stallBookingsResult.error;
  }

  if (invoicesResult.error) {
    throw invoicesResult.error;
  }

  if (invoiceLineItemsResult.error) {
    throw invoiceLineItemsResult.error;
  }

  const showAnnouncements = showAnnouncementsResult.error
    ? isMissingSchemaError(showAnnouncementsResult.error, "show_announcements")
      ? []
      : (() => { throw showAnnouncementsResult.error; })()
    : showAnnouncementsResult.data ?? [];
  const showScorePaidWarmups = showScorePaidWarmupsResult.error
    ? isMissingShowScoreSchemaError(showScorePaidWarmupsResult.error)
      ? []
      : (() => { throw showScorePaidWarmupsResult.error; })()
    : showScorePaidWarmupsResult.data ?? [];
  const scoredRuns = scoredRunsResult.error
    ? isMissingSchemaError(scoredRunsResult.error, "scored_runs")
      ? []
      : (() => { throw scoredRunsResult.error; })()
    : scoredRunsResult.data ?? [];
  const blockRunEntries = blockRunEntriesResult.error
    ? isMissingSchemaError(blockRunEntriesResult.error, "block_run_entries")
      ? []
      : (() => { throw blockRunEntriesResult.error; })()
    : blockRunEntriesResult.data ?? [];
  const blockRunClassEntries = blockRunClassEntriesResult.error
    ? isMissingSchemaError(blockRunClassEntriesResult.error, "block_run_class_entries")
      ? []
      : (() => { throw blockRunClassEntriesResult.error; })()
    : blockRunClassEntriesResult.data ?? [];
  const entryResults = entryResultsResult.error
    ? isMissingSchemaError(entryResultsResult.error, "entry_results")
      ? []
      : (() => { throw entryResultsResult.error; })()
    : entryResultsResult.data ?? [];
  const payoutSchedules = payoutSchedulesResult.error
    ? isMissingSchemaError(payoutSchedulesResult.error, "payout_schedules")
      ? []
      : (() => { throw payoutSchedulesResult.error; })()
    : payoutSchedulesResult.data ?? [];
  const payoutScheduleBrackets = payoutScheduleBracketsResult.error
    ? isMissingSchemaError(payoutScheduleBracketsResult.error, "payout_schedule_brackets")
      ? []
      : (() => { throw payoutScheduleBracketsResult.error; })()
    : payoutScheduleBracketsResult.data ?? [];
  const payoutCalculations = payoutCalculationsResult.error
    ? isMissingSchemaError(payoutCalculationsResult.error, "payout_calculations")
      ? []
      : (() => { throw payoutCalculationsResult.error; })()
    : payoutCalculationsResult.data ?? [];
  const payoutAwards = payoutAwardsResult.error
    ? isMissingSchemaError(payoutAwardsResult.error, "payout_awards")
      ? []
      : (() => { throw payoutAwardsResult.error; })()
    : payoutAwardsResult.data ?? [];
  const entryImportBatches = entryImportBatchesResult.error
    ? isMissingSchemaError(entryImportBatchesResult.error, "entry_import_batches")
      ? []
      : (() => { throw entryImportBatchesResult.error; })()
    : entryImportBatchesResult.data ?? [];

  return {
    profile,
    isPlatformAdmin,
    organizations: organizationsResult.data ?? [],
    organizationMembers: organizationMembersResult.data ?? [],
    shows: showsResult.data ?? [],
    showDays: showDaysResult.data ?? [],
    showAnnouncements,
    showScoreClassSetups,
    scoredRuns,
    blockRunEntries,
    blockRunClassEntries,
    entryResults,
    payoutSchedules,
    payoutScheduleBrackets,
    payoutCalculations,
    payoutAwards,
    showScorePaidWarmups,
    entryImportBatches,
    contacts: contactsResult.data ?? [],
    contactOrganizationLinks,
    contactRoles,
    externalOrganizations,
    organizationExternalMembershipRequirements,
    organizationMembershipTypes,
    contactOrganizationMemberships,
    organizationProducts,
    manualSales,
    contactExternalMemberships,
    horseExternalMemberships,
    horseHealthDocuments,
    horses: horsesResult.data ?? [],
    horseOrganizationLinks,
    horseContacts: horseContactsResult.data ?? [],
    organizationBackNumbers,
    classes: classesResult.data ?? [],
    classTemplates,
    classTemplateDivisions,
    divisions: divisionsResult.data ?? [],
    sanctioningBodies,
    entries: entriesResult.data ?? [],
    stallOptions: stallOptionsResult.data ?? [],
    stallBookings: stallBookingsResult.data ?? [],
    invoices: invoicesResult.data ?? [],
    invoiceLineItems: invoiceLineItemsResult.data ?? [],
  };
}

export type PublicShowSummary = {
  id: string;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: Show["status"];
  default_currency: string | null;
  organization_name: string;
};

export async function fetchPublicShows(): Promise<PublicShowSummary[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("shows")
    .select("id, name, slug, start_date, end_date, location, city, state, country, status, default_currency, organizations(name)")
    .eq("is_public", true)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    organization_name: row.organizations?.name ?? "",
    organizations: undefined,
  }));
}

export type PublicShowContext = {
  show: Show;
  organization: Organization;
  showDays: ShowDay[];
  classes: ClassRecord[];
  divisions: Division[];
  payoutCalculations: PayoutCalculation[];
  payoutAwards: PayoutAward[];
  stallOptions: StallOption[];
  announcements: ShowAnnouncement[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  externalOrganizations: ExternalOrganization[];
  sanctioningBodies: SanctioningBody[];
};

export async function fetchPublicShow(slug: string): Promise<PublicShowContext | null> {
  const client = requireSupabase();

  const { data: show, error: showError } = await client
    .from("shows")
    .select("*")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle<Show>();

  if (showError) throw showError;
  if (!show) return null;

  const [
    orgResult,
    daysResult,
    classesResult,
    stallOptionsResult,
    announcementsResult,
    membershipReqResult,
    externalOrgsResult,
    sanctioningBodiesResult,
    payoutCalculationsResult,
  ] = await Promise.all([
    client.from("organizations").select("*").eq("id", show.organization_id).single<Organization>(),
    client.from("show_days").select("*").eq("show_id", show.id).order("sort_order", { ascending: true }).returns<ShowDay[]>(),
    client.from("classes").select("*").eq("show_id", show.id).eq("is_public", true).order("sort_order", { ascending: true }).returns<ClassRecord[]>(),
    client.from("stall_options").select("*").eq("show_id", show.id).order("price", { ascending: true }).returns<StallOption[]>(),
    client.from("show_announcements").select("*").eq("show_id", show.id).order("created_at", { ascending: false }).returns<ShowAnnouncement[]>(),
    client.from("organization_external_membership_requirements").select("*").eq("organization_id", show.organization_id).returns<OrganizationExternalMembershipRequirement[]>(),
    client.from("external_organizations").select("*").order("name", { ascending: true }).returns<ExternalOrganization[]>(),
    client.from("sanctioning_bodies").select("*").order("name", { ascending: true }).returns<SanctioningBody[]>(),
    client.from("payout_calculations").select("*").eq("show_id", show.id).eq("status", "published").order("published_at", { ascending: false }).returns<PayoutCalculation[]>(),
  ]);

  if (orgResult.error) throw orgResult.error;
  if (daysResult.error) throw daysResult.error;
  if (classesResult.error) throw classesResult.error;

  const classIds = (classesResult.data ?? []).map((c) => c.id);
  const divisionsResult = classIds.length
    ? await client.from("divisions").select("*").in("class_id", classIds).returns<Division[]>()
    : { data: [], error: null };

  if (divisionsResult.error) throw divisionsResult.error;

  const payoutCalculations = payoutCalculationsResult.error
    ? isMissingSchemaError(payoutCalculationsResult.error, "payout_calculations")
      ? []
      : (() => { throw payoutCalculationsResult.error; })()
    : payoutCalculationsResult.data ?? [];
  const payoutCalculationIds = payoutCalculations.map((calculation) => calculation.id);
  const payoutAwardsResult = payoutCalculationIds.length
    ? await client.from("payout_awards").select("*").in("calculation_id", payoutCalculationIds).order("rank", { ascending: true }).returns<PayoutAward[]>()
    : { data: [], error: null };

  const payoutAwards = payoutAwardsResult.error
    ? isMissingSchemaError(payoutAwardsResult.error, "payout_awards")
      ? []
      : (() => { throw payoutAwardsResult.error; })()
    : payoutAwardsResult.data ?? [];

  return {
    show,
    organization: orgResult.data,
    showDays: daysResult.data ?? [],
    classes: classesResult.data ?? [],
    divisions: divisionsResult.data ?? [],
    payoutCalculations,
    payoutAwards,
    stallOptions: stallOptionsResult.data ?? [],
    announcements: announcementsResult.data ?? [],
    membershipRequirements: membershipReqResult.data ?? [],
    externalOrganizations: externalOrgsResult.data ?? [],
    sanctioningBodies: sanctioningBodiesResult.data ?? [],
  };
}

export async function updateUserProfile(id: string, input: UserProfileUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("user_profiles")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<UserProfile>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createShowAnnouncement(input: ShowAnnouncementInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("show_announcements")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      title: input.title.trim(),
      body: input.body.trim(),
      created_by_user_id: input.created_by_user_id || null,
    })
    .select("*")
    .single<ShowAnnouncement>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateShowAnnouncement(id: string, input: Pick<ShowAnnouncementInput, "title" | "body">) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("show_announcements")
    .update({ title: input.title.trim(), body: input.body.trim() })
    .eq("id", id)
    .select("*")
    .single<ShowAnnouncement>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteShowAnnouncement(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("show_announcements").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createOrganization(profileId: string, input: OrganizationInput) {
  const client = requireSupabase();
  const organizationId = crypto.randomUUID();
  const { error: organizationError } = await client.from("organizations").insert({
    id: organizationId,
    name: input.name,
    short_name: input.short_name || null,
    slug: slugify(input.slug || input.name),
    primary_contact_email: input.primary_contact_email || null,
    timezone: input.timezone || "America/Toronto",
    currency: input.currency || "CAD",
    created_by_user_id: profileId,
  });

  if (organizationError) {
    throw organizationError;
  }

  const { error: memberError } = await client.from("organization_members").insert({
    organization_id: organizationId,
    user_id: profileId,
    role: "admin",
  });

  if (memberError) {
    throw memberError;
  }

  const { data: organization, error: reloadError } = await client
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single<Organization>();

  if (reloadError) {
    throw reloadError;
  }

  return organization;
}

export async function updateOrganizationHealthSettings(
  id: string,
  input: OrganizationSettingsInput,
) {
  const client = requireSupabase();
  const payload = {
    ...input,
    name: input.name?.trim(),
    short_name: nullableTrim(input.short_name),
    primary_contact_name: nullableTrim(input.primary_contact_name),
    primary_contact_email: nullableTrim(input.primary_contact_email),
    primary_contact_phone: nullableTrim(input.primary_contact_phone),
    billing_name: nullableTrim(input.billing_name),
    billing_email: nullableTrim(input.billing_email),
    billing_phone: nullableTrim(input.billing_phone),
    address: nullableTrim(input.address),
    address_line2: nullableTrim(input.address_line2),
    city: nullableTrim(input.city),
    state: normalizeState(input.state),
    zip_code: nullableTrim(input.zip_code),
    country: normalizeCountry(input.country),
    currency: input.currency?.trim().toUpperCase(),
    tax_rate: input.tax_rate === undefined ? undefined : normalizeTaxRate(input.tax_rate),
    tax_name: nullableTrim(input.tax_name),
    tax_number: nullableTrim(input.tax_number),
    secondary_tax_name: nullableTrim(input.secondary_tax_name),
    secondary_tax_number: nullableTrim(input.secondary_tax_number),
  };
  const { data, error } = await client
    .from("organizations")
    .update(cleanPayload(payload))
    .eq("id", id)
    .select("*")
    .single<Organization>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createShow(input: ShowInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("shows")
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      slug: slugify(input.slug || input.name),
      start_date: input.start_date,
      end_date: input.end_date,
      venue: input.venue || null,
      location: input.location || null,
      status: input.status ?? "draft",
      reservation_payment_policy: input.reservation_payment_policy ?? "pay_at_booking",
      entry_payment_policy: input.entry_payment_policy ?? "card_on_file_preauth",
      entry_preauth_timing: input.entry_preauth_timing ?? "show_start",
      entry_preauth_time: input.entry_preauth_time ?? "08:00",
      entry_settlement_timing: input.entry_settlement_timing ?? "show_end",
      entry_settlement_due_time: input.entry_settlement_due_time ?? "14:00",
      entry_auto_capture_enabled: input.entry_auto_capture_enabled ?? true,
      entry_preauth_amount_strategy: input.entry_preauth_amount_strategy ?? "entry_balance",
      entry_preauth_margin_percent: input.entry_preauth_margin_percent ?? 0,
    })
    .select("*")
    .single<Show>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateShow(id: string, input: ShowUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("shows")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<Show>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createContact(input: ContactInput) {
  const client = requireSupabase();
  const normalizedEmail = normalizeEmail(input.email);
  const roles = uniqueRoles([input.type, ...(input.roles ?? [])]);

  if (normalizedEmail) {
    const existing = await findExistingContactByEmail(normalizedEmail);

    if (existing) {
      const contact = await enrichExistingContact(existing, input);
      await ensureContactOrganizationLink({
        organization_id: input.organization_id,
        contact_id: contact.id,
        source: "manual",
        created_by_user_id: input.created_by_user_id,
      });
      await ensureContactRoles({
        organization_id: input.organization_id,
        contact_id: contact.id,
        roles,
        source: input.roles?.length ? "manual" : "contact_type",
      });
      await syncContactExternalMemberships(contact.id, input.external_memberships);

      return contact;
    }
  }

  const { data, error } = await client
    .from("contacts")
    .insert({
      organization_id: input.organization_id,
      type: input.type,
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      email: normalizedEmail,
      phone: input.phone?.trim() || null,
      barn_name: input.barn_name?.trim() || null,
      linked_user_id: input.linked_user_id || null,
      created_by_user_id: input.created_by_user_id || null,
      address: input.address?.trim() || null,
      address_line2: input.address_line2?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zip_code: input.zip_code?.trim() || null,
      country: input.country?.trim() || null,
      date_of_birth: input.date_of_birth || null,
    })
    .select("*")
    .single<Contact>();

  if (error) {
    if (error.code === "23505" && normalizedEmail) {
      const reusedContact = await reuseContactByEmail(input, normalizedEmail, roles);

      if (reusedContact) {
        await syncContactExternalMemberships(reusedContact.id, input.external_memberships);

        return reusedContact;
      }

      let existing = await findExistingContactByEmail(normalizedEmail);

      if (!existing) {
        await claimContactsForCurrentUser();
        existing = await findExistingContactByEmail(normalizedEmail);
      }

      if (existing) {
        const contact = await enrichExistingContact(existing, input);
        await ensureContactOrganizationLink({
          organization_id: input.organization_id,
          contact_id: contact.id,
          source: "manual",
          created_by_user_id: input.created_by_user_id,
        });
        await ensureContactRoles({
          organization_id: input.organization_id,
          contact_id: contact.id,
          roles,
          source: input.roles?.length ? "manual" : "contact_type",
        });
        await syncContactExternalMemberships(contact.id, input.external_memberships);

        return contact;
      }
    }

    throw error;
  }

  await ensureContactRoles({
    organization_id: data.organization_id,
    contact_id: data.id,
    roles,
    source: input.roles?.length ? "manual" : "contact_type",
  });
  await ensureContactOrganizationLink({
    organization_id: input.organization_id,
    contact_id: data.id,
    source: "created_here",
    created_by_user_id: input.created_by_user_id,
  });
  await syncContactExternalMemberships(data.id, input.external_memberships);

  return data;
}

export async function updateContact(id: string, input: ContactUpdateInput) {
  const client = requireSupabase();
  const { external_memberships: externalMemberships, ...contactInput } = input;
  const payload = {
    ...contactInput,
    first_name: contactInput.first_name?.trim(),
    last_name: contactInput.last_name?.trim(),
    email: contactInput.email === undefined ? undefined : normalizeEmail(contactInput.email),
    phone: contactInput.phone === undefined ? undefined : contactInput.phone?.trim() || null,
    barn_name: contactInput.barn_name === undefined ? undefined : contactInput.barn_name?.trim() || null,
  };
  const { data, error } = await client
    .from("contacts")
    .update(cleanPayload(payload))
    .eq("id", id)
    .select("*")
    .single<Contact>();

  if (error) {
    throw error;
  }

  if (input.type) {
    await ensureContactRole({
      organization_id: data.organization_id,
      contact_id: data.id,
      role: input.type,
      source: "contact_type",
    });
  }

  await syncContactExternalMemberships(data.id, externalMemberships);

  return data;
}

type CountResult = {
  count: number | null;
  error: unknown;
};

function exactCount(result: CountResult) {
  if (result.error) {
    throw result.error;
  }

  return result.count ?? 0;
}

function pluralizedReference(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export async function deleteContact(id: string) {
  const client = requireSupabase();
  const [ownedHorsesResult, entriesOwnerOrPayerResult, entriesRiderResult, stallBookingsResult, invoicesResult] = await Promise.all([
    client.from("horses").select("id", { count: "exact", head: true }).eq("primary_owner_contact_id", id),
    client.from("entries").select("id", { count: "exact", head: true }).or(`owner_contact_id.eq.${id},payer_contact_id.eq.${id}`),
    client.from("entries").select("id", { count: "exact", head: true }).eq("rider_contact_id", id),
    client.from("stall_bookings").select("id", { count: "exact", head: true }).or(`booker_contact_id.eq.${id},payer_contact_id.eq.${id}`),
    client.from("invoices").select("id", { count: "exact", head: true }).eq("payer_contact_id", id),
  ]);
  const blockers = [
    {
      count: exactCount(ownedHorsesResult),
      singular: "cheval comme proprietaire principal",
      plural: "chevaux comme proprietaire principal",
    },
    {
      count: exactCount(entriesOwnerOrPayerResult),
      singular: "inscription comme proprietaire/payeur",
      plural: "inscriptions comme proprietaire/payeur",
    },
    {
      count: exactCount(stallBookingsResult),
      singular: "reservation comme reservataire/payeur",
      plural: "reservations comme reservataire/payeur",
    },
    {
      count: exactCount(invoicesResult),
      singular: "facture comme payeur",
      plural: "factures comme payeur",
    },
  ]
    .filter((reference) => reference.count > 0)
    .map((reference) => pluralizedReference(reference.count, reference.singular, reference.plural));

  if (blockers.length) {
    throw new Error(`Impossible de supprimer ce contact pour l'instant: il est encore utilise par ${blockers.join(", ")}.`);
  }

  if (exactCount(entriesRiderResult)) {
    const { error: detachRiderError } = await client.from("entries").update({ rider_contact_id: null }).eq("rider_contact_id", id);

    if (detachRiderError) {
      throw detachRiderError;
    }
  }

  const { error } = await client.from("contacts").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function setOrganizationExternalMembershipRequirement(input: {
  organization_id: string;
  external_organization_id: string;
  contact_type: Contact["type"];
  is_required: boolean;
}) {
  const client = requireSupabase();

  if (!input.is_required) {
    const { error } = await client
      .from("organization_external_membership_requirements")
      .delete()
      .eq("organization_id", input.organization_id)
      .eq("external_organization_id", input.external_organization_id)
      .eq("contact_type", input.contact_type);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await client.from("organization_external_membership_requirements").upsert(
    {
      organization_id: input.organization_id,
      external_organization_id: input.external_organization_id,
      contact_type: input.contact_type,
      is_required: true,
    },
    { onConflict: "organization_id,external_organization_id,contact_type" },
  );

  if (error) {
    throw error;
  }
}

function normalizeMembershipTypeCode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || null;
}

function normalizeOrganizationMembershipTypeInput(
  input: OrganizationMembershipTypeInput,
) {
  return {
    organization_id: input.organization_id,
    name: input.name.trim(),
    code: normalizeMembershipTypeCode(input.code),
    description: input.description?.trim() || null,
    season_year: Number(input.season_year),
    price: Math.max(0, Number(input.price) || 0),
    tax_applicable: input.tax_applicable ?? true,
    valid_from: input.valid_from,
    valid_until: input.valid_until,
    is_active: input.is_active ?? true,
  };
}

function normalizeOrganizationMembershipTypeUpdateInput(
  input: OrganizationMembershipTypeUpdateInput,
) {
  const row: Record<string, unknown> = {};

  if (input.name !== undefined) row.name = input.name.trim();
  if (input.code !== undefined) row.code = normalizeMembershipTypeCode(input.code);
  if (input.description !== undefined) {
    row.description = input.description?.trim() || null;
  }
  if (input.season_year !== undefined) row.season_year = Number(input.season_year);
  if (input.price !== undefined) row.price = Math.max(0, Number(input.price) || 0);
  if (input.tax_applicable !== undefined) row.tax_applicable = input.tax_applicable;
  if (input.valid_from !== undefined) row.valid_from = input.valid_from;
  if (input.valid_until !== undefined) row.valid_until = input.valid_until;
  if (input.is_active !== undefined) row.is_active = input.is_active;

  return row;
}

export async function createOrganizationMembershipType(
  input: OrganizationMembershipTypeInput,
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_membership_types")
    .insert(normalizeOrganizationMembershipTypeInput(input))
    .select("*")
    .single<OrganizationMembershipType>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateOrganizationMembershipType(
  id: string,
  input: OrganizationMembershipTypeUpdateInput,
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_membership_types")
    .update(normalizeOrganizationMembershipTypeUpdateInput(input))
    .eq("id", id)
    .select("*")
    .single<OrganizationMembershipType>();

  if (error) {
    throw error;
  }

  return data;
}

function normalizeContactOrganizationMembershipInput(input: ContactOrganizationMembershipInput) {
  return {
    organization_id: input.organization_id,
    contact_id: input.contact_id,
    membership_type_id: input.membership_type_id,
    show_id: input.show_id ?? null,
    payer_contact_id: input.payer_contact_id ?? input.contact_id,
    membership_number: input.membership_number?.trim() || null,
    status: input.status ?? "active",
    notes: input.notes?.trim() || null,
    sold_by_user_id: input.sold_by_user_id,
  };
}

export async function createContactOrganizationMembership(
  input: ContactOrganizationMembershipInput,
) {
  const client = requireSupabase();
  const normalizedInput = normalizeContactOrganizationMembershipInput(input);

  await ensureContactOrganizationLink({
    organization_id: normalizedInput.organization_id,
    contact_id: normalizedInput.contact_id,
    source: "claimed_account",
    created_by_user_id: normalizedInput.sold_by_user_id,
  });

  if (normalizedInput.payer_contact_id && normalizedInput.payer_contact_id !== normalizedInput.contact_id) {
    await ensureContactOrganizationLink({
      organization_id: normalizedInput.organization_id,
      contact_id: normalizedInput.payer_contact_id,
      source: "claimed_account",
      created_by_user_id: normalizedInput.sold_by_user_id,
    });
  }

  const { data, error } = await client
    .from("contact_organization_memberships")
    .insert(normalizedInput)
    .select("*")
    .single<ContactOrganizationMembership>();

  if (error) {
    throw error;
  }

  return data;
}

function normalizeProductCode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || null;
}

function normalizeOrganizationProductInput(input: OrganizationProductInput) {
  return {
    organization_id: input.organization_id,
    name: input.name.trim(),
    code: normalizeProductCode(input.code),
    description: input.description?.trim() || null,
    category: input.category,
    default_price: Math.max(0, Number(input.default_price) || 0),
    tax_applicable: input.tax_applicable ?? true,
    is_active: input.is_active ?? true,
  };
}

function normalizeOrganizationProductUpdateInput(input: OrganizationProductUpdateInput) {
  const row: Record<string, unknown> = {};

  if (input.name !== undefined) row.name = input.name.trim();
  if (input.code !== undefined) row.code = normalizeProductCode(input.code);
  if (input.description !== undefined) row.description = input.description?.trim() || null;
  if (input.category !== undefined) row.category = input.category;
  if (input.default_price !== undefined) row.default_price = Math.max(0, Number(input.default_price) || 0);
  if (input.tax_applicable !== undefined) row.tax_applicable = input.tax_applicable;
  if (input.is_active !== undefined) row.is_active = input.is_active;

  return row;
}

export async function createOrganizationProduct(input: OrganizationProductInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_products")
    .insert(normalizeOrganizationProductInput(input))
    .select("*")
    .single<OrganizationProduct>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateOrganizationProduct(
  id: string,
  input: OrganizationProductUpdateInput,
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_products")
    .update(normalizeOrganizationProductUpdateInput(input))
    .eq("id", id)
    .select("*")
    .single<OrganizationProduct>();

  if (error) {
    throw error;
  }

  return data;
}

function normalizeManualSaleInput(input: ManualSaleInput) {
  return {
    organization_id: input.organization_id,
    product_id: input.product_id ?? null,
    show_id: input.show_id ?? null,
    payer_contact_id: input.payer_contact_id,
    sold_by_user_id: input.sold_by_user_id,
    status: input.status ?? "active",
    description: input.description.trim(),
    quantity: Math.max(0.01, Number(input.quantity) || 1),
    unit_price: Math.max(0, Number(input.unit_price) || 0),
    tax_applicable: input.tax_applicable ?? true,
    source_payload: input.source_payload ?? {},
  };
}

export async function createManualSale(input: ManualSaleInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("manual_sales")
    .insert(normalizeManualSaleInput(input))
    .select("*")
    .single<ManualSale>();

  if (error) {
    throw error;
  }

  return data;
}

export async function cancelManualSale(id: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("manual_sales")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("*")
    .single<ManualSale>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createHorse(input: HorseInput) {
  const client = requireSupabase();
  const birthYear = input.birth_year ?? birthYearFromDate(input.date_of_birth ?? null);
  await ensureContactOrganizationLink({
    organization_id: input.organization_id,
    contact_id: input.primary_owner_contact_id,
    source: "horse",
    created_by_user_id: input.created_by_user_id,
  });

  if (input.agent_contact_id && input.agent_contact_id !== input.primary_owner_contact_id) {
    await ensureContactOrganizationLink({
      organization_id: input.organization_id,
      contact_id: input.agent_contact_id,
      source: "horse",
      created_by_user_id: input.created_by_user_id,
    });
  }

  const { data: horse, error: horseError } = await client
    .from("horses")
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      primary_owner_contact_id: input.primary_owner_contact_id,
      breed: input.breed || null,
      color: input.color || null,
      gender: input.gender || null,
      date_of_birth: input.date_of_birth || null,
      birth_year: birthYear || null,
      registration_number: input.registration_number || null,
      created_by_user_id: input.created_by_user_id || null,
    })
    .select("*")
    .single<Horse>();

  if (horseError) {
    throw horseError;
  }

  await ensureHorseOrganizationLink({
    organization_id: input.organization_id,
    horse_id: horse.id,
    source: "created_here",
    created_by_user_id: input.created_by_user_id,
  });

  await upsertHorseContact({
    organization_id: input.organization_id,
    horse_id: horse.id,
    contact_id: input.primary_owner_contact_id,
    role: "owner",
  });

  await ensureContactRole({
    organization_id: input.organization_id,
    contact_id: input.primary_owner_contact_id,
    role: "owner",
    source: "horse",
  });

  if (input.agent_contact_id && input.agent_contact_id !== input.primary_owner_contact_id) {
    await upsertHorseContact({
      organization_id: input.organization_id,
      horse_id: horse.id,
      contact_id: input.agent_contact_id,
      role: "agent",
    });
    await ensureContactRole({
      organization_id: input.organization_id,
      contact_id: input.agent_contact_id,
      role: "agent",
      source: "horse",
    });
  }

  await syncHorseExternalMemberships(horse.id, input.external_memberships);

  return horse;
}

export async function updateHorse(id: string, input: HorseUpdateInput) {
  const client = requireSupabase();
  const { agent_contact_id: agentContactId, external_memberships: externalMemberships, ...horseInput } = input;
  const existingHorse = await getHorseById(id);
  const normalizedHorseInput = {
    ...horseInput,
    birth_year: horseInput.birth_year ?? (horseInput.date_of_birth !== undefined ? birthYearFromDate(horseInput.date_of_birth) : undefined),
  };

  if (input.primary_owner_contact_id) {
    await ensureContactOrganizationLink({
      organization_id: existingHorse.organization_id,
      contact_id: input.primary_owner_contact_id,
      source: "horse",
    });
  }

  if (agentContactId && agentContactId !== input.primary_owner_contact_id) {
    await ensureContactOrganizationLink({
      organization_id: existingHorse.organization_id,
      contact_id: agentContactId,
      source: "horse",
    });
  }

  const { data, error } = await client
    .from("horses")
    .update(cleanPayload(normalizedHorseInput))
    .eq("id", id)
    .select("*")
    .single<Horse>();

  if (error) {
    throw error;
  }

  if (input.primary_owner_contact_id) {
    const { error: deleteOwnerContactsError } = await client.from("horse_contacts").delete().eq("horse_id", id).eq("role", "owner").neq("contact_id", data.primary_owner_contact_id);
    if (deleteOwnerContactsError) {
      throw deleteOwnerContactsError;
    }

    await upsertHorseContact({
      organization_id: data.organization_id,
      horse_id: data.id,
      contact_id: input.primary_owner_contact_id,
      role: "owner",
    });
    await ensureContactRole({
      organization_id: data.organization_id,
      contact_id: input.primary_owner_contact_id,
      role: "owner",
      source: "horse",
    });
  }

  if (agentContactId !== undefined) {
    const { error: deleteAgentContactsError } = await client.from("horse_contacts").delete().eq("horse_id", id).eq("role", "agent");
    if (deleteAgentContactsError) {
      throw deleteAgentContactsError;
    }

    if (agentContactId && agentContactId !== data.primary_owner_contact_id) {
      await upsertHorseContact({
        organization_id: data.organization_id,
        horse_id: data.id,
        contact_id: agentContactId,
        role: "agent",
      });
      await ensureContactRole({
        organization_id: data.organization_id,
        contact_id: agentContactId,
        role: "agent",
        source: "horse",
      });
    }
  }

  await syncHorseExternalMemberships(data.id, externalMemberships);

  return data;
}

export async function deleteHorse(id: string) {
  const client = requireSupabase();

  const { error: bookingsError } = await client.from("stall_bookings").delete().eq("horse_id", id);
  if (bookingsError) {
    throw bookingsError;
  }

  const { error: entriesError } = await client.from("entries").delete().eq("horse_id", id);
  if (entriesError) {
    throw entriesError;
  }

  const { error: horseContactsError } = await client.from("horse_contacts").delete().eq("horse_id", id);
  if (horseContactsError) {
    throw horseContactsError;
  }

  const { error } = await client.from("horses").delete().eq("id", id);
  if (error) {
    throw error;
  }
}

type GvlCogginsVerification = {
  error?: string;
  status?: "verified" | "pending_review" | "rejected";
  source_url?: string | null;
  certificate_number?: string | null;
  issuer_name?: string | null;
  test_or_administered_on?: string | null;
  result?: string | null;
  horse_name?: string | null;
  horse_date_of_birth?: string | null;
  horse_external_id?: string | null;
  verification_source?: HorseHealthDocument["verification_source"];
  verified_at?: string | null;
  warnings?: string[];
  payload?: Record<string, unknown>;
};

export type NrhaEligibilityReason = {
  action?: string;
  id?: number;
  message?: string;
  year?: number;
};

export type NrhaEligibilityVerification = {
  error?: string;
  status?: "eligible" | "ineligible";
  eligible?: boolean;
  parameters?: Record<string, unknown> | null;
  reasons?: NrhaEligibilityReason[];
  payload?: Record<string, unknown>;
};

export async function verifyNrhaEligibility(input: {
  classCode: number;
  competitionLicenseNumber: number;
  countryId?: number | null;
  date: string;
  isEuroEvent?: boolean;
  memberNumber: number;
}) {
  const client = requireSupabase();
  const { data: verification, error: invokeError, response } = await client.functions.invoke<NrhaEligibilityVerification>("nrha-eligibility", {
    body: input,
  });

  if (invokeError) {
    throw new Error(await nrhaEligibilityInvokeErrorMessage(invokeError, response));
  }

  if (!verification) {
    throw new Error("Validation NRHA impossible: aucune reponse recue.");
  }

  if (verification.error) {
    throw new Error(verification.error);
  }

  return verification;
}

type NrhaEligibilityErrorPayload = {
  error?: unknown;
  nrha_status?: unknown;
  payload?: unknown;
};

async function nrhaEligibilityInvokeErrorMessage(invokeError: unknown, response?: Response) {
  const fallbackMessage = invokeError instanceof Error ? invokeError.message : "Erreur inconnue.";
  const responseStatus = response?.status;
  const payload = response ? await readNrhaEligibilityErrorPayload(response) : null;

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const errorPayload = payload as NrhaEligibilityErrorPayload;
    const edgeMessage = typeof errorPayload.error === "string" ? errorPayload.error : null;
    const nrhaStatus = typeof errorPayload.nrha_status === "number" ? errorPayload.nrha_status : null;
    const statusParts = [
      responseStatus ? `code Edge Function ${responseStatus}` : null,
      nrhaStatus ? `code NRHA ${nrhaStatus}` : null,
    ].filter(Boolean);
    const detailParts = [
      statusParts.length ? statusParts.join(", ") : null,
      edgeMessage,
      nrhaPayloadSummary(errorPayload.payload),
    ].filter(Boolean);

    if (detailParts.length) {
      return `Validation NRHA impossible: ${detailParts.join(" - ")}`;
    }
  }

  if (responseStatus) {
    return `Validation NRHA impossible: code Edge Function ${responseStatus} - ${fallbackMessage}`;
  }

  return `Validation NRHA impossible: ${fallbackMessage}`;
}

async function readNrhaEligibilityErrorPayload(response: Response) {
  try {
    const responseCopy = response.clone();
    const contentType = responseCopy.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return await responseCopy.json();
    }

    return await responseCopy.text();
  } catch {
    return null;
  }
}

function nrhaPayloadSummary(payload: unknown) {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    const trimmedPayload = payload.trim();
    return trimmedPayload ? trimmedPayload.slice(0, 180) : null;
  }

  if (typeof payload === "object" && !Array.isArray(payload)) {
    const message = (payload as { message?: unknown; error?: unknown; title?: unknown }).message
      ?? (payload as { message?: unknown; error?: unknown; title?: unknown }).error
      ?? (payload as { message?: unknown; error?: unknown; title?: unknown }).title;

    if (typeof message === "string" && message.trim()) {
      return message.trim().slice(0, 180);
    }
  }

  return null;
}

export async function verifyGvlCogginsDocument(input: {
  organization_id: string;
  horse_id: string;
  source_url: string;
  document_file?: File | null;
  horse_name?: string;
  horse_date_of_birth?: string | null;
  horse_birth_year?: number | null;
  created_by_user_id?: string;
}) {
  const client = requireSupabase();
  const sourceUrl = input.source_url.trim();

  if (!sourceUrl) {
    throw new Error("Ajoute un lien GVL avant de lancer la validation.");
  }

  const { data: verification, error: invokeError } = await client.functions.invoke<GvlCogginsVerification>("verify-gvl-coggins", {
    body: {
      url: sourceUrl,
      horseName: input.horse_name,
      horseDateOfBirth: input.horse_date_of_birth ?? null,
      horseBirthYear: input.horse_birth_year ?? null,
    },
  });

  if (invokeError) {
    if (input.document_file) {
      return createPendingGvlCogginsDocument({
        organization_id: input.organization_id,
        horse_id: input.horse_id,
        source_url: sourceUrl,
        document_file: input.document_file,
        horse_name: input.horse_name,
        horse_date_of_birth: input.horse_date_of_birth,
        created_by_user_id: input.created_by_user_id,
        review_notes: `Validation GVL impossible: ${invokeError.message}`,
      });
    }

    throw new Error(`Validation GVL impossible: ${invokeError.message}`);
  }

  if (!verification) {
    if (input.document_file) {
      return createPendingGvlCogginsDocument({
        organization_id: input.organization_id,
        horse_id: input.horse_id,
        source_url: sourceUrl,
        document_file: input.document_file,
        horse_name: input.horse_name,
        horse_date_of_birth: input.horse_date_of_birth,
        created_by_user_id: input.created_by_user_id,
        review_notes: "Validation GVL impossible: aucune reponse recue.",
      });
    }

    throw new Error("Validation GVL impossible: aucune reponse recue.");
  }

  if (verification.error) {
    if (input.document_file) {
      return createPendingGvlCogginsDocument({
        organization_id: input.organization_id,
        horse_id: input.horse_id,
        source_url: sourceUrl,
        document_file: input.document_file,
        horse_name: input.horse_name,
        horse_date_of_birth: input.horse_date_of_birth,
        created_by_user_id: input.created_by_user_id,
        review_notes: verification.error,
      });
    }

    throw new Error(verification.error);
  }

  const documentType: HorseHealthDocument["document_type"] = "coggins_eia";
  const status: HorseHealthDocument["status"] = verification.status === "verified" ? "verified" : verification.status === "rejected" ? "rejected" : "pending_review";
  const sourceUrlFromGvl = verification.source_url ?? sourceUrl;
  const payload = {
    organization_id: input.organization_id,
    horse_id: input.horse_id,
    document_type: documentType,
    status,
    verification_source: verification.verification_source ?? "gvl_url",
    source_url: sourceUrlFromGvl,
    certificate_number: verification.certificate_number ?? null,
    issuer_name: verification.issuer_name ?? null,
    test_or_administered_on: verification.test_or_administered_on ?? null,
    result: verification.result ?? null,
    horse_name: verification.horse_name ?? null,
    horse_date_of_birth: verification.horse_date_of_birth ?? null,
    horse_external_id: verification.horse_external_id ?? null,
    warnings: verification.warnings ?? [],
    payload: verification.payload ?? {},
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_notes: verification.warnings?.length ? verification.warnings.join(", ") : null,
  };

  const existing = await findExistingHorseHealthDocument({
    horse_id: input.horse_id,
    document_type: documentType,
    certificate_number: payload.certificate_number,
    source_url: sourceUrlFromGvl,
  });

  if (existing) {
    const { data, error } = await client
      .from("horse_health_documents")
      .update(cleanPayload(payload))
      .eq("id", existing.id)
      .select("*")
      .single<HorseHealthDocument>();

    if (error) {
      throw error;
    }

    if (data.status !== "verified" && input.document_file) {
      return attachHorseHealthDocumentFile(data.id, {
        organization_id: input.organization_id,
        horse_id: input.horse_id,
        file: input.document_file,
      });
    }

    return data;
  }

  const { data, error } = await client
    .from("horse_health_documents")
    .insert({
      ...payload,
      created_by_user_id: input.created_by_user_id ?? null,
    })
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    if (isMissingSchemaError(error, "horse_health_documents")) {
      throw new Error("La migration des documents sante des chevaux n'est pas encore appliquee.");
    }

    throw error;
  }

  if (data.status !== "verified" && input.document_file) {
    return attachHorseHealthDocumentFile(data.id, {
      organization_id: input.organization_id,
      horse_id: input.horse_id,
      file: input.document_file,
    });
  }

  return data;
}

async function createPendingGvlCogginsDocument(input: {
  organization_id: string;
  horse_id: string;
  source_url: string;
  document_file: File;
  horse_name?: string;
  horse_date_of_birth?: string | null;
  created_by_user_id?: string;
  review_notes?: string | null;
}) {
  const client = requireSupabase();
  const documentUrl = await uploadHealthDocumentFile({
    organization_id: input.organization_id,
    horse_id: input.horse_id,
    file: input.document_file,
  });
  const existing = await findExistingHorseHealthDocument({
    horse_id: input.horse_id,
    document_type: "coggins_eia",
    certificate_number: null,
    source_url: input.source_url,
  });
  const payload = {
    organization_id: input.organization_id,
    horse_id: input.horse_id,
    document_type: "coggins_eia",
    status: "pending_review",
    verification_source: "upload",
    source_url: input.source_url,
    document_url: documentUrl,
    horse_name: input.horse_name ?? null,
    horse_date_of_birth: input.horse_date_of_birth ?? null,
    warnings: ["GVL_MANUAL_REVIEW"],
    review_notes: input.review_notes ?? "Coggins GVL depose pour revision manuelle.",
  };

  if (existing) {
    const { data, error } = await client
      .from("horse_health_documents")
      .update(cleanPayload(payload))
      .eq("id", existing.id)
      .select("*")
      .single<HorseHealthDocument>();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await client
    .from("horse_health_documents")
    .insert({
      ...payload,
      created_by_user_id: input.created_by_user_id ?? null,
    })
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    if (isMissingSchemaError(error, "horse_health_documents")) {
      throw new Error("La migration des documents sante des chevaux n'est pas encore appliquee.");
    }

    throw error;
  }

  return data;
}

export async function createUploadedHorseHealthDocument(input: {
  organization_id: string;
  horse_id: string;
  document_type: Extract<HorseHealthDocument["document_type"], "coggins_eia" | "influenza_vaccine" | "rhino_vaccine" | "combo_vaccine" | "other">;
  file: File;
  source_url?: string | null;
  test_or_administered_on?: string | null;
  issuer_name?: string | null;
  created_by_user_id?: string;
  review_notes?: string | null;
}) {
  const client = requireSupabase();
  const documentUrl = await uploadHealthDocumentFile({
    organization_id: input.organization_id,
    horse_id: input.horse_id,
    file: input.file,
  });
  const { data, error } = await client
    .from("horse_health_documents")
    .insert({
      organization_id: input.organization_id,
      horse_id: input.horse_id,
      document_type: input.document_type,
      status: "pending_review",
      verification_source: "upload",
      source_url: input.source_url || null,
      document_url: documentUrl,
      issuer_name: input.issuer_name || null,
      test_or_administered_on: input.test_or_administered_on || null,
      created_by_user_id: input.created_by_user_id ?? null,
      review_notes: input.review_notes || null,
    })
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    if (isMissingSchemaError(error, "horse_health_documents")) {
      throw new Error("La migration des documents sante des chevaux n'est pas encore appliquee.");
    }

    throw error;
  }

  return data;
}

async function attachHorseHealthDocumentFile(
  id: string,
  input: {
    organization_id: string;
    horse_id: string;
    file: File;
  },
) {
  const client = requireSupabase();
  const documentUrl = await uploadHealthDocumentFile(input);
  const { data, error } = await client
    .from("horse_health_documents")
    .update({ document_url: documentUrl })
    .eq("id", id)
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    throw error;
  }

  return data;
}

export async function reviewHorseHealthDocument(
  id: string,
  input: {
    status: Extract<HorseHealthDocument["status"], "approved" | "rejected" | "pending_review">;
    reviewed_by_user_id?: string;
    review_notes?: string | null;
    test_or_administered_on?: string | null;
  },
) {
  const client = requireSupabase();
  const reviewed = input.status === "approved" || input.status === "rejected";
  const { data, error } = await client
    .from("horse_health_documents")
    .update(
      cleanPayload({
        status: input.status,
        reviewed_by_user_id: reviewed ? input.reviewed_by_user_id ?? null : null,
        reviewed_at: reviewed ? new Date().toISOString() : null,
        review_notes: input.review_notes ?? null,
        test_or_administered_on: input.test_or_administered_on === undefined ? undefined : input.test_or_administered_on || null,
      }),
    )
    .eq("id", id)
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    if (isMissingSchemaError(error, "horse_health_documents")) {
      throw new Error("La migration des documents sante des chevaux n'est pas encore appliquee.");
    }

    throw error;
  }

  return data;
}

export async function getHorseHealthDocumentFileUrl(documentUrl: string) {
  const client = requireSupabase();
  const objectPath = horseHealthDocumentObjectPath(documentUrl);

  if (/^https?:\/\//i.test(objectPath)) {
    return objectPath;
  }

  const { data, error } = await client.storage.from("health-documents").createSignedUrl(objectPath, 10 * 60);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

function horseHealthDocumentObjectPath(documentUrl: string) {
  const cleanUrl = documentUrl.trim();

  if (!cleanUrl) {
    return cleanUrl;
  }

  if (!/^https?:\/\//i.test(cleanUrl)) {
    return cleanUrl.replace(/^\/+/, "").replace(/^health-documents\//, "");
  }

  try {
    const url = new URL(cleanUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    const marker = "/health-documents/";
    const markerIndex = decodedPath.indexOf(marker);

    if (markerIndex >= 0) {
      return decodedPath.slice(markerIndex + marker.length);
    }
  } catch {
    return cleanUrl;
  }

  return cleanUrl;
}

async function uploadHealthDocumentFile(input: { organization_id: string; horse_id: string; file: File }) {
  const client = requireSupabase();
  const objectPath = `${input.organization_id}/${input.horse_id}/${crypto.randomUUID()}-${safeStorageFileName(input.file.name)}`;
  const { error } = await client.storage.from("health-documents").upload(objectPath, input.file, {
    contentType: input.file.type || undefined,
  });

  if (error) {
    throw error;
  }

  return objectPath;
}

function safeStorageFileName(value: string) {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean || "document";
}

async function findExistingHorseHealthDocument(input: {
  horse_id: string;
  document_type: HorseHealthDocument["document_type"];
  certificate_number: string | null;
  source_url: string;
}) {
  const client = requireSupabase();

  if (input.certificate_number) {
    const { data, error } = await client
      .from("horse_health_documents")
      .select("*")
      .eq("horse_id", input.horse_id)
      .eq("document_type", input.document_type)
      .eq("certificate_number", input.certificate_number)
      .maybeSingle<HorseHealthDocument>();

    if (error && !isMissingSchemaError(error, "horse_health_documents")) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  const { data, error } = await client
    .from("horse_health_documents")
    .select("*")
    .eq("horse_id", input.horse_id)
    .eq("document_type", input.document_type)
    .eq("source_url", input.source_url)
    .maybeSingle<HorseHealthDocument>();

  if (error && !isMissingSchemaError(error, "horse_health_documents")) {
    throw error;
  }

  return data ?? null;
}

async function upsertHorseContact(input: {
  organization_id: string;
  horse_id: string;
  contact_id: string;
  role: HorseContact["role"];
}) {
  const client = requireSupabase();
  const canPayInvoices = input.role === "owner" || input.role === "co-owner";
  const { error } = await client.from("horse_contacts").upsert(
    {
      organization_id: input.organization_id,
      horse_id: input.horse_id,
      contact_id: input.contact_id,
      role: input.role,
      can_create_entries: true,
      can_modify_entries: true,
      can_book_stalls: true,
      can_pay_invoices: canPayInvoices,
    },
    { onConflict: "horse_id,contact_id,role" },
  );

  if (error) {
    throw error;
  }
}

export async function createClassTemplate(input: ClassTemplateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("class_templates")
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      code: input.code || null,
      block_label: input.block_label || null,
      category: input.category || null,
      default_pattern: input.default_pattern || null,
      default_entry_fee: input.default_entry_fee ?? null,
      sanctioning_body_codes: input.sanctioning_body_codes ?? [],
      back_number_policy: input.back_number_policy ?? "horse",
      eligibility_rules: input.eligibility_rules ?? {},
      sort_order: input.sort_order ?? 1,
      is_active: input.is_active ?? true,
      notes: input.notes || null,
    })
    .select("*")
    .single<ClassTemplate>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateClassTemplate(id: string, input: ClassTemplateUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("class_templates")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<ClassTemplate>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteClassTemplate(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("class_templates").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createClassTemplateDivision(input: ClassTemplateDivisionInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("class_template_divisions")
    .insert({
      organization_id: input.organization_id,
      class_template_id: input.class_template_id,
      name: input.name,
      code: input.code || null,
      level: input.level ?? null,
      default_entry_fee: input.default_entry_fee ?? null,
      default_judge_fee: input.default_judge_fee ?? null,
      default_payout_schedule_type: input.default_payout_schedule_type ?? "none",
      default_added_money: input.default_added_money ?? 0,
      default_retainage_percent: input.default_retainage_percent ?? null,
      default_trophy_or_plaque_fee: input.default_trophy_or_plaque_fee ?? 0,
      default_sanctioning_fee_percent: input.default_sanctioning_fee_percent ?? null,
      default_payout_rules: input.default_payout_rules ?? {},
      default_payout_notes: input.default_payout_notes || null,
      sanctioning_body_codes: input.sanctioning_body_codes ?? [],
      eligibility_rules: input.eligibility_rules ?? {},
      sort_order: input.sort_order ?? 1,
      notes: input.notes || null,
    })
    .select("*")
    .single<ClassTemplateDivision>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateClassTemplateDivision(id: string, input: ClassTemplateDivisionUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("class_template_divisions")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<ClassTemplateDivision>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteClassTemplateDivision(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("class_template_divisions").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createClass(input: ClassInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("classes")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      show_day_id: input.show_day_id || null,
      class_template_id: input.class_template_id || null,
      name: input.name,
      code: input.code || null,
      block_label: input.block_label || null,
      arena: input.arena || null,
      pattern: input.pattern || null,
      custom_pattern: input.custom_pattern ?? null,
	      sanctioning_body_codes: input.sanctioning_body_codes ?? [],
	      back_number_policy: input.back_number_policy ?? "horse",
	      nrha_slate_number: input.nrha_slate_number || null,
	      entries_close_at: input.entries_close_at ?? null,
	      late_entries_allowed: input.late_entries_allowed ?? true,
	      late_entry_fee_percent: input.late_entry_fee_percent ?? 50,
      draw_prepared_at: input.draw_prepared_at ?? null,
      eligibility_rules: input.eligibility_rules ?? {},
      judge_name: input.judge_name || null,
      schedule_start_mode: input.schedule_start_mode ?? (input.scheduled_time ? "fixed" : "unscheduled"),
      scheduled_time: input.scheduled_time ?? null,
      sort_order: input.sort_order ?? 1,
      entry_fee: input.entry_fee ?? null,
      status: "open",
      is_public: true,
      is_event_block: input.is_event_block ?? false,
    })
    .select("*")
    .single<ClassRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateClass(id: string, input: ClassUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("classes")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<ClassRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteClass(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("classes").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createDivision(input: DivisionInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("divisions")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      class_id: input.class_id,
      class_template_division_id: input.class_template_division_id || null,
      name: input.name,
      code: input.code || null,
      level: input.level ?? null,
      entry_fee: input.entry_fee ?? null,
      judge_fee: input.judge_fee ?? null,
      payout_schedule_type: input.payout_schedule_type ?? "none",
      added_money: input.added_money ?? 0,
      retainage_percent: input.retainage_percent ?? null,
      trophy_or_plaque_fee: input.trophy_or_plaque_fee ?? 0,
      sanctioning_fee_percent: input.sanctioning_fee_percent ?? null,
      payout_rules: input.payout_rules ?? {},
      payout_notes: input.payout_notes || null,
      sanctioning_body_codes: input.sanctioning_body_codes ?? [],
      eligibility_rules: input.eligibility_rules ?? {},
    })
    .select("*")
    .single<Division>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateDivision(id: string, input: DivisionUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("divisions")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<Division>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteDivision(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("divisions").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

type PayoutCalculationSaveInput = Pick<
  PayoutCalculation,
  | "show_id"
  | "division_id"
  | "import_batch_id"
  | "currency"
  | "entry_count"
  | "gross_entry_fees"
  | "trophy_or_plaque_fee"
  | "base_after_trophy_fee"
  | "nrha_fee_amount"
  | "net_entry_fee"
  | "retainage_amount"
  | "final_net_entry_fee"
  | "added_money"
  | "net_purse"
  | "payout_schedule_id"
  | "source_snapshot"
  | "result_snapshot"
>;

type PayoutAwardSaveInput = Pick<PayoutAward, "entry_id" | "rank" | "percentage" | "amount" | "payee_contact_id" | "payee_name" | "payee_override_note">;

export async function savePayoutCalculationDraft(input: {
  awards: PayoutAwardSaveInput[];
  calculatedByUserId?: string | null;
  calculation: PayoutCalculationSaveInput;
}) {
  const client = requireSupabase();
  const now = new Date().toISOString();
  const calculationPayload: Record<string, unknown> = {
    ...input.calculation,
    calculated_at: now,
    calculated_by: input.calculatedByUserId ?? null,
    published_at: null,
    reviewed_at: null,
    status: "draft" as PayoutCalculationStatus,
  };
  const { data: existing, error: existingError } = await client
    .from("payout_calculations")
    .select("*")
    .eq("show_id", input.calculation.show_id)
    .eq("division_id", input.calculation.division_id)
    .maybeSingle<PayoutCalculation>();

  if (existingError) {
    throw existingError;
  }

  const saveCalculation = (payload: Record<string, unknown>) =>
    existing
      ? client
          .from("payout_calculations")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single<PayoutCalculation>()
      : client
          .from("payout_calculations")
          .insert(payload)
          .select("*")
          .single<PayoutCalculation>();

  let { data: calculation, error: calculationError } = await saveCalculation(calculationPayload);

  if (calculationError && isMissingColumnError(calculationError, "import_batch_id")) {
    if (input.calculation.import_batch_id) {
      throw toAqrAuditImportSchemaError(calculationError);
    }

    const { import_batch_id: _importBatchId, ...legacyPayload } = calculationPayload;
    ({ data: calculation, error: calculationError } = await saveCalculation(legacyPayload));
  }

  if (calculationError) {
    throw calculationError;
  }

  if (!calculation) {
    throw new Error("Le calcul de bourse n'a pas pu etre sauvegarde.");
  }

  const { error: deleteAwardsError } = await client.from("payout_awards").delete().eq("calculation_id", calculation.id);

  if (deleteAwardsError) {
    throw deleteAwardsError;
  }

  if (!input.awards.length) {
    return { awards: [] as PayoutAward[], calculation };
  }

  const { data: awards, error: awardsError } = await client
    .from("payout_awards")
    .insert(input.awards.map((award) => ({ ...award, calculation_id: calculation.id })))
    .select("*")
    .returns<PayoutAward[]>();

  if (awardsError) {
    throw awardsError;
  }

  return { awards: awards ?? [], calculation };
}

export async function updatePayoutCalculationStatus(id: string, status: Extract<PayoutCalculationStatus, "reviewed" | "published">) {
  const client = requireSupabase();
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await client
    .from("payout_calculations")
    .select("status, reviewed_at")
    .eq("id", id)
    .single<Pick<PayoutCalculation, "reviewed_at" | "status">>();

  if (existingError) {
    throw existingError;
  }

  if (status === "reviewed" && existing.status !== "draft") {
    throw new Error("Seul un calcul draft peut être marqué révisé.");
  }

  if (status === "published" && existing.status !== "reviewed") {
    throw new Error("Seul un calcul révisé peut être publié.");
  }

  const patch =
    status === "published"
      ? { status, published_at: now, reviewed_at: existing.reviewed_at ?? now }
      : { status, reviewed_at: now, published_at: null };
  const { data, error } = await client
    .from("payout_calculations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single<PayoutCalculation>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePayoutAwardPayee(
  id: string,
  input: Pick<PayoutAward, "calculation_id" | "payee_contact_id" | "payee_name" | "payee_override_note">,
) {
  const client = requireSupabase();
  const { data: calculation, error: calculationError } = await client
    .from("payout_calculations")
    .select("status")
    .eq("id", input.calculation_id)
    .single<Pick<PayoutCalculation, "status">>();

  if (calculationError) {
    throw calculationError;
  }

  if (calculation.status !== "draft") {
    throw new Error("Le payee peut seulement être modifié sur un calcul draft.");
  }

  const { data, error } = await client
    .from("payout_awards")
    .update({
      payee_contact_id: input.payee_contact_id,
      payee_name: input.payee_name,
      payee_override_note: input.payee_override_note,
    })
    .eq("id", id)
    .eq("calculation_id", input.calculation_id)
    .select("*")
    .single<PayoutAward>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createBackNumberRange(input: {
  organization_id: string;
  start_number: number;
  end_number: number;
  assignment_mode?: OrganizationBackNumber["assignment_mode"];
  status?: Exclude<OrganizationBackNumber["status"], "assigned">;
  notes?: string | null;
  created_by_user_id?: string | null;
}) {
  const client = requireSupabase();
  const startNumber = Math.min(input.start_number, input.end_number);
  const endNumber = Math.max(input.start_number, input.end_number);

  if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || startNumber < 1) {
    throw new Error("La plage de dossards doit contenir des numeros entiers positifs.");
  }

  if (endNumber - startNumber > 999) {
    throw new Error("La plage est trop grande. Ajoute au maximum 1000 dossards a la fois.");
  }

  const { data: existing, error: selectError } = await client
    .from("organization_back_numbers")
    .select("number")
    .eq("organization_id", input.organization_id)
    .gte("number", startNumber)
    .lte("number", endNumber)
    .returns<Array<Pick<OrganizationBackNumber, "number">>>();

  if (selectError) {
    throw selectError;
  }

  const existingNumbers = new Set((existing ?? []).map((row) => row.number));
  const rows = Array.from({ length: endNumber - startNumber + 1 }, (_, index) => startNumber + index)
    .filter((number) => !existingNumbers.has(number))
    .map((number) => ({
      organization_id: input.organization_id,
      number,
      status: input.status ?? "available",
      assignment_mode: input.assignment_mode ?? "horse",
      created_by_user_id: input.created_by_user_id ?? null,
      notes: input.notes?.trim() || null,
    }));

  if (!rows.length) {
    return [];
  }

  const { data, error } = await client
    .from("organization_back_numbers")
    .insert(rows)
    .select("*")
    .returns<OrganizationBackNumber[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function assignBackNumber(input: {
  organization_id: string;
  number: number;
  horse_id?: string | null;
  rider_contact_id?: string | null;
  assignment_mode: OrganizationBackNumber["assignment_mode"];
  transfer_existing?: boolean;
  created_by_user_id?: string | null;
  notes?: string | null;
}) {
  const client = requireSupabase();
  const number = normalizeBackNumber(input.number);
  const horseId = input.assignment_mode === "rider" ? null : input.horse_id || null;
  const riderContactId = input.assignment_mode === "horse" ? null : input.rider_contact_id || null;

  if ((input.assignment_mode === "horse" || input.assignment_mode === "horse_rider_team") && !horseId) {
    throw new Error("Choisis un cheval avant d'assigner un dossard.");
  }

  if ((input.assignment_mode === "rider" || input.assignment_mode === "horse_rider_team") && !riderContactId) {
    throw new Error("Choisis un cavalier avant d'assigner ce dossard.");
  }

  const { data: existing, error: selectError } = await client
    .from("organization_back_numbers")
    .select("*")
    .eq("organization_id", input.organization_id)
    .eq("number", number)
    .maybeSingle<OrganizationBackNumber>();

  if (selectError) {
    throw selectError;
  }

  const existingTargetMatches =
    existing?.status === "assigned" &&
    existing.assignment_mode === input.assignment_mode &&
    backNumberTargetMatches(existing, {
      assignment_mode: input.assignment_mode,
      horse_id: horseId,
      rider_contact_id: riderContactId,
    });

  if (existing && existing.status !== "available" && !existingTargetMatches && !input.transfer_existing) {
    throw new Error(`Le dossard ${number} est deja ${backNumberStatusErrorLabel(existing.status)}.`);
  }

  await releaseExistingBackNumberAssignment({
    organization_id: input.organization_id,
    assignment_mode: input.assignment_mode,
    horse_id: horseId,
    rider_contact_id: riderContactId,
    except_back_number_id: existing?.id ?? null,
  });

  const payload = {
    organization_id: input.organization_id,
    number,
    status: "assigned" as const,
    assignment_mode: input.assignment_mode,
    assigned_horse_id: horseId,
    assigned_rider_contact_id: riderContactId,
    assigned_at: new Date().toISOString(),
    created_by_user_id: input.created_by_user_id ?? existing?.created_by_user_id ?? null,
    notes: input.notes?.trim() || existing?.notes || null,
  };

  const query = existing
    ? client.from("organization_back_numbers").update(payload).eq("id", existing.id)
    : client.from("organization_back_numbers").insert(payload);
  const { data, error } = await query.select("*").single<OrganizationBackNumber>();

  if (error) {
    throw error;
  }

  return data;
}

export async function assignNextBackNumber(input: {
  organization_id: string;
  horse_id?: string | null;
  rider_contact_id?: string | null;
  assignment_mode: OrganizationBackNumber["assignment_mode"];
  created_by_user_id?: string | null;
  notes?: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_back_numbers")
    .select("number")
    .eq("organization_id", input.organization_id)
    .eq("status", "available")
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle<Pick<OrganizationBackNumber, "number">>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Aucun dossard disponible dans l'inventaire de cette association.");
  }

  return assignBackNumber({
    ...input,
    number: data.number,
  });
}

export async function claimHorseBackNumber(input: {
  organization_id: string;
  horse_id?: string | null;
  number: number;
  assignment_mode?: OrganizationBackNumber["assignment_mode"];
  rider_contact_id?: string | null;
}) {
  const client = requireSupabase();
  const number = normalizeBackNumber(input.number);
  const assignmentMode = input.assignment_mode ?? "horse";
  const { data, error } = await client
    .rpc("claim_horse_back_number", {
      requested_number: number,
      target_assignment_mode: assignmentMode,
      target_horse_id: assignmentMode === "rider" ? null : input.horse_id ?? null,
      target_organization_id: input.organization_id,
      target_rider_contact_id: assignmentMode === "horse" ? null : input.rider_contact_id ?? null,
    })
    .single<OrganizationBackNumber>();

  if (error) {
    throw error;
  }

  return data;
}

export async function releaseBackNumber(id: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_back_numbers")
    .update({
      status: "available",
      assigned_horse_id: null,
      assigned_rider_contact_id: null,
      assigned_at: null,
    })
    .eq("id", id)
    .select("*")
    .single<OrganizationBackNumber>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateBackNumberStatus(id: string, status: Exclude<OrganizationBackNumber["status"], "assigned">) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_back_numbers")
    .update({
      status,
      assigned_horse_id: null,
      assigned_rider_contact_id: null,
      assigned_at: null,
    })
    .eq("id", id)
    .select("*")
    .single<OrganizationBackNumber>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteBackNumber(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("organization_back_numbers").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

async function releaseExistingBackNumberAssignment(input: {
  organization_id: string;
  assignment_mode: OrganizationBackNumber["assignment_mode"];
  horse_id: string | null;
  rider_contact_id: string | null;
  except_back_number_id?: string | null;
}) {
  const client = requireSupabase();
  let query = client
    .from("organization_back_numbers")
    .update({
      status: "available",
      assigned_horse_id: null,
      assigned_rider_contact_id: null,
      assigned_at: null,
    })
    .eq("organization_id", input.organization_id)
    .eq("status", "assigned")
    .eq("assignment_mode", input.assignment_mode);

  if (input.assignment_mode === "horse" || input.assignment_mode === "horse_rider_team") {
    query = query.eq("assigned_horse_id", input.horse_id);
  }

  if (input.assignment_mode === "rider" || input.assignment_mode === "horse_rider_team") {
    query = query.eq("assigned_rider_contact_id", input.rider_contact_id);
  }

  if (input.except_back_number_id) {
    query = query.neq("id", input.except_back_number_id);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

async function resolveEntryBackNumber(input: EntryInput) {
  const client = requireSupabase();
  const { data: division, error: divisionError } = await client
    .from("divisions")
    .select("class_id")
    .eq("id", input.division_id)
    .single<Pick<Division, "class_id">>();

  if (divisionError) {
    throw divisionError;
  }

  const { data: classRecord, error: classError } = await client
    .from("classes")
    .select("back_number_policy")
    .eq("id", division.class_id)
    .single<Pick<ClassRecord, "back_number_policy">>();

  if (classError) {
    throw classError;
  }

  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("back_number_policy")
    .eq("id", input.organization_id)
    .single<Pick<Organization, "back_number_policy">>();

  if (organizationError && !isMissingSchemaError(organizationError, "back_number_policy")) {
    throw organizationError;
  }

  const effectivePolicy =
    classRecord.back_number_policy === "entry" || classRecord.back_number_policy === "custom"
      ? classRecord.back_number_policy
      : organization?.back_number_policy ?? classRecord.back_number_policy;

  if (effectivePolicy === "entry" || effectivePolicy === "custom") {
    return null;
  }

  const riderContactId = input.rider_contact_id || input.owner_contact_id;
  let query = client
    .from("organization_back_numbers")
    .select("number")
    .eq("organization_id", input.organization_id)
    .eq("status", "assigned")
    .eq("assignment_mode", effectivePolicy);

  if (effectivePolicy === "horse" || effectivePolicy === "horse_rider_team") {
    query = query.eq("assigned_horse_id", input.horse_id);
  }

  if (effectivePolicy === "rider" || effectivePolicy === "horse_rider_team") {
    if (!riderContactId) {
      return null;
    }

    query = query.eq("assigned_rider_contact_id", riderContactId);
  }

  const { data, error } = await query.limit(1).maybeSingle<Pick<OrganizationBackNumber, "number">>();

  if (error) {
    if (isMissingSchemaError(error, "organization_back_numbers")) {
      return null;
    }

    throw error;
  }

  return data?.number ?? null;
}

function normalizeBackNumber(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Le numero de dossard doit etre un entier positif.");
  }

  return value;
}

function backNumberTargetMatches(
  backNumber: OrganizationBackNumber,
  target: {
    assignment_mode: OrganizationBackNumber["assignment_mode"];
    horse_id: string | null;
    rider_contact_id: string | null;
  },
) {
  if (target.assignment_mode === "horse") {
    return backNumber.assigned_horse_id === target.horse_id;
  }

  if (target.assignment_mode === "rider") {
    return backNumber.assigned_rider_contact_id === target.rider_contact_id;
  }

  return backNumber.assigned_horse_id === target.horse_id && backNumber.assigned_rider_contact_id === target.rider_contact_id;
}

function backNumberStatusErrorLabel(status: OrganizationBackNumber["status"]) {
  if (status === "assigned") {
    return "assigne a un autre cheval, cavalier ou equipe";
  }

  if (status === "reserved") {
    return "reserve";
  }

  if (status === "lost") {
    return "marque perdu";
  }

  if (status === "retired") {
    return "retire";
  }

  return "indisponible";
}

async function resolveLateEntryFee(input: EntryInput) {
  const client = requireSupabase();
  const { data: division, error: divisionError } = await client
    .from("divisions")
    .select("entry_fee, class_id")
    .eq("id", input.division_id)
    .single<{ entry_fee: number | null; class_id: string }>();

  if (divisionError) {
    throw divisionError;
  }

  const { data: classRecord, error: classError } = await client
    .from("classes")
    .select("entry_fee, entries_close_at, late_entries_allowed, late_entry_fee_percent")
    .eq("id", division.class_id)
    .single<Pick<ClassRecord, "entries_close_at" | "entry_fee" | "late_entries_allowed" | "late_entry_fee_percent">>();

  if (classError) {
    throw classError;
  }

  const baseFee = input.base_fee ?? division.entry_fee ?? classRecord.entry_fee ?? null;
  const isLate = Boolean(classRecord.entries_close_at && Date.now() > new Date(classRecord.entries_close_at).getTime());

  if (isLate && !classRecord.late_entries_allowed) {
    throw new Error("Les inscriptions sont fermées pour ce bloc.");
  }

  const lateFeePercent = isLate ? classRecord.late_entry_fee_percent ?? 50 : 0;
  const lateFeeAmount = isLate && baseFee != null ? Math.round(baseFee * (lateFeePercent / 100) * 100) / 100 : 0;

  return {
    baseFee,
    isLate,
    lateFeeAmount,
    lateFeePercent,
  };
}

async function assertEntryProgramLimits(input: {
  entry_id?: string;
  division_id: string;
  horse_id: string;
  owner_contact_id: string;
  rider_contact_id: string | null;
  status?: Entry["status"];
}) {
  if (input.status && inactiveEntryStatuses.includes(input.status)) {
    return;
  }

  const client = requireSupabase();
  const inactiveStatusFilter = `(${inactiveEntryStatuses.join(",")})`;
  const { data: division, error: divisionError } = await client
    .from("divisions")
    .select("id, class_id")
    .eq("id", input.division_id)
    .single<Pick<Division, "id" | "class_id">>();

  if (divisionError) {
    throw divisionError;
  }

  const { data: classDivisions, error: classDivisionsError } = await client
    .from("divisions")
    .select("id")
    .eq("class_id", division.class_id)
    .returns<Array<Pick<Division, "id">>>();

  if (classDivisionsError) {
    throw classDivisionsError;
  }

  const classDivisionIds = (classDivisions ?? []).map((classDivision) => classDivision.id);
  let horseEntryQuery = client
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("horse_id", input.horse_id)
    .in("division_id", classDivisionIds)
    .not("status", "in", inactiveStatusFilter);

  if (input.entry_id) {
    horseEntryQuery = horseEntryQuery.neq("id", input.entry_id);
  }

  const { count: horseEntryCount, error: horseEntryError } = await horseEntryQuery;

  if (horseEntryError) {
    throw horseEntryError;
  }

  if ((horseEntryCount ?? 0) > 0) {
    throw new Error("Un même cheval ne peut être inscrit qu'une fois par bloc.");
  }

  const riderContactId = input.rider_contact_id ?? input.owner_contact_id;
  let riderEntryQuery = client
    .from("entries")
    .select("id, rider_contact_id, owner_contact_id")
    .eq("division_id", input.division_id)
    .not("status", "in", inactiveStatusFilter);

  if (input.entry_id) {
    riderEntryQuery = riderEntryQuery.neq("id", input.entry_id);
  }

  const { data: riderEntries, error: riderEntriesError } = await riderEntryQuery.returns<Array<Pick<Entry, "id" | "rider_contact_id" | "owner_contact_id">>>();

  if (riderEntriesError) {
    throw riderEntriesError;
  }

  const riderEntryCount = (riderEntries ?? []).filter((entry) => (entry.rider_contact_id ?? entry.owner_contact_id) === riderContactId).length;

  if (riderEntryCount >= 3) {
    throw new Error("Un cavalier ne peut pas être inscrit plus de trois fois dans une même classe.");
  }
}

export async function createEntry(input: EntryInput) {
  const client = requireSupabase();
  await ensureEntryOrganizationLinks({
    organization_id: input.organization_id,
    horse_id: input.horse_id,
    owner_contact_id: input.owner_contact_id,
    rider_contact_id: input.rider_contact_id ?? null,
    payer_contact_id: input.payer_contact_id,
    created_by_user_id: input.created_by_user_id,
  });
  await assertHorseHealthValidForShow(input.horse_id, input.show_id);
  await assertEntryShowLevelMembershipRequirements({
    organization_id: input.organization_id,
    owner_contact_id: input.owner_contact_id,
    payer_contact_id: input.payer_contact_id,
    rider_contact_id: input.rider_contact_id ?? null,
  });
  await assertEntryProgramLimits({
    division_id: input.division_id,
    horse_id: input.horse_id,
    owner_contact_id: input.owner_contact_id,
    rider_contact_id: input.rider_contact_id ?? null,
  });
  const lateEntry = await resolveLateEntryFee(input);
  const resolvedEntryNumber = input.entry_number === undefined ? await resolveEntryBackNumber(input) : input.entry_number;

  const { data, error } = await client
    .from("entries")
    .insert({
      organization_id: input.organization_id,
	      show_id: input.show_id,
	      horse_id: input.horse_id,
	      division_id: input.division_id,
	      created_by_user_id: input.created_by_user_id,
	      owner_contact_id: input.owner_contact_id,
	      rider_contact_id: input.rider_contact_id || null,
	      payer_contact_id: input.payer_contact_id,
	      entry_number: resolvedEntryNumber ?? null,
	      base_fee: lateEntry.baseFee,
      total_fees: lateEntry.baseFee == null ? null : lateEntry.baseFee + lateEntry.lateFeeAmount,
      is_late: lateEntry.isLate,
      late_fee_percent: lateEntry.lateFeePercent,
      late_fee_amount: lateEntry.lateFeeAmount,
      status: "draft",
    })
    .select("*")
    .single<Entry>();

  if (error) {
    throw error;
  }

  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.owner_contact_id,
    role: "owner",
    source: "entry",
  });
  if (data.rider_contact_id) {
    await ensureContactRole({
      organization_id: data.organization_id,
      contact_id: data.rider_contact_id,
      role: "rider",
      source: "entry",
    });
  }
  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.payer_contact_id,
    role: "payer",
    source: "entry",
  });

  return data;
}

export async function updateEntry(id: string, input: EntryUpdateInput) {
  const client = requireSupabase();
  const existing = await getEntryById(id);
  await ensureEntryOrganizationLinks({
    organization_id: existing.organization_id,
    horse_id: input.horse_id ?? existing.horse_id,
    owner_contact_id: input.owner_contact_id ?? existing.owner_contact_id,
    rider_contact_id: input.rider_contact_id === undefined ? existing.rider_contact_id : input.rider_contact_id,
    payer_contact_id: input.payer_contact_id ?? existing.payer_contact_id,
    created_by_user_id: existing.created_by_user_id,
  });
  const nextEntryStatus = input.status ?? existing.status;

  if (!["cancelled", "scratched", "scratched_pending_refund"].includes(nextEntryStatus)) {
    await assertHorseHealthValidForShow(input.horse_id ?? existing.horse_id, existing.show_id);
    await assertEntryShowLevelMembershipRequirements({
      organization_id: existing.organization_id,
      owner_contact_id: input.owner_contact_id ?? existing.owner_contact_id,
      payer_contact_id: input.payer_contact_id ?? existing.payer_contact_id,
      rider_contact_id: input.rider_contact_id === undefined ? existing.rider_contact_id : input.rider_contact_id,
    });
    await assertEntryProgramLimits({
      entry_id: id,
      division_id: input.division_id ?? existing.division_id,
      horse_id: input.horse_id ?? existing.horse_id,
      owner_contact_id: input.owner_contact_id ?? existing.owner_contact_id,
      rider_contact_id: input.rider_contact_id === undefined ? existing.rider_contact_id : input.rider_contact_id,
      status: nextEntryStatus,
    });
  }

  const { data, error } = await client
    .from("entries")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<Entry>();

  if (error) {
    throw error;
  }

  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.owner_contact_id,
    role: "owner",
    source: "entry",
  });
  if (data.rider_contact_id) {
    await ensureContactRole({
      organization_id: data.organization_id,
      contact_id: data.rider_contact_id,
      role: "rider",
      source: "entry",
    });
  }
  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.payer_contact_id,
    role: "payer",
    source: "entry",
  });

  return data;
}

export async function deleteEntry(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("entries").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createStallOption(input: StallOptionInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("stall_options")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      name: input.name,
      description: input.description || null,
      price: input.price,
      total_quantity: input.total_quantity,
      available_quantity: input.available_quantity ?? input.total_quantity,
      duration_days: input.duration_days ?? null,
      show_day_start_id: input.show_day_start_id || null,
      show_day_end_id: input.show_day_end_id || null,
      requires_horse_assignment: input.requires_horse_assignment ?? true,
      limit_per_horse_stalls: input.limit_per_horse_stalls ?? null,
      category: input.category || null,
      product_id: input.product_id ?? null,
      notes: input.notes || null,
    })
    .select("*")
    .single<StallOption>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateStallOption(id: string, input: StallOptionUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("stall_options")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<StallOption>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createStallBooking(input: StallBookingInput) {
  const client = requireSupabase();
  await ensureStallBookingOrganizationLinks({
    organization_id: input.organization_id,
    horse_id: input.horse_id ?? null,
    booker_contact_id: input.booker_contact_id,
    payer_contact_id: input.payer_contact_id,
    created_by_user_id: input.created_by_user_id,
  });
  const bookingStatus = input.status ?? "requested";

  if (input.horse_id && !["cancelled", "completed"].includes(bookingStatus)) {
    await assertHorseHealthValidForShow(input.horse_id, input.show_id);
  }

  const { data, error } = await client
    .from("stall_bookings")
    .insert(cleanPayload({
      organization_id: input.organization_id,
      show_id: input.show_id,
      stall_option_id: input.stall_option_id,
      horse_id: input.horse_id || null,
      created_by_user_id: input.created_by_user_id,
      booker_contact_id: input.booker_contact_id,
      payer_contact_id: input.payer_contact_id,
      status: input.status ?? "requested",
      show_day_start_id: input.show_day_start_id || null,
      show_day_end_id: input.show_day_end_id || null,
      quantity: input.quantity,
      unit_price: input.unit_price ?? null,
      total_price: input.total_price ?? null,
      affects_inventory: input.affects_inventory,
      billable: input.billable,
      notes: input.notes || null,
    }))
    .select("*")
    .single<StallBooking>();

  if (error) {
    throw error;
  }

  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.booker_contact_id,
    role: "booker",
    source: "reservation",
  });
  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.payer_contact_id,
    role: "payer",
    source: "reservation",
  });

  return data;
}

export async function updateStallBooking(id: string, input: StallBookingUpdateInput) {
  const client = requireSupabase();
  const existing = await getStallBookingById(id);
  await ensureStallBookingOrganizationLinks({
    organization_id: existing.organization_id,
    horse_id: input.horse_id === undefined ? existing.horse_id : input.horse_id,
    booker_contact_id: input.booker_contact_id ?? existing.booker_contact_id,
    payer_contact_id: input.payer_contact_id ?? existing.payer_contact_id,
    created_by_user_id: existing.created_by_user_id,
  });
  const nextBookingHorseId = input.horse_id === undefined ? existing.horse_id : input.horse_id;
  const nextBookingStatus = input.status ?? existing.status;

  if (nextBookingHorseId && !["cancelled", "completed"].includes(nextBookingStatus)) {
    await assertHorseHealthValidForShow(nextBookingHorseId, existing.show_id);
  }

  const { data, error } = await client
    .from("stall_bookings")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<StallBooking>();

  if (error) {
    throw error;
  }

  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.booker_contact_id,
    role: "booker",
    source: "reservation",
  });
  await ensureContactRole({
    organization_id: data.organization_id,
    contact_id: data.payer_contact_id,
    role: "payer",
    source: "reservation",
  });

  return data;
}

export async function deleteStallBooking(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("stall_bookings").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

async function loadShowScoreClassSetups() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("show_score_class_setups")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<ShowScoreClassSetup[]>();

  if (error) {
    if (isMissingShowScoreSchemaError(error)) {
      return [];
    }

    throw error;
  }

  return data ?? [];
}

export function previewShowScoreDrawEntryImport(input: {
  showId: string;
  classIds?: string[];
  classes: ClassRecord[];
  divisions: Division[];
  showScoreClassSetups: ShowScoreClassSetup[];
}) {
  return buildAqrAuditImportPreview(input);
}

export async function syncShowScoreDrawEntryImportBatch(input: {
  showId: string;
  classIds?: string[];
  createdByUserId: string;
}) {
  const client = requireSupabase();
  const { data: show, error: showError } = await client
    .from("shows")
    .select("*")
    .eq("id", input.showId)
    .single<Show>();

  if (showError) {
    throw showError;
  }

  const { data: activeBatch, error: activeBatchError } = await client
    .from("entry_import_batches")
    .select("*")
    .eq("show_id", input.showId)
    .eq("source", AQR_AUDIT_IMPORT_SOURCE)
    .in("status", ["created", "failed"])
    .limit(1)
    .maybeSingle<EntryImportBatch>();

  if (activeBatchError) {
    throw toAqrAuditImportSchemaError(activeBatchError);
  }

  if (activeBatch) {
    throw new Error("Un batch AQR est deja actif pour ce show. Nettoie-le avant de relancer l'import.");
  }

  const [
    setupsResult,
    classesResult,
    divisionsResult,
    contactsResult,
    horsesResult,
  ] = await Promise.all([
    client.from("show_score_class_setups").select("*").eq("show_id", input.showId).returns<ShowScoreClassSetup[]>(),
    client.from("classes").select("*").eq("show_id", input.showId).returns<ClassRecord[]>(),
    client.from("divisions").select("*").eq("show_id", input.showId).returns<Division[]>(),
    client.from("contacts").select("*").eq("organization_id", show.organization_id).returns<Contact[]>(),
    client.from("horses").select("*").eq("organization_id", show.organization_id).returns<Horse[]>(),
  ]);

  if (setupsResult.error) {
    throw setupsResult.error;
  }
  if (classesResult.error) {
    throw classesResult.error;
  }
  if (divisionsResult.error) {
    throw divisionsResult.error;
  }
  if (contactsResult.error) {
    throw contactsResult.error;
  }
  if (horsesResult.error) {
    throw horsesResult.error;
  }

  const preview = buildAqrAuditImportPreview({
    showId: input.showId,
    classIds: input.classIds,
    classes: classesResult.data ?? [],
    divisions: divisionsResult.data ?? [],
    showScoreClassSetups: setupsResult.data ?? [],
  });

  if (preview.errors.length) {
    throw new Error(`Import AQR bloque: ${preview.errors.join(" ")}`);
  }

  if (!preview.totalEntries) {
    throw new Error("Aucune entry a creer depuis les draws ShowScore selectionnes.");
  }

  await assertShowScoreOfficialScoringNotStarted(
    input.showId,
    preview.classPreviews.map((classPreview) => classPreview.classRecord.id),
  );

  const sourceRunSnapshots: Record<string, Record<string, unknown>> = {};
  const createdContactIds = new Set<string>();
  const createdHorseIds = new Set<string>();
  const createdEntryIds: string[] = [];
  const runIds: string[] = [];
  const blockRunIds: string[] = [];
  const mutableContacts = [...(contactsResult.data ?? [])];
  const mutableHorses = [...(horsesResult.data ?? [])];

  const { data: batch, error: batchError } = await client
    .from("entry_import_batches")
    .insert({
      organization_id: show.organization_id,
      show_id: input.showId,
      source: AQR_AUDIT_IMPORT_SOURCE,
      status: "created",
      created_by_user_id: input.createdByUserId,
      summary: {
        totalRuns: preview.totalRuns,
        totalEntries: preview.totalEntries,
        classCount: preview.classPreviews.length,
        warnings: preview.warnings,
      },
      source_run_snapshots: {},
    })
    .select("*")
    .single<EntryImportBatch>();

  if (batchError) {
    throw toAqrAuditImportSchemaError(batchError);
  }

  try {
    for (const classPreview of preview.classPreviews) {
      const setupRuns = classPreview.setup.runs.map((run, index) => normalizeShowScoreDrawRun(run, index));
      const setupRunsBySourceId = new Map(setupRuns.map((run) => [run.sourceRunId, run]));
      const updatedRuns: Array<Record<string, unknown> & { __normalizedAqrRun?: NormalizedShowScoreDrawRun }> = classPreview.setup.runs.map((run, index) => {
        const normalizedRun = setupRunsBySourceId.get(normalizeShowScoreDrawRun(run, index).sourceRunId) ?? normalizeShowScoreDrawRun(run, index);
        return { ...run, __normalizedAqrRun: normalizedRun };
      });

      sourceRunSnapshots[classPreview.classRecord.id] = {};

      for (const runPreview of classPreview.runs) {
        const run = runPreview.run;
        const sourceRun = classPreview.setup.runs.find((candidate, index) => normalizeShowScoreDrawRun(candidate, index).sourceRunId === run.sourceRunId) ?? run.raw;
        const snapshot = captureRunTechnicalSnapshot(sourceRun);
        const ownerContact = await findOrCreateAuditContact({
          contacts: mutableContacts,
          createdByUserId: input.createdByUserId,
          name: run.owner || run.rider,
          organizationId: show.organization_id,
          role: "owner",
        });
        const riderContact = run.rider
          ? await findOrCreateAuditContact({
              contacts: mutableContacts,
              createdByUserId: input.createdByUserId,
              name: run.rider,
              organizationId: show.organization_id,
              role: "rider",
            })
          : ownerContact;
        const payerContact = ownerContact;
        const horse = await findOrCreateAuditHorse({
          createdByUserId: input.createdByUserId,
          horses: mutableHorses,
          name: run.horse,
          organizationId: show.organization_id,
          ownerContactId: ownerContact.id,
        });

        if (ownerContact.wasCreated) {
          createdContactIds.add(ownerContact.id);
        }
        if (riderContact.wasCreated) {
          createdContactIds.add(riderContact.id);
        }
        if (horse.wasCreated) {
          createdHorseIds.add(horse.id);
        }

        const runId = pickRunUuid(sourceRun, ["runId", "run_id", "id"]) ?? crypto.randomUUID();
        const blockRunId = pickRunUuid(sourceRun, ["blockRunId", "block_run_id"]) ?? crypto.randomUUID();
        const entryIds: string[] = [];

        for (const division of runPreview.matchedDivisions) {
          const externalSourceKey = buildAqrExternalSourceKey({
            classId: classPreview.classRecord.id,
            divisionId: division.id,
            run,
          });
          const entryStatus: Entry["status"] = isAqrScratchRun(run) ? "scratched" : "active";
          const baseFee = division.entry_fee ?? classPreview.classRecord.entry_fee ?? 0;
          const { data: entry, error: entryError } = await client
            .from("entries")
            .insert({
              organization_id: show.organization_id,
              show_id: input.showId,
              horse_id: horse.id,
              division_id: division.id,
              created_by_user_id: input.createdByUserId,
              owner_contact_id: ownerContact.id,
              rider_contact_id: riderContact.id,
              payer_contact_id: payerContact.id,
              entry_number: parseBackNumber(run.backNumber),
              base_fee: baseFee,
              total_fees: baseFee,
              is_late: false,
              late_fee_percent: 0,
              late_fee_amount: 0,
              status: "draft",
              import_source: AQR_AUDIT_IMPORT_SOURCE,
              import_batch_id: batch.id,
              external_source_key: externalSourceKey,
              source_payload: {
                classId: classPreview.classRecord.id,
                className: classPreview.classRecord.name,
                divisionId: division.id,
                divisionCode: division.code,
                run,
                runId,
                blockRunId,
              },
            })
            .select("*")
            .single<Entry>();

          if (entryError) {
            throw entryError;
          }

          const { error: entryStatusError } = await client
            .from("entries")
            .update({ status: entryStatus })
            .eq("id", entry.id);

          if (entryStatusError) {
            throw entryStatusError;
          }

          entryIds.push(entry.id);
          createdEntryIds.push(entry.id);
        }

        await upsertAuditRunLinks({
          blockId: classPreview.classRecord.id,
          blockRunId,
          entryIds,
          orderOfGo: run.order || run.draw,
          runId,
          showId: input.showId,
        });

        runIds.push(runId);
        blockRunIds.push(blockRunId);
        sourceRunSnapshots[classPreview.classRecord.id][run.sourceRunId] = {
          snapshot,
          runId,
          blockRunId,
          entryIds,
          divisionIds: runPreview.matchedDivisions.map((division) => division.id),
          horseId: horse.id,
          ownerContactId: ownerContact.id,
          riderContactId: riderContact.id,
          payerContactId: payerContact.id,
        };

        for (let index = 0; index < updatedRuns.length; index += 1) {
          const updatedRun = updatedRuns[index] as Record<string, unknown> & { __normalizedAqrRun?: NormalizedShowScoreDrawRun };

          if (updatedRun.__normalizedAqrRun?.sourceRunId !== run.sourceRunId) {
            continue;
          }

          delete updatedRun.__normalizedAqrRun;
          updatedRuns[index] = {
            ...updatedRun,
            runId,
            blockRunId,
            entryId: entryIds[0] ?? null,
            entryIds,
            divisionId: runPreview.matchedDivisions[0]?.id ?? null,
            divisionIds: runPreview.matchedDivisions.map((division) => division.id),
            horseId: horse.id,
            ownerContactId: ownerContact.id,
            riderContactId: riderContact.id,
            payerContactId: payerContact.id,
            hspImportBatchId: batch.id,
          };
        }
      }

      const cleanedRuns = updatedRuns.map((run) => {
        const { __normalizedAqrRun, ...cleanRun } = run as Record<string, unknown> & { __normalizedAqrRun?: NormalizedShowScoreDrawRun };
        return cleanRun;
      });

      const { error: setupError } = await client
        .from("show_score_class_setups")
        .update({ runs: cleanedRuns })
        .eq("class_id", classPreview.classRecord.id)
        .eq("show_id", input.showId);

      if (setupError) {
        throw setupError;
      }
    }

    const { data: updatedBatch, error: updateBatchError } = await client
      .from("entry_import_batches")
      .update({
        summary: {
          totalRuns: preview.totalRuns,
          totalEntries: preview.totalEntries,
          classCount: preview.classPreviews.length,
          createdEntryIds,
          createdContactIds: [...createdContactIds],
          createdHorseIds: [...createdHorseIds],
          runIds,
          blockRunIds,
          warnings: preview.warnings,
        },
        source_run_snapshots: sourceRunSnapshots,
      })
      .eq("id", batch.id)
      .select("*")
      .single<EntryImportBatch>();

    if (updateBatchError) {
      throw updateBatchError;
    }

    return updatedBatch;
  } catch (error) {
    await client
      .from("entry_import_batches")
      .update({
        status: "failed",
        summary: {
          totalRuns: preview.totalRuns,
          totalEntries: preview.totalEntries,
          createdEntryIds,
          createdContactIds: [...createdContactIds],
          createdHorseIds: [...createdHorseIds],
          runIds,
          blockRunIds,
          error: error instanceof Error ? error.message : String(error),
        },
        source_run_snapshots: sourceRunSnapshots,
      })
      .eq("id", batch.id);
    throw toAqrAuditImportSchemaError(error);
  }
}

export async function cleanupShowScoreDrawEntryImportBatch(batchId: string) {
  const client = requireSupabase();
  const { data: batch, error: batchError } = await client
    .from("entry_import_batches")
    .select("*")
    .eq("id", batchId)
    .single<EntryImportBatch>();

  if (batchError) {
    throw toAqrAuditImportSchemaError(batchError);
  }

  if (batch.source !== AQR_AUDIT_IMPORT_SOURCE) {
    throw new Error("Ce batch ne provient pas de l'import audit AQR.");
  }

  const { data: entries, error: entriesError } = await client
    .from("entries")
    .select("*")
    .eq("import_batch_id", batchId)
    .returns<Entry[]>();

  if (entriesError) {
    throw toAqrAuditImportSchemaError(entriesError);
  }

  const entryIds = (entries ?? []).map((entry) => entry.id);
  const sourceSnapshots = normalizeSourceRunSnapshots(batch.source_run_snapshots);
  const runIds = uniqueStrings(sourceSnapshots.flatMap((snapshot) => [snapshot.runId]));
  const blockRunIds = uniqueStrings(sourceSnapshots.flatMap((snapshot) => [snapshot.blockRunId]));
  const createdContactIds = jsonStringArray(batch.summary.createdContactIds);
  const createdHorseIds = jsonStringArray(batch.summary.createdHorseIds);
  const invoiceIds = entryIds.length ? await invoiceIdsForEntries(entryIds) : [];

  const { data: payoutCalculations, error: payoutCalculationsError } = await client
    .from("payout_calculations")
    .select("id")
    .eq("import_batch_id", batchId)
    .returns<Array<Pick<PayoutCalculation, "id">>>();

  if (payoutCalculationsError) {
    throw toAqrAuditImportSchemaError(payoutCalculationsError);
  }

  const payoutCalculationIds = (payoutCalculations ?? []).map((calculation) => calculation.id);

  if (payoutCalculationIds.length) {
    const { error: payoutAwardsError } = await client
      .from("payout_awards")
      .delete()
      .in("calculation_id", payoutCalculationIds);

    if (payoutAwardsError) {
      throw payoutAwardsError;
    }

    const { error: payoutDeleteError } = await client
      .from("payout_calculations")
      .delete()
      .in("id", payoutCalculationIds);

    if (payoutDeleteError) {
      throw payoutDeleteError;
    }
  }

  if (runIds.length) {
    const { error: scoredRunError } = await client.from("scored_runs").delete().in("run_id", runIds);

    if (scoredRunError) {
      throw scoredRunError;
    }
  }

  if (blockRunIds.length) {
    const { error: blockRunClassError } = await client
      .from("block_run_class_entries")
      .delete()
      .in("block_run_id", blockRunIds);

    if (blockRunClassError) {
      throw blockRunClassError;
    }

    const { error: blockRunError } = await client
      .from("block_run_entries")
      .delete()
      .in("block_run_id", blockRunIds);

    if (blockRunError) {
      throw blockRunError;
    }
  }

  if (entryIds.length) {
    const { error: deleteEntriesError } = await client.from("entries").delete().in("id", entryIds);

    if (deleteEntriesError) {
      throw deleteEntriesError;
    }
  }

  await deleteEmptyDraftInvoices(invoiceIds);
  await cleanupAuditHorses(createdHorseIds, batch.organization_id);
  await cleanupAuditContacts(createdContactIds, batch.organization_id);
  await restoreShowScoreRunsForBatch(batch);

  const { data: cleanedBatch, error: cleanedBatchError } = await client
    .from("entry_import_batches")
    .update({
      status: "cleaned",
      cleaned_at: new Date().toISOString(),
    })
    .eq("id", batchId)
    .select("*")
    .single<EntryImportBatch>();

  if (cleanedBatchError) {
    throw cleanedBatchError;
  }

  return cleanedBatch;
}

async function assertShowScoreOfficialScoringNotStarted(showId: string, classIds: string[]) {
  if (!classIds.length) {
    return;
  }

  const client = requireSupabase();
  const { data: scoringSessions, error: scoringError } = await client
    .from("show_score_scoring_sessions")
    .select("class_id,started_at")
    .eq("show_id", showId)
    .in("class_id", classIds)
    .returns<Array<{ class_id: string; started_at: string | null }>>();

  if (scoringError && !isMissingSchemaError(scoringError, "show_score_scoring_sessions")) {
    throw scoringError;
  }

  const startedClassIds = (scoringSessions ?? [])
    .filter((session) => session.started_at)
    .map((session) => session.class_id);

  if (startedClassIds.length) {
    throw new Error("Import AQR bloque: le pointage officiel ShowScore a deja commence pour une classe selectionnee.");
  }

  const { data: judgeSessions, error: judgeError } = await client
    .from("show_score_judge_sessions")
    .select("class_id,finalized")
    .eq("show_id", showId)
    .in("class_id", classIds)
    .returns<Array<{ class_id: string; finalized: boolean }>>();

  if (judgeError && !isMissingSchemaError(judgeError, "show_score_judge_sessions")) {
    throw judgeError;
  }

  if ((judgeSessions ?? []).some((session) => session.finalized)) {
    throw new Error("Import AQR bloque: une session juge ShowScore est deja finalisee pour une classe selectionnee.");
  }
}

async function findOrCreateAuditContact(input: {
  contacts: Contact[];
  createdByUserId: string;
  name: string;
  organizationId: string;
  role: Contact["type"];
}): Promise<Contact & { wasCreated: boolean }> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Impossible de creer un contact AQR sans nom.");
  }

  const existing = findContactByName(input.contacts, name);

  if (existing) {
    await ensureContactRole({
      organization_id: input.organizationId,
      contact_id: existing.id,
      role: input.role,
      source: "entry",
    });
    return { ...existing, wasCreated: false };
  }

  const splitName = splitDisplayName(name);
  const contact = await createContact({
    organization_id: input.organizationId,
    type: input.role,
    roles: [input.role],
    first_name: splitName.firstName,
    last_name: splitName.lastName,
    created_by_user_id: input.createdByUserId,
  });

  input.contacts.push(contact);
  return { ...contact, wasCreated: true };
}

async function findOrCreateAuditHorse(input: {
  createdByUserId: string;
  horses: Horse[];
  name: string;
  organizationId: string;
  ownerContactId: string;
}): Promise<Horse & { wasCreated: boolean }> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Impossible de creer un cheval AQR sans nom.");
  }

  const existing = input.horses.find((horse) => normalizeNameKey(horse.name) === normalizeNameKey(name));

  if (existing) {
    await ensureHorseOrganizationLink({
      organization_id: input.organizationId,
      horse_id: existing.id,
      source: "entry",
      created_by_user_id: input.createdByUserId,
    });
    await upsertHorseContact({
      organization_id: input.organizationId,
      horse_id: existing.id,
      contact_id: input.ownerContactId,
      role: "owner",
    });
    return { ...existing, wasCreated: false };
  }

  const horse = await createHorse({
    organization_id: input.organizationId,
    name,
    primary_owner_contact_id: input.ownerContactId,
    created_by_user_id: input.createdByUserId,
  });

  input.horses.push(horse);
  return { ...horse, wasCreated: true };
}

async function upsertAuditRunLinks(input: {
  blockId: string;
  blockRunId: string;
  entryIds: string[];
  orderOfGo: number;
  runId: string;
  showId: string;
}) {
  const client = requireSupabase();
  const { error: blockRunError } = await client.from("block_run_entries").upsert(
    {
      block_run_id: input.blockRunId,
      run_id: input.runId,
      show_id: input.showId,
      block_id: input.blockId,
      order_of_go: input.orderOfGo,
    },
    { onConflict: "block_run_id" },
  );

  if (blockRunError) {
    throw blockRunError;
  }

  if (!input.entryIds.length) {
    return;
  }

  const { error: classEntriesError } = await client
    .from("block_run_class_entries")
    .upsert(
      input.entryIds.map((entryId) => ({
        block_run_id: input.blockRunId,
        entry_id: entryId,
      })),
      { onConflict: "block_run_id,entry_id" },
    );

  if (classEntriesError) {
    throw classEntriesError;
  }
}

async function invoiceIdsForEntries(entryIds: string[]) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("invoice_line_items")
    .select("invoice_id")
    .eq("item_type", "entry")
    .in("item_id", entryIds)
    .returns<Array<Pick<InvoiceLineItem, "invoice_id">>>();

  if (error) {
    throw error;
  }

  return uniqueStrings((data ?? []).map((lineItem) => lineItem.invoice_id));
}

async function deleteEmptyDraftInvoices(invoiceIds: string[]) {
  if (!invoiceIds.length) {
    return;
  }

  const client = requireSupabase();

  for (const invoiceId of invoiceIds) {
    const { data: invoice, error: invoiceError } = await client
      .from("invoices")
      .select("id,status")
      .eq("id", invoiceId)
      .maybeSingle<Pick<Invoice, "id" | "status">>();

    if (invoiceError) {
      throw invoiceError;
    }

    if (!invoice || invoice.status !== "draft") {
      continue;
    }

    const { count, error: countError } = await client
      .from("invoice_line_items")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceId);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) > 0) {
      continue;
    }

    const { error: deleteError } = await client.from("invoices").delete().eq("id", invoiceId);

    if (deleteError) {
      throw deleteError;
    }
  }
}

async function cleanupAuditHorses(horseIds: string[], organizationId: string) {
  const client = requireSupabase();

  for (const horseId of uniqueStrings(horseIds)) {
    const [entryCount, stallCount] = await Promise.all([
      countRows("entries", "horse_id", horseId),
      countRows("stall_bookings", "horse_id", horseId),
    ]);

    if (entryCount + stallCount > 0) {
      continue;
    }

    const { error } = await client
      .from("horses")
      .delete()
      .eq("id", horseId)
      .eq("organization_id", organizationId);

    if (error && error.code !== "23503") {
      throw error;
    }
  }
}

async function cleanupAuditContacts(contactIds: string[], organizationId: string) {
  const client = requireSupabase();

  for (const contactId of uniqueStrings(contactIds)) {
    const [
      ownerEntryCount,
      riderEntryCount,
      payerEntryCount,
      bookerStallCount,
      payerStallCount,
      horseContactCount,
    ] = await Promise.all([
      countRows("entries", "owner_contact_id", contactId),
      countRows("entries", "rider_contact_id", contactId),
      countRows("entries", "payer_contact_id", contactId),
      countRows("stall_bookings", "booker_contact_id", contactId),
      countRows("stall_bookings", "payer_contact_id", contactId),
      countRows("horse_contacts", "contact_id", contactId),
    ]);

    if (ownerEntryCount + riderEntryCount + payerEntryCount + bookerStallCount + payerStallCount + horseContactCount > 0) {
      continue;
    }

    const { error } = await client
      .from("contacts")
      .delete()
      .eq("id", contactId)
      .eq("organization_id", organizationId);

    if (error && error.code !== "23503") {
      throw error;
    }
  }
}

async function countRows(tableName: string, columnName: string, value: string) {
  const client = requireSupabase();
  const { count, error } = await client
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq(columnName, value);

  if (error) {
    if (isMissingSchemaError(error, tableName)) {
      return 0;
    }

    throw error;
  }

  return count ?? 0;
}

async function restoreShowScoreRunsForBatch(batch: EntryImportBatch) {
  const client = requireSupabase();
  const snapshots = normalizeSourceRunSnapshotMap(batch.source_run_snapshots);
  const classIds = Object.keys(snapshots);

  if (!classIds.length) {
    return;
  }

  const { data: setups, error } = await client
    .from("show_score_class_setups")
    .select("*")
    .eq("show_id", batch.show_id)
    .in("class_id", classIds)
    .returns<ShowScoreClassSetup[]>();

  if (error) {
    throw error;
  }

  for (const setup of setups ?? []) {
    const classSnapshots = snapshots[setup.class_id] ?? {};
    let changed = false;
    const restoredRuns = setup.runs.map((run, index) => {
      const normalizedRun = normalizeShowScoreDrawRun(run, index);
      const snapshotRecord = classSnapshots[normalizedRun.sourceRunId];

      if (!snapshotRecord && run.hspImportBatchId !== batch.id) {
        return run;
      }

      changed = true;
      return restoreRunTechnicalSnapshot(run, snapshotRecord?.snapshot);
    });

    if (!changed) {
      continue;
    }

    const { error: updateError } = await client
      .from("show_score_class_setups")
      .update({ runs: restoredRuns })
      .eq("class_id", setup.class_id)
      .eq("show_id", setup.show_id);

    if (updateError) {
      throw updateError;
    }
  }
}

type FlatSourceRunSnapshot = {
  classId: string;
  sourceRunId: string;
  snapshot: RunTechnicalSnapshot;
  runId: string | null;
  blockRunId: string | null;
};

function normalizeSourceRunSnapshots(value: Record<string, unknown>) {
  return Object.entries(normalizeSourceRunSnapshotMap(value)).flatMap(([classId, classSnapshots]) =>
    Object.entries(classSnapshots).map(([sourceRunId, snapshotRecord]) => ({
      classId,
      sourceRunId,
      ...snapshotRecord,
    })),
  );
}

function normalizeSourceRunSnapshotMap(value: Record<string, unknown>) {
  const map: Record<string, Record<string, Omit<FlatSourceRunSnapshot, "classId" | "sourceRunId">>> = {};

  for (const [classId, classValue] of Object.entries(value ?? {})) {
    if (!classValue || typeof classValue !== "object" || Array.isArray(classValue)) {
      continue;
    }

    map[classId] = {};

    for (const [sourceRunId, runValue] of Object.entries(classValue as Record<string, unknown>)) {
      if (!runValue || typeof runValue !== "object" || Array.isArray(runValue)) {
        continue;
      }

      const record = runValue as Record<string, unknown>;
      map[classId][sourceRunId] = {
        snapshot: normalizeRunTechnicalSnapshot(record.snapshot),
        runId: typeof record.runId === "string" ? record.runId : null,
        blockRunId: typeof record.blockRunId === "string" ? record.blockRunId : null,
      };
    }
  }

  return map;
}

function normalizeRunTechnicalSnapshot(value: unknown): RunTechnicalSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { presentFields: [], values: {} };
  }

  const record = value as Record<string, unknown>;
  return {
    presentFields: Array.isArray(record.presentFields)
      ? record.presentFields.filter((field): field is RunTechnicalSnapshot["presentFields"][number] => typeof field === "string")
      : [],
    values: record.values && typeof record.values === "object" && !Array.isArray(record.values)
      ? record.values as RunTechnicalSnapshot["values"]
      : {},
  };
}

function findContactByName(contacts: Contact[], name: string) {
  const targetKey = normalizeNameKey(name);
  return contacts.find((contact) => {
    const fullName = `${contact.first_name} ${contact.last_name}`.trim();
    const reversedName = `${contact.last_name} ${contact.first_name}`.trim();
    return normalizeNameKey(fullName) === targetKey || normalizeNameKey(reversedName) === targetKey;
  });
}

function splitDisplayName(name: string) {
  const trimmed = name.trim();

  if (trimmed.includes(",")) {
    const [lastName, ...firstNameParts] = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    return {
      firstName: firstNameParts.join(" ") || lastName || "AQR",
      lastName: lastName || "Audit",
    };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return { firstName: parts[0] || "AQR", lastName: "Audit" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function normalizeNameKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseBackNumber(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function pickRunUuid(run: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = run[key];

    if (typeof value === "string" && isUuid(value)) {
      return value;
    }
  }

  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function prepareShowScoreClassSetup(input: {
  classRecord: ClassRecord;
  entries: Entry[];
  divisions: Division[];
  horses: Horse[];
  contacts: Contact[];
}) {
  const client = requireSupabase();
  const closeDate = input.classRecord.entries_close_at ? new Date(input.classRecord.entries_close_at) : null;

  if (closeDate && !Number.isNaN(closeDate.getTime()) && Date.now() < closeDate.getTime()) {
    throw new Error("Les inscriptions ne sont pas encore fermees pour ce bloc.");
  }

  const runs = buildShowScoreRunsForClass(input.classRecord.id, input.entries, {
    contacts: input.contacts,
    divisions: input.divisions,
    horses: input.horses,
  });

  if (!runs.length) {
    throw new Error("Aucune inscription a envoyer dans l'ordre de passage.");
  }

  await saveShowScoreRunLinks(input.classRecord, runs);

  const judges = input.classRecord.judge_name
    ? [{ id: "judge-1", name: input.classRecord.judge_name, order: 1 }]
    : [{ id: "judge-1", name: "", order: 1 }];
  const preparedAt = new Date().toISOString();

  const { data, error } = await client
    .from("show_score_class_setups")
    .upsert(
      {
        class_id: input.classRecord.id,
        organization_id: input.classRecord.organization_id,
        show_id: input.classRecord.show_id,
        show_day_id: input.classRecord.show_day_id,
        pattern: input.classRecord.pattern || null,
        custom_pattern: input.classRecord.custom_pattern,
        runs,
        judges,
        is_draw_imported: true,
      },
      { onConflict: "class_id" },
    )
    .select("*")
    .single<ShowScoreClassSetup>();

  if (error) {
    throw error;
  }

  const { error: classError } = await client.from("classes").update({ draw_prepared_at: preparedAt }).eq("id", input.classRecord.id);

  if (classError) {
    throw classError;
  }

  return data;
}

async function saveShowScoreRunLinks(classRecord: ClassRecord, runs: ShowScoreRun[]) {
  const client = requireSupabase();
  const blockRunRows = runs.map((run) => ({
    block_run_id: run.blockRunId,
    run_id: run.runId,
    show_id: classRecord.show_id,
    block_id: classRecord.id,
    order_of_go: run.draw,
  }));
  const entryRows = runs.flatMap((run) =>
    (run.entryIds.length ? run.entryIds : [run.entryId]).map((entryId) => ({
      block_run_id: run.blockRunId,
      entry_id: entryId,
    })),
  );

  try {
    const { error: deleteError } = await client.from("block_run_entries").delete().eq("block_id", classRecord.id);

    if (deleteError) {
      throw deleteError;
    }

    const { error: blockRunError } = await client.from("block_run_entries").upsert(blockRunRows, { onConflict: "block_run_id" });

    if (blockRunError) {
      throw blockRunError;
    }

    if (entryRows.length) {
      const { error: entryError } = await client
        .from("block_run_class_entries")
        .upsert(entryRows, { onConflict: "block_run_id,entry_id" });

      if (entryError) {
        throw entryError;
      }
    }
  } catch (error) {
    if (
      isMissingSchemaError(error as { code?: string; message?: string }, "block_run_entries") ||
      isMissingSchemaError(error as { code?: string; message?: string }, "block_run_class_entries")
    ) {
      return;
    }

    throw error;
  }
}

export function buildShowScorePaidWarmupEntriesForClass(
  classId: string,
  entries: Entry[],
  relations: {
    contacts: Contact[];
    divisions: Division[];
    horses: Horse[];
  },
): ShowScorePaidWarmupEntry[] {
  return buildShowScoreRunsForClass(classId, entries, relations).map((run, index) => ({
    id: run.entryId,
    order: index + 1,
    rider: formatPaidWarmupEntryLabel(run),
    status: "pending",
    completedAt: null,
  }));
}

export async function prepareShowScorePaidWarmupFromClass(input: {
  paidWarmupId?: string;
  classRecord: ClassRecord;
  entries: Entry[];
  divisions: Division[];
  horses: Horse[];
  contacts: Contact[];
  name?: string;
  durationMinutesPerRider?: number;
  dragInterval?: number | null;
  dragDurationMinutes?: number;
  isPublicLive?: boolean;
}) {
  if (!input.classRecord.show_day_id) {
    throw new Error("Le bloc doit être assigné à une journée avant de créer un paid warm up.");
  }

  const entries = buildShowScorePaidWarmupEntriesForClass(input.classRecord.id, input.entries, {
    contacts: input.contacts,
    divisions: input.divisions,
    horses: input.horses,
  });

  if (!entries.length) {
    throw new Error("Aucune inscription à envoyer dans le paid warm up.");
  }

  return saveShowScorePaidWarmup({
    id: input.paidWarmupId,
    organization_id: input.classRecord.organization_id,
    show_id: input.classRecord.show_id,
    show_day_id: input.classRecord.show_day_id,
    name: input.name || `Paid warm up - ${input.classRecord.name}`,
    arena: input.classRecord.arena,
    duration_minutes_per_rider: input.durationMinutesPerRider ?? 5,
    drag_interval: input.dragInterval ?? null,
    drag_duration_minutes: input.dragDurationMinutes ?? 8,
    schedule_start_mode: input.classRecord.schedule_start_mode,
    schedule_start_time: input.classRecord.scheduled_time,
    is_public_live: input.isPublicLive ?? false,
    active_entry_id: null,
    active_started_at: null,
    entries,
    sort_order: input.classRecord.sort_order,
    legacy_payload: {
      source: "hsp_class_entries",
      source_class_id: input.classRecord.id,
    },
  });
}

export async function saveShowScorePaidWarmup(input: ShowScorePaidWarmupInput) {
  const client = requireSupabase();
  const row = showScorePaidWarmupRow(input);
  const { data, error } = await client
    .from("show_score_paid_warmups")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single<ShowScorePaidWarmup>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateShowScorePaidWarmup(id: string, input: ShowScorePaidWarmupUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("show_score_paid_warmups")
    .update(cleanPayload(showScorePaidWarmupPatch(input)))
    .eq("id", id)
    .select("*")
    .single<ShowScorePaidWarmup>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteShowScorePaidWarmup(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("show_score_paid_warmups").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function ensureContactRole(input: {
  organization_id: string;
  contact_id: string;
  role: ContactRoleName;
  source: ContactRole["source"];
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("contact_roles")
    .upsert(
      {
        organization_id: input.organization_id,
        contact_id: input.contact_id,
        role: input.role,
        source: input.source,
      },
      { onConflict: "organization_id,contact_id,role" },
    )
    .select("*")
    .single<ContactRole>();

  if (error) {
    if (isMissingSchemaError(error, "contact_roles")) {
      return null;
    }

    throw error;
  }

  return data;
}

export async function ensureContactRoles(input: {
  organization_id: string;
  contact_id: string;
  roles: ContactRoleName[];
  source: ContactRole["source"];
}) {
  const roles = uniqueRoles(input.roles);
  const ensured: Array<ContactRole | null> = [];

  for (const role of roles) {
    ensured.push(
      await ensureContactRole({
        organization_id: input.organization_id,
        contact_id: input.contact_id,
        role,
        source: input.source,
      }),
    );
  }

  return ensured;
}

async function ensureContactOrganizationLink(input: {
  organization_id: string;
  contact_id: string;
  source: ContactOrganizationLink["source"];
  created_by_user_id?: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.from("contact_organization_links").upsert(
    {
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      source: input.source,
      created_by_user_id: input.created_by_user_id ?? null,
    },
    { onConflict: "organization_id,contact_id" },
  );

  if (error) {
    if (isMissingSchemaError(error, "contact_organization_links")) {
      return;
    }

    throw error;
  }
}

async function ensureHorseOrganizationLink(input: {
  organization_id: string;
  horse_id: string;
  source: HorseOrganizationLink["source"];
  created_by_user_id?: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.from("horse_organization_links").upsert(
    {
      organization_id: input.organization_id,
      horse_id: input.horse_id,
      source: input.source,
      created_by_user_id: input.created_by_user_id ?? null,
    },
    { onConflict: "organization_id,horse_id" },
  );

  if (error) {
    if (isMissingSchemaError(error, "horse_organization_links")) {
      return;
    }

    throw error;
  }
}

async function syncContactExternalMemberships(contactId: string, memberships?: ExternalMembershipInput[]) {
  if (!memberships) {
    return;
  }

  const client = requireSupabase();
  const cleanMemberships = memberships
    .map((membership) => ({
      contact_id: contactId,
      external_organization_id: membership.external_organization_id,
      membership_number: membership.membership_number.trim(),
      status: membership.status ?? "unknown",
      expires_on: membership.expires_on ?? null,
    }))
    .filter((membership) => membership.external_organization_id && membership.membership_number);

  if (cleanMemberships.length) {
    const { error } = await client.from("contact_external_memberships").upsert(cleanMemberships, {
      onConflict: "contact_id,external_organization_id",
    });

    if (error) {
      if (isMissingSchemaError(error, "contact_external_memberships")) {
        return;
      }

      throw error;
    }
  }

  const emptyMemberships = memberships.filter((membership) => membership.external_organization_id && !membership.membership_number.trim());

  if (emptyMemberships.length) {
    const { error } = await client
      .from("contact_external_memberships")
      .delete()
      .eq("contact_id", contactId)
      .in(
        "external_organization_id",
        emptyMemberships.map((membership) => membership.external_organization_id),
      );

    if (error && !isMissingSchemaError(error, "contact_external_memberships")) {
      throw error;
    }
  }
}

async function syncHorseExternalMemberships(horseId: string, memberships?: ExternalHorseMembershipInput[]) {
  if (!memberships) {
    return;
  }

  const client = requireSupabase();
  const cleanMemberships = memberships
    .map((membership) => ({
      horse_id: horseId,
      external_organization_id: membership.external_organization_id,
      reference_type: membership.reference_type ?? "competition_license",
      reference_number: membership.reference_number.trim(),
      status: membership.status ?? "unknown",
      expires_on: membership.expires_on ?? null,
    }))
    .filter((membership) => membership.external_organization_id && membership.reference_number);

  if (cleanMemberships.length) {
    const { error } = await client.from("horse_external_memberships").upsert(cleanMemberships, {
      onConflict: "horse_id,external_organization_id,reference_type",
    });

    if (error) {
      if (isMissingSchemaError(error, "horse_external_memberships")) {
        return;
      }

      throw error;
    }
  }

  const emptyMemberships = memberships.filter((membership) => membership.external_organization_id && !membership.reference_number.trim());

  if (emptyMemberships.length) {
    const membershipsByType = new Map<HorseExternalMembership["reference_type"], string[]>();

    for (const membership of emptyMemberships) {
      const referenceType = membership.reference_type ?? "competition_license";
      membershipsByType.set(referenceType, [...(membershipsByType.get(referenceType) ?? []), membership.external_organization_id]);
    }

    for (const [referenceType, externalOrganizationIds] of membershipsByType.entries()) {
      const { error } = await client
        .from("horse_external_memberships")
        .delete()
        .eq("horse_id", horseId)
        .eq("reference_type", referenceType)
        .in("external_organization_id", externalOrganizationIds);

      if (error && !isMissingSchemaError(error, "horse_external_memberships")) {
        throw error;
      }
    }
  }
}

async function getHorseById(id: string) {
  const client = requireSupabase();
  const { data, error } = await client.from("horses").select("*").eq("id", id).single<Horse>();

  if (error) {
    throw error;
  }

  return data;
}

async function getEntryById(id: string) {
  const client = requireSupabase();
  const { data, error } = await client.from("entries").select("*").eq("id", id).single<Entry>();

  if (error) {
    throw error;
  }

  return data;
}

async function getStallBookingById(id: string) {
  const client = requireSupabase();
  const { data, error } = await client.from("stall_bookings").select("*").eq("id", id).single<StallBooking>();

  if (error) {
    throw error;
  }

  return data;
}

async function assertHorseHealthValidForShow(horseId: string | null | undefined, showId: string | null | undefined) {
  if (!horseId || !showId) {
    return;
  }

  const client = requireSupabase();
  const { error } = await client.rpc("assert_horse_health_valid_for_show", {
    target_horse_id: horseId,
    target_show_id: showId,
  });

  if (error) {
    if (isMissingRpcError(error, "assert_horse_health_valid_for_show")) {
      const { error: cogginsError } = await client.rpc("assert_horse_coggins_valid_for_show", {
        target_horse_id: horseId,
        target_show_id: showId,
      });

      if (!cogginsError || isMissingRpcError(cogginsError, "assert_horse_coggins_valid_for_show")) {
        return;
      }

      throw new Error(cogginsError.message || "Le statut sante du cheval n'est pas valide pour ce show.");
    }

    throw new Error(error.message || "Le statut sante du cheval n'est pas valide pour ce show.");
  }
}

async function assertEntryShowLevelMembershipRequirements(input: {
  organization_id: string;
  owner_contact_id: string | null | undefined;
  payer_contact_id: string | null | undefined;
  rider_contact_id: string | null | undefined;
}) {
  const requirements = await loadRequiredExternalMembershipRequirements(input.organization_id);
  const riderRequirementIds = membershipRequirementIdsForType(requirements, "rider");

  if (riderRequirementIds.length && !input.rider_contact_id) {
    throw new Error("Choisir un cavalier avant de creer l'inscription: cette association exige des numeros de membre pour les riders.");
  }

  await assertContactExternalMembershipRequirements({
    contact_id: input.owner_contact_id,
    contact_type: "owner",
    requirements,
    role_label: "Proprietaire",
  });
  await assertContactExternalMembershipRequirements({
    contact_id: input.rider_contact_id,
    contact_type: "rider",
    requirements,
    role_label: "Cavalier",
  });
  await assertContactExternalMembershipRequirements({
    contact_id: input.payer_contact_id,
    contact_type: "payer",
    requirements,
    role_label: "Payeur",
  });
}

async function loadRequiredExternalMembershipRequirements(organizationId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_external_membership_requirements")
    .select("external_organization_id,contact_type,is_required")
    .eq("organization_id", organizationId)
    .eq("is_required", true)
    .returns<Array<Pick<OrganizationExternalMembershipRequirement, "external_organization_id" | "contact_type" | "is_required">>>();

  if (error) {
    if (isMissingSchemaError(error, "organization_external_membership_requirements")) {
      return [];
    }

    throw error;
  }

  return data ?? [];
}

async function assertContactExternalMembershipRequirements(input: {
  contact_id: string | null | undefined;
  contact_type: Contact["type"];
  requirements: Array<Pick<OrganizationExternalMembershipRequirement, "external_organization_id" | "contact_type" | "is_required">>;
  role_label: string;
}) {
  const requiredOrganizationIds = membershipRequirementIdsForType(input.requirements, input.contact_type);

  if (!requiredOrganizationIds.length) {
    return;
  }

  if (!input.contact_id) {
    throw new Error(`${input.role_label} requis: cette association exige des numeros de membre obligatoires.`);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("contact_external_memberships")
    .select("external_organization_id,membership_number,status")
    .eq("contact_id", input.contact_id)
    .in("external_organization_id", requiredOrganizationIds)
    .returns<Array<Pick<ContactExternalMembership, "external_organization_id" | "membership_number" | "status">>>();

  if (error) {
    if (isMissingSchemaError(error, "contact_external_memberships")) {
      return;
    }

    throw error;
  }

  const validOrganizationIds = new Set(
    (data ?? [])
      .filter((membership) => membership.membership_number.trim() && membership.status !== "expired")
      .map((membership) => membership.external_organization_id),
  );
  const missingOrganizationIds = requiredOrganizationIds.filter((organizationId) => !validOrganizationIds.has(organizationId));

  if (!missingOrganizationIds.length) {
    return;
  }

  const labels = await loadExternalOrganizationLabels(missingOrganizationIds);
  throw new Error(`${input.role_label}: numeros de membre obligatoires manquants ou expires (${labels.join(", ")}).`);
}

async function loadExternalOrganizationLabels(ids: string[]) {
  if (!ids.length) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("external_organizations")
    .select("id,code,name")
    .in("id", ids)
    .returns<Array<Pick<ExternalOrganization, "id" | "code" | "name">>>();

  if (error) {
    if (isMissingSchemaError(error, "external_organizations")) {
      return ids;
    }

    throw error;
  }

  return ids.map((id) => {
    const organization = data?.find((candidate) => candidate.id === id);
    return organization?.code || organization?.name || id;
  });
}

function membershipRequirementIdsForType(
  requirements: Array<Pick<OrganizationExternalMembershipRequirement, "external_organization_id" | "contact_type" | "is_required">>,
  contactType: Contact["type"],
) {
  return requirements.filter((requirement) => requirement.is_required && requirement.contact_type === contactType).map((requirement) => requirement.external_organization_id);
}

async function ensureEntryOrganizationLinks(input: {
  organization_id: string;
  horse_id: string;
  owner_contact_id: string;
  rider_contact_id?: string | null;
  payer_contact_id: string;
  created_by_user_id?: string | null;
}) {
  await ensureHorseOrganizationLink({
    organization_id: input.organization_id,
    horse_id: input.horse_id,
    source: "entry",
    created_by_user_id: input.created_by_user_id,
  });
  await ensureContactOrganizationLink({
    organization_id: input.organization_id,
    contact_id: input.owner_contact_id,
    source: "entry",
    created_by_user_id: input.created_by_user_id,
  });
  if (input.rider_contact_id) {
    await ensureContactOrganizationLink({
      organization_id: input.organization_id,
      contact_id: input.rider_contact_id,
      source: "entry",
      created_by_user_id: input.created_by_user_id,
    });
  }
  await ensureContactOrganizationLink({
    organization_id: input.organization_id,
    contact_id: input.payer_contact_id,
    source: "entry",
    created_by_user_id: input.created_by_user_id,
  });
}

async function ensureStallBookingOrganizationLinks(input: {
  organization_id: string;
  horse_id?: string | null;
  booker_contact_id: string;
  payer_contact_id: string;
  created_by_user_id?: string | null;
}) {
  if (input.horse_id) {
    await ensureHorseOrganizationLink({
      organization_id: input.organization_id,
      horse_id: input.horse_id,
      source: "reservation",
      created_by_user_id: input.created_by_user_id,
    });
  }
  await ensureContactOrganizationLink({
    organization_id: input.organization_id,
    contact_id: input.booker_contact_id,
    source: "reservation",
    created_by_user_id: input.created_by_user_id,
  });
  await ensureContactOrganizationLink({
    organization_id: input.organization_id,
    contact_id: input.payer_contact_id,
    source: "reservation",
    created_by_user_id: input.created_by_user_id,
  });
}

const userProfileTypes = ["owner", "agent", "secretary", "admin"] as const;

function profileDefaultsFromUser(user: User): Pick<UserProfile, "first_name" | "last_name" | "phone" | "type_user"> {
  const metadata = user.user_metadata ?? {};
  const emailName = user.email?.split("@")[0] ?? "user";
  const [firstName, ...rest] = emailName.split(/[._-]/).filter(Boolean);

  return {
    first_name: metadataText(metadata, "first_name") ?? titleCase(firstName),
    last_name: metadataText(metadata, "last_name") ?? titleCase(rest.join(" ")),
    phone: metadataText(metadata, "phone"),
    type_user: profileTypeFromMetadata(metadata) ?? "owner",
  };
}

function missingUserProfileFields(
  profile: UserProfile,
  defaults: Pick<UserProfile, "first_name" | "last_name" | "phone" | "type_user">,
) {
  const patch: Partial<Pick<UserProfile, "first_name" | "last_name" | "phone" | "type_user">> = {};

  if (!profile.first_name && defaults.first_name) {
    patch.first_name = defaults.first_name;
  }

  if (!profile.last_name && defaults.last_name) {
    patch.last_name = defaults.last_name;
  }

  if (!profile.phone && defaults.phone) {
    patch.phone = defaults.phone;
  }

  if (!profile.type_user && defaults.type_user) {
    patch.type_user = defaults.type_user;
  }

  return patch;
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

function profileTypeFromMetadata(metadata: Record<string, unknown>): UserProfile["type_user"] {
  const value = metadataText(metadata, "type_user") ?? metadataText(metadata, "account_type");

  if (value && userProfileTypes.includes(value as NonNullable<UserProfile["type_user"]>)) {
    return value as NonNullable<UserProfile["type_user"]>;
  }

  return null;
}

async function claimContactsForCurrentUser() {
  const client = requireSupabase();
  const { error } = await client.rpc("claim_contacts_for_current_user");

  if (error && !isMissingRpcError(error, "claim_contacts_for_current_user")) {
    throw error;
  }
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

async function findExistingContactByEmail(normalizedEmail: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("contacts")
    .select("*")
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: true })
    .returns<Contact[]>();

  if (error) {
    throw error;
  }

  const visibleContacts = data ?? [];

  return visibleContacts[0] ?? null;
}

async function reuseContactByEmail(input: ContactInput, normalizedEmail: string, roles: ContactRoleName[]) {
  const client = requireSupabase();
  const { data, error } = await client
    .rpc("reuse_contact_by_email", {
      target_barn_name: input.barn_name?.trim() || null,
      target_created_by_user_id: input.created_by_user_id || null,
      target_email: normalizedEmail,
      target_first_name: input.first_name.trim(),
      target_last_name: input.last_name.trim(),
      target_linked_user_id: input.linked_user_id || null,
      target_organization_id: input.organization_id,
      target_phone: input.phone?.trim() || null,
      target_roles: roles,
      target_type: input.type,
    })
    .single<Contact>();

  if (error) {
    if (isMissingRpcError(error, "reuse_contact_by_email")) {
      return null;
    }

    throw error;
  }

  return data;
}

async function enrichExistingContact(existing: Contact, input: ContactInput) {
  const client = requireSupabase();
  const patch: Record<string, unknown> = {};
  const phone = input.phone?.trim();
  const barnName = input.barn_name?.trim();
  const normalizedEmail = normalizeEmail(input.email);

  if (!existing.email && normalizedEmail) {
    patch.email = normalizedEmail;
  }

  if (!existing.phone && phone) {
    patch.phone = phone;
  }

  if (!existing.barn_name && barnName) {
    patch.barn_name = barnName;
  }

  if (!existing.linked_user_id && input.linked_user_id) {
    patch.linked_user_id = input.linked_user_id;
  }

  if (existing.type === "other" && input.type !== "other") {
    patch.type = input.type;
  }

  if (!Object.keys(patch).length) {
    return existing;
  }

  const { data, error } = await client
    .from("contacts")
    .update(patch)
    .eq("id", existing.id)
    .select("*")
    .single<Contact>();

  if (error) {
    throw error;
  }

  return data;
}

function uniqueRoles(roles: ContactRoleName[]) {
  return Array.from(new Set(roles.filter(Boolean)));
}

function deriveContactRolesFromContacts(contacts: Contact[]): ContactRole[] {
  return contacts.map((contact) => ({
    id: `${contact.id}-${contact.type}`,
    organization_id: contact.organization_id,
    contact_id: contact.id,
    role: contact.type,
    source: "contact_type",
    created_at: contact.created_at,
  }));
}

function deriveContactOrganizationLinksFromContacts(contacts: Contact[]): ContactOrganizationLink[] {
  return contacts.map((contact) => ({
    id: `${contact.organization_id}-${contact.id}`,
    organization_id: contact.organization_id,
    contact_id: contact.id,
    source: "created_here",
    created_by_user_id: null,
    created_at: contact.created_at,
  }));
}

function deriveHorseOrganizationLinksFromHorses(horses: Horse[]): HorseOrganizationLink[] {
  return horses.map((horse) => ({
    id: `${horse.organization_id}-${horse.id}`,
    organization_id: horse.organization_id,
    horse_id: horse.id,
    source: "created_here",
    created_by_user_id: null,
    created_at: horse.created_at,
  }));
}

function titleCase(value: string) {
  if (!value) {
    return null;
  }

  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function birthYearFromDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function showScorePaidWarmupRow(input: ShowScorePaidWarmupInput) {
  return cleanPayload({
    id: input.id || crypto.randomUUID(),
    organization_id: input.organization_id,
    show_id: input.show_id,
    show_day_id: input.show_day_id,
    name: input.name.trim() || "Paid warm up",
    arena: nullableTrim(input.arena),
    duration_minutes_per_rider: normalizePositiveInteger(input.duration_minutes_per_rider, 5),
    drag_interval: normalizeNullablePositiveInteger(input.drag_interval),
    drag_duration_minutes: normalizeNonNegativeInteger(input.drag_duration_minutes, 8),
    schedule_start_mode: normalizeScheduleStartMode(input.schedule_start_mode),
    schedule_start_time: input.schedule_start_mode === "fixed" ? nullableTrim(input.schedule_start_time) : null,
    is_public_live: Boolean(input.is_public_live),
    active_entry_id: input.active_entry_id || null,
    active_started_at: input.active_started_at || null,
    entries: normalizeShowScorePaidWarmupEntries(input.entries),
    sort_order: normalizePositiveInteger(input.sort_order, 1),
    legacy_payload: input.legacy_payload ?? null,
  });
}

function showScorePaidWarmupPatch(input: ShowScorePaidWarmupUpdateInput) {
  const scheduleStartMode = input.schedule_start_mode === undefined ? undefined : normalizeScheduleStartMode(input.schedule_start_mode);

  return cleanPayload({
    show_day_id: input.show_day_id,
    name: input.name == null ? input.name : input.name.trim() || "Paid warm up",
    arena: nullableTrim(input.arena),
    duration_minutes_per_rider: normalizeOptionalPositiveInteger(input.duration_minutes_per_rider),
    drag_interval: input.drag_interval === undefined ? undefined : normalizeNullablePositiveInteger(input.drag_interval),
    drag_duration_minutes: normalizeOptionalNonNegativeInteger(input.drag_duration_minutes),
    schedule_start_mode: scheduleStartMode,
    schedule_start_time: scheduleStartMode === "fixed" ? nullableTrim(input.schedule_start_time) : scheduleStartMode ? null : nullableTrim(input.schedule_start_time),
    is_public_live: input.is_public_live,
    active_entry_id: input.active_entry_id,
    active_started_at: input.active_started_at,
    entries: input.entries === undefined ? undefined : normalizeShowScorePaidWarmupEntries(input.entries),
    sort_order: normalizeOptionalPositiveInteger(input.sort_order),
    legacy_payload: input.legacy_payload,
  });
}

function normalizeShowScorePaidWarmupEntries(entries?: ShowScorePaidWarmupEntry[]) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    id: entry.id,
    order: index + 1,
    rider: entry.rider || "",
    status: normalizePaidWarmupEntryStatus(entry.status),
    completedAt: entry.completedAt || null,
  }));
}

function normalizePaidWarmupEntryStatus(status: ShowScorePaidWarmupEntry["status"]) {
  return status === "done" || status === "no_show" || status === "scratch" ? status : "pending";
}

function normalizeScheduleStartMode(mode?: ScheduleStartMode | null): ScheduleStartMode {
  return mode === "fixed" || mode === "after_previous" ? mode : "unscheduled";
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOptionalPositiveInteger(value: unknown) {
  return value === undefined ? undefined : normalizePositiveInteger(value, 1);
}

function normalizeNullablePositiveInteger(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeOptionalNonNegativeInteger(value: unknown) {
  return value === undefined ? undefined : normalizeNonNegativeInteger(value, 0);
}

function formatPaidWarmupEntryLabel(run: ReturnType<typeof buildShowScoreRunsForClass>[number]) {
  const parts = [];

  if (run.backNumber) {
    parts.push(`#${run.backNumber}`);
  }

  parts.push(run.rider || "Cavalier");

  if (run.horse) {
    parts.push(run.horse);
  }

  return parts.join(" · ");
}

function cleanPayload<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function nullableTrim(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
}

function normalizeCountry(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim().toUpperCase().slice(0, 2) || null;
}

function normalizeState(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim().toUpperCase() || null;
}

function normalizeTaxRate(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(99.999, Number(value.toFixed(3)))) : 0;
}

function isMissingShowScoreSchemaError(error: { code?: string; message?: string }) {
  return isMissingSchemaError(error, "show_score_class_setups");
}

const AQR_AUDIT_IMPORT_MIGRATION_MESSAGE =
  "Le module Audit AQR n'est pas encore installe dans Supabase. Applique la migration 0065_aqr_audit_import_batches.sql dans le projet Supabase partage avant d'utiliser l'import ou le cleanup AQR.";

function toAqrAuditImportSchemaError(error: unknown) {
  return isAqrAuditImportSchemaError(error) ? new Error(AQR_AUDIT_IMPORT_MIGRATION_MESSAGE) : toServiceError(error);
}

function isAqrAuditImportSchemaError(error: unknown) {
  const pgError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = `${pgError?.message ?? ""} ${pgError?.details ?? ""} ${pgError?.hint ?? ""}`.toLowerCase();

  return (
    isMissingSchemaError(pgError, "entry_import_batches") ||
    isMissingColumnError(pgError, "import_source") ||
    isMissingColumnError(pgError, "import_batch_id") ||
    isMissingColumnError(pgError, "external_source_key") ||
    isMissingColumnError(pgError, "source_payload") ||
    (message.includes("entry_import_batches") && (message.includes("does not exist") || message.includes("schema cache")))
  );
}

function isMissingColumnError(error: unknown, columnName: string) {
  const pgError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = `${pgError?.message ?? ""} ${pgError?.details ?? ""} ${pgError?.hint ?? ""}`.toLowerCase();
  const normalizedColumn = columnName.toLowerCase();

  return (
    pgError?.code === "42703" ||
    ((message.includes("column") || message.includes("schema cache") || message.includes("could not find")) &&
      message.includes(normalizedColumn) &&
      (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find")))
  );
}

function toServiceError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return new Error((error as { message: string }).message);
  }

  return new Error(String(error));
}

function isMissingSchemaError(error: { code?: string; message?: string }, relationName: string) {
  const message = String(error.message || "").toLowerCase();
  return error.code === "42P01" || (message.includes("schema cache") && message.includes(relationName));
}

export async function setOrganizationPlan(input: {
  organizationId: string;
  plan: 'community' | 'professional' | 'premium';
  expiresAt?: string | null;
  notes?: string | null;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("set_organization_plan", {
    target_org_id: input.organizationId,
    target_plan: input.plan,
    target_expires_at: input.expiresAt ?? null,
    target_notes: input.notes ?? null,
  });

  if (error) throw error;
}

function isMissingRpcError(error: { code?: string; message?: string }, functionName: string) {
  const message = String(error.message || "").toLowerCase();
  const normalizedFunctionName = functionName.toLowerCase();

  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    (message.includes("schema cache") && message.includes(normalizedFunctionName)) ||
    message.includes(`function public.${normalizedFunctionName}`)
  );
}
