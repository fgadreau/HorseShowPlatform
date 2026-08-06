export type Organization = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  description: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  billing_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  logo_url: string | null;
  website_url: string | null;
  timezone: string;
  currency: string;
  tax_rate: number;
  tax_name: string | null;
  tax_number: string | null;
  secondary_tax_name: string | null;
  secondary_tax_number: string | null;
  back_number_policy: OrganizationBackNumberAssignmentMode;
  subscription_plan: PlanTier;
  subscription_status: string;
  subscription_expires_at: string | null;
  subscription_notes: string | null;
  modules_enabled: OrganizationModules;
  created_by_user_id: string | null;
  created_at: string;
};

export type HealthIdentityValidationRequirement = "none" | "identified" | "verified";
export type HealthPolicyEnforcementMode = "warning" | "blocking";
export type CogginsValidityRule = "rolling_months" | "calendar_year";

export type OrganizationHealthPolicy = {
  id: string;
  organization_id: string;
  effective_from: string;
  effective_until: string | null;
  coggins_required: boolean;
  coggins_validity_rule: CogginsValidityRule;
  coggins_validity_months: number;
  influenza_required: boolean;
  rhino_required: boolean;
  combo_vaccine_accepted: boolean;
  vaccine_validity_months: number;
  identity_validation_requirement: HealthIdentityValidationRequirement;
  association_review_required: boolean;
  enforcement_mode: HealthPolicyEnforcementMode;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationHealthPolicyInput = Pick<
  OrganizationHealthPolicy,
  | "coggins_required"
  | "coggins_validity_rule"
  | "coggins_validity_months"
  | "influenza_required"
  | "rhino_required"
  | "combo_vaccine_accepted"
  | "vaccine_validity_months"
  | "identity_validation_requirement"
  | "association_review_required"
  | "enforcement_mode"
> & {
  notes?: string | null;
};

export type OrganizationHealthDocumentReview = {
  id: string;
  organization_id: string;
  horse_document_id: string;
  health_policy_id: string | null;
  version: number;
  status: "approved" | "rejected";
  review_notes: string | null;
  reviewed_by_user_id: string;
  reviewed_at: string;
  created_at: string;
};

export type HorseHealthRequirementStatus =
  | "not_required"
  | "valid"
  | "missing"
  | "missing_date"
  | "future_date"
  | "expired"
  | "rejected"
  | "identity_pending"
  | "identity_mismatch"
  | "review_pending"
  | "review_rejected";

export type HorseHealthComplianceStatus =
  | "not_required"
  | "compliant"
  | "pending_review"
  | "non_compliant";

export type HorseHealthRequirementAssessment = {
  required: boolean;
  status: HorseHealthRequirementStatus;
  document_id: string | null;
  document_type: string | null;
  document_status: string | null;
  test_or_administered_on: string | null;
  expires_on: string | null;
  identity_validation_id: string | null;
  identity_validation_status: string | null;
  identity_validation_verdict: string | null;
  association_review_id: string | null;
  association_review_status: OrganizationHealthDocumentReview["status"] | null;
};

export type HorseHealthComplianceReason = {
  code: string;
  requirement: "coggins" | "influenza" | "rhino";
  status: HorseHealthRequirementStatus;
  document_id: string | null;
  expires_on: string | null;
};

export type HorseHealthCompliance = {
  horse_id: string;
  organization_id: string;
  reference_date: string;
  policy_id: string;
  policy_effective_from: string;
  compliance_status: HorseHealthComplianceStatus;
  can_proceed: boolean;
  enforcement_mode: HealthPolicyEnforcementMode;
  requirements: Record<"coggins" | "influenza" | "rhino", HorseHealthRequirementAssessment>;
  reasons: HorseHealthComplianceReason[];
};

export type HorseHealthComplianceOverview = HorseHealthCompliance & {
  organization_name: string;
  organization_short_name: string | null;
};

export type PlanTier = 'community' | 'professional' | 'premium';

export type OrganizationModules = {
  show_score: boolean;
};

export type NrhaRiderRankingListType = "top_professional_riders" | "top_200_non_pro_riders" | "top_200_lifetime_all_riders";

export type NrhaRiderRanking = {
  id: string;
  eligibility_year: number;
  source_year: number | null;
  list_type: NrhaRiderRankingListType;
  rank: number;
  rider_name: string;
  rider_name_match_key: string;
  rider_name_normalized: string;
  earnings: number | null;
  applies_to_categories: number[];
  source_file_name: string | null;
  source_payload: Record<string, unknown>;
  imported_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Show = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  venue: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: "draft" | "open" | "closed" | "archived";
  timezone: string | null;
  default_currency: string | null;
  tax_rate: number | null;
  is_public: boolean;
  entry_deadline_mode: "show" | "block";
  entries_close_at: string | null;
  reservations_close_at: string | null;
  late_entries_allowed: boolean;
  late_entry_fee_percent: number;
  reservation_payment_policy: "pay_at_booking" | "manual";
  entry_payment_policy: "card_on_file_preauth" | "manual";
  entry_preauth_timing: "show_start" | "manual";
  entry_preauth_time: string;
  entry_settlement_timing: "show_end" | "manual";
  entry_settlement_due_time: string;
  entry_auto_capture_enabled: boolean;
  entry_preauth_amount_strategy: "entry_balance" | "entry_balance_with_margin";
  entry_preauth_margin_percent: number;
  created_at: string;
};

export type UserProfile = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  type_user: "owner" | "agent" | "secretary" | "admin" | null;
  avatar_url: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  date_of_birth: string | null;
  preferred_locale: string;
  marketing_opt_in: boolean;
  created_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: "admin" | "secretary" | "user";
  created_at: string;
};

export type Invoice = {
  id: string;
  organization_id: string;
  show_id: string | null;
  invoice_number: string;
  payer_contact_id: string;
  status: "draft" | "sent" | "viewed" | "partially_paid" | "paid" | "overdue" | "void";
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  total_paid: number;
  balance_due: number;
  created_at: string;
};

