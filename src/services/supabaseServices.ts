import type { User } from "@supabase/supabase-js";
import { buildEligibilityFingerprint, eligibilityExpiresAt } from "../lib/eligibilityEngine";
import { requireSupabase } from "../lib/supabase";
import type {
  BlockInput,
  Block,
  BlockConcurrencyGroup,
  BlockConcurrencyGroupMember,
  BlockJudgeAssignment,
  BlockTemplate,
  ClassTemplate,
  ClassTemplateInput,
  ClassTemplateUpdateInput,
  BlockTemplateInput,
  BlockTemplateUpdateInput,
  BlockUpdateInput,
  Contact,
  ContactExternalIdentifier,
  ContactInput,
  ContactOrganizationMembership,
  ContactOrganizationMembershipInput,
  ContactOrganizationLink,
  ContactRole,
  ContactRoleName,
  ContactUpdateInput,
  Discipline,
  DirectoryContact,
  DirectoryHorse,
  ClassRecord,
  ClassInput,
  ClassUpdateInput,
  EntryImportBatch,
  EntryResult,
  Entry,
  EntryInput,
  EntryUpdateInput,
  ExternalHorseIdentifierInput,
  ExternalDataSource,
  ExternalSourceGoverningBody,
  Horse,
  HorseExternalIdentifier,
  HorseHealthDocument,
  HorseHealthCompliance,
  HorseHealthComplianceOverview,
  HorseDocumentValidation,
  HorseIdentityLock,
  HorseIdentityCorrection,
  HorseOrganizationLink,
  HorseContact,
  HorseInput,
  HorseUpdateInput,
  ExternalContactIdentifierInput,
  ExternalCredentialIssuer,
  GoverningBodyAssignment,
  GoverningBodyAssignmentInput,
  Invoice,
  InvoiceLineItem,
  ManualSale,
  ManualSaleInput,
  NrhaRiderRanking,
  NrhaRiderRankingListType,
  Organization,
  OrganizationBackNumber,
  OrganizationExternalCredentialRequirement,
  OrganizationHealthDocumentReview,
  OrganizationHealthPolicy,
  OrganizationHealthPolicyInput,
  OrganizationInput,
  OrganizationMembershipType,
  OrganizationMembershipTypeInput,
  OrganizationMembershipTypeUpdateInput,
  OrganizationMember,
  OrganizationDiscipline,
  OrganizationProduct,
  OrganizationProductInput,
  OrganizationProductUpdateInput,
  OrganizationSettingsInput,
  SanctioningBody,
  Slate,
  SlateInput,
  SlateUpdateInput,
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
  ShowScoreBlockSetup,
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
  matchRunClasses,
  normalizeShowScoreDrawRun,
  previewShowScoreDrawEntryImport as buildAqrAuditImportPreview,
  restoreRunTechnicalSnapshot,
  type NormalizedShowScoreDrawRun,
  type RunTechnicalSnapshot,
} from "../lib/aqrAuditImport";
import { buildShowScoreRunsForClass, type ShowScoreRun } from "./showScoreAdapters";
import { compareContactIdentity, compareHorseIdentity, type IdentityMatchConfidence } from "../lib/identityComparison";

const inactiveEntryStatuses: Entry["status"][] = ["cancelled", "scratched", "scratched_pending_refund"];

