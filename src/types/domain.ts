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

export type ClassRecord = {
  id: string;
  organization_id: string;
  show_id: string;
  show_day_id: string | null;
  name: string;
  code: string | null;
  arena: string | null;
  pattern: string | null;
  custom_pattern: Record<string, unknown> | null;
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
  name: string;
  level: number | null;
  entry_fee: number | null;
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
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  barn_name?: string;
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
  breed?: string;
  color?: string;
  gender?: Horse["gender"];
  birth_year?: number;
  registration_number?: string;
};

export type HorseUpdateInput = {
  name?: string;
  primary_owner_contact_id?: string;
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
  show_day_id?: string;
  code?: string;
  arena?: string;
  pattern?: string;
  custom_pattern?: Record<string, unknown> | null;
  judge_name?: string;
  sort_order?: number;
  entry_fee?: number;
};

export type ClassUpdateInput = {
  name?: string;
  code?: string | null;
  show_day_id?: string | null;
  arena?: string | null;
  pattern?: string | null;
  custom_pattern?: Record<string, unknown> | null;
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
  level?: number;
  entry_fee?: number;
};

export type DivisionUpdateInput = {
  class_id?: string;
  show_id?: string;
  name?: string;
  level?: number | null;
  entry_fee?: number | null;
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