export type InvoiceLineItem = {
  id: string;
  organization_id: string;
  invoice_id: string;
  item_type: "entry" | "judge_fee" | "stall" | "extra" | "membership" | "fee" | "discount" | "tax" | "manual";
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_applicable: boolean;
  tax_amount: number;
  created_at: string;
};

export type ProductCategory = "stall_extra" | "feed" | "merch" | "ticket" | "meal" | "admin_fee" | "manual";

export type OrganizationProduct = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  description: string | null;
  category: ProductCategory;
  default_price: number;
  tax_applicable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualSale = {
  id: string;
  organization_id: string;
  product_id: string | null;
  show_id: string | null;
  payer_contact_id: string;
  sold_by_user_id: string;
  status: "draft" | "active" | "cancelled";
  description: string;
  quantity: number;
  unit_price: number;
  tax_applicable: boolean;
  invoice_id: string | null;
  source_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  type: "owner" | "agent" | "rider" | "payer" | "other";
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
  barn_name: string | null;
  linked_user_id: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  date_of_birth: string | null;
  created_at: string;
};

export type ContactRoleName = "owner" | "agent" | "rider" | "payer" | "booker" | "other";

export type ContactRole = {
  id: string;
  organization_id: string;
  contact_id: string;
  role: ContactRoleName;
  source: "manual" | "contact_type" | "horse" | "entry" | "reservation";
  created_at: string;
};

export type ContactOrganizationLink = {
  id: string;
  organization_id: string;
  contact_id: string;
  source: "manual" | "created_here" | "claimed_account" | "entry" | "reservation" | "horse";
  created_by_user_id: string | null;
  created_at: string;
};

export type HorseOrganizationLink = {
  id: string;
  organization_id: string;
  horse_id: string;
  source: "manual" | "created_here" | "entry" | "reservation";
  created_by_user_id: string | null;
  created_at: string;
};

export type DirectorySource = "manual" | "entry" | "membership" | "relationship" | "reservation" | "import";