export type AppContext = {
  profile: UserProfile;
  isPlatformAdmin: boolean;
  loadedOrganizationId: string | null;
  organizations: Organization[];
  organizationMembers: OrganizationMember[];
  shows: Show[];
  showDays: ShowDay[];
  disciplines: Discipline[];
  organizationDisciplines: OrganizationDiscipline[];
  slates: Slate[];
  showAnnouncements: ShowAnnouncement[];
  showScoreClassSetups: ShowScoreBlockSetup[];
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
  directoryContacts: DirectoryContact[];
  contactRoles: ContactRole[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  externalDataSources: ExternalDataSource[];
  externalSourceGoverningBodies: ExternalSourceGoverningBody[];
  organizationExternalCredentialRequirements: OrganizationExternalCredentialRequirement[];
  organizationHealthPolicies: OrganizationHealthPolicy[];
  organizationHealthDocumentReviews: OrganizationHealthDocumentReview[];
  organizationMembershipTypes: OrganizationMembershipType[];
  contactOrganizationMemberships: ContactOrganizationMembership[];
  organizationProducts: OrganizationProduct[];
  manualSales: ManualSale[];
  nrhaRiderRankings: NrhaRiderRanking[];
  contactExternalIdentifiers: ContactExternalIdentifier[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  horseOrganizationLinks: HorseOrganizationLink[];
  directoryHorses: DirectoryHorse[];
  horseContacts: HorseContact[];
  organizationBackNumbers: OrganizationBackNumber[];
  blocks: Block[];
  blockJudgeAssignments: BlockJudgeAssignment[];
  blockConcurrencyGroups: BlockConcurrencyGroup[];
  blockConcurrencyGroupMembers: BlockConcurrencyGroupMember[];
  blockTemplates: BlockTemplate[];
  classTemplates: ClassTemplate[];
  classes: ClassRecord[];
  sanctioningBodies: SanctioningBody[];
  entries: Entry[];
  stallOptions: StallOption[];
  stallBookings: StallBooking[];
  invoices: Invoice[];
  invoiceLineItems: InvoiceLineItem[];
};

export type ContactIdentityCandidate = {
  contact_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  email_hint: string | null;
  phone_hint: string | null;
  already_linked: boolean;
  search_signature: string;
  score: number;
  confidence: IdentityMatchConfidence;
  reasons: string[];
};

export type HorseIdentityCandidate = {
  horse_id: string;
  name: string;
  registration_number: string | null;
  date_of_birth: string | null;
  birth_year: number | null;
  gender: Horse["gender"];
  primary_owner_contact_id: string;
  already_linked: boolean;
  search_signature: string;
  score: number;
  confidence: IdentityMatchConfidence;
  reasons: string[];
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

function scopeQueryToOrganization<T>(query: T, organizationId: string | null, column = "organization_id"): T {
  if (!organizationId) return query;
  return (query as T & { eq: (targetColumn: string, value: string) => T }).eq(column, organizationId);
}

function scopeQueryToIds<T>(query: T, ids: string[], column: string): T {
  return (query as T & { in: (targetColumn: string, values: string[]) => T }).in(column, ids);
}

export async function loadAppContext(user: User, requestedOrganizationId?: string): Promise<AppContext> {
  const client = requireSupabase();
  const profile = await ensureUserProfile(user);

  const [organizationsResult, organizationMembersResult] = await Promise.all([
    client.from("organizations").select("*").order("created_at", { ascending: false }).returns<Organization[]>(),
    client.from("organization_members").select("*").order("created_at", { ascending: false }).returns<OrganizationMember[]>(),
  ]);

  if (organizationsResult.error) throw organizationsResult.error;
  if (organizationMembersResult.error) throw organizationMembersResult.error;

  const organizations = organizationsResult.data ?? [];
  const loadedOrganizationId = requestedOrganizationId && organizations.some((organization) => organization.id === requestedOrganizationId)
    ? requestedOrganizationId
    : organizations[0]?.id ?? null;

  const [showsResult, contactOrganizationLinksResult, horseOrganizationLinksResult] = await Promise.all([
    scopeQueryToOrganization(client.from("shows").select("*").order("start_date", { ascending: true }).returns<Show[]>(), loadedOrganizationId),
    loadedOrganizationId
      ? client
          .from("directory_contacts")
          .select("id, organization_discipline_id, contact_id, source, notes, metadata, created_by_user_id, created_at, updated_at, organization_disciplines!inner(organization_id)")
          .eq("organization_disciplines.organization_id", loadedOrganizationId)
          .order("created_at", { ascending: false })
      : client
          .from("directory_contacts")
          .select("id, organization_discipline_id, contact_id, source, notes, metadata, created_by_user_id, created_at, updated_at, organization_disciplines!inner(organization_id)")
          .order("created_at", { ascending: false }),
    loadedOrganizationId
      ? client
          .from("directory_horses")
          .select("id, organization_discipline_id, horse_id, source, notes, metadata, created_by_user_id, created_at, updated_at, organization_disciplines!inner(organization_id)")
          .eq("organization_disciplines.organization_id", loadedOrganizationId)
          .order("created_at", { ascending: false })
      : client
          .from("directory_horses")
          .select("id, organization_discipline_id, horse_id, source, notes, metadata, created_by_user_id, created_at, updated_at, organization_disciplines!inner(organization_id)")
          .order("created_at", { ascending: false }),
  ]);

  if (contactOrganizationLinksResult.error) throw contactOrganizationLinksResult.error;
  if (horseOrganizationLinksResult.error) throw horseOrganizationLinksResult.error;
  if (showsResult.error) throw showsResult.error;

  const directoryContactIds = Array.from(new Set((contactOrganizationLinksResult.data ?? []).map((row) => row.contact_id)));
  const directoryHorseIds = Array.from(new Set((horseOrganizationLinksResult.data ?? []).map((row) => row.horse_id)));
  const showIds = (showsResult.data ?? []).map((show) => show.id);
  const horsesQuery = scopeQueryToIds(
    client.from("horses").select("*").order("created_at", { ascending: false }).returns<Horse[]>(),
    directoryHorseIds,
    "id",
  );
  const horsesResult = await horsesQuery;
  const { data: horsesData, error: horsesError } = horsesResult;
  if (horsesError) throw horsesError;

  const horseIds = (horsesData ?? []).map((horse) => horse.id);
  const [horseContactsResult, horseExternalIdentifiersResult, horseHealthDocumentsResult] = await Promise.all([
    scopeQueryToIds(client.from("horse_contacts").select("*").order("created_at", { ascending: false }).returns<HorseContact[]>(), horseIds, "horse_id"),
    scopeQueryToIds(client.from("horse_external_identifiers").select("*").order("created_at", { ascending: false }).returns<HorseExternalIdentifier[]>(), horseIds, "horse_id"),
    scopeQueryToIds(client.from("horse_documents").select("*").order("created_at", { ascending: false }).returns<HorseHealthDocument[]>(), horseIds, "horse_id"),
  ]);

  if (horseContactsResult.error) throw horseContactsResult.error;

  const relatedContactIds = Array.from(new Set([
    ...directoryContactIds,
    ...(horsesData ?? []).map((horse) => horse.primary_owner_contact_id),
    ...(horseContactsResult.data ?? []).map((horseContact) => horseContact.contact_id),
  ]));
  const [contactsResult, contactExternalIdentifiersResult] = await Promise.all([
    scopeQueryToIds(client.from("contacts").select("*").order("created_at", { ascending: false }).returns<Contact[]>(), relatedContactIds, "id"),
    scopeQueryToIds(client.from("contact_external_identifiers").select("*").order("created_at", { ascending: false }).returns<ContactExternalIdentifier[]>(), relatedContactIds, "contact_id"),
  ]);

  const [
    showDaysResult,
    disciplinesResult,
    organizationDisciplinesResult,
    slatesResult,
    contactRolesResult,
    externalCredentialIssuersResult,
    externalDataSourcesResult,
    externalSourceGoverningBodiesResult,
    organizationExternalCredentialRequirementsResult,
    organizationHealthPoliciesResult,
    organizationHealthDocumentReviewsResult,
    organizationMembershipTypesResult,
    contactOrganizationMembershipsResult,
    organizationProductsResult,
    manualSalesResult,
    nrhaRiderRankingsResult,
    organizationBackNumbersResult,
    blocksResult,
    blockJudgeAssignmentsResult,
    blockConcurrencyGroupsResult,
    blockTemplatesResult,
    classTemplatesResult,
    classesResult,
    sanctioningBodiesResult,
    entriesResult,
    stallOptionsResult,
    stallBookingsResult,
    invoicesResult,
    invoiceLineItemsResult,
    showAnnouncementsResult,
    scoredRunsResult,
    blockRunEntriesResult,
    entryResultsResult,
    payoutSchedulesResult,
    payoutScheduleBracketsResult,
    payoutCalculationsResult,
    showScorePaidWarmupsResult,
    entryImportBatchesResult,
  ] = await Promise.all([
    scopeQueryToOrganization(client.from("show_days").select("*").order("day_date", { ascending: true }).returns<ShowDay[]>(), loadedOrganizationId),
    client.from("disciplines").select("*").eq("is_active", true).order("name", { ascending: true }).returns<Discipline[]>(),
    scopeQueryToOrganization(client.from("organization_disciplines").select("*").eq("is_active", true).order("created_at", { ascending: true }).returns<OrganizationDiscipline[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("slates").select("*").order("sort_order", { ascending: true }).returns<Slate[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("contact_roles").select("*").order("created_at", { ascending: false }).returns<ContactRole[]>(), loadedOrganizationId),
    client.from("external_credential_issuers").select("*").order("name", { ascending: true }).returns<ExternalCredentialIssuer[]>(),
    client.from("external_data_sources").select("*").eq("is_active", true).order("name", { ascending: true }).returns<ExternalDataSource[]>(),
    client.from("external_source_governing_bodies").select("*").eq("is_active", true).returns<ExternalSourceGoverningBody[]>(),
    scopeQueryToOrganization(client.from("organization_external_credential_requirements").select("*").order("created_at", { ascending: false }).returns<OrganizationExternalCredentialRequirement[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("organization_health_policies").select("*").order("effective_from", { ascending: false }).returns<OrganizationHealthPolicy[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("organization_health_document_reviews").select("*").order("reviewed_at", { ascending: false }).returns<OrganizationHealthDocumentReview[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("organization_membership_types").select("*").order("season_year", { ascending: false }).order("name", { ascending: true }).returns<OrganizationMembershipType[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("contact_organization_memberships").select("*").order("created_at", { ascending: false }).returns<ContactOrganizationMembership[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("organization_products").select("*").order("category", { ascending: true }).order("name", { ascending: true }).returns<OrganizationProduct[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("manual_sales").select("*").order("created_at", { ascending: false }).returns<ManualSale[]>(), loadedOrganizationId),
    client.from("nrha_rider_rankings").select("*").order("eligibility_year", { ascending: false }).order("list_type", { ascending: true }).order("rank", { ascending: true }).returns<NrhaRiderRanking[]>(),
    scopeQueryToOrganization(client.from("organization_back_numbers").select("*").order("number", { ascending: true }).returns<OrganizationBackNumber[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("blocks").select("*").order("created_at", { ascending: false }).returns<Block[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("block_judge_assignments").select("*").order("sort_order", { ascending: true }).returns<BlockJudgeAssignment[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("block_concurrency_groups").select("*").order("name", { ascending: true }).returns<BlockConcurrencyGroup[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("block_templates").select("*").order("sort_order", { ascending: true }).returns<BlockTemplate[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("class_templates").select("*").order("sort_order", { ascending: true }).returns<ClassTemplate[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("classes").select("*").order("created_at", { ascending: false }).returns<ClassRecord[]>(), loadedOrganizationId),
    client.from("governing_bodies").select("*").eq("is_active", true).order("name", { ascending: true }).returns<SanctioningBody[]>(),
    scopeQueryToOrganization(client.from("entries").select("*").order("created_at", { ascending: false }).returns<Entry[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("stall_options").select("*").order("created_at", { ascending: false }).returns<StallOption[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("stall_bookings").select("*").order("created_at", { ascending: false }).returns<StallBooking[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("invoices").select("*").order("created_at", { ascending: false }).limit(20).returns<Invoice[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("invoice_line_items").select("*").order("created_at", { ascending: false }).returns<InvoiceLineItem[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("show_announcements").select("*").order("created_at", { ascending: false }).returns<ShowAnnouncement[]>(), loadedOrganizationId),
    scopeQueryToIds(client.from("scored_runs").select("*").order("scored_at", { ascending: false }).returns<ScoredRun[]>(), showIds, "show_id"),
    scopeQueryToIds(client.from("block_run_entries").select("*").order("order_of_go", { ascending: true }).returns<BlockRunEntry[]>(), showIds, "show_id"),
    scopeQueryToIds(client.from("entry_results").select("*").order("synced_at", { ascending: false }).returns<EntryResult[]>(), showIds, "show_id"),
    client.from("payout_schedules").select("*").order("federation", { ascending: true }).order("name", { ascending: true }).returns<PayoutSchedule[]>(),
    client.from("payout_schedule_brackets").select("*").order("min_entries", { ascending: true }).order("place", { ascending: true }).returns<PayoutScheduleBracket[]>(),
    scopeQueryToIds(client.from("payout_calculations").select("*").order("calculated_at", { ascending: false }).returns<PayoutCalculation[]>(), showIds, "show_id"),
    scopeQueryToOrganization(client.from("show_score_paid_warmups").select("*").order("sort_order", { ascending: true }).returns<ShowScorePaidWarmup[]>(), loadedOrganizationId),
    scopeQueryToOrganization(client.from("entry_import_batches").select("*").order("created_at", { ascending: false }).returns<EntryImportBatch[]>(), loadedOrganizationId),
  ]);
  const [blockConcurrencyGroupMembersResult, blockRunClassEntriesResult, payoutAwardsResult] = await Promise.all([
    scopeQueryToIds(
      client.from("block_concurrency_group_members").select("*").order("sort_order", { ascending: true }).returns<BlockConcurrencyGroupMember[]>(),
      (blockConcurrencyGroupsResult.data ?? []).map((group) => group.id),
      "group_id",
    ),
    scopeQueryToIds(
      client.from("block_run_class_entries").select("*").returns<BlockRunClassEntry[]>(),
      (blockRunEntriesResult.data ?? []).map((entry) => entry.block_run_id),
      "block_run_id",
    ),
    scopeQueryToIds(
      client.from("payout_awards").select("*").order("rank", { ascending: true }).returns<PayoutAward[]>(),
      (payoutCalculationsResult.data ?? []).map((calculation) => calculation.id),
      "calculation_id",
    ),
  ]);
  const showScoreClassSetups = await loadShowScoreClassSetups(loadedOrganizationId);

  const { data: isPlatformAdminData } = await client.rpc("is_platform_admin").returns<boolean>();
  const isPlatformAdmin = Boolean(isPlatformAdminData);

  if (showDaysResult.error) {
    throw showDaysResult.error;
  }

  if (disciplinesResult.error) {
    throw disciplinesResult.error;
  }
  if (organizationDisciplinesResult.error) {
    throw organizationDisciplinesResult.error;
  }
  if (slatesResult.error) {
    throw slatesResult.error;
  }

  if (contactsResult.error) {
    throw contactsResult.error;
  }

  const contactOrganizationLinks = contactOrganizationLinksResult.error
    ? null
    : (contactOrganizationLinksResult.data ?? []).map(directoryContactRowToOrganizationLink);

  if (!contactOrganizationLinks) {
    throw contactOrganizationLinksResult.error;
  }
  const directoryContacts = (contactOrganizationLinksResult.data ?? []).map(directoryContactRowToDirectoryContact);

  const contactRoles = contactRolesResult.error
    ? null
    : contactRolesResult.data ?? [];

  if (!contactRoles) {
    throw contactRolesResult.error;
  }

  const externalCredentialIssuers = externalCredentialIssuersResult.error
    ? isMissingSchemaError(externalCredentialIssuersResult.error, "external_credential_issuers")
      ? []
      : null
    : externalCredentialIssuersResult.data ?? [];

  if (!externalCredentialIssuers) {
    throw externalCredentialIssuersResult.error;
  }

  const externalDataSources = externalDataSourcesResult.error
    ? isMissingSchemaError(externalDataSourcesResult.error, "external_data_sources")
      ? []
      : null
    : externalDataSourcesResult.data ?? [];

  if (!externalDataSources) {
    throw externalDataSourcesResult.error;
  }

  const externalSourceGoverningBodies = externalSourceGoverningBodiesResult.error
    ? isMissingSchemaError(externalSourceGoverningBodiesResult.error, "external_source_governing_bodies")
      ? []
      : null
    : externalSourceGoverningBodiesResult.data ?? [];

  if (!externalSourceGoverningBodies) {
    throw externalSourceGoverningBodiesResult.error;
  }

  const organizationExternalCredentialRequirements = organizationExternalCredentialRequirementsResult.error
    ? isMissingSchemaError(organizationExternalCredentialRequirementsResult.error, "organization_external_credential_requirements")
      ? []
      : null
    : organizationExternalCredentialRequirementsResult.data ?? [];

  if (!organizationExternalCredentialRequirements) {
    throw organizationExternalCredentialRequirementsResult.error;
  }

  const organizationHealthPolicies = organizationHealthPoliciesResult.error
    ? isMissingSchemaError(organizationHealthPoliciesResult.error, "organization_health_policies")
      ? []
      : null
    : organizationHealthPoliciesResult.data ?? [];

  if (!organizationHealthPolicies) {
    throw organizationHealthPoliciesResult.error;
  }

  const organizationHealthDocumentReviews = organizationHealthDocumentReviewsResult.error
    ? isMissingSchemaError(organizationHealthDocumentReviewsResult.error, "organization_health_document_reviews")
      ? []
      : null
    : organizationHealthDocumentReviewsResult.data ?? [];

  if (!organizationHealthDocumentReviews) {
    throw organizationHealthDocumentReviewsResult.error;
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

  const contactExternalIdentifiers = contactExternalIdentifiersResult.error
    ? isMissingSchemaError(contactExternalIdentifiersResult.error, "contact_external_identifiers")
      ? []
      : null
    : (contactExternalIdentifiersResult.data ?? []).map(hydrateContactExternalIdentifier);

  if (!contactExternalIdentifiers) {
    throw contactExternalIdentifiersResult.error;
  }

  const horseExternalIdentifiers = horseExternalIdentifiersResult.error
    ? isMissingSchemaError(horseExternalIdentifiersResult.error, "horse_external_identifiers")
      ? []
      : null
    : (horseExternalIdentifiersResult.data ?? []).map(hydrateHorseExternalIdentifier);

  if (!horseExternalIdentifiers) {
    throw horseExternalIdentifiersResult.error;
  }

  const horseHealthDocuments = horseHealthDocumentsResult.error
    ? isMissingSchemaError(horseHealthDocumentsResult.error, "horse_documents")
      ? []
      : null
    : horseHealthDocumentsResult.data ?? [];

  if (!horseHealthDocuments) {
    throw horseHealthDocumentsResult.error;
  }

  const horseOrganizationLinks = horseOrganizationLinksResult.error
    ? null
    : (horseOrganizationLinksResult.data ?? []).map(directoryHorseRowToOrganizationLink);

  if (!horseOrganizationLinks) {
    throw horseOrganizationLinksResult.error;
  }
  const directoryHorses = (horseOrganizationLinksResult.data ?? []).map(directoryHorseRowToDirectoryHorse);

  const organizationBackNumbers = organizationBackNumbersResult.error
    ? isMissingSchemaError(organizationBackNumbersResult.error, "organization_back_numbers")
      ? []
      : null
    : organizationBackNumbersResult.data ?? [];

  if (!organizationBackNumbers) {
    throw organizationBackNumbersResult.error;
  }

  if (blocksResult.error) {
    throw blocksResult.error;
  }
  if (blockJudgeAssignmentsResult.error) {
    throw blockJudgeAssignmentsResult.error;
  }
  if (blockConcurrencyGroupsResult.error) {
    throw blockConcurrencyGroupsResult.error;
  }
  if (blockConcurrencyGroupMembersResult.error) {
    throw blockConcurrencyGroupMembersResult.error;
  }

  const blockTemplates = blockTemplatesResult.error
    ? isMissingSchemaError(blockTemplatesResult.error, "block_templates")
      ? []
      : null
    : blockTemplatesResult.data ?? [];

  if (!blockTemplates) {
    throw blockTemplatesResult.error;
  }

  const classTemplates = classTemplatesResult.error
    ? isMissingSchemaError(classTemplatesResult.error, "class_templates")
      ? []
      : null
    : classTemplatesResult.data ?? [];

  if (!classTemplates) {
    throw classTemplatesResult.error;
  }

  if (classesResult.error) {
    throw classesResult.error;
  }

  const sanctioningBodies = sanctioningBodiesResult.error
    ? isMissingSchemaError(sanctioningBodiesResult.error, "governing_bodies")
      ? []
      : null
    : sanctioningBodiesResult.data ?? [];

  if (!sanctioningBodies) {
    throw sanctioningBodiesResult.error;
  }

  const [classGoverningBodiesResult, classTemplateGoverningBodiesResult] = await Promise.all([
    scopeQueryToIds(
      client.from("class_governing_bodies").select("class_id,governing_body_id,reporting_class_code,eligibility_profile_code,sanction_metadata").returns<GoverningBodyLinkRow[]>(),
      (classesResult.data ?? []).map((classRecord) => classRecord.id),
      "class_id",
    ),
    scopeQueryToIds(
      client.from("class_template_governing_bodies").select("class_template_id,governing_body_id,reporting_class_code,eligibility_profile_code,sanction_metadata").returns<GoverningBodyLinkRow[]>(),
      classTemplates.map((classTemplate) => classTemplate.id),
      "class_template_id",
    ),
  ]);

  if (classGoverningBodiesResult.error) {
    throw classGoverningBodiesResult.error;
  }
  if (classTemplateGoverningBodiesResult.error) {
    throw classTemplateGoverningBodiesResult.error;
  }

  const governingBodyById = new Map(sanctioningBodies.map((body) => [body.id, body]));
  const classes = attachGoverningBodyAssignments(classesResult.data ?? [], classGoverningBodiesResult.data ?? [], "class_id", governingBodyById);
  const classTemplatesWithGoverningBodies = attachGoverningBodyAssignments(
    classTemplates,
    classTemplateGoverningBodiesResult.data ?? [],
    "class_template_id",
    governingBodyById,
  );

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
  const nrhaRiderRankings = nrhaRiderRankingsResult.error
    ? isMissingSchemaError(nrhaRiderRankingsResult.error, "nrha_rider_rankings")
      ? []
      : (() => { throw nrhaRiderRankingsResult.error; })()
    : nrhaRiderRankingsResult.data ?? [];

  return {
    profile,
    isPlatformAdmin,
    loadedOrganizationId,
    organizations,
    organizationMembers: organizationMembersResult.data ?? [],
    shows: showsResult.data ?? [],
    showDays: showDaysResult.data ?? [],
    disciplines: disciplinesResult.data ?? [],
    organizationDisciplines: organizationDisciplinesResult.data ?? [],
    slates: slatesResult.data ?? [],
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
    directoryContacts,
    contactRoles,
    externalCredentialIssuers,
    externalDataSources,
    externalSourceGoverningBodies,
    organizationExternalCredentialRequirements,
    organizationHealthPolicies,
    organizationHealthDocumentReviews,
    organizationMembershipTypes,
    contactOrganizationMemberships,
    organizationProducts,
    manualSales,
    nrhaRiderRankings,
    contactExternalIdentifiers,
    horseExternalIdentifiers,
    horseHealthDocuments,
    horses: horsesResult.data ?? [],
    horseOrganizationLinks,
    directoryHorses,
    horseContacts: horseContactsResult.data ?? [],
    organizationBackNumbers,
    blocks: blocksResult.data ?? [],
    blockJudgeAssignments: blockJudgeAssignmentsResult.data ?? [],
    blockConcurrencyGroups: blockConcurrencyGroupsResult.data ?? [],
    blockConcurrencyGroupMembers: blockConcurrencyGroupMembersResult.data ?? [],
    blockTemplates,
    classTemplates: classTemplatesWithGoverningBodies,
    classes,
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
  healthPolicy: OrganizationHealthPolicy | null;
  showDays: ShowDay[];
  blocks: Block[];
  classes: ClassRecord[];
  payoutCalculations: PayoutCalculation[];
  payoutAwards: PayoutAward[];
  stallOptions: StallOption[];
  announcements: ShowAnnouncement[];
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
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
    healthPolicyResult,
    daysResult,
    blocksResult,
    stallOptionsResult,
    announcementsResult,
    membershipReqResult,
    externalOrgsResult,
    sanctioningBodiesResult,
    payoutCalculationsResult,
  ] = await Promise.all([
    client.from("organizations").select("*").eq("id", show.organization_id).single<Organization>(),
    client
      .from("organization_health_policies")
      .select("*")
      .eq("organization_id", show.organization_id)
      .lte("effective_from", show.start_date)
      .or(`effective_until.is.null,effective_until.gte.${show.start_date}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle<OrganizationHealthPolicy>(),
    client.from("show_days").select("*").eq("show_id", show.id).order("sort_order", { ascending: true }).returns<ShowDay[]>(),
    client.from("blocks").select("*").eq("show_id", show.id).eq("schedule_is_public", true).order("sort_order", { ascending: true }).returns<Block[]>(),
    client.from("stall_options").select("*").eq("show_id", show.id).order("price", { ascending: true }).returns<StallOption[]>(),
    client.from("show_announcements").select("*").eq("show_id", show.id).order("created_at", { ascending: false }).returns<ShowAnnouncement[]>(),
    client.from("organization_external_credential_requirements").select("*").eq("organization_id", show.organization_id).returns<OrganizationExternalCredentialRequirement[]>(),
    client.from("external_credential_issuers").select("*").order("name", { ascending: true }).returns<ExternalCredentialIssuer[]>(),
    client.from("governing_bodies").select("*").eq("is_active", true).order("name", { ascending: true }).returns<SanctioningBody[]>(),
    client.from("payout_calculations").select("*").eq("show_id", show.id).eq("status", "published").order("published_at", { ascending: false }).returns<PayoutCalculation[]>(),
  ]);

  if (orgResult.error) throw orgResult.error;
  if (healthPolicyResult.error) throw healthPolicyResult.error;
  if (daysResult.error) throw daysResult.error;
  if (blocksResult.error) throw blocksResult.error;

  const blockIds = (blocksResult.data ?? []).map((block) => block.id);
  const classesResult = blockIds.length
    ? await client.from("classes").select("*").in("block_id", blockIds).eq("is_public", true).returns<ClassRecord[]>()
    : { data: [], error: null };

  if (classesResult.error) throw classesResult.error;

  const publicClassIds = (classesResult.data ?? []).map((classRecord) => classRecord.id);
  const { data: classGoverningBodies, error: classGoverningBodiesError } = publicClassIds.length
    ? await client
        .from("class_governing_bodies")
        .select("class_id,governing_body_id,reporting_class_code,eligibility_profile_code,sanction_metadata")
        .in("class_id", publicClassIds)
        .returns<GoverningBodyLinkRow[]>()
    : { data: [], error: null };

  if (classGoverningBodiesError) throw classGoverningBodiesError;
  const publicGoverningBodyById = new Map((sanctioningBodiesResult.data ?? []).map((body) => [body.id, body]));
  const publicClasses = attachGoverningBodyAssignments(classesResult.data ?? [], classGoverningBodies ?? [], "class_id", publicGoverningBodyById);

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
    healthPolicy: healthPolicyResult.data,
    showDays: daysResult.data ?? [],
    blocks: blocksResult.data ?? [],
    classes: publicClasses,
    payoutCalculations,
    payoutAwards,
    stallOptions: stallOptionsResult.data ?? [],
    announcements: announcementsResult.data ?? [],
    membershipRequirements: membershipReqResult.data ?? [],
    externalCredentialIssuers: externalOrgsResult.data ?? [],
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

export async function setOrganizationHealthPolicy(input: {
  organization_id: string;
  effective_from: string;
  policy: OrganizationHealthPolicyInput;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("set_organization_health_policy", {
    p_organization_id: input.organization_id,
    p_effective_from: input.effective_from,
    p_policy: input.policy,
  });

  if (error) {
    if (isMissingRpcError(error, "set_organization_health_policy")) {
      throw new Error("La migration des politiques de santé d'association n'est pas encore appliquée.");
    }
    throw error;
  }

  return data as OrganizationHealthPolicy;
}

export async function createOrganizationHealthDocumentReview(input: {
  organization_id: string;
  horse_document_id: string;
  status: OrganizationHealthDocumentReview["status"];
  review_notes?: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_organization_health_document_review", {
    p_organization_id: input.organization_id,
    p_horse_document_id: input.horse_document_id,
    p_status: input.status,
    p_review_notes: input.review_notes ?? null,
  });

  if (error) {
    if (isMissingRpcError(error, "create_organization_health_document_review")) {
      throw new Error("La migration des révisions santé par association n'est pas encore appliquée.");
    }
    throw error;
  }

  return data as OrganizationHealthDocumentReview;
}

export async function getHorseHealthCompliance(input: {
  horse_id: string;
  organization_id: string;
  reference_date?: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_horse_health_compliance", {
    p_horse_id: input.horse_id,
    p_organization_id: input.organization_id,
    p_reference_date: input.reference_date ?? null,
  });

  if (error) {
    if (isMissingRpcError(error, "get_horse_health_compliance")) {
      throw new Error("La migration du calcul de conformité santé n'est pas encore appliquée.");
    }
    throw error;
  }

  const result = (data as HorseHealthCompliance[] | null)?.[0];
  if (!result) {
    throw new Error("Le calcul de conformité santé n'a retourné aucun résultat.");
  }

  return result;
}

export async function listHorseHealthCompliance(input: {
  horse_ids?: string[];
  organization_id?: string;
  reference_date?: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("list_horse_health_compliance", {
    p_horse_ids: input.horse_ids?.length ? input.horse_ids : null,
    p_organization_id: input.organization_id ?? null,
    p_reference_date: input.reference_date ?? null,
  });

  if (error) {
    if (isMissingRpcError(error, "list_horse_health_compliance")) {
      throw new Error("La migration de présentation de la conformité santé n'est pas encore appliquée.");
    }
    throw error;
  }

  return (data ?? []) as HorseHealthComplianceOverview[];
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

export async function createSlate(input: SlateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("slates")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      governing_body_id: input.governing_body_id ?? null,
      name: input.name.trim(),
      technical_number: input.technical_number?.trim() || null,
      sort_order: input.sort_order ?? 1,
      reporting_rules: input.reporting_rules ?? {},
      notes: input.notes?.trim() || null,
      created_by_user_id: input.created_by_user_id ?? null,
    })
    .select("*")
    .single<Slate>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSlate(id: string, input: SlateUpdateInput) {
  const client = requireSupabase();
  const payload = cleanPayload({
    ...input,
    name: input.name === undefined ? undefined : input.name.trim(),
    governing_body_id: input.governing_body_id === undefined ? undefined : input.governing_body_id || null,
    technical_number: input.technical_number === undefined ? undefined : input.technical_number?.trim() || null,
    notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
  });
  const { data, error } = await client
    .from("slates")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single<Slate>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSlate(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("slates").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function linkContactToDirectory(input: {
  organization_discipline_id: string;
  contact_id: string;
  created_by_user_id?: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.from("directory_contacts").upsert(
    {
      organization_discipline_id: input.organization_discipline_id,
      contact_id: input.contact_id,
      source: "manual",
      created_by_user_id: input.created_by_user_id ?? null,
    },
    { onConflict: "organization_discipline_id,contact_id", ignoreDuplicates: true },
  );

  if (error) {
    throw error;
  }
}

export async function unlinkContactFromDirectory(organizationDisciplineId: string, contactId: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("directory_contacts")
    .delete()
    .eq("organization_discipline_id", organizationDisciplineId)
    .eq("contact_id", contactId);

  if (error) {
    throw error;
  }
}

export async function linkHorseToDirectory(input: {
  organization_discipline_id: string;
  horse_id: string;
  created_by_user_id?: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.from("directory_horses").upsert(
    {
      organization_discipline_id: input.organization_discipline_id,
      horse_id: input.horse_id,
      source: "manual",
      created_by_user_id: input.created_by_user_id ?? null,
    },
    { onConflict: "organization_discipline_id,horse_id", ignoreDuplicates: true },
  );

  if (error) {
    throw error;
  }
}

export async function unlinkHorseFromDirectory(organizationDisciplineId: string, horseId: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("directory_horses")
    .delete()
    .eq("organization_discipline_id", organizationDisciplineId)
    .eq("horse_id", horseId);

  if (error) {
    throw error;
  }
}

type ContactIdentityCandidateRow = {
  contact_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  email_hint: string | null;
  phone_hint: string | null;
  email_exact: boolean;
  phone_exact: boolean;
  already_linked: boolean;
  search_signature: string;
};

export async function searchContactIdentityCandidates(input: Pick<ContactInput, "organization_id" | "first_name" | "middle_name" | "last_name" | "email" | "phone" | "date_of_birth">) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("search_contact_identity_candidates", {
    target_organization_id: input.organization_id,
    target_first_name: input.first_name,
    target_middle_name: input.middle_name ?? null,
    target_last_name: input.last_name,
    target_email: input.email ?? null,
    target_phone: input.phone ?? null,
    target_date_of_birth: input.date_of_birth || null,
    result_limit: 5,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as ContactIdentityCandidateRow[];

  return rows.flatMap((row): ContactIdentityCandidate[] => {
    const match = compareContactIdentity(input, {
      first_name: row.first_name,
      middle_name: row.middle_name,
      last_name: row.last_name,
      email: row.email_exact ? input.email ?? null : null,
      phone: row.phone_exact ? input.phone ?? null : null,
      date_of_birth: row.date_of_birth,
    });

    return match ? [{
      contact_id: row.contact_id,
      first_name: row.first_name,
      middle_name: row.middle_name,
      last_name: row.last_name,
      date_of_birth: row.date_of_birth,
      email_hint: row.email_hint,
      phone_hint: row.phone_hint,
      already_linked: row.already_linked,
      search_signature: row.search_signature,
      ...match,
    }] : [];
  }).sort((left, right) => right.score - left.score);
}

type HorseIdentityCandidateRow = {
  horse_id: string;
  name: string;
  registration_number: string | null;
  date_of_birth: string | null;
  birth_year: number | null;
  gender: Horse["gender"];
  primary_owner_contact_id: string;
  already_linked: boolean;
  search_signature: string;
};

export async function searchHorseIdentityCandidates(input: Pick<HorseInput, "organization_id" | "name" | "registration_number" | "date_of_birth" | "birth_year" | "gender" | "primary_owner_contact_id">) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("search_horse_identity_candidates", {
    target_organization_id: input.organization_id,
    target_name: input.name,
    target_registration_number: input.registration_number ?? null,
    target_date_of_birth: input.date_of_birth || null,
    target_birth_year: input.birth_year ?? null,
    target_gender: input.gender ?? null,
    target_owner_contact_id: input.primary_owner_contact_id,
    result_limit: 5,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as HorseIdentityCandidateRow[];

  return rows.flatMap((row): HorseIdentityCandidate[] => {
    const match = compareHorseIdentity(input, row);

    return match ? [{
      horse_id: row.horse_id,
      name: row.name,
      registration_number: row.registration_number,
      date_of_birth: row.date_of_birth,
      birth_year: row.birth_year,
      gender: row.gender,
      primary_owner_contact_id: row.primary_owner_contact_id,
      already_linked: row.already_linked,
      search_signature: row.search_signature,
      ...match,
    }] : [];
  }).sort((left, right) => right.score - left.score);
}

export async function dismissContactIdentityCandidate(input: {
  organization_id: string;
  contact_id: string;
  search_signature: string;
  reason?: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.rpc("dismiss_contact_identity_candidate", {
    target_organization_id: input.organization_id,
    target_contact_id: input.contact_id,
    target_signature: input.search_signature,
    target_reason: input.reason ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function dismissHorseIdentityCandidate(input: {
  organization_id: string;
  horse_id: string;
  search_signature: string;
  reason?: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.rpc("dismiss_horse_identity_candidate", {
    target_organization_id: input.organization_id,
    target_horse_id: input.horse_id,
    target_signature: input.search_signature,
    target_reason: input.reason ?? null,
  });

  if (error) {
    throw error;
  }
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
      await syncContactExternalIdentifiers(contact.id, input.external_memberships);

      return contact;
    }
  }

  const { data, error } = await client
    .from("contacts")
    .insert({
      type: input.type,
      first_name: input.first_name.trim(),
      middle_name: input.middle_name?.trim() || null,
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
      country: normalizeCountry(input.country),
      date_of_birth: input.date_of_birth || null,
    })
    .select("*")
    .single<Contact>();

  if (error) {
    if (error.code === "23505" && normalizedEmail) {
      const reusedContact = await reuseContactByEmail(input, normalizedEmail, roles);

      if (reusedContact) {
        await syncContactExternalIdentifiers(reusedContact.id, input.external_memberships);

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
        await syncContactExternalIdentifiers(contact.id, input.external_memberships);

        return contact;
      }
    }

    throw error;
  }

  await ensureContactOrganizationLink({
    organization_id: input.organization_id,
    contact_id: data.id,
    source: "created_here",
    created_by_user_id: input.created_by_user_id,
  });
  await ensureContactRoles({
    organization_id: input.organization_id,
    contact_id: data.id,
    roles,
    source: input.roles?.length ? "manual" : "contact_type",
  });
  await syncContactExternalIdentifiers(data.id, input.external_memberships);

  return data;
}

export async function updateContact(id: string, input: ContactUpdateInput) {
  const client = requireSupabase();
  const { external_memberships: externalMemberships, ...contactInput } = input;
  const payload = {
    ...contactInput,
    first_name: contactInput.first_name?.trim(),
    middle_name: contactInput.middle_name === undefined ? undefined : contactInput.middle_name?.trim() || null,
    last_name: contactInput.last_name?.trim(),
    email: contactInput.email === undefined ? undefined : normalizeEmail(contactInput.email),
    phone: contactInput.phone === undefined ? undefined : contactInput.phone?.trim() || null,
    barn_name: contactInput.barn_name === undefined ? undefined : contactInput.barn_name?.trim() || null,
    address: contactInput.address === undefined ? undefined : contactInput.address?.trim() || null,
    address_line2: contactInput.address_line2 === undefined ? undefined : contactInput.address_line2?.trim() || null,
    city: contactInput.city === undefined ? undefined : contactInput.city?.trim() || null,
    state: contactInput.state === undefined ? undefined : contactInput.state?.trim() || null,
    zip_code: contactInput.zip_code === undefined ? undefined : contactInput.zip_code?.trim() || null,
    country: normalizeCountry(contactInput.country),
    date_of_birth: contactInput.date_of_birth === undefined ? undefined : contactInput.date_of_birth || null,
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

  await syncContactExternalIdentifiers(data.id, externalMemberships);

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

export async function setOrganizationExternalCredentialRequirement(input: {
  organization_id: string;
  external_credential_issuer_id: string;
  contact_type: Contact["type"];
  requirement_group_code?: string | null;
  match_rule?: OrganizationExternalCredentialRequirement["match_rule"];
  is_required: boolean;
}) {
  const client = requireSupabase();

  if (!input.is_required) {
    const { error } = await client
      .from("organization_external_credential_requirements")
      .delete()
      .eq("organization_id", input.organization_id)
      .eq("external_credential_issuer_id", input.external_credential_issuer_id)
      .eq("contact_type", input.contact_type)
      .eq("identifier_type", "membership");

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await client.from("organization_external_credential_requirements").upsert(
    {
      organization_id: input.organization_id,
      external_credential_issuer_id: input.external_credential_issuer_id,
      contact_type: input.contact_type,
      identifier_type: "membership",
      requirement_group_code: input.requirement_group_code ?? null,
      match_rule: input.match_rule ?? "all",
      validity_rule: "active_on_reference_date",
      enforcement_mode: "blocking",
      is_required: true,
    },
    { onConflict: "organization_id,external_credential_issuer_id,contact_type,identifier_type" },
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
      name: input.name,
      primary_owner_contact_id: input.primary_owner_contact_id,
      breed: input.breed || null,
      color: input.color || null,
      gender: input.gender || null,
      date_of_birth: input.date_of_birth || null,
      birth_year: birthYear || null,
      registration_number: input.registration_status === "grade" ? null : input.registration_number || null,
      registration_status: input.registration_status ?? (input.registration_number?.trim() ? "registered" : "unknown"),
      sire_name: input.sire_name || null,
      dam_name: input.dam_name || null,
      created_by_user_id: input.created_by_user_id || null,
    })
    .select("*")
    .single<Horse>();

  if (horseError) {
    throw horseError;
  }

  await upsertHorseContact({
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

  await ensureHorseOrganizationLink({
    organization_id: input.organization_id,
    horse_id: horse.id,
    source: "created_here",
    created_by_user_id: input.created_by_user_id,
  });

  await syncHorseExternalIdentifiers(horse.id, input.external_memberships);

  return horse;
}

export async function updateHorse(id: string, input: HorseUpdateInput) {
  const client = requireSupabase();
  const {
    agent_contact_id: agentContactId,
    external_memberships: externalMemberships,
    identity_correction_reason: identityCorrectionReason,
    ...horseInput
  } = input;
  const normalizedHorseInput = {
    ...horseInput,
    registration_number: horseInput.registration_status === "grade" ? null : horseInput.registration_number,
    birth_year: horseInput.birth_year ?? (horseInput.date_of_birth !== undefined ? birthYearFromDate(horseInput.date_of_birth) : undefined),
  };

  if (identityCorrectionReason?.trim()) {
    await correctHorseIdentity(id, {
      reason: identityCorrectionReason,
      changes: cleanPayload({
        name: normalizedHorseInput.name,
        date_of_birth: normalizedHorseInput.date_of_birth,
        birth_year: normalizedHorseInput.birth_year,
        gender: normalizedHorseInput.gender,
        breed: normalizedHorseInput.breed,
        registration_number: normalizedHorseInput.registration_number,
        registration_status: normalizedHorseInput.registration_status,
        external_identifiers: externalMemberships?.map((membership) => ({
          external_credential_issuer_id: membership.external_credential_issuer_id,
          identifier_type: membership.identifier_type ?? "competition_license",
          identifier_value: membership.identifier_value,
        })),
      }),
    });
  }

  if (input.primary_owner_contact_id) {
    await ensureContactDirectoriesForHorse({
      horse_id: id,
      contact_id: input.primary_owner_contact_id,
      source: "horse",
    });
  }

  if (agentContactId && agentContactId !== input.primary_owner_contact_id) {
    await ensureContactDirectoriesForHorse({
      horse_id: id,
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
      horse_id: data.id,
      contact_id: input.primary_owner_contact_id,
      role: "owner",
    });
    await ensureContactRoleForHorseOrganizations(data.id, input.primary_owner_contact_id, "owner");
  }

  if (agentContactId !== undefined) {
    const { error: deleteAgentContactsError } = await client.from("horse_contacts").delete().eq("horse_id", id).eq("role", "agent");
    if (deleteAgentContactsError) {
      throw deleteAgentContactsError;
    }

    if (agentContactId && agentContactId !== data.primary_owner_contact_id) {
      await upsertHorseContact({
        horse_id: data.id,
        contact_id: agentContactId,
        role: "agent",
      });
      await ensureContactRoleForHorseOrganizations(data.id, agentContactId, "agent");
    }
  }

  if (!identityCorrectionReason?.trim()) {
    await syncHorseExternalIdentifiers(data.id, externalMemberships);
  }

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
  status?: "eligible" | "ineligible" | "unavailable";
  eligible?: boolean;
  parameters?: Record<string, unknown> | null;
  reasons?: NrhaEligibilityReason[];
  payload?: Record<string, unknown>;
  cache?: {
    decisionId: string;
    source: "cache" | "live_external";
    checkedAt: string;
    expiresAt: string | null;
  };
};

export type NrhaEligibilityDecisionContext = {
  organizationId: string;
  showId: string;
  classId: string;
  governingBodyId: string;
  horseId: string;
  riderContactId: string;
  referenceDate: string;
  eligibilityProfileCode: string;
  cacheTtlHours: number;
  sourceUnavailablePolicy: "block" | "allow_with_warning";
};

export type NrhaEligibilityProfileSignal = {
  actualAmount?: number | null;
  classCode: number;
  code: string;
  globalBlock: boolean;
  message: string;
  scope: "all_nrha_classes" | "non_pro_classes" | "horse_novice_classes" | "rookie_classes" | "green_entry_level_classes" | "open_cap_classes" | "class_specific";
  subject: "rider" | "horse" | "team" | "unknown";
  thresholdAmount?: number | null;
};

export type NrhaEligibilityProfileQuestion = {
  answer: string | null;
  evidenceClassCodes: number[];
  id: string;
  label: string;
  status: "unknown" | "answered" | "blocked";
};

export type NrhaEligibilityProfileAge = {
  ageOnJan1: number | null;
  birthYear: number | null;
  dateOfBirth: string | null;
  referenceDate: string;
  rule: "actual_age_on_jan_1" | "horse_competition_age_on_jan_1";
  source: "date_of_birth" | "birth_year" | "unavailable";
};

export type NrhaEligibilityProfileTest = {
  classCode: number;
  className: string;
  eligible: boolean | null;
  id: string;
  payload?: unknown;
  reasons: NrhaEligibilityReason[];
  signals: NrhaEligibilityProfileSignal[];
  status: "eligible" | "ineligible" | "error";
};

export type NrhaEligibilityProfileVerification = {
  checkedAt?: string;
  error?: string;
  input?: Record<string, unknown>;
  profile?: {
    globalBlocks: NrhaEligibilityProfileSignal[];
    horse: {
      age: NrhaEligibilityProfileAge;
      licenseStatus: string;
      noviceHorseLevel: string;
    };
    rider: {
      age: NrhaEligibilityProfileAge;
      greenEntryLevel: string;
      openCapStatus: string;
      professionalStatus: string;
      rookieLevel: string;
    };
  };
  questions?: NrhaEligibilityProfileQuestion[];
  status?: "complete" | "partial" | "blocked";
  summary?: {
    answeredQuestions: number;
    blockedQuestions: number;
    testedClassCount: number;
    unfilledQuestions: string[];
  };
  tests?: NrhaEligibilityProfileTest[];
};

export type NrhaHorseLookupCheck = {
  input: string;
  matched: boolean;
  official: string | null;
};

export type NrhaHorseRecord = {
  city?: string;
  country?: string;
  currentLease?: boolean;
  damName?: string;
  foalDate?: string;
  horseName?: string;
  leaseEndDate?: string;
  leaseStartDate?: string;
  leassee?: string;
  licenseNumber?: number;
  ownerEndDate?: string;
  ownerMemberNumber?: number;
  ownerName?: string;
  ownerStartDate?: string;
  sex?: string;
  sireName?: string;
  state?: string;
};

export type NrhaHorseLookupVerification = {
  checks?: {
    dateOfBirth?: NrhaHorseLookupCheck;
    name?: NrhaHorseLookupCheck;
    ownerName?: NrhaHorseLookupCheck;
  };
  error?: string;
  horse?: NrhaHorseRecord | null;
  inputDateOfBirth?: string | null;
  inputName?: string;
  inputOwnerName?: string | null;
  licenseNumber?: number;
  matched?: boolean;
  nrha_status?: number;
  officialFoalDate?: string | null;
  officialHorseName?: string | null;
  officialOwnerName?: string | null;
  payload?: Record<string, unknown> | unknown[];
  status?: "found" | "verified" | "mismatch" | "not_found";
};

export type NrhaMemberLookupCheck = {
  input: string;
  matched: boolean;
  official: string | null;
};

export type NrhaMemberRecord = {
  city?: string;
  country?: string;
  emailAddress?: string;
  firstName?: string;
  fullName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  memberExpirationDate?: string;
  memberNumber?: number;
  middleName?: string;
  phoneNumber?: string;
  state?: string;
  zip?: string;
};

export type NrhaMemberLookupVerification = {
  checks?: {
    emailAddress?: NrhaMemberLookupCheck;
    firstName?: NrhaMemberLookupCheck;
    fullName?: NrhaMemberLookupCheck;
    lastName?: NrhaMemberLookupCheck;
  };
  error?: string;
  inputEmailAddress?: string;
  inputFirstName?: string;
  inputFullName?: string;
  inputLastName?: string;
  matched?: boolean;
  member?: NrhaMemberRecord | null;
  memberNumber?: number;
  nrha_status?: number;
  officialEmailAddress?: string | null;
  officialExpirationDate?: string | null;
  officialFirstName?: string | null;
  officialFullName?: string | null;
  officialLastName?: string | null;
  payload?: Record<string, unknown> | unknown[];
  status?: "found" | "verified" | "mismatch" | "not_found";
};

export async function verifyNrhaHorse(input: {
  dateOfBirth?: string;
  licenseNumber: number;
  name: string;
  ownerName?: string;
}) {
  const client = requireSupabase();
  const { data: verification, error: invokeError, response } = await client.functions.invoke<NrhaHorseLookupVerification>("nrha-horse-lookup", {
    body: input,
  });

  if (invokeError) {
    throw new Error(await nrhaHorseLookupInvokeErrorMessage(invokeError, response));
  }

  if (!verification) {
    throw new Error("Validation NRHA cheval impossible: aucune reponse recue.");
  }

  if (verification.error) {
    throw new Error(verification.error);
  }

  return verification;
}

export async function verifyNrhaMember(input: {
  emailAddress?: string;
  firstName?: string;
  fullName?: string;
  lastName?: string;
  memberNumber: number;
}) {
  const client = requireSupabase();
  const { data: verification, error: invokeError, response } = await client.functions.invoke<NrhaMemberLookupVerification>("nrha-member-lookup", {
    body: input,
  });

  if (invokeError) {
    throw new Error(await nrhaMemberLookupInvokeErrorMessage(invokeError, response));
  }

  if (!verification) {
    throw new Error("Validation NRHA membre impossible: aucune reponse recue.");
  }

  if (verification.error) {
    throw new Error(verification.error);
  }

  return verification;
}

export async function verifyNrhaEligibility(input: {
  classCode: number;
  competitionLicenseNumber: number;
  countryId?: number | null;
  date: string;
  isEuroEvent?: boolean;
  memberNumber: number;
  decisionContext?: NrhaEligibilityDecisionContext;
  forceRefresh?: boolean;
}) {
  const client = requireSupabase();
  const requestBody = {
    classCode: input.classCode,
    competitionLicenseNumber: input.competitionLicenseNumber,
    countryId: input.countryId,
    date: input.date,
    isEuroEvent: input.isEuroEvent,
    memberNumber: input.memberNumber,
  };
  const inputFingerprint = buildEligibilityFingerprint([
    "NRHA",
    input.decisionContext?.eligibilityProfileCode,
    input.classCode,
    input.competitionLicenseNumber,
    input.memberNumber,
    input.date,
    input.countryId,
    input.isEuroEvent,
  ]);

  if (input.decisionContext && !input.forceRefresh) {
    const cached = await findCachedTeamEligibilityDecision(input.decisionContext, inputFingerprint);
    if (cached) {
      return cached;
    }
  }

  const { data: verification, error: invokeError, response } = await client.functions.invoke<NrhaEligibilityVerification>("nrha-eligibility", {
    body: requestBody,
  });

  if (invokeError) {
    const message = await nrhaEligibilityInvokeErrorMessage(invokeError, response);
    if (!input.decisionContext) {
      throw new Error(message);
    }

    const decision = await recordTeamEligibilityDecision({
      context: input.decisionContext,
      inputFingerprint,
      status: "unavailable",
      canProceed: input.decisionContext.sourceUnavailablePolicy === "allow_with_warning",
      reasons: [{ action: "retry", message }],
      snapshotId: null,
      checkedAt: new Date().toISOString(),
      expiresAt: null,
    });

    return {
      status: "unavailable" as const,
      eligible: undefined,
      reasons: [{ action: "retry", message }],
      cache: {
        decisionId: decision.id,
        source: "live_external" as const,
        checkedAt: decision.checked_at,
        expiresAt: decision.expires_at,
      },
    };
  }

  if (!verification) {
    throw new Error("Validation NRHA impossible: aucune reponse recue.");
  }

  if (verification.error) {
    throw new Error(verification.error);
  }

  if (input.decisionContext) {
    const checkedAt = new Date().toISOString();
    const expiresAt = eligibilityExpiresAt(checkedAt, input.decisionContext.cacheTtlHours);
    const externalDataSourceId = await externalDataSourceIdForVerificationSource("NRHA_ELIGIBILITY_API");
    const snapshotId = externalDataSourceId
      ? await recordExternalDataSnapshot({
          externalDataSourceId,
          sourceRecordKey: inputFingerprint,
          payload: { request: requestBody, response: verification },
          teamEligibility: {
            horseId: input.decisionContext.horseId,
            riderContactId: input.decisionContext.riderContactId,
            showId: input.decisionContext.showId,
            classId: input.decisionContext.classId,
            governingBodyId: input.decisionContext.governingBodyId,
          },
        })
      : null;
    const status: "eligible" | "ineligible" = verification.eligible ? "eligible" : "ineligible";
    const decision = await recordTeamEligibilityDecision({
      context: input.decisionContext,
      inputFingerprint,
      status,
      canProceed: Boolean(verification.eligible),
      reasons: verification.reasons ?? [],
      snapshotId,
      checkedAt,
      expiresAt,
    });

    return {
      ...verification,
      status,
      cache: {
        decisionId: decision.id,
        source: "live_external" as const,
        checkedAt: decision.checked_at,
        expiresAt: decision.expires_at,
      },
    };
  }

  return verification;
}

type TeamEligibilityDecisionRow = {
  id: string;
  status: "eligible" | "ineligible" | "unavailable";
  reasons: NrhaEligibilityReason[];
  checked_at: string;
  expires_at: string | null;
};

async function findCachedTeamEligibilityDecision(context: NrhaEligibilityDecisionContext, inputFingerprint: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("team_eligibility_decisions")
    .select("id,status,reasons,checked_at,expires_at")
    .eq("class_id", context.classId)
    .eq("governing_body_id", context.governingBodyId)
    .eq("horse_id", context.horseId)
    .eq("rider_contact_id", context.riderContactId)
    .eq("show_id", context.showId)
    .eq("reference_date", context.referenceDate)
    .eq("input_fingerprint", inputFingerprint)
    .in("status", ["eligible", "ineligible"])
    .gt("expires_at", new Date().toISOString())
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle<TeamEligibilityDecisionRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    status: data.status,
    eligible: data.status === "eligible",
    reasons: data.reasons ?? [],
    cache: {
      decisionId: data.id,
      source: "cache" as const,
      checkedAt: data.checked_at,
      expiresAt: data.expires_at,
    },
  } satisfies NrhaEligibilityVerification;
}

async function recordTeamEligibilityDecision(input: {
  context: NrhaEligibilityDecisionContext;
  inputFingerprint: string;
  status: TeamEligibilityDecisionRow["status"];
  canProceed: boolean;
  reasons: NrhaEligibilityReason[];
  snapshotId: string | null;
  checkedAt: string;
  expiresAt: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("team_eligibility_decisions")
    .insert({
      organization_id: input.context.organizationId,
      show_id: input.context.showId,
      class_id: input.context.classId,
      governing_body_id: input.context.governingBodyId,
      horse_id: input.context.horseId,
      rider_contact_id: input.context.riderContactId,
      reference_date: input.context.referenceDate,
      status: input.status,
      can_proceed: input.canProceed,
      reasons: input.reasons,
      input_fingerprint: input.inputFingerprint,
      source_mode: "live_external",
      external_snapshot_id: input.snapshotId,
      checked_at: input.checkedAt,
      expires_at: input.expiresAt,
    })
    .select("id,status,reasons,checked_at,expires_at")
    .single<TeamEligibilityDecisionRow>();

  if (error) throw error;
  return data;
}

export async function verifyNrhaEligibilityProfile(input: {
  classCodes?: Array<number | string>;
  competitionLicenseNumber: number;
  continueAfterGlobalBlock?: boolean;
  countryId?: number | null;
  date: string;
  horseBirthYear?: number | string | null;
  horseDateOfBirth?: string | null;
  isEuroEvent?: boolean;
  maxTests?: number;
  memberNumber: number;
  riderBirthYear?: number | string | null;
  riderDateOfBirth?: string | null;
}) {
  const client = requireSupabase();
  const { data: verification, error: invokeError, response } = await client.functions.invoke<NrhaEligibilityProfileVerification>("nrha-eligibility-profile", {
    body: input,
  });

  if (invokeError) {
    throw new Error(await nrhaEligibilityInvokeErrorMessage(invokeError, response));
  }

  if (!verification) {
    throw new Error("Profil NRHA impossible: aucune reponse recue.");
  }

  if (verification.error) {
    throw new Error(verification.error);
  }

  return verification;
}

async function nrhaHorseLookupInvokeErrorMessage(invokeError: unknown, response?: Response) {
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
      return `Validation NRHA cheval impossible: ${detailParts.join(" - ")}`;
    }
  }

  if (responseStatus) {
    return `Validation NRHA cheval impossible: code Edge Function ${responseStatus} - ${fallbackMessage}`;
  }

  return `Validation NRHA cheval impossible: ${fallbackMessage}`;
}

async function nrhaMemberLookupInvokeErrorMessage(invokeError: unknown, response?: Response) {
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
      return `Validation NRHA membre impossible: ${detailParts.join(" - ")}`;
    }
  }

  if (responseStatus) {
    return `Validation NRHA membre impossible: code Edge Function ${responseStatus} - ${fallbackMessage}`;
  }

  return `Validation NRHA membre impossible: ${fallbackMessage}`;
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
    document_category: "health",
    uploaded_by_organization_id: input.organization_id,
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
      .from("horse_documents")
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
    .from("horse_documents")
    .insert({
      ...payload,
      created_by_user_id: input.created_by_user_id ?? null,
    })
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    if (isMissingSchemaError(error, "horse_documents")) {
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
  const existing = await findExistingHorseHealthDocument({
    horse_id: input.horse_id,
    document_type: "coggins_eia",
    certificate_number: null,
    source_url: input.source_url,
  });
  const fileMetadata = existing?.document_url ? null : await horseDocumentFileMetadata(input.document_file);
  const documentUrl = existing?.document_url ?? await uploadHealthDocumentFile({
    horse_id: input.horse_id,
    file: input.document_file,
  });
  const payload = {
    document_category: "health",
    uploaded_by_organization_id: input.organization_id,
    horse_id: input.horse_id,
    document_type: "coggins_eia",
    status: "pending_review",
    verification_source: "upload",
    source_url: input.source_url,
    document_url: documentUrl,
    original_file_name: existing?.original_file_name ?? (input.document_file.name || null),
    mime_type: existing?.mime_type ?? (input.document_file.type || null),
    file_size_bytes: existing?.file_size_bytes ?? input.document_file.size,
    content_sha256: existing?.content_sha256 ?? fileMetadata?.sha256 ?? null,
    horse_name: input.horse_name ?? null,
    horse_date_of_birth: input.horse_date_of_birth ?? null,
    warnings: ["GVL_MANUAL_REVIEW"],
    review_notes: input.review_notes ?? "Coggins GVL depose pour revision manuelle.",
  };

  if (existing) {
    const { data, error } = await client
      .from("horse_documents")
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
    .from("horse_documents")
    .insert({
      ...payload,
      created_by_user_id: input.created_by_user_id ?? null,
    })
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    if (isMissingSchemaError(error, "horse_documents")) {
      throw new Error("La migration des documents sante des chevaux n'est pas encore appliquee.");
    }

    throw error;
  }

  return data;
}

export async function createUploadedHorseHealthDocument(input: {
  organization_id: string;
  horse_id: string;
  document_category?: HorseHealthDocument["document_category"];
  document_type: HorseHealthDocument["document_type"];
  file: File;
  source_url?: string | null;
  test_or_administered_on?: string | null;
  issuer_name?: string | null;
  external_credential_issuer_id?: string | null;
  registration_number?: string | null;
  breed_name?: string | null;
  created_by_user_id?: string;
  review_notes?: string | null;
}) {
  const client = requireSupabase();
  const documentCategory = input.document_category ?? (input.document_type.startsWith("breed_") || input.document_type === "ownership_certificate" ? "registration" : "health");
  const fileMetadata = await horseDocumentFileMetadata(input.file);
  const documentUrl = await uploadHealthDocumentFile({
    horse_id: input.horse_id,
    file: input.file,
  });
  const { data, error } = await client
    .from("horse_documents")
    .insert({
      document_category: documentCategory,
      uploaded_by_organization_id: input.organization_id,
      horse_id: input.horse_id,
      document_type: input.document_type,
      status: "pending_review",
      verification_source: "upload",
      source_url: input.source_url || null,
      document_url: documentUrl,
      issuer_name: input.issuer_name || null,
      external_credential_issuer_id: input.external_credential_issuer_id || null,
      registration_number: input.registration_number?.trim() || null,
      breed_name: input.breed_name?.trim() || null,
      original_file_name: input.file.name || null,
      mime_type: input.file.type || null,
      file_size_bytes: input.file.size,
      content_sha256: fileMetadata.sha256,
      test_or_administered_on: input.test_or_administered_on || null,
      created_by_user_id: input.created_by_user_id ?? null,
      review_notes: input.review_notes || null,
    })
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
    if (isMissingSchemaError(error, "horse_documents")) {
      throw new Error("La migration des documents sante des chevaux n'est pas encore appliquee.");
    }

    throw error;
  }

  return data;
}

export async function listHorseDocumentValidations(horseId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("horse_document_validations")
    .select("*")
    .eq("horse_id", horseId)
    .order("created_at", { ascending: false })
    .returns<HorseDocumentValidation[]>();

  if (error) {
    if (isMissingSchemaError(error, "horse_document_validations")) {
      throw new Error("La migration d'identification des documents n'est pas encore appliquee.");
    }

    throw error;
  }

  return data ?? [];
}

export async function createHorseDocumentValidation(
  horseDocumentId: string,
  validation: Record<string, unknown>,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_horse_document_validation", {
    p_horse_document_id: horseDocumentId,
    p_validation: validation,
  });

  if (error) {
    if (isMissingRpcError(error, "create_horse_document_validation")) {
      throw new Error("La migration d'identification des documents n'est pas encore appliquee.");
    }

    throw error;
  }

  return data as HorseDocumentValidation;
}

export async function listHorseIdentityLocks(horseId: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_horse_identity_locks", {
    p_horse_id: horseId,
  });

  if (error) {
    if (isMissingRpcError(error, "get_horse_identity_locks")) {
      throw new Error("La migration de verrouillage de l'identite du cheval n'est pas encore appliquee.");
    }

    throw error;
  }

  return (data ?? []) as HorseIdentityLock[];
}

export async function canCorrectHorseIdentity(horseId: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("can_correct_horse_identity", {
    target_horse_id: horseId,
  });

  if (error) {
    if (isMissingRpcError(error, "can_correct_horse_identity")) return false;
    throw error;
  }

  return data === true;
}

export async function listHorseIdentityCorrections(horseId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("horse_identity_corrections")
    .select("*")
    .eq("horse_id", horseId)
    .order("created_at", { ascending: false })
    .returns<HorseIdentityCorrection[]>();

  if (error) {
    if (isMissingSchemaError(error, "horse_identity_corrections")) return [];
    throw error;
  }

  return data ?? [];
}

export async function correctHorseIdentity(
  horseId: string,
  input: { reason: string; changes: Record<string, unknown> },
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("correct_horse_identity", {
    p_horse_id: horseId,
    p_reason: input.reason,
    p_changes: input.changes,
  });

  if (error) {
    if (isMissingRpcError(error, "correct_horse_identity")) {
      throw new Error("La migration de correction auditee de l'identite n'est pas encore appliquee.");
    }
    throw error;
  }

  return data as HorseIdentityCorrection;
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
  const fileMetadata = await horseDocumentFileMetadata(input.file);
  const documentUrl = await uploadHealthDocumentFile(input);
  const { data, error } = await client
    .from("horse_documents")
    .update({
      document_url: documentUrl,
      original_file_name: input.file.name || null,
      mime_type: input.file.type || null,
      file_size_bytes: input.file.size,
      content_sha256: fileMetadata.sha256,
    })
    .eq("id", id)
    .select("*")
    .single<HorseHealthDocument>();

  if (error) {
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

  const { data, error } = await client.storage.from("horse-documents").createSignedUrl(objectPath, 10 * 60);

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
    return cleanUrl.replace(/^\/+/, "").replace(/^(?:health|horse)-documents\//, "");
  }

  try {
    const url = new URL(cleanUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    const marker = decodedPath.includes("/horse-documents/") ? "/horse-documents/" : "/health-documents/";
    const markerIndex = decodedPath.indexOf(marker);

    if (markerIndex >= 0) {
      return decodedPath.slice(markerIndex + marker.length);
    }
  } catch {
    return cleanUrl;
  }

  return cleanUrl;
}

async function uploadHealthDocumentFile(input: { organization_id?: string; horse_id: string; file: File }) {
  const client = requireSupabase();
  const objectPath = `${input.horse_id}/${crypto.randomUUID()}-${safeStorageFileName(input.file.name)}`;
  const { error } = await client.storage.from("horse-documents").upload(objectPath, input.file, {
    contentType: input.file.type || undefined,
  });

  if (error) {
    throw error;
  }

  return objectPath;
}

async function horseDocumentFileMetadata(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { sha256 };
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
      .from("horse_documents")
      .select("*")
      .eq("horse_id", input.horse_id)
      .eq("document_type", input.document_type)
      .eq("certificate_number", input.certificate_number)
      .maybeSingle<HorseHealthDocument>();

    if (error && !isMissingSchemaError(error, "horse_documents")) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  const { data, error } = await client
    .from("horse_documents")
    .select("*")
    .eq("horse_id", input.horse_id)
    .eq("document_type", input.document_type)
    .eq("source_url", input.source_url)
    .maybeSingle<HorseHealthDocument>();

  if (error && !isMissingSchemaError(error, "horse_documents")) {
    throw error;
  }

  return data ?? null;
}

async function upsertHorseContact(input: {
  horse_id: string;
  contact_id: string;
  role: HorseContact["role"];
}) {
  const client = requireSupabase();
  const canPayInvoices = input.role === "owner" || input.role === "co-owner";
  const { error } = await client.from("horse_contacts").upsert(
    {
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

export async function createBlockTemplate(input: BlockTemplateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("block_templates")
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      code: input.code || null,
      block_label: input.block_label || null,
      category: input.category || null,
      pattern: input.pattern || null,
      custom_pattern: input.custom_pattern ?? null,
      block_type: input.block_type ?? "competition",
      sort_order: input.sort_order ?? 1,
      is_active: input.is_active ?? true,
      notes: input.notes || null,
    })
    .select("*")
    .single<BlockTemplate>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateBlockTemplate(id: string, input: BlockTemplateUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("block_templates")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<BlockTemplate>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteBlockTemplate(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("block_templates").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createClassTemplate(input: ClassTemplateInput) {
  const client = requireSupabase();
  const organizationDisciplineId = input.organization_discipline_id
    ?? await findDefaultOrganizationDisciplineId(input.organization_id);
  const { data, error } = await client
    .from("class_templates")
    .insert({
      organization_id: input.organization_id,
      block_template_id: input.block_template_id,
      organization_discipline_id: organizationDisciplineId,
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
      back_number_policy_override: input.back_number_policy_override ?? null,
      eligibility_rules: input.eligibility_rules ?? {},
      sort_order: input.sort_order ?? 1,
      notes: input.notes || null,
    })
    .select("*")
    .single<ClassTemplate>();

  if (error) {
    throw error;
  }

  const governingBodyAssignments = await syncGoverningBodyAssignments("class_template_governing_bodies", "class_template_id", data.id, input.governing_body_assignments ?? []);

  return { ...data, governing_body_assignments: governingBodyAssignments };
}

export async function updateClassTemplate(id: string, input: ClassTemplateUpdateInput) {
  const client = requireSupabase();
  const { governing_body_assignments: governingBodyAssignments, ...rowInput } = input;
  const { data, error } = await client
    .from("class_templates")
    .update(cleanPayload(rowInput))
    .eq("id", id)
    .select("*")
    .single<ClassTemplate>();

  if (error) {
    throw error;
  }

  const savedGoverningBodyAssignments = governingBodyAssignments
    ? await syncGoverningBodyAssignments("class_template_governing_bodies", "class_template_id", id, governingBodyAssignments)
    : [];

  return { ...data, governing_body_assignments: savedGoverningBodyAssignments };
}

export async function deleteClassTemplate(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("class_templates").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createBlock(input: BlockInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("blocks")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      show_day_id: input.show_day_id || null,
      block_template_id: input.block_template_id || null,
      slate_id: input.slate_id || null,
      name: input.name,
      display_label: input.display_label || null,
      block_type: input.block_type ?? "competition",
      arena: input.arena || null,
      pattern: input.pattern || null,
      custom_pattern: input.custom_pattern ?? null,
      entries_close_at: input.entries_close_at ?? null,
      draw_prepared_at: input.draw_prepared_at ?? null,
      judge_display_name: input.judge_display_name || null,
      schedule_start_mode: input.schedule_start_mode ?? (input.scheduled_time ? "fixed" : "unscheduled"),
      scheduled_time: input.scheduled_time ?? null,
      sort_order: input.sort_order ?? 1,
      schedule_status: input.schedule_status ?? "open",
      schedule_is_public: input.schedule_is_public ?? true,
      results_are_public: input.results_are_public ?? false,
      notes: input.notes ?? null,
    })
    .select("*")
    .single<Block>();

  if (error) {
    throw error;
  }

  try {
    if (input.concurrent_block_id) {
      await addBlockToConcurrencyGroup(data, input.concurrent_block_id);
    }

    await syncBlockJudgeAssignments(data, input.judge_display_name ?? null);
  } catch (relatedDataError) {
    await client.from("blocks").delete().eq("id", data.id);
    throw relatedDataError;
  }

  return data;
}

async function removeBlockFromConcurrencyGroup(blockId: string) {
  const client = requireSupabase();
  const { data: membership, error: membershipError } = await client
    .from("block_concurrency_group_members")
    .select("group_id")
    .eq("block_id", blockId)
    .maybeSingle<{ group_id: string }>();

  if (membershipError) {
    throw membershipError;
  }

  if (!membership) {
    return;
  }

  const { error: deleteError } = await client
    .from("block_concurrency_group_members")
    .delete()
    .eq("block_id", blockId);

  if (deleteError) {
    throw deleteError;
  }

  const { count, error: countError } = await client
    .from("block_concurrency_group_members")
    .select("block_id", { count: "exact", head: true })
    .eq("group_id", membership.group_id);

  if (countError) {
    throw countError;
  }

  if ((count ?? 0) < 2) {
    const { error: groupDeleteError } = await client
      .from("block_concurrency_groups")
      .delete()
      .eq("id", membership.group_id);

    if (groupDeleteError) {
      throw groupDeleteError;
    }
  }
}

async function syncBlockJudgeAssignments(block: Block, judgeDisplayName: string | null) {
  const client = requireSupabase();
  const { error: deleteError } = await client
    .from("block_judge_assignments")
    .delete()
    .eq("block_id", block.id);

  if (deleteError) {
    throw deleteError;
  }

  const judgeNames = (judgeDisplayName ?? "")
    .split(/[;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);

  if (!judgeNames.length) {
    return;
  }

  const { error: insertError } = await client.from("block_judge_assignments").insert(
    judgeNames.map((displayName, index) => ({
      organization_id: block.organization_id,
      show_id: block.show_id,
      block_id: block.id,
      display_name: displayName,
      assignment_role: "judge",
      sort_order: index + 1,
    })),
  );

  if (insertError) {
    throw insertError;
  }
}

async function addBlockToConcurrencyGroup(block: Block, concurrentBlockId: string) {
  const client = requireSupabase();
  let createdGroupId: string | null = null;
  const { data: existingMembership, error: membershipError } = await client
    .from("block_concurrency_group_members")
    .select("group_id")
    .eq("block_id", concurrentBlockId)
    .maybeSingle<{ group_id: string }>();

  if (membershipError) {
    throw membershipError;
  }

  let groupId = existingMembership?.group_id ?? null;

  if (!groupId) {
    const { data: group, error: groupError } = await client
      .from("block_concurrency_groups")
      .insert({
        organization_id: block.organization_id,
        show_id: block.show_id,
        name: `Concurrent ${concurrentBlockId.slice(0, 8)} ${block.id.slice(0, 8)}`,
      })
      .select("id")
      .single<{ id: string }>();

    if (groupError) {
      throw groupError;
    }

    groupId = group.id;
    createdGroupId = group.id;
    const { error: firstMemberError } = await client.from("block_concurrency_group_members").insert({
      group_id: groupId,
      block_id: concurrentBlockId,
      sort_order: 1,
    });

    if (firstMemberError) {
      await client.from("block_concurrency_groups").delete().eq("id", groupId);
      throw firstMemberError;
    }
  }

  const { data: members, error: membersError } = await client
    .from("block_concurrency_group_members")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .returns<Array<{ sort_order: number }>>();

  if (membersError) {
    throw membersError;
  }

  const { error: addMemberError } = await client.from("block_concurrency_group_members").insert({
    group_id: groupId,
    block_id: block.id,
    sort_order: (members?.[0]?.sort_order ?? 0) + 1,
  });

  if (addMemberError) {
    if (createdGroupId) {
      await client.from("block_concurrency_groups").delete().eq("id", createdGroupId);
    }
    throw addMemberError;
  }
}

export async function updateBlock(id: string, input: BlockUpdateInput) {
  const client = requireSupabase();
  const { concurrent_block_id: concurrentBlockId, ...rowInput } = input;
  const { data, error } = await client
    .from("blocks")
    .update(cleanPayload(rowInput))
    .eq("id", id)
    .select("*")
    .single<Block>();

  if (error) {
    throw error;
  }

  if (Object.prototype.hasOwnProperty.call(input, "concurrent_block_id")) {
    await removeBlockFromConcurrencyGroup(id);
    if (concurrentBlockId) {
      await addBlockToConcurrencyGroup(data, concurrentBlockId);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "judge_display_name")) {
    await syncBlockJudgeAssignments(data, input.judge_display_name ?? null);
  }

  return data;
}

export async function deleteBlock(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("blocks").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createClass(input: ClassInput) {
  const client = requireSupabase();
  const organizationDisciplineId = input.organization_discipline_id
    ?? await findDefaultOrganizationDisciplineId(input.organization_id);
  const { data, error } = await client
    .from("classes")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      block_id: input.block_id,
      organization_discipline_id: organizationDisciplineId,
      class_template_id: input.class_template_id || null,
      name: input.name,
      description: input.description ?? null,
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
      minimum_entries: input.minimum_entries ?? 2,
      registration_status: input.registration_status ?? "open",
      is_public: input.is_public ?? true,
      back_number_policy_override: input.back_number_policy_override ?? null,
      sort_order: input.sort_order ?? 1,
      eligibility_rules: input.eligibility_rules ?? {},
      notes: input.notes ?? null,
    })
    .select("*")
    .single<ClassRecord>();

  if (error) {
    throw error;
  }

  const governingBodyAssignments = await syncGoverningBodyAssignments("class_governing_bodies", "class_id", data.id, input.governing_body_assignments ?? []);

  return { ...data, governing_body_assignments: governingBodyAssignments };
}

export async function updateClass(id: string, input: ClassUpdateInput) {
  const client = requireSupabase();
  const { governing_body_assignments: governingBodyAssignments, ...rowInput } = input;
  const { data, error } = await client
    .from("classes")
    .update(cleanPayload(rowInput))
    .eq("id", id)
    .select("*")
    .single<ClassRecord>();

  if (error) {
    throw error;
  }

  const savedGoverningBodyAssignments = governingBodyAssignments
    ? await syncGoverningBodyAssignments("class_governing_bodies", "class_id", id, governingBodyAssignments)
    : [];

  return { ...data, governing_body_assignments: savedGoverningBodyAssignments };
}

async function syncGoverningBodyAssignments(
  joinTable: "class_governing_bodies" | "class_template_governing_bodies",
  ownerColumn: "class_id" | "class_template_id",
  ownerId: string,
  assignments: GoverningBodyAssignmentInput[],
) {
  const client = requireSupabase();
  const normalizedAssignments = Array.from(
    new Map(
      assignments
        .filter((assignment) => assignment.governing_body_id)
        .map((assignment) => [assignment.governing_body_id, {
          governing_body_id: assignment.governing_body_id,
          reporting_class_code: assignment.reporting_class_code?.trim() || null,
          eligibility_profile_code: assignment.eligibility_profile_code?.trim() || null,
          sanction_metadata: assignment.sanction_metadata ?? {},
        }]),
    ).values(),
  );

  let governingBodies: Array<Pick<SanctioningBody, "id" | "code" | "name">> = [];

  if (normalizedAssignments.length) {
    const governingBodyIds = normalizedAssignments.map((assignment) => assignment.governing_body_id);
    const { data, error: governingBodiesError } = await client
      .from("governing_bodies")
      .select("id,code,name")
      .in("id", governingBodyIds)
      .eq("is_active", true)
      .returns<Array<Pick<SanctioningBody, "id" | "code" | "name">>>();

    if (governingBodiesError) {
      throw governingBodiesError;
    }

    governingBodies = data ?? [];
    const foundIds = new Set(governingBodies.map((body) => body.id));
    const missingIds = governingBodyIds.filter((id) => !foundIds.has(id));

    if (missingIds.length) {
      throw new Error(`Organisme de règles introuvable ou inactif: ${missingIds.join(", ")}.`);
    }
  }

  const { error: deleteError } = await client.from(joinTable).delete().eq(ownerColumn, ownerId);

  if (deleteError) {
    throw deleteError;
  }

  if (!normalizedAssignments.length) {
    return [];
  }

  const { error: insertError } = await client.from(joinTable).insert(
    normalizedAssignments.map((assignment) => ({
      [ownerColumn]: ownerId,
      ...assignment,
    })),
  );

  if (insertError) {
    throw insertError;
  }

  const bodyById = new Map(governingBodies.map((body) => [body.id, body]));
  return normalizedAssignments.map((assignment) => {
    const body = bodyById.get(assignment.governing_body_id)!;
    return {
      ...assignment,
      code: body.code,
      name: body.name,
    };
  });
}

export async function deleteClass(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("classes").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

type PayoutCalculationSaveInput = Pick<
  PayoutCalculation,
  | "show_id"
  | "class_id"
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
    .eq("class_id", input.calculation.class_id)
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
  const { data: classRecord, error: classError } = await client
    .from("classes")
    .select("block_id, back_number_policy_override")
    .eq("id", input.class_id)
    .single<Pick<ClassRecord, "back_number_policy_override" | "block_id">>();

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

  const effectivePolicy = classRecord.back_number_policy_override ?? organization?.back_number_policy ?? "horse";

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
  const { data: classRecord, error: classError } = await client
    .from("classes")
    .select("entry_fee, block_id")
    .eq("id", input.class_id)
    .single<{ entry_fee: number | null; block_id: string }>();

  if (classError) {
    throw classError;
  }

  const { data: block, error: blockError } = await client
    .from("blocks")
    .select("entries_close_at")
    .eq("id", classRecord.block_id)
    .single<Pick<Block, "entries_close_at">>();

  if (blockError) {
    throw blockError;
  }

  const { data: show, error: showError } = await client
    .from("shows")
    .select("late_entries_allowed, late_entry_fee_percent")
    .eq("id", input.show_id)
    .single<Pick<Show, "late_entries_allowed" | "late_entry_fee_percent">>();

  if (showError) {
    throw showError;
  }

  const baseFee = input.base_fee ?? classRecord.entry_fee ?? null;
  const isLate = Boolean(block.entries_close_at && Date.now() > new Date(block.entries_close_at).getTime());

  if (isLate && !show.late_entries_allowed) {
    throw new Error("Les inscriptions sont fermées pour ce bloc.");
  }

  const lateFeePercent = isLate ? show.late_entry_fee_percent ?? 50 : 0;
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
  class_id: string;
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
  const { data: classRecord, error: classError } = await client
    .from("classes")
    .select("id, block_id")
    .eq("id", input.class_id)
    .single<Pick<ClassRecord, "id" | "block_id">>();

  if (classError) {
    throw classError;
  }

  const { data: blockClasses, error: blockClassesError } = await client
    .from("classes")
    .select("id")
    .eq("block_id", classRecord.block_id)
    .returns<Array<Pick<ClassRecord, "id">>>();

  if (blockClassesError) {
    throw blockClassesError;
  }

  const blockClassIds = (blockClasses ?? []).map((blockClass) => blockClass.id);
  let horseEntryQuery = client
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("horse_id", input.horse_id)
    .in("class_id", blockClassIds)
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
    .eq("class_id", input.class_id)
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
  await assertHorseHealthComplianceForShow(input.horse_id, input.show_id);
  await assertEntryShowLevelMembershipRequirements({
    organization_id: input.organization_id,
    owner_contact_id: input.owner_contact_id,
    payer_contact_id: input.payer_contact_id,
    rider_contact_id: input.rider_contact_id ?? null,
    show_id: input.show_id,
  });
  await assertEntryProgramLimits({
    class_id: input.class_id,
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
	      class_id: input.class_id,
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
    await assertHorseHealthComplianceForShow(input.horse_id ?? existing.horse_id, existing.show_id);
    await assertEntryShowLevelMembershipRequirements({
      organization_id: existing.organization_id,
      owner_contact_id: input.owner_contact_id ?? existing.owner_contact_id,
      payer_contact_id: input.payer_contact_id ?? existing.payer_contact_id,
      rider_contact_id: input.rider_contact_id === undefined ? existing.rider_contact_id : input.rider_contact_id,
      show_id: existing.show_id,
    });
    await assertEntryProgramLimits({
      entry_id: id,
      class_id: input.class_id ?? existing.class_id,
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
    await assertHorseHealthComplianceForShow(input.horse_id, input.show_id);
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
    await assertHorseHealthComplianceForShow(nextBookingHorseId, existing.show_id);
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

async function loadShowScoreClassSetups(organizationId: string | null = null) {
  const client = requireSupabase();
  const query = client
    .from("show_score_block_setups")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<ShowScoreBlockSetup[]>();
  const { data, error } = await scopeQueryToOrganization(query, organizationId);

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
  blocks: Block[];
  classes: ClassRecord[];
  showScoreClassSetups: ShowScoreBlockSetup[];
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

  const [setupsResult, blocksResult, contactDirectoryResult, horseDirectoryResult] = await Promise.all([
    client.from("show_score_block_setups").select("*").eq("show_id", input.showId).returns<ShowScoreBlockSetup[]>(),
    client.from("blocks").select("*").eq("show_id", input.showId).returns<Block[]>(),
    client
      .from("directory_contacts")
      .select("contact_id, organization_disciplines!inner(organization_id)")
      .eq("organization_disciplines.organization_id", show.organization_id)
      .returns<Array<{ contact_id: string }>>(),
    client
      .from("directory_horses")
      .select("horse_id, organization_disciplines!inner(organization_id)")
      .eq("organization_disciplines.organization_id", show.organization_id)
      .returns<Array<{ horse_id: string }>>(),
  ]);

  if (setupsResult.error) {
    throw setupsResult.error;
  }
  if (blocksResult.error) {
    throw blocksResult.error;
  }
  if (contactDirectoryResult.error) {
    throw contactDirectoryResult.error;
  }
  if (horseDirectoryResult.error) {
    throw horseDirectoryResult.error;
  }

  const blockIds = (blocksResult.data ?? []).map((block) => block.id);
  const contactIds = [...new Set((contactDirectoryResult.data ?? []).map((row) => row.contact_id))];
  const horseIds = [...new Set((horseDirectoryResult.data ?? []).map((row) => row.horse_id))];
  const [classesResult, contactsResult, horsesResult] = await Promise.all([
    blockIds.length
      ? client.from("classes").select("*").in("block_id", blockIds).returns<ClassRecord[]>()
      : Promise.resolve({ data: [] as ClassRecord[], error: null }),
    contactIds.length
      ? client.from("contacts").select("*").in("id", contactIds).returns<Contact[]>()
      : Promise.resolve({ data: [] as Contact[], error: null }),
    horseIds.length
      ? client.from("horses").select("*").in("id", horseIds).returns<Horse[]>()
      : Promise.resolve({ data: [] as Horse[], error: null }),
  ]);

  if (classesResult.error) {
    throw classesResult.error;
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
    blocks: blocksResult.data ?? [],
    classes: classesResult.data ?? [],
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
    preview.classPreviews.map((classPreview) => classPreview.block.id),
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

      sourceRunSnapshots[classPreview.block.id] = {};

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

        for (const classRecord of runPreview.matchedClasses) {
          const externalSourceKey = buildAqrExternalSourceKey({
            blockId: classPreview.block.id,
            classId: classRecord.id,
            run,
          });
          const entryStatus: Entry["status"] = isAqrScratchRun(run) ? "scratched" : "active";
          const baseFee = classRecord.entry_fee ?? 0;
          const { data: entry, error: entryError } = await client
            .from("entries")
            .insert({
              organization_id: show.organization_id,
              show_id: input.showId,
              horse_id: horse.id,
              class_id: classRecord.id,
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
                classId: classPreview.block.id,
                className: classPreview.block.name,
                divisionId: classRecord.id,
                divisionCode: classRecord.code,
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
          blockId: classPreview.block.id,
          blockRunId,
          entryIds,
          orderOfGo: run.order || run.draw,
          runId,
          showId: input.showId,
        });

        runIds.push(runId);
        blockRunIds.push(blockRunId);
        sourceRunSnapshots[classPreview.block.id][run.sourceRunId] = {
          snapshot,
          runId,
          blockRunId,
          entryIds,
          divisionIds: runPreview.matchedClasses.map((classRecord) => classRecord.id),
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
            divisionId: runPreview.matchedClasses[0]?.id ?? null,
            divisionIds: runPreview.matchedClasses.map((classRecord) => classRecord.id),
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
        .from("show_score_block_setups")
        .update({ runs: cleanedRuns })
        .eq("block_id", classPreview.block.id)
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
  await cleanupAuditHorses(createdHorseIds);
  await cleanupAuditContacts(createdContactIds);
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
    .select("block_id,started_at")
    .eq("show_id", showId)
    .in("block_id", classIds)
    .returns<Array<{ block_id: string; started_at: string | null }>>();

  if (scoringError && !isMissingSchemaError(scoringError, "show_score_scoring_sessions")) {
    throw scoringError;
  }

  const startedClassIds = (scoringSessions ?? [])
    .filter((session) => session.started_at)
    .map((session) => session.block_id);

  if (startedClassIds.length) {
    throw new Error("Import AQR bloque: le pointage officiel ShowScore a deja commence pour une classe selectionnee.");
  }

  const { data: judgeSessions, error: judgeError } = await client
    .from("show_score_judge_sessions")
    .select("block_id,finalized")
    .eq("show_id", showId)
    .in("block_id", classIds)
    .returns<Array<{ block_id: string; finalized: boolean }>>();

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

async function cleanupAuditHorses(horseIds: string[]) {
  const client = requireSupabase();

  for (const horseId of uniqueStrings(horseIds)) {
    const [entryCount, stallCount] = await Promise.all([
      countRows("entries", "horse_id", horseId),
      countRows("stall_bookings", "horse_id", horseId),
    ]);

    if (entryCount + stallCount > 0) {
      continue;
    }

    const { error: directoryError } = await client.from("directory_horses").delete().eq("horse_id", horseId);

    if (directoryError) {
      throw directoryError;
    }

    const { error } = await client.from("horses").delete().eq("id", horseId);

    if (error && error.code !== "23503") {
      throw error;
    }
  }
}

async function cleanupAuditContacts(contactIds: string[]) {
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

    const { error: directoryError } = await client.from("directory_contacts").delete().eq("contact_id", contactId);

    if (directoryError) {
      throw directoryError;
    }

    const { error } = await client.from("contacts").delete().eq("id", contactId);

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
    .from("show_score_block_setups")
    .select("*")
    .eq("show_id", batch.show_id)
    .in("block_id", classIds)
    .returns<ShowScoreBlockSetup[]>();

  if (error) {
    throw error;
  }

  for (const setup of setups ?? []) {
    const classSnapshots = snapshots[setup.block_id] ?? {};
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
      .from("show_score_block_setups")
      .update({ runs: restoredRuns })
      .eq("block_id", setup.block_id)
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
    const fullName = [contact.first_name, contact.middle_name, contact.last_name].filter(Boolean).join(" ").trim();
    const reversedName = [contact.last_name, contact.middle_name, contact.first_name].filter(Boolean).join(" ").trim();
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

type GoverningBodyLinkRow = {
  class_id?: string;
  class_template_id?: string;
  governing_body_id: string;
  reporting_class_code: string | null;
  eligibility_profile_code: string | null;
  sanction_metadata: Record<string, unknown>;
};

function attachGoverningBodyAssignments<T extends { id: string }>(
  records: T[],
  links: GoverningBodyLinkRow[],
  ownerColumn: "class_id" | "class_template_id",
  governingBodyById: Map<string, SanctioningBody>,
) {
  const assignmentsByOwnerId = new Map<string, GoverningBodyAssignment[]>();

  for (const link of links) {
    const ownerId = link[ownerColumn];
    const body = governingBodyById.get(link.governing_body_id);

    if (ownerId && body) {
      assignmentsByOwnerId.set(ownerId, [...(assignmentsByOwnerId.get(ownerId) ?? []), {
        governing_body_id: body.id,
        code: body.code,
        name: body.name,
        reporting_class_code: link.reporting_class_code,
        eligibility_profile_code: link.eligibility_profile_code,
        sanction_metadata: link.sanction_metadata ?? {},
      }]);
    }
  }

  return records.map((record) => ({
    ...record,
    governing_body_assignments: assignmentsByOwnerId.get(record.id) ?? [],
  }));
}

export async function prepareShowScoreClassSetup(input: {
  classRecord: Block;
  entries: Entry[];
  classes: ClassRecord[];
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
    classes: input.classes,
    horses: input.horses,
  });

  if (!runs.length) {
    throw new Error("Aucune inscription a envoyer dans l'ordre de passage.");
  }

  await saveShowScoreRunLinks(input.classRecord, runs);

  const judges = input.classRecord.judge_display_name
    ? [{ id: "judge-1", name: input.classRecord.judge_display_name, order: 1 }]
    : [{ id: "judge-1", name: "", order: 1 }];
  const preparedAt = new Date().toISOString();

  const { data, error } = await client
    .from("show_score_block_setups")
    .upsert(
      {
        block_id: input.classRecord.id,
        organization_id: input.classRecord.organization_id,
        show_id: input.classRecord.show_id,
        show_day_id: input.classRecord.show_day_id,
        pattern: input.classRecord.pattern || null,
        custom_pattern: input.classRecord.custom_pattern,
        runs,
        judges,
        is_draw_imported: true,
      },
      { onConflict: "block_id" },
    )
    .select("*")
    .single<ShowScoreBlockSetup>();

  if (error) {
    throw error;
  }

  const { error: classError } = await client.from("blocks").update({ draw_prepared_at: preparedAt }).eq("id", input.classRecord.id);

  if (classError) {
    throw classError;
  }

  return data;
}

async function saveShowScoreRunLinks(classRecord: Block, runs: ShowScoreRun[]) {
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
    classes: ClassRecord[];
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
  classRecord: Block;
  entries: Entry[];
  classes: ClassRecord[];
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
    classes: input.classes,
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
      source_block_id: input.classRecord.id,
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
  const organizationDisciplineId = await findDefaultOrganizationDisciplineId(input.organization_id);
  const { error } = await client.from("directory_contacts").upsert(
    {
      organization_discipline_id: organizationDisciplineId,
      contact_id: input.contact_id,
      source: directorySourceFromLegacyLink(input.source),
      created_by_user_id: input.created_by_user_id ?? null,
    },
    { onConflict: "organization_discipline_id,contact_id" },
  );

  if (error) {
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
  const organizationDisciplineId = await findDefaultOrganizationDisciplineId(input.organization_id);
  const { error } = await client.from("directory_horses").upsert(
    {
      organization_discipline_id: organizationDisciplineId,
      horse_id: input.horse_id,
      source: directorySourceFromLegacyLink(input.source),
      created_by_user_id: input.created_by_user_id ?? null,
    },
    { onConflict: "organization_discipline_id,horse_id" },
  );

  if (error) {
    throw error;
  }
}

type HorseDirectoryContextRow = {
  organization_discipline_id: string;
  organization_disciplines:
    | { organization_id: string; is_active: boolean }
    | Array<{ organization_id: string; is_active: boolean }>;
};

async function loadHorseDirectoryContexts(horseId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("directory_horses")
    .select("organization_discipline_id, organization_disciplines!inner(organization_id,is_active)")
    .eq("horse_id", horseId)
    .eq("organization_disciplines.is_active", true)
    .returns<HorseDirectoryContextRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const directory = Array.isArray(row.organization_disciplines)
      ? row.organization_disciplines[0]
      : row.organization_disciplines;

    return {
      organizationDisciplineId: row.organization_discipline_id,
      organizationId: directory?.organization_id ?? "",
    };
  }).filter((context) => context.organizationId);
}

async function ensureContactDirectoriesForHorse(input: {
  horse_id: string;
  contact_id: string;
  source: ContactOrganizationLink["source"];
  created_by_user_id?: string | null;
}) {
  const contexts = await loadHorseDirectoryContexts(input.horse_id);

  if (!contexts.length) {
    return;
  }

  const client = requireSupabase();
  const { error } = await client.from("directory_contacts").upsert(
    contexts.map((context) => ({
      organization_discipline_id: context.organizationDisciplineId,
      contact_id: input.contact_id,
      source: directorySourceFromLegacyLink(input.source),
      created_by_user_id: input.created_by_user_id ?? null,
    })),
    { onConflict: "organization_discipline_id,contact_id" },
  );

  if (error) {
    throw error;
  }
}

async function ensureContactRoleForHorseOrganizations(
  horseId: string,
  contactId: string,
  role: ContactRoleName,
) {
  const contexts = await loadHorseDirectoryContexts(horseId);
  const organizationIds = Array.from(new Set(contexts.map((context) => context.organizationId)));

  for (const organizationId of organizationIds) {
    await ensureContactRole({
      organization_id: organizationId,
      contact_id: contactId,
      role,
      source: "horse",
    });
  }
}

async function findDefaultOrganizationDisciplineId(organizationId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_disciplines")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Cette association n'a aucun répertoire de discipline actif.");
  }

  return data.id;
}

function directorySourceFromLegacyLink(
  source: ContactOrganizationLink["source"] | HorseOrganizationLink["source"],
) {
  switch (source) {
    case "entry":
      return "entry";
    case "reservation":
      return "reservation";
    case "claimed_account":
      return "membership";
    case "horse":
      return "relationship";
    default:
      return "manual";
  }
}

async function syncContactExternalIdentifiers(contactId: string, memberships?: ExternalContactIdentifierInput[]) {
  if (!memberships) {
    return;
  }

  const client = requireSupabase();
  const cleanIdentifiers = memberships.filter(
    (membership) => membership.external_credential_issuer_id && membership.identifier_value.trim(),
  );

  for (const membership of cleanIdentifiers) {
    const verificationPayload = membership.verification_payload ?? {};
    const verificationSource = membership.verification_source ?? null;
    const sourceId = await externalDataSourceIdForVerificationSource(verificationSource);
    const { data, error } = await client
      .from("contact_external_identifiers")
      .upsert(
        {
          contact_id: contactId,
          external_credential_issuer_id: membership.external_credential_issuer_id,
          identifier_type: membership.identifier_type ?? "membership",
          identifier_value: membership.identifier_value.trim(),
          status: membership.status ?? "unknown",
          valid_from: membership.valid_from ?? null,
          expires_on: membership.expires_on ?? null,
          verified_at: membership.verified_at ?? null,
          verified_by_external_data_source_id: sourceId,
          metadata: {
            verification_source: verificationSource,
            verification_payload: verificationPayload,
          },
        },
        { onConflict: "contact_id,external_credential_issuer_id,identifier_type" },
      )
      .select("id")
      .single<{ id: string }>();

    if (error) {
      if (isMissingSchemaError(error, "contact_external_identifiers")) {
        return;
      }

      throw error;
    }

    if (sourceId && Object.keys(verificationPayload).length) {
      const snapshotId = await recordExternalDataSnapshot({
        externalDataSourceId: sourceId,
        payload: verificationPayload,
        sourceRecordKey: membership.identifier_value.trim(),
        contactId,
      });
      const { error: snapshotLinkError } = await client
        .from("contact_external_identifiers")
        .update({ latest_snapshot_id: snapshotId })
        .eq("id", data.id);

      if (snapshotLinkError) {
        throw snapshotLinkError;
      }
    }
  }

  const emptyMemberships = memberships.filter((membership) => membership.external_credential_issuer_id && !membership.identifier_value.trim());

  if (emptyMemberships.length) {
    const membershipsByType = new Map<ContactExternalIdentifier["identifier_type"], string[]>();

    for (const membership of emptyMemberships) {
      const identifierType = membership.identifier_type ?? "membership";
      membershipsByType.set(identifierType, [
        ...(membershipsByType.get(identifierType) ?? []),
        membership.external_credential_issuer_id,
      ]);
    }

    for (const [identifierType, issuerIds] of membershipsByType.entries()) {
      const { error } = await client
        .from("contact_external_identifiers")
        .delete()
        .eq("contact_id", contactId)
        .eq("identifier_type", identifierType)
        .in("external_credential_issuer_id", issuerIds);

      if (error && !isMissingSchemaError(error, "contact_external_identifiers")) {
        throw error;
      }
    }
  }
}

async function syncHorseExternalIdentifiers(horseId: string, memberships?: ExternalHorseIdentifierInput[]) {
  if (!memberships) {
    return;
  }

  const client = requireSupabase();
  const cleanIdentifiers = memberships.filter(
    (membership) => membership.external_credential_issuer_id && membership.identifier_value.trim(),
  );

  for (const membership of cleanIdentifiers) {
    const verificationPayload = membership.verification_payload ?? {};
    const verificationSource = membership.verification_source ?? null;
    const sourceId = await externalDataSourceIdForVerificationSource(verificationSource);
    const { data, error } = await client
      .from("horse_external_identifiers")
      .upsert(
        {
          horse_id: horseId,
          external_credential_issuer_id: membership.external_credential_issuer_id,
          identifier_type: membership.identifier_type ?? "competition_license",
          identifier_value: membership.identifier_value.trim(),
          status: membership.status ?? "unknown",
          valid_from: membership.valid_from ?? null,
          expires_on: membership.expires_on ?? null,
          verified_at: membership.verified_at ?? null,
          verified_by_external_data_source_id: sourceId,
          metadata: {
            verification_source: verificationSource,
            verification_payload: verificationPayload,
          },
        },
        { onConflict: "horse_id,external_credential_issuer_id,identifier_type" },
      )
      .select("id")
      .single<{ id: string }>();

    if (error) {
      if (isMissingSchemaError(error, "horse_external_identifiers")) {
        return;
      }

      throw error;
    }

    if (sourceId && Object.keys(verificationPayload).length) {
      const snapshotId = await recordExternalDataSnapshot({
        externalDataSourceId: sourceId,
        payload: verificationPayload,
        sourceRecordKey: membership.identifier_value.trim(),
        horseId,
      });
      const { error: snapshotLinkError } = await client
        .from("horse_external_identifiers")
        .update({ latest_snapshot_id: snapshotId })
        .eq("id", data.id);

      if (snapshotLinkError) {
        throw snapshotLinkError;
      }
    }
  }

  const emptyMemberships = memberships.filter((membership) => membership.external_credential_issuer_id && !membership.identifier_value.trim());

  if (emptyMemberships.length) {
    const membershipsByType = new Map<HorseExternalIdentifier["identifier_type"], string[]>();

    for (const membership of emptyMemberships) {
      const referenceType = membership.identifier_type ?? "competition_license";
      membershipsByType.set(referenceType, [...(membershipsByType.get(referenceType) ?? []), membership.external_credential_issuer_id]);
    }

    for (const [referenceType, externalCredentialIssuerIds] of membershipsByType.entries()) {
      const { error } = await client
        .from("horse_external_identifiers")
        .delete()
        .eq("horse_id", horseId)
        .eq("identifier_type", referenceType)
        .in("external_credential_issuer_id", externalCredentialIssuerIds);

      if (error && !isMissingSchemaError(error, "horse_external_identifiers")) {
        throw error;
      }
    }
  }
}

const externalDataSourceIdCache = new Map<string, string | null>();

async function externalDataSourceIdForVerificationSource(source: string | null) {
  if (!source) {
    return null;
  }

  const sourceCode = source === "nrha_api" ? "NRHA_MEMBER_LOOKUP" : source.trim().toUpperCase();
  if (externalDataSourceIdCache.has(sourceCode)) {
    return externalDataSourceIdCache.get(sourceCode) ?? null;
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("external_data_sources")
    .select("id")
    .eq("code", sourceCode)
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  const sourceId = data?.id ?? null;
  externalDataSourceIdCache.set(sourceCode, sourceId);
  return sourceId;
}

async function recordExternalDataSnapshot(input: {
  externalDataSourceId: string;
  payload: Record<string, unknown>;
  sourceRecordKey?: string;
  contactId?: string;
  horseId?: string;
  teamEligibility?: {
    horseId: string;
    riderContactId: string;
    showId: string;
    classId: string;
    governingBodyId: string;
  };
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("external_data_snapshots")
    .insert({
      external_data_source_id: input.externalDataSourceId,
      source_record_key: input.sourceRecordKey?.trim() || null,
      status: "verified",
      effective_at: new Date().toISOString(),
      payload: input.payload,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  if (input.contactId) {
    const { error: contactLinkError } = await client.from("external_data_snapshot_contacts").insert({
      snapshot_id: data.id,
      contact_id: input.contactId,
      relationship_type: "subject",
    });
    if (contactLinkError) {
      throw contactLinkError;
    }
  }

  if (input.horseId) {
    const { error: horseLinkError } = await client.from("external_data_snapshot_horses").insert({
      snapshot_id: data.id,
      horse_id: input.horseId,
      relationship_type: "subject",
    });
    if (horseLinkError) {
      throw horseLinkError;
    }
  }

  if (input.teamEligibility) {
    const { error: teamLinkError } = await client.from("team_eligibility_snapshots").insert({
      snapshot_id: data.id,
      horse_id: input.teamEligibility.horseId,
      rider_contact_id: input.teamEligibility.riderContactId,
      show_id: input.teamEligibility.showId,
      class_id: input.teamEligibility.classId,
      governing_body_id: input.teamEligibility.governingBodyId,
    });
    if (teamLinkError) {
      throw teamLinkError;
    }
  }

  return data.id;
}

function hydrateContactExternalIdentifier(identifier: ContactExternalIdentifier): ContactExternalIdentifier {
  const metadata = identifier.metadata ?? {};
  return {
    ...identifier,
    verification_source: typeof metadata.verification_source === "string" ? metadata.verification_source : null,
    verification_payload: isPlainRecord(metadata.verification_payload) ? metadata.verification_payload : {},
  };
}

function hydrateHorseExternalIdentifier(identifier: HorseExternalIdentifier): HorseExternalIdentifier {
  const metadata = identifier.metadata ?? {};
  return {
    ...identifier,
    verification_source: typeof metadata.verification_source === "string" ? metadata.verification_source : null,
    verification_payload: isPlainRecord(metadata.verification_payload) ? metadata.verification_payload : {},
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

async function assertHorseHealthComplianceForShow(horseId: string | null | undefined, showId: string | null | undefined) {
  if (!horseId || !showId) {
    return;
  }

  const client = requireSupabase();
  const { error } = await client.rpc("assert_horse_health_compliance_for_show", {
    p_horse_id: horseId,
    p_show_id: showId,
  });

  if (error) {
    if (isMissingRpcError(error, "assert_horse_health_compliance_for_show")) {
      throw new Error("La migration de conformité santé des inscriptions et réservations n'est pas encore appliquée.");
    }

    if (error.message.includes("HSP_HEALTH_COMPLIANCE_BLOCKED")) {
      throw new Error("Les documents santé de ce cheval ne respectent pas la politique bloquante de l'association pour la date du concours.");
    }

    throw new Error(error.message || "Impossible de vérifier la conformité santé du cheval pour ce concours.");
  }
}

async function assertEntryShowLevelMembershipRequirements(input: {
  organization_id: string;
  owner_contact_id: string | null | undefined;
  payer_contact_id: string | null | undefined;
  rider_contact_id: string | null | undefined;
  show_id: string | null | undefined;
}) {
  const requirements = await loadRequiredExternalCredentialRequirements(input.organization_id);
  const riderRequirementIds = credentialRequirementIssuerIdsForType(requirements, "rider");
  const referenceDate = await entryMembershipReferenceDate(input.show_id);

  if (riderRequirementIds.length && !input.rider_contact_id) {
    throw new Error("Choisir un cavalier avant de creer l'inscription: cette association exige des numeros de membre pour les riders.");
  }

  await assertContactExternalIdentifierRequirements({
    contact_id: input.owner_contact_id,
    contact_type: "owner",
    reference_date: referenceDate,
    requirements,
    role_label: "Proprietaire",
  });
  await assertContactExternalIdentifierRequirements({
    contact_id: input.rider_contact_id,
    contact_type: "rider",
    reference_date: referenceDate,
    requirements,
    role_label: "Cavalier",
  });
  await assertContactExternalIdentifierRequirements({
    contact_id: input.payer_contact_id,
    contact_type: "payer",
    reference_date: referenceDate,
    requirements,
    role_label: "Payeur",
  });
}

async function entryMembershipReferenceDate(showId: string | null | undefined) {
  if (!showId) {
    return todayDateValue();
  }

  const client = requireSupabase();
  const { data, error } = await client.from("shows").select("start_date").eq("id", showId).maybeSingle<Pick<Show, "start_date">>();

  if (error) {
    throw error;
  }

  return data?.start_date?.slice(0, 10) || todayDateValue();
}

async function loadRequiredExternalCredentialRequirements(organizationId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_external_credential_requirements")
    .select("id,external_credential_issuer_id,contact_type,identifier_type,requirement_group_code,match_rule,validity_rule,enforcement_mode,is_required")
    .eq("organization_id", organizationId)
    .eq("is_required", true)
    .returns<ExternalCredentialRequirementCheck[]>();

  if (error) {
    if (isMissingSchemaError(error, "organization_external_credential_requirements")) {
      return [];
    }

    throw error;
  }

  return data ?? [];
}

async function assertContactExternalIdentifierRequirements(input: {
  contact_id: string | null | undefined;
  contact_type: Contact["type"];
  reference_date: string;
  requirements: ExternalCredentialRequirementCheck[];
  role_label: string;
}) {
  const requiredCredentials = input.requirements.filter(
    (requirement) =>
      requirement.is_required &&
      requirement.contact_type === input.contact_type &&
      requirement.enforcement_mode === "blocking",
  );
  const requiredOrganizationIds = Array.from(
    new Set(requiredCredentials.map((requirement) => requirement.external_credential_issuer_id)),
  );

  if (!requiredOrganizationIds.length) {
    return;
  }

  if (!input.contact_id) {
    throw new Error(`${input.role_label} requis: cette association exige des numeros de membre obligatoires.`);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("contact_external_identifiers")
    .select("external_credential_issuer_id,identifier_type,identifier_value,status,valid_from,expires_on")
    .eq("contact_id", input.contact_id)
    .in("external_credential_issuer_id", requiredOrganizationIds)
    .returns<Array<Pick<ContactExternalIdentifier, "external_credential_issuer_id" | "identifier_type" | "identifier_value" | "status" | "valid_from" | "expires_on">>>();

  if (error) {
    if (isMissingSchemaError(error, "contact_external_identifiers")) {
      return;
    }

    throw error;
  }

  const requirementGroups = groupExternalCredentialRequirements(requiredCredentials);
  const missingRequirements = requirementGroups
    .filter((group) => {
      const results = group.requirements.map((requirement) =>
        (data ?? []).some(
          (identifier) =>
            identifier.external_credential_issuer_id === requirement.external_credential_issuer_id &&
            identifier.identifier_type === requirement.identifier_type &&
            contactExternalIdentifierSatisfiesRequirement(identifier, requirement, input.reference_date),
        ),
      );
      return group.matchRule === "at_least_one" ? !results.some(Boolean) : !results.every(Boolean);
    })
    .flatMap((group) => group.requirements);
  const missingOrganizationIds = Array.from(
    new Set(missingRequirements.map((requirement) => requirement.external_credential_issuer_id)),
  );

  if (!missingOrganizationIds.length) {
    return;
  }

  const labels = await loadExternalCredentialIssuerLabels(missingOrganizationIds);
  throw new Error(`${input.role_label}: numeros de membre obligatoires manquants ou expires (${labels.join(", ")}).`);
}

function contactExternalIdentifierSatisfiesRequirement(
  identifier: Pick<ContactExternalIdentifier, "identifier_value" | "status" | "valid_from" | "expires_on">,
  requirement: Pick<OrganizationExternalCredentialRequirement, "validity_rule">,
  referenceDate: string,
) {
  if (!identifier.identifier_value.trim()) {
    return false;
  }

  if (requirement.validity_rule === "present") {
    return true;
  }

  if (identifier.status !== "active") {
    return false;
  }

  if (identifier.valid_from && identifier.valid_from.slice(0, 10) > referenceDate) {
    return false;
  }

  return !identifier.expires_on || identifier.expires_on.slice(0, 10) >= referenceDate;
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

async function loadExternalCredentialIssuerLabels(ids: string[]) {
  if (!ids.length) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("external_credential_issuers")
    .select("id,code,name")
    .in("id", ids)
    .returns<Array<Pick<ExternalCredentialIssuer, "id" | "code" | "name">>>();

  if (error) {
    if (isMissingSchemaError(error, "external_credential_issuers")) {
      return ids;
    }

    throw error;
  }

  return ids.map((id) => {
    const organization = data?.find((candidate) => candidate.id === id);
    return organization?.code || organization?.name || id;
  });
}

type ExternalCredentialRequirementCheck = Pick<
  OrganizationExternalCredentialRequirement,
  "id" | "external_credential_issuer_id" | "contact_type" | "identifier_type" | "requirement_group_code" | "match_rule" | "validity_rule" | "enforcement_mode" | "is_required"
>;

function groupExternalCredentialRequirements(requirements: ExternalCredentialRequirementCheck[]) {
  const groups = new Map<string, ExternalCredentialRequirementCheck[]>();

  for (const requirement of requirements) {
    const key = requirement.requirement_group_code
      ? `${requirement.contact_type}:${requirement.requirement_group_code}`
      : `direct:${requirement.id}`;
    groups.set(key, [...(groups.get(key) ?? []), requirement]);
  }

  return Array.from(groups.entries()).map(([key, groupedRequirements]) => ({
    key,
    matchRule: groupedRequirements[0]?.match_rule ?? "all",
    requirements: groupedRequirements,
  }));
}

function credentialRequirementIssuerIdsForType(
  requirements: ExternalCredentialRequirementCheck[],
  contactType: Contact["type"],
) {
  return requirements
    .filter(
      (requirement) =>
        requirement.is_required &&
        requirement.contact_type === contactType &&
        requirement.enforcement_mode === "blocking",
    )
    .map((requirement) => requirement.external_credential_issuer_id);
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

  return enrichExistingContact(data, input);
}

async function enrichExistingContact(existing: Contact, input: ContactInput) {
  const client = requireSupabase();
  const patch: Record<string, unknown> = {};
  const phone = input.phone?.trim();
  const barnName = input.barn_name?.trim();
  const middleName = input.middle_name?.trim();
  const normalizedEmail = normalizeEmail(input.email);
  const address = input.address?.trim();
  const addressLine2 = input.address_line2?.trim();
  const city = input.city?.trim();
  const state = input.state?.trim();
  const zipCode = input.zip_code?.trim();
  const country = normalizeCountry(input.country);

  if (!existing.email && normalizedEmail) {
    patch.email = normalizedEmail;
  }

  if (!existing.phone && phone) {
    patch.phone = phone;
  }

  if (!existing.barn_name && barnName) {
    patch.barn_name = barnName;
  }

  if (!existing.middle_name && middleName) {
    patch.middle_name = middleName;
  }

  if (!existing.address && address) {
    patch.address = address;
  }

  if (!existing.address_line2 && addressLine2) {
    patch.address_line2 = addressLine2;
  }

  if (!existing.city && city) {
    patch.city = city;
  }

  if (!existing.state && state) {
    patch.state = state;
  }

  if (!existing.zip_code && zipCode) {
    patch.zip_code = zipCode;
  }

  if (!existing.country && country) {
    patch.country = country;
  }

  if (!existing.date_of_birth && input.date_of_birth) {
    patch.date_of_birth = input.date_of_birth;
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

type DirectoryContactLinkRow = {
  id: string;
  organization_discipline_id: string;
  contact_id: string;
  source: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  organization_disciplines: { organization_id: string } | Array<{ organization_id: string }>;
};

type DirectoryHorseLinkRow = {
  id: string;
  organization_discipline_id: string;
  horse_id: string;
  source: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  organization_disciplines: { organization_id: string } | Array<{ organization_id: string }>;
};

function directoryOrganizationId(
  relation: DirectoryContactLinkRow["organization_disciplines"],
) {
  return Array.isArray(relation) ? relation[0]?.organization_id ?? "" : relation.organization_id;
}

function legacyLinkSourceFromDirectory(source: string): ContactOrganizationLink["source"] {
  switch (source) {
    case "entry":
      return "entry";
    case "reservation":
      return "reservation";
    case "membership":
      return "claimed_account";
    case "relationship":
      return "horse";
    default:
      return "manual";
  }
}

function directoryContactRowToOrganizationLink(row: DirectoryContactLinkRow): ContactOrganizationLink {
  return {
    id: row.id,
    organization_id: directoryOrganizationId(row.organization_disciplines),
    contact_id: row.contact_id,
    source: legacyLinkSourceFromDirectory(row.source),
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
  };
}

function directoryContactRowToDirectoryContact(row: DirectoryContactLinkRow): DirectoryContact {
  return {
    id: row.id,
    organization_discipline_id: row.organization_discipline_id,
    contact_id: row.contact_id,
    source: row.source as DirectoryContact["source"],
    notes: row.notes,
    metadata: row.metadata,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function directoryHorseRowToOrganizationLink(row: DirectoryHorseLinkRow): HorseOrganizationLink {
  const source = legacyLinkSourceFromDirectory(row.source);

  return {
    id: row.id,
    organization_id: directoryOrganizationId(row.organization_disciplines),
    horse_id: row.horse_id,
    source: source === "horse" || source === "claimed_account" ? "manual" : source,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
  };
}

function directoryHorseRowToDirectoryHorse(row: DirectoryHorseLinkRow): DirectoryHorse {
  return {
    id: row.id,
    organization_discipline_id: row.organization_discipline_id,
    horse_id: row.horse_id,
    source: row.source as DirectoryHorse["source"],
    notes: row.notes,
    metadata: row.metadata,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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

  const cleanValue = value?.trim() ?? "";

  if (!cleanValue) {
    return null;
  }

  const upperValue = cleanValue.toUpperCase();

  if (/^[A-Z]{2}$/.test(upperValue)) {
    return upperValue;
  }

  const normalizedName = upperValue
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const countryByName: Record<string, string> = {
    AUSTRALIA: "AU",
    AUSTRALIE: "AU",
    BELGIQUE: "BE",
    BELGIUM: "BE",
    CAN: "CA",
    CANADA: "CA",
    FRANCE: "FR",
    "GREAT BRITAIN": "GB",
    MEXICO: "MX",
    MEXIQUE: "MX",
    "ROYAUME UNI": "GB",
    SUISSE: "CH",
    SWITZERLAND: "CH",
    UK: "GB",
    "UNITED KINGDOM": "GB",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    US: "US",
    USA: "US",
  };

  return countryByName[normalizedName] ?? upperValue.slice(0, 2);
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
  return isMissingSchemaError(error, "show_score_block_setups");
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

function isMissingExternalMembershipVerificationColumn(error: unknown) {
  return (
    isMissingColumnError(error, "verified_at") ||
    isMissingColumnError(error, "verification_source") ||
    isMissingColumnError(error, "verification_payload")
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

export type NrhaRiderRankingImportRow = {
  earnings?: number | null;
  rank: number;
  riderName: string;
  sourcePayload?: Record<string, unknown>;
};

export async function replaceNrhaRiderRankings(input: {
  appliesToCategories?: number[];
  eligibilityYear: number;
  importedByUserId?: string | null;
  listType: NrhaRiderRankingListType;
  rows: NrhaRiderRankingImportRow[];
  sourceFileName?: string | null;
  sourceYear?: number | null;
}) {
  const client = requireSupabase();
  const appliesToCategories = input.appliesToCategories?.length ? input.appliesToCategories : [2, 6];
  const rows = input.rows
    .filter((row) => Number.isInteger(row.rank) && row.rank > 0 && row.riderName.trim())
    .map((row) => ({
      applies_to_categories: appliesToCategories,
      eligibility_year: input.eligibilityYear,
      earnings: row.earnings ?? null,
      imported_by_user_id: input.importedByUserId ?? null,
      list_type: input.listType,
      rank: row.rank,
      rider_name: row.riderName.trim(),
      rider_name_match_key: nrhaRiderNameMatchKey(row.riderName),
      rider_name_normalized: normalizeNrhaRiderName(row.riderName),
      source_file_name: input.sourceFileName ?? null,
      source_payload: row.sourcePayload ?? {},
      source_year: input.sourceYear ?? null,
    }));

  if (!rows.length) {
    throw new Error("Aucun rider NRHA valide à importer.");
  }

  const { error: deleteError } = await client
    .from("nrha_rider_rankings")
    .delete()
    .eq("eligibility_year", input.eligibilityYear)
    .eq("list_type", input.listType);

  if (deleteError) {
    throw deleteError;
  }

  const { error: insertError } = await client.from("nrha_rider_rankings").insert(rows);

  if (insertError) {
    throw insertError;
  }
}

function normalizeNrhaRiderName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nrhaRiderNameMatchKey(value: string) {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");

  if (commaIndex > 0) {
    const lastName = trimmed.slice(0, commaIndex).trim();
    const givenNames = trimmed.slice(commaIndex + 1).trim().split(/\s+/).filter(Boolean);
    const firstName = givenNames[0] ?? "";
    return normalizeNrhaRiderName([firstName, lastName].filter(Boolean).join(" "));
  }

  return normalizeNrhaRiderName(trimmed);
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
