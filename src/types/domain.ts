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
  health_verification_required: boolean;
  coggins_validity_months: 6 | 12;
  subscription_plan: PlanTier;
  subscription_status: string;
  subscription_expires_at: string | null;
  subscription_notes: string | null;
  modules_enabled: OrganizationModules;
  created_by_user_id: string | null;
  created_at: string;
};

export type PlanTier = 'community' | 'professional' | 'premium';

export type OrganizationModules = {
  show_score: boolean;
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
  show_id: string;
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

export type Contact = {
  id: string;
  organization_id: string;
  type: "owner" | "agent" | "rider" | "payer" | "other";
  first_name: string;
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

export type ExternalOrganization = {
  id: string;
  code: string;
  name: string;
  verification_provider: string | null;
  verification_url: string | null;
  verification_enabled: boolean;
  created_at: string;
};

export type OrganizationExternalMembershipRequirement = {
  id: string;
  organization_id: string;
  external_organization_id: string;
  contact_type: Contact["type"];
  is_required: boolean;
  created_at: string;
};

export type ContactExternalMembership = {
  id: string;
  contact_id: string;
  external_organization_id: string;
  membership_number: string;
  status: "active" | "pending" | "expired" | "unknown";
  expires_on: string | null;
  verified_at: string | null;
  verification_source: string | null;
  verification_payload: Record<string, unknown>;
  created_at: string;
};

export type HorseExternalMembership = {
  id: string;
  horse_id: string;
  external_organization_id: string;
  reference_type: "competition_license" | "registration" | "membership" | "other";
  reference_number: string;
  status: "active" | "pending" | "expired" | "unknown";
  expires_on: string | null;
  verified_at: string | null;
  verification_source: string | null;
  verification_payload: Record<string, unknown>;
  created_at: string;
};

export type HorseHealthDocument = {
  id: string;
  organization_id: string;
  horse_id: string;
  document_type: "coggins_eia" | "influenza_vaccine" | "rhino_vaccine" | "combo_vaccine" | "other";
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
  warnings: string[];
  payload: Record<string, unknown>;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

export type Horse = {
  id: string;
  organization_id: string;
  name: string;
  breed: string | null;
  color: string | null;
  gender: "M" | "F" | "G" | null;
  date_of_birth: string | null;
  birth_year: number | null;
  registration_number: string | null;
  primary_owner_contact_id: string;
  created_at: string;
};

export type HorseContact = {
  id: string;
  organization_id: string;
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
  code: string;
  name: string;
  back_number_policy: BackNumberPolicy;
  rule_notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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
  division_id: string;
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

export type ClassTemplate = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  block_label: string | null;
  category: string | null;
  default_pattern: string | null;
  default_entry_fee: number | null;
  sanctioning_body_codes: string[];
  back_number_policy: BackNumberPolicy;
  eligibility_rules: EligibilityRules;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassTemplateDivision = {
  id: string;
  organization_id: string;
  class_template_id: string;
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
  sanctioning_body_codes: string[];
  eligibility_rules: EligibilityRules;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassRecord = {
  id: string;
  organization_id: string;
  show_id: string;
  show_day_id: string | null;
  class_template_id: string | null;
  name: string;
  code: string | null;
  block_label: string | null;
  arena: string | null;
  pattern: string | null;
  custom_pattern: Record<string, unknown> | null;
  sanctioning_body_codes: string[];
  back_number_policy: BackNumberPolicy;
  nrha_slate_number: string | null;
  entries_close_at: string | null;
  late_entries_allowed: boolean;
  late_entry_fee_percent: number;
  draw_prepared_at: string | null;
  eligibility_rules: EligibilityRules;
  judge_name: string | null;
  schedule_start_mode: ScheduleStartMode;
  scheduled_time: string | null;
  sort_order: number;
  entry_fee: number | null;
  status: "open" | "closed" | "running" | "finished";
  is_public: boolean;
  is_event_block: boolean;
  created_at: string;
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

export type ShowScoreClassSetup = {
  class_id: string;
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
  division_id: string;
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

export type Division = {
  id: string;
  organization_id: string;
  show_id: string;
  class_id: string;
  class_template_division_id: string | null;
  name: string;
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
  sanctioning_body_codes: string[];
  eligibility_rules: EligibilityRules;
  created_at: string;
};

export type Entry = {
  id: string;
  organization_id: string;
  show_id: string;
  horse_id: string;
  division_id: string;
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
  health_verification_required?: boolean;
  coggins_validity_months?: 6 | 12;
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
  external_memberships?: ExternalMembershipInput[];
};

export type ContactUpdateInput = {
  type?: Contact["type"];
  first_name?: string;
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
  external_memberships?: ExternalMembershipInput[];
};

export type ExternalMembershipInput = {
  external_organization_id: string;
  membership_number: string;
  status?: ContactExternalMembership["status"];
  expires_on?: string | null;
};

export type ExternalHorseMembershipInput = {
  external_organization_id: string;
  reference_type?: HorseExternalMembership["reference_type"];
  reference_number: string;
  status?: HorseExternalMembership["status"];
  expires_on?: string | null;
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
  created_by_user_id?: string;
  external_memberships?: ExternalHorseMembershipInput[];
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
  external_memberships?: ExternalHorseMembershipInput[];
};

export type ClassInput = {
  organization_id: string;
  show_id: string;
  name: string;
  class_template_id?: string | null;
  show_day_id?: string;
  code?: string;
  block_label?: string;
  arena?: string;
  pattern?: string;
  custom_pattern?: Record<string, unknown> | null;
  sanctioning_body_codes?: string[];
  back_number_policy?: BackNumberPolicy;
  nrha_slate_number?: string | null;
  entries_close_at?: string | null;
  late_entries_allowed?: boolean;
  late_entry_fee_percent?: number;
  draw_prepared_at?: string | null;
  eligibility_rules?: EligibilityRules;
  judge_name?: string;
  schedule_start_mode?: ScheduleStartMode;
  scheduled_time?: string | null;
  sort_order?: number;
  entry_fee?: number;
  is_event_block?: boolean;
};

export type ClassUpdateInput = {
  name?: string;
  code?: string | null;
  class_template_id?: string | null;
  show_day_id?: string | null;
  block_label?: string | null;
  arena?: string | null;
  pattern?: string | null;
  custom_pattern?: Record<string, unknown> | null;
  sanctioning_body_codes?: string[];
  back_number_policy?: BackNumberPolicy;
  nrha_slate_number?: string | null;
  entries_close_at?: string | null;
  late_entries_allowed?: boolean;
  late_entry_fee_percent?: number;
  draw_prepared_at?: string | null;
  eligibility_rules?: EligibilityRules;
  judge_name?: string | null;
  schedule_start_mode?: ScheduleStartMode;
  scheduled_time?: string | null;
  sort_order?: number;
  entry_fee?: number | null;
  status?: ClassRecord["status"];
  is_event_block?: boolean;
};

export type DivisionInput = {
  organization_id: string;
  show_id: string;
  class_id: string;
  name: string;
  class_template_division_id?: string | null;
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
  sanctioning_body_codes?: string[];
  eligibility_rules?: EligibilityRules;
};

export type DivisionUpdateInput = {
  class_id?: string;
  show_id?: string;
  name?: string;
  class_template_division_id?: string | null;
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
  sanctioning_body_codes?: string[];
  eligibility_rules?: EligibilityRules;
};

export type ClassTemplateInput = {
  organization_id: string;
  name: string;
  code?: string;
  block_label?: string;
  category?: string;
  default_pattern?: string;
  default_entry_fee?: number;
  sanctioning_body_codes?: string[];
  back_number_policy?: BackNumberPolicy;
  eligibility_rules?: EligibilityRules;
  sort_order?: number;
  is_active?: boolean;
  notes?: string;
};

export type ClassTemplateUpdateInput = {
  name?: string;
  code?: string | null;
  block_label?: string | null;
  category?: string | null;
  default_pattern?: string | null;
  default_entry_fee?: number | null;
  sanctioning_body_codes?: string[];
  back_number_policy?: BackNumberPolicy;
  eligibility_rules?: EligibilityRules;
  sort_order?: number;
  is_active?: boolean;
  notes?: string | null;
};

export type ClassTemplateDivisionInput = {
  organization_id: string;
  class_template_id: string;
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
  sanctioning_body_codes?: string[];
  eligibility_rules?: EligibilityRules;
  sort_order?: number;
  notes?: string;
};

export type ClassTemplateDivisionUpdateInput = {
  class_template_id?: string;
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
  sanctioning_body_codes?: string[];
  eligibility_rules?: EligibilityRules;
  sort_order?: number;
  notes?: string | null;
};

export type EntryInput = {
  organization_id: string;
  show_id: string;
  horse_id: string;
  division_id: string;
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
  division_id?: string;
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