export type DirectoryContact = {
  id: string;
  organization_discipline_id: string;
  contact_id: string;
  source: DirectorySource;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DirectoryHorse = {
  id: string;
  organization_discipline_id: string;
  horse_id: string;
  source: DirectorySource;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalCredentialIssuerType =
  | "provincial_territorial_sport_organization"
  | "national_sport_organization"
  | "breed_registry"
  | "sanctioning_organization"
  | "insurance_provider"
  | "other";

export type ExternalCredentialIssuer = {
  id: string;
  code: string;
  name: string;
  issuer_type: ExternalCredentialIssuerType;
  country_code: string | null;
  subdivision_code: string | null;
  website_url: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExternalCredentialProduct = {
  id: string;
  external_credential_issuer_id: string;
  code: string;
  name: string;
  credential_type: "membership" | "license" | "registration" | "certification" | "insurance" | "other";
  includes_liability_insurance: boolean;
  minimum_coverage_amount: number | null;
  coverage_currency: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalDataSourceType = "api" | "manual_import" | "document" | "public_registry";
export type ExternalDataSourceStatus = "planned" | "available" | "degraded" | "unavailable" | "retired";

export type ExternalDataSource = {
  id: string;
  code: string;
  name: string;
  source_type: ExternalDataSourceType;
  operational_status: ExternalDataSourceStatus;
  base_url: string | null;
  documentation_url: string | null;
  capabilities: Record<string, unknown>;
  configuration: Record<string, unknown>;
  availability_checked_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExternalSourceGoverningBody = {
  external_data_source_id: string;
  governing_body_id: string;
  relationship_type: "official" | "authorized" | "third_party" | "manual";
  data_scope: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OrganizationExternalCredentialRequirement = {
  id: string;
  organization_id: string;
  external_credential_issuer_id: string;
  contact_type: Contact["type"];
  identifier_type: ContactExternalIdentifier["identifier_type"];
  requirement_group_code: string | null;
  match_rule: "all" | "at_least_one";
  validity_rule: "present" | "active_on_reference_date";
  enforcement_mode: "warning" | "blocking";
  is_required: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type OrganizationMembershipType = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  description: string | null;
  season_year: number;
  price: number;
  tax_applicable: boolean;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ContactOrganizationMembership = {
  id: string;
  organization_id: string;
  contact_id: string;
  membership_type_id: string;
  show_id: string | null;
  payer_contact_id: string | null;
  season_year: number;
  membership_number: string | null;
  status: "draft" | "active" | "expired" | "cancelled";
  valid_from: string;
  valid_until: string;
  invoice_id: string | null;
  notes: string | null;
  sold_by_user_id: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactExternalIdentifier = {
  id: string;
  contact_id: string;
  external_credential_issuer_id: string;
  credential_product_id: string | null;
  identifier_type: "membership" | "license" | "registration" | "certification" | "other";
  identifier_value: string;
  normalized_identifier_value: string;
  status: "active" | "pending" | "expired" | "inactive" | "revoked" | "unknown";
  valid_from: string | null;
  expires_on: string | null;
  verified_at: string | null;
  verified_by_external_data_source_id: string | null;
  latest_snapshot_id: string | null;
  metadata: Record<string, unknown>;
  /** Hydrated compatibility fields for the existing NRHA review UI. */
  verification_source: string | null;
  verification_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type HorseExternalIdentifier = {
  id: string;
  horse_id: string;
  external_credential_issuer_id: string;
  credential_product_id: string | null;
  identifier_type: "competition_license" | "registration" | "membership" | "microchip" | "passport" | "other";
  identifier_value: string;
  normalized_identifier_value: string;
  status: "active" | "pending" | "expired" | "inactive" | "revoked" | "unknown";
  valid_from: string | null;
  expires_on: string | null;
  verified_at: string | null;
  verified_by_external_data_source_id: string | null;
  latest_snapshot_id: string | null;
  metadata: Record<string, unknown>;
  /** Hydrated compatibility fields for the existing NRHA review UI. */
  verification_source: string | null;
  verification_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type HorseDocumentCategory = "health" | "registration" | "other";
export type HorseDocumentType =
  | "coggins_eia"
  | "influenza_vaccine"
  | "rhino_vaccine"
  | "combo_vaccine"
  | "breed_registration"
  | "breed_pedigree"
  | "ownership_certificate"
  | "other";

export type HorseDocument = {
  id: string;
  horse_id: string;
  document_category: HorseDocumentCategory;
  document_type: HorseDocumentType;
  status: "pending_review" | "verified" | "approved" | "rejected" | "expired";
  verification_source: "manual" | "gvl_qr" | "gvl_url" | "gvl_api" | "upload";
  source_url: string | null;
  document_url: string | null;
  certificate_number: string | null;
  issuer_name: string | null;
  test_or_administered_on: string | null;
  expires_on: string | null;
  result: string | null;
  horse_name: string | null;
  horse_date_of_birth: string | null;
  horse_external_id: string | null;
  external_credential_issuer_id: string | null;
  registration_number: string | null;
  breed_name: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  content_sha256: string | null;
  metadata: Record<string, unknown>;
  uploaded_by_organization_id: string | null;
  warnings: string[];
  payload: Record<string, unknown>;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Compatibility name used by the existing health UI while horse_documents becomes canonical. */
export type HorseHealthDocument = HorseDocument;

export type HorseDocumentValidationStatus = "identified" | "verified" | "mismatch" | "rejected" | "superseded" | "invalidated";
export type HorseDocumentValidationSource = "manual" | "ocr" | "qr" | "external_api" | "import";

export type HorseDocumentValidation = {
  id: string;
  horse_document_id: string;
  horse_id: string;
  version: number;
  status: HorseDocumentValidationStatus;
  source: HorseDocumentValidationSource;
  comparison_profile: "health_document_horse" | "external_horse";
  extracted_horse_name: string | null;
  extracted_date_of_birth: string | null;
  extracted_birth_year: number | null;
  extracted_age_years: number | null;
  extracted_age_reference_date: string | null;
  extracted_gender: string | null;
  extracted_breed: string | null;
  extracted_color: string | null;
  extracted_identifier: string | null;
  extracted_owner_name: string | null;
  horse_identity_snapshot: Record<string, unknown>;
  comparison_result: Record<string, unknown>;
  evidence: Record<string, unknown>[];
  source_payload: Record<string, unknown>;
  warnings: string[];
  verdict: "match" | "possible_match" | "mismatch" | "insufficient_data";
  score: number;
  confidence: "certain" | "probable" | "weak";
  created_by_user_id: string;
  created_at: string;
  superseded_by_validation_id: string | null;
  superseded_at: string | null;
  invalidated_by_correction_id: string | null;
  invalidated_at: string | null;
  invalidated_fields: string[] | null;
};

export type HorseIdentityCorrection = {
  id: string;
  horse_id: string;
  reason: string;
  changed_fields: string[];
  before_identity: Record<string, unknown>;
  after_identity: Record<string, unknown>;
  status: "pending" | "applied";
  created_by_user_id: string;
  created_at: string;
  applied_at: string | null;
};

export type HorseIdentityLockField =
  | "name"
  | "date_of_birth"
  | "birth_year"
  | "gender"
  | "breed"
  | "registration_number"
  | "registration_status"
  | "external_identifier";

export type HorseIdentityLock = {
  lock_field: HorseIdentityLockField;
  validation_id: string;
  horse_document_id: string;
  document_type: HorseDocumentType;
  external_credential_issuer_id: string | null;
  validation_version: number;
};

export type Horse = {
  id: string;
  name: string;
  breed: string | null;
  color: string | null;
  gender: "M" | "F" | "G" | null;
  date_of_birth: string | null;
  birth_year: number | null;
  registration_number: string | null;
  registration_status: "registered" | "grade" | "unknown";
  sire_name: string | null;
  dam_name: string | null;
  primary_owner_contact_id: string;
  created_at: string;
};

export type HorseContact = {
  id: string;
  horse_id: string;
  contact_id: string;
  role: "owner" | "co-owner" | "agent" | "rider" | "manager";
  can_create_entries: boolean;
  can_modify_entries: boolean;
  can_book_stalls: boolean;
  can_pay_invoices: boolean;
  created_at: string;
};

export type OrganizationBackNumberAssignmentMode = "horse" | "rider" | "horse_rider_team";
export type BackNumberPolicy = OrganizationBackNumberAssignmentMode | "entry" | "custom";
export type BackNumberAssignmentMode = OrganizationBackNumberAssignmentMode;
export type BackNumberStatus = "available" | "assigned" | "reserved" | "lost" | "retired";

export type OrganizationBackNumber = {
  id: string;
  organization_id: string;
  number: number;
  status: BackNumberStatus;
  assignment_mode: BackNumberAssignmentMode;
  assigned_horse_id: string | null;
  assigned_rider_contact_id: string | null;
  assigned_at: string | null;
  created_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SanctioningBody = {
  id: string;
  code: string;
  name: string;
  default_back_number_policy: BackNumberPolicy;
  description: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoverningBodyAssignment = {
  governing_body_id: string;
  code: string;
  name: string;
  reporting_class_code: string | null;
  eligibility_profile_code: string | null;
  sanction_metadata: Record<string, unknown>;
};

export type GoverningBodyAssignmentInput = {
  governing_body_id: string;
  reporting_class_code?: string | null;
  eligibility_profile_code?: string | null;
  sanction_metadata?: Record<string, unknown>;
};

export type Discipline = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type OrganizationDiscipline = {
  id: string;
  organization_id: string;
  discipline_id: string;
  is_default: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DisciplineGoverningBody = {
  discipline_id: string;
  governing_body_id: string;
  is_default: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DisciplineCredentialIssuer = {
  discipline_id: string;
  external_credential_issuer_id: string;
  is_default: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationDisciplineGoverningBody = {
  organization_discipline_id: string;
  governing_body_id: string;
  is_default: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EligibilityRequirementScope = "organization_discipline" | "block" | "class" | "block_template" | "class_template";
export type EligibilityRequirementType = "host_membership" | "external_contact_credential" | "horse_registration" | "rider_insurance" | "program_nomination";

export type IncentiveProgramType =
  | "horse_foal_nomination"
  | "stallion_nomination"
  | "stallion_subscription_foal_nomination"
  | "stallion_incentive"
  | "performance_incentive";

export type IncentiveProgram = {
  id: string;
  organization_id: string;
  code: string;
  name_fr: string;
  name_en: string | null;
  description_fr: string | null;
  description_en: string | null;
  program_type: IncentiveProgramType;
  valid_from: string | null;
  valid_until: string | null;
  nomination_deadline: string | null;
  nomination_fee: number;
  tax_applicable: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IncentiveProgramInput = Pick<IncentiveProgram,
  | "organization_id"
  | "code"
  | "name_fr"
  | "program_type"
> & Partial<Pick<IncentiveProgram,
  | "name_en"
  | "description_fr"
  | "description_en"
  | "valid_from"
  | "valid_until"
  | "nomination_deadline"
  | "nomination_fee"
  | "tax_applicable"
  | "is_active"
  | "settings"
  | "created_by_user_id"
>>;

export type IncentiveProgramNomination = {
  id: string;
  organization_id: string;
  incentive_program_id: string;
  horse_id: string;
  nomination_role: "horse" | "foal" | "stallion";
  season_year: number;
  status: "pending" | "active" | "expired" | "rejected" | "withdrawn";
  source: "manual" | "import" | "stallion_progeny" | "performance";
  nominated_on: string;
  valid_from: string | null;
  valid_until: string | null;
  qualifying_stallion_nomination_id: string | null;
  manual_sale_id: string | null;
  reference_number: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IncentiveProgramNominationInput = Pick<IncentiveProgramNomination,
  | "organization_id"
  | "incentive_program_id"
  | "horse_id"
  | "nomination_role"
  | "season_year"
> & Partial<Pick<IncentiveProgramNomination,
  | "status"
  | "source"
  | "nominated_on"
  | "valid_from"
  | "valid_until"
  | "qualifying_stallion_nomination_id"
  | "reference_number"
  | "notes"
  | "metadata"
  | "created_by_user_id"
>>;

export type EligibilityRequirement = {
  id: string;
  organization_id: string;
  scope_type: EligibilityRequirementScope;
  organization_discipline_id: string | null;
  block_id: string | null;
  class_id: string | null;
  block_template_id: string | null;
  class_template_id: string | null;
  requirement_type: EligibilityRequirementType;
  subject_type: "rider" | "owner" | "horse";
  external_credential_issuer_id: string | null;
  credential_product_id: string | null;
  incentive_program_id: string | null;
  credential_type: ExternalCredentialProduct["credential_type"] | null;
  requirement_group_code: string | null;
  match_rule: "all" | "at_least_one";
  validity_rule: "present" | "active_on_reference_date";
  enforcement_mode: "warning" | "blocking";
  is_required: boolean;
  is_active: boolean;
  label: string | null;
  settings: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EligibilityRequirementInput = Pick<EligibilityRequirement,
  | "organization_id"
  | "scope_type"
  | "requirement_type"
  | "subject_type"
> & Partial<Pick<EligibilityRequirement,
  | "organization_discipline_id"
  | "block_id"
  | "class_id"
  | "block_template_id"
  | "class_template_id"
  | "external_credential_issuer_id"
  | "credential_product_id"
  | "incentive_program_id"
  | "credential_type"
  | "requirement_group_code"
  | "match_rule"
  | "validity_rule"
  | "enforcement_mode"
  | "is_required"
  | "is_active"
  | "label"
  | "settings"
  | "created_by_user_id"
>>;

export type ContactInsuranceEvidence = {
  id: string;
  contact_id: string;
  external_credential_issuer_id: string | null;
  credential_product_id: string | null;
  policy_number: string | null;
  provider_name: string | null;
  valid_from: string | null;
  expires_on: string;
  coverage_amount: number | null;
  coverage_currency: string | null;
  document_storage_path: string | null;
  status: "pending" | "approved" | "expired" | "rejected" | "superseded";
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EntryEligibilityRequirementAssessment = {
  entry_id: string;
  reference_date: string;
  can_proceed: boolean;
  status: "not_required" | "compliant" | "warning" | "non_compliant";
  groups: Array<{
    code: string;
    passed: boolean;
    blocking: boolean;
    checks: Array<{
      id: string;
      scope_type: EligibilityRequirementScope;
      requirement_type: EligibilityRequirementType;
      subject_type: "rider" | "owner" | "horse";
      label: string | null;
      passed: boolean;
      enforcement_mode: "warning" | "blocking";
    }>;
  }>;
};

export type Slate = {
  id: string;
  organization_id: string;
  show_id: string;
  governing_body_id: string | null;
  name: string;
  technical_number: string | null;
  sort_order: number;
  reporting_rules: Record<string, unknown>;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SlateInput = {
  organization_id: string;
  show_id: string;
  governing_body_id?: string | null;
  name: string;
  technical_number?: string | null;
  sort_order?: number;
  reporting_rules?: Record<string, unknown>;
  notes?: string | null;
  created_by_user_id?: string | null;
};

export type SlateUpdateInput = Partial<Omit<SlateInput, "organization_id" | "show_id">>;

export type BlockJudgeAssignment = {
  id: string;
  organization_id: string;
  show_id: string;
  block_id: string;
  judge_user_profile_id: string | null;
  judge_contact_id: string | null;
  display_name: string;
  assignment_role: "judge" | "chair" | "alternate";
  sort_order: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BlockConcurrencyGroup = {
  id: string;
  organization_id: string;
  show_id: string;
  name: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BlockConcurrencyGroupMember = {
  group_id: string;
  block_id: string;
  sort_order: number;
  created_at: string;
};

export type EligibilityRules = {
  notes?: string;
  [key: string]: unknown;
};

export type PayoutScheduleType = "none" | "nrha_schedule_a" | "nrha_schedule_b" | "house_concentrated" | "house_distributed" | "house_custom" | "jackpot_100";
export type PayoutScheduleFederation = "NRHA" | "AQHA" | "NSBA" | "custom";
export type PayoutCalculationStatus = "draft" | "reviewed" | "published";
export type ScheduleStartMode = "fixed" | "after_previous" | "unscheduled";

export type PayoutSchedule = {
  id: string;
  name: string;
  federation: PayoutScheduleFederation;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type PayoutScheduleBracket = {
  id: string;
  schedule_id: string;
  min_entries: number;
  max_entries: number | null;
  place: number;
  percentage: number;
  created_at: string;
};

export type PayoutResultSnapshotRow = {
  entry_id: string;
  rank: number | null;
  back_number: string | null;
  rider_name: string;
  horse_name: string;
  owner_name: string;
  final_score: number | null;
  status: ScoredRunStatus | "pending";
  payout_amount: number;
  payout_percentage: number;
  payee_contact_id: string | null;
  payee_name: string;
};

export type PayoutCalculation = {
  id: string;
  show_id: string;
  class_id: string;
  status: PayoutCalculationStatus;
  currency: string;
  entry_count: number;
  gross_entry_fees: number;
  trophy_or_plaque_fee: number;
  base_after_trophy_fee: number;
  nrha_fee_amount: number;
  net_entry_fee: number;
  retainage_amount: number;
  final_net_entry_fee: number;
  added_money: number;
  net_purse: number;
  payout_schedule_id: string | null;
  source_snapshot: Record<string, unknown>;
  result_snapshot: PayoutResultSnapshotRow[];
  calculated_at: string;
  reviewed_at: string | null;
  published_at: string | null;
  calculated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayoutAward = {
  id: string;
  calculation_id: string;
  entry_id: string;
  rank: number;
  percentage: number;
  amount: number;
  payee_contact_id: string | null;
  payee_name: string | null;
  payee_override_note: string | null;
  created_at: string;
  updated_at: string;
};

export type BlockTemplate = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  block_label: string | null;
  category: string | null;
  pattern: string | null;
  custom_pattern: Record<string, unknown> | null;
  block_type: Block["block_type"];
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassTemplate = {
  id: string;
  organization_id: string;
  block_template_id: string;
  organization_discipline_id: string;
  name: string;
  code: string | null;
  level: number | null;
  default_entry_fee: number | null;
  default_judge_fee: number | null;
  default_payout_schedule_type: PayoutScheduleType;
  default_added_money: number;
  default_retainage_percent: number | null;
  default_trophy_or_plaque_fee: number;
  default_sanctioning_fee_percent: number | null;
  default_payout_rules: Record<string, unknown>;
  default_payout_notes: string | null;
  back_number_policy_override: BackNumberPolicy | null;
  governing_body_assignments: GoverningBodyAssignment[];
  eligibility_rules: EligibilityRules;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Block = {
  id: string;
  organization_id: string;
  show_id: string;
  show_day_id: string | null;
  block_template_id: string | null;
  slate_id: string | null;
  name: string;
  display_label: string | null;
  block_type: "competition" | "paid_warmup" | "event" | "break" | "ceremony";
  arena: string | null;
  pattern: string | null;
  custom_pattern: Record<string, unknown> | null;
  entries_close_at: string | null;
  draw_prepared_at: string | null;
  judge_display_name: string | null;
  schedule_start_mode: ScheduleStartMode;
  scheduled_time: string | null;
  follows_block_id?: string | null;
  estimated_duration: string | null;
  sort_order: number;
  schedule_status: "open" | "closed" | "running" | "finished";
  schedule_is_public: boolean;
  results_are_public: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ShowDay = {
  id: string;
  organization_id: string;
  show_id: string;
  day_date: string;
  day_name: string | null;
  day_number: number | null;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
};

export type ShowAnnouncement = {
  id: string;
  organization_id: string;
  show_id: string;
  title: string;
  body: string;
  created_by_user_id: string | null;
  created_at: string;
};

export type ShowAnnouncementInput = {
  organization_id: string;
  show_id: string;
  title: string;
  body: string;
  created_by_user_id?: string;
};

export type ShowScoreBlockSetup = {
  block_id: string;
  organization_id: string;
  show_id: string;
  show_day_id: string | null;
  pattern: string | null;
  custom_pattern: Record<string, unknown> | null;
  runs: Array<Record<string, unknown>>;
  schedule_details: Record<string, unknown>;
  judges: Array<Record<string, unknown>>;
  is_draw_imported: boolean;
  started_at: string | null;
  drag_interval: number | null;
  drag_duration_minutes: number;
  locked_at: string | null;
  locked_by_user_id: string | null;
  locked_by_label: string | null;
  finalized: boolean;
  finalized_at: string | null;
  finalized_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ScoredRunStatus = "scored" | "scratch" | "no_score" | "disqualified";

export type ScoredRun = {
  run_id: string;
  show_id: string;
  back_number: string | null;
  rider_id: string | null;
  horse_id: string | null;
  owner_id: string | null;
  scored_at: string;
  status: ScoredRunStatus;
  final_score: number | null;
  created_at: string;
  updated_at: string;
};

export type BlockRunEntry = {
  block_run_id: string;
  run_id: string;
  show_id: string;
  block_id: string;
  order_of_go: number;
  created_at: string;
  updated_at: string;
};

export type BlockRunClassEntry = {
  block_run_id: string;
  entry_id: string;
  created_at: string;
};

export type EntryResult = {
  entry_id: string;
  run_id: string;
  block_run_id: string;
  block_id: string;
  class_id: string;
  show_id: string;
  final_score: number | null;
  status: ScoredRunStatus;
  synced_at: string;
  updated_at: string;
};

export type ShowScorePaidWarmupEntryStatus = "pending" | "done" | "no_show" | "scratch";

export type ShowScorePaidWarmupEntry = {
  id: string;
  order: number;
  rider: string;
  status: ShowScorePaidWarmupEntryStatus;
  completedAt?: string | null;
};

export type ShowScorePaidWarmup = {
  id: string;
  organization_id: string;
  show_id: string;
  show_day_id: string;
  block_id: string;
  name: string;
  arena: string | null;
  duration_minutes_per_rider: number;
  drag_interval: number | null;
  drag_duration_minutes: number;
  schedule_start_mode: ScheduleStartMode | null;
  schedule_start_time: string | null;
  is_public_live: boolean;
  active_entry_id: string | null;
  active_started_at: string | null;
  entries: ShowScorePaidWarmupEntry[];
  sort_order: number;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ClassRecord = {
  id: string;
  organization_id: string;
  show_id: string;
  block_id: string;
  class_template_id: string | null;
  organization_discipline_id: string;
  name: string;
  description: string | null;
  level: number | null;
  code: string | null;
  entry_fee: number | null;
  judge_fee: number | null;
  payout_schedule_type: PayoutScheduleType;
  added_money: number;
  retainage_percent: number | null;
  trophy_or_plaque_fee: number;
  sanctioning_fee_percent: number | null;
  payout_rules: Record<string, unknown>;
  payout_notes: string | null;
  minimum_entries: number;
  registration_status: "draft" | "open" | "closed" | "cancelled";
  is_public: boolean;
  back_number_policy_override: BackNumberPolicy | null;
  sort_order: number;
  eligibility_rules: EligibilityRules;
  notes: string | null;
  created_at: string;
  updated_at: string;
  governing_body_assignments: GoverningBodyAssignment[];
};

export type Entry = {
  id: string;
  organization_id: string;
  show_id: string;
  horse_id: string;
  class_id: string;
  created_by_user_id: string;
  owner_contact_id: string;
  rider_contact_id: string | null;
  payer_contact_id: string;
  status: "draft" | "pending_checkout" | "active" | "scratched_pending_refund" | "scratched" | "completed" | "cancelled";
  entry_number: number | null;
  base_fee: number | null;
  total_fees: number | null;
  is_late: boolean;
  late_fee_percent: number;
  late_fee_amount: number;
  created_at: string;
};

export type StallOption = {
  id: string;
  organization_id: string;
  show_id: string;
  name: string;
  description: string | null;
  price: number;
  total_quantity: number;
  available_quantity: number;
  duration_days: number | null;
  show_day_start_id: string | null;
  show_day_end_id: string | null;
  requires_horse_assignment: boolean;
  limit_per_horse_stalls: number | null;
  category: "stall" | "camping" | "parking" | "extra" | null;
  product_id: string | null;
  notes: string | null;
  created_at: string;
};

export type StallBooking = {
  id: string;
  organization_id: string;
  show_id: string;
  stall_option_id: string;
  horse_id: string | null;
  created_by_user_id: string;
  booker_contact_id: string;
  payer_contact_id: string;
  status: "requested" | "reserved" | "active" | "cancelled" | "completed";
  show_day_start_id: string | null;
  show_day_end_id: string | null;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  affects_inventory?: boolean;
  billable?: boolean;
  notes: string | null;
  created_at: string;
};

export type UserProfileUpdateInput = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  date_of_birth?: string | null;
  preferred_locale?: string;
  marketing_opt_in?: boolean;
};

export type OrganizationInput = {
  name: string;
  slug: string;
  short_name?: string;
  primary_contact_email?: string;
  timezone?: string;
  currency?: string;
  discipline_ids?: string[];
  default_discipline_id?: string;
  requires_host_membership?: boolean;
};

export type OrganizationSettingsInput = {
  name?: string;
  short_name?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  address?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  timezone?: string;
  currency?: string;
  tax_rate?: number;
  tax_name?: string | null;
  tax_number?: string | null;
  secondary_tax_name?: string | null;
  secondary_tax_number?: string | null;
  back_number_policy?: Organization["back_number_policy"];
};

export type ShowInput = {
  organization_id: string;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  venue?: string;
  location?: string;
  status?: Show["status"];
  reservation_payment_policy?: Show["reservation_payment_policy"];
  entry_payment_policy?: Show["entry_payment_policy"];
  entry_preauth_timing?: Show["entry_preauth_timing"];
  entry_preauth_time?: string;
  entry_settlement_timing?: Show["entry_settlement_timing"];
  entry_settlement_due_time?: string;
  entry_auto_capture_enabled?: boolean;
  entry_preauth_amount_strategy?: Show["entry_preauth_amount_strategy"];
  entry_preauth_margin_percent?: number;
};

export type ShowUpdateInput = {
  name?: string;
  slug?: string;
  start_date?: string;
  end_date?: string;
  venue?: string | null;
  location?: string | null;
  status?: Show["status"];
  reservation_payment_policy?: Show["reservation_payment_policy"];
  entry_payment_policy?: Show["entry_payment_policy"];
  entry_preauth_timing?: Show["entry_preauth_timing"];
  entry_preauth_time?: string;
  entry_settlement_timing?: Show["entry_settlement_timing"];
  entry_settlement_due_time?: string;
  entry_auto_capture_enabled?: boolean;
  entry_preauth_amount_strategy?: Show["entry_preauth_amount_strategy"];
  entry_preauth_margin_percent?: number;
};

export type ContactInput = {
  organization_id: string;
  type: Contact["type"];
  roles?: ContactRoleName[];
  first_name: string;
  middle_name?: string;
  last_name: string;
  email?: string;
  phone?: string;
  barn_name?: string;
  linked_user_id?: string;
  created_by_user_id?: string;
  address?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  date_of_birth?: string;
  external_memberships?: ExternalContactIdentifierInput[];
};

export type ContactUpdateInput = {
  type?: Contact["type"];
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  barn_name?: string | null;
  address?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  date_of_birth?: string | null;
  external_memberships?: ExternalContactIdentifierInput[];
};

export type ExternalContactIdentifierInput = {
  external_credential_issuer_id: string;
  credential_product_id?: string | null;
  identifier_type?: ContactExternalIdentifier["identifier_type"];
  identifier_value: string;
  status?: ContactExternalIdentifier["status"];
  valid_from?: string | null;
  expires_on?: string | null;
  verified_at?: string | null;
  verification_payload?: Record<string, unknown>;
  verification_source?: string | null;
};

export type OrganizationMembershipTypeInput = {
  organization_id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  season_year: number;
  price: number;
  tax_applicable?: boolean;
  valid_from: string;
  valid_until: string;
  is_active?: boolean;
};

export type OrganizationMembershipTypeUpdateInput = Partial<
  Omit<OrganizationMembershipTypeInput, "organization_id">
>;

export type ContactOrganizationMembershipInput = {
  organization_id: string;
  contact_id: string;
  membership_type_id: string;
  show_id?: string | null;
  payer_contact_id?: string | null;
  membership_number?: string | null;
  status?: ContactOrganizationMembership["status"];
  notes?: string | null;
  sold_by_user_id: string;
};

export type OrganizationProductInput = {
  organization_id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  category: ProductCategory;
  default_price: number;
  tax_applicable?: boolean;
  is_active?: boolean;
};

export type OrganizationProductUpdateInput = Partial<
  Omit<OrganizationProductInput, "organization_id">
>;

export type ManualSaleInput = {
  organization_id: string;
  product_id?: string | null;
  show_id?: string | null;
  payer_contact_id: string;
  sold_by_user_id: string;
  status?: ManualSale["status"];
  description: string;
  quantity: number;
  unit_price: number;
  tax_applicable?: boolean;
  source_payload?: Record<string, unknown>;
};

export type ExternalHorseIdentifierInput = {
  external_credential_issuer_id: string;
  identifier_type?: HorseExternalIdentifier["identifier_type"];
  identifier_value: string;
  status?: HorseExternalIdentifier["status"];
  valid_from?: string | null;
  expires_on?: string | null;
  verified_at?: string | null;
  verification_payload?: Record<string, unknown>;
  verification_source?: string | null;
};

export type HorseInput = {
  organization_id: string;
  name: string;
  primary_owner_contact_id: string;
  agent_contact_id?: string | null;
  breed?: string;
  color?: string;
  gender?: Horse["gender"];
  date_of_birth?: string | null;
  birth_year?: number;
  registration_number?: string;
  registration_status?: Horse["registration_status"];
  sire_name?: string;
  dam_name?: string;
  created_by_user_id?: string;
  external_memberships?: ExternalHorseIdentifierInput[];
};

export type HorseUpdateInput = {
  name?: string;
  primary_owner_contact_id?: string;
  agent_contact_id?: string | null;
  breed?: string | null;
  color?: string | null;
  gender?: Horse["gender"];
  date_of_birth?: string | null;
  birth_year?: number | null;
  registration_number?: string | null;
  registration_status?: Horse["registration_status"];
  sire_name?: string | null;
  dam_name?: string | null;
  external_memberships?: ExternalHorseIdentifierInput[];
  identity_correction_reason?: string;
};

export type BlockInput = {
  organization_id: string;
  show_id: string;
  name: string;
  block_template_id?: string | null;
  slate_id?: string | null;
  show_day_id?: string;
  display_label?: string;
  block_type?: Block["block_type"];
  arena?: string;
  pattern?: string;
  custom_pattern?: Record<string, unknown> | null;
  entries_close_at?: string | null;
  draw_prepared_at?: string | null;
  judge_display_name?: string;
  schedule_start_mode?: ScheduleStartMode;
  scheduled_time?: string | null;
  follows_block_id?: string | null;
  sort_order?: number;
  schedule_status?: Block["schedule_status"];
  schedule_is_public?: boolean;
  results_are_public?: boolean;
  notes?: string | null;
  /** Association applicative; persistée dans block_concurrency_group_members. */
  concurrent_block_id?: string | null;
};

export type BlockUpdateInput = {
  name?: string;
  block_template_id?: string | null;
  slate_id?: string | null;
  show_day_id?: string | null;
  display_label?: string | null;
  block_type?: Block["block_type"];
  arena?: string | null;
  pattern?: string | null;
  custom_pattern?: Record<string, unknown> | null;
  entries_close_at?: string | null;
  draw_prepared_at?: string | null;
  judge_display_name?: string | null;
  schedule_start_mode?: ScheduleStartMode;
  scheduled_time?: string | null;
  follows_block_id?: string | null;
  sort_order?: number;
  schedule_status?: Block["schedule_status"];
  schedule_is_public?: boolean;
  results_are_public?: boolean;
  notes?: string | null;
  /** Association applicative; persistée dans block_concurrency_group_members. */
  concurrent_block_id?: string | null;
};

export type ClassInput = {
  organization_id: string;
  show_id: string;
  block_id: string;
  organization_discipline_id?: string;
  name: string;
  class_template_id?: string | null;
  description?: string | null;
  code?: string;
  level?: number;
  entry_fee?: number;
  judge_fee?: number;
  payout_schedule_type?: PayoutScheduleType;
  added_money?: number;
  retainage_percent?: number | null;
  trophy_or_plaque_fee?: number;
  sanctioning_fee_percent?: number | null;
  payout_rules?: Record<string, unknown>;
  payout_notes?: string | null;
  minimum_entries?: number;
  registration_status?: ClassRecord["registration_status"];
  is_public?: boolean;
  back_number_policy_override?: BackNumberPolicy | null;
  sort_order?: number;
  eligibility_rules?: EligibilityRules;
  notes?: string | null;
  governing_body_assignments?: GoverningBodyAssignmentInput[];
};

export type ClassUpdateInput = {
  block_id?: string;
  show_id?: string;
  organization_discipline_id?: string;
  name?: string;
  class_template_id?: string | null;
  description?: string | null;
  code?: string | null;
  level?: number | null;
  entry_fee?: number | null;
  judge_fee?: number | null;
  payout_schedule_type?: PayoutScheduleType;
  added_money?: number | null;
  retainage_percent?: number | null;
  trophy_or_plaque_fee?: number | null;
  sanctioning_fee_percent?: number | null;
  payout_rules?: Record<string, unknown>;
  payout_notes?: string | null;
  minimum_entries?: number;
  registration_status?: ClassRecord["registration_status"];
  is_public?: boolean;
  back_number_policy_override?: BackNumberPolicy | null;
  sort_order?: number;
  eligibility_rules?: EligibilityRules;
  notes?: string | null;
  governing_body_assignments?: GoverningBodyAssignmentInput[];
};

export type BlockTemplateInput = {
  organization_id: string;
  name: string;
  code?: string;
  block_label?: string;
  category?: string;
  pattern?: string;
  custom_pattern?: Record<string, unknown> | null;
  block_type?: Block["block_type"];
  sort_order?: number;
  is_active?: boolean;
  notes?: string;
};

export type BlockTemplateUpdateInput = {
  name?: string;
  code?: string | null;
  block_label?: string | null;
  category?: string | null;
  pattern?: string | null;
  custom_pattern?: Record<string, unknown> | null;
  block_type?: Block["block_type"];
  sort_order?: number;
  is_active?: boolean;
  notes?: string | null;
};

export type ClassTemplateInput = {
  organization_id: string;
  block_template_id: string;
  organization_discipline_id?: string;
  name: string;
  code?: string;
  level?: number;
  default_entry_fee?: number;
  default_judge_fee?: number;
  default_payout_schedule_type?: PayoutScheduleType;
  default_added_money?: number;
  default_retainage_percent?: number | null;
  default_trophy_or_plaque_fee?: number;
  default_sanctioning_fee_percent?: number | null;
  default_payout_rules?: Record<string, unknown>;
  default_payout_notes?: string | null;
  back_number_policy_override?: BackNumberPolicy | null;
  eligibility_rules?: EligibilityRules;
  sort_order?: number;
  notes?: string;
  governing_body_assignments?: GoverningBodyAssignmentInput[];
};

export type ClassTemplateUpdateInput = {
  block_template_id?: string;
  organization_discipline_id?: string;
  name?: string;
  code?: string | null;
  level?: number | null;
  default_entry_fee?: number | null;
  default_judge_fee?: number | null;
  default_payout_schedule_type?: PayoutScheduleType;
  default_added_money?: number | null;
  default_retainage_percent?: number | null;
  default_trophy_or_plaque_fee?: number | null;
  default_sanctioning_fee_percent?: number | null;
  default_payout_rules?: Record<string, unknown>;
  default_payout_notes?: string | null;
  back_number_policy_override?: BackNumberPolicy | null;
  eligibility_rules?: EligibilityRules;
  sort_order?: number;
  notes?: string | null;
  governing_body_assignments?: GoverningBodyAssignmentInput[];
};

export type EntryInput = {
  organization_id: string;
  show_id: string;
  horse_id: string;
  class_id: string;
  created_by_user_id: string;
  owner_contact_id: string;
  rider_contact_id?: string;
  payer_contact_id: string;
  entry_number?: number | null;
  base_fee?: number;
  is_late?: boolean;
  late_fee_percent?: number;
  late_fee_amount?: number;
};

export type EntryUpdateInput = {
  horse_id?: string;
  class_id?: string;
  owner_contact_id?: string;
  rider_contact_id?: string | null;
  payer_contact_id?: string;
  entry_number?: number | null;
  status?: Entry["status"];
  base_fee?: number | null;
  total_fees?: number | null;
  is_late?: boolean;
  late_fee_percent?: number;
  late_fee_amount?: number;
};

export type ShowScorePaidWarmupInput = {
  id?: string;
  organization_id: string;
  show_id: string;
  show_day_id: string;
  name: string;
  arena?: string | null;
  duration_minutes_per_rider?: number;
  drag_interval?: number | null;
  drag_duration_minutes?: number;
  schedule_start_mode?: ScheduleStartMode | null;
  schedule_start_time?: string | null;
  follows_block_id?: string | null;
  is_public_live?: boolean;
  active_entry_id?: string | null;
  active_started_at?: string | null;
  entries?: ShowScorePaidWarmupEntry[];
  sort_order?: number;
  legacy_payload?: Record<string, unknown> | null;
};

export type ShowScorePaidWarmupUpdateInput = Partial<Omit<ShowScorePaidWarmupInput, "id" | "organization_id" | "show_id" | "show_day_id">> & {
  show_day_id?: string;
};

export type StallOptionInput = {
  organization_id: string;
  show_id: string;
  name: string;
  description?: string;
  price: number;
  total_quantity: number;
  available_quantity?: number;
  duration_days?: number;
  show_day_start_id?: string | null;
  show_day_end_id?: string | null;
  requires_horse_assignment?: boolean;
  limit_per_horse_stalls?: number | null;
  category?: StallOption["category"];
  product_id?: string | null;
  notes?: string;
};

export type StallOptionUpdateInput = {
  name?: string;
  description?: string | null;
  price?: number;
  total_quantity?: number;
  available_quantity?: number;
  duration_days?: number | null;
  show_day_start_id?: string | null;
  show_day_end_id?: string | null;
  requires_horse_assignment?: boolean;
  limit_per_horse_stalls?: number | null;
  category?: StallOption["category"];
  product_id?: string | null;
  notes?: string | null;
};

export type StallBookingInput = {
  organization_id: string;
  show_id: string;
  stall_option_id: string;
  horse_id?: string;
  created_by_user_id: string;
  booker_contact_id: string;
  payer_contact_id: string;
  status?: StallBooking["status"];
  show_day_start_id?: string | null;
  show_day_end_id?: string | null;
  quantity: number;
  unit_price?: number;
  total_price?: number;
  affects_inventory?: boolean;
  billable?: boolean;
  notes?: string;
};

export type StallBookingUpdateInput = {
  stall_option_id?: string;
  horse_id?: string | null;
  booker_contact_id?: string;
  payer_contact_id?: string;
  status?: StallBooking["status"];
  show_day_start_id?: string | null;
  show_day_end_id?: string | null;
  quantity?: number;
  unit_price?: number | null;
  total_price?: number | null;
  affects_inventory?: boolean;
  billable?: boolean;
  notes?: string | null;
};
