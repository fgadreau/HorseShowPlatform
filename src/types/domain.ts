export type Organization = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  description: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  logo_url: string | null;
  website_url: string | null;
  timezone: string;
  currency: string;
  tax_rate: number;
  subscription_plan: string;
  subscription_status: string;
  created_by_user_id: string | null;
  created_at: string;
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
  item_type: "entry" | "stall" | "extra" | "membership" | "fee" | "discount" | "tax" | "manual";
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

export type Horse = {
  id: string;
  organization_id: string;
  name: string;
  breed: string | null;
  color: string | null;
  gender: "M" | "F" | "G" | null;
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

export type BackNumberPolicy = "horse" | "horse_rider_team" | "entry" | "custom";

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
  eligibility_rules: EligibilityRules;
  judge_name: string | null;
  sort_order: number;
  entry_fee: number | null;
  status: "open" | "closed" | "running" | "finished";
  is_public: boolean;
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

export type OrganizationInput = {
  name: string;
  slug: string;
  short_name?: string;
  primary_contact_email?: string;
  timezone?: string;
  currency?: string;
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
};

export type ShowUpdateInput = {
  name?: string;
  slug?: string;
  start_date?: string;
  end_date?: string;
  venue?: string | null;
  location?: string | null;
  status?: Show["status"];
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
};

export type ContactUpdateInput = {
  type?: Contact["type"];
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  barn_name?: string | null;
};

export type HorseInput = {
  organization_id: string;
  name: string;
  primary_owner_contact_id: string;
  agent_contact_id?: string | null;
  breed?: string;
  color?: string;
  gender?: Horse["gender"];
  birth_year?: number;
  registration_number?: string;
  created_by_user_id?: string;
};

export type HorseUpdateInput = {
  name?: string;
  primary_owner_contact_id?: string;
  agent_contact_id?: string | null;
  breed?: string | null;
  color?: string | null;
  gender?: Horse["gender"];
  birth_year?: number | null;
  registration_number?: string | null;
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
  eligibility_rules?: EligibilityRules;
  judge_name?: string;
  sort_order?: number;
  entry_fee?: number;
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
  eligibility_rules?: EligibilityRules;
  judge_name?: string | null;
  sort_order?: number;
  entry_fee?: number | null;
  status?: ClassRecord["status"];
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
  base_fee?: number;
};

export type EntryUpdateInput = {
  horse_id?: string;
  division_id?: string;
  owner_contact_id?: string;
  rider_contact_id?: string | null;
  payer_contact_id?: string;
  status?: Entry["status"];
  base_fee?: number | null;
  total_fees?: number | null;
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
