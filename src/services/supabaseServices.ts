import type { User } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";
import type {
  ClassInput,
  ClassRecord,
  ClassUpdateInput,
  Contact,
  ContactInput,
  ContactUpdateInput,
  Division,
  DivisionInput,
  DivisionUpdateInput,
  Entry,
  EntryInput,
  EntryUpdateInput,
  Horse,
  HorseInput,
  HorseUpdateInput,
  Invoice,
  Organization,
  OrganizationInput,
  OrganizationMember,
  Show,
  ShowDay,
  ShowScoreClassSetup,
  ShowInput,
  ShowUpdateInput,
  UserProfile,
} from "../types/domain";
import { buildShowScoreRunsForClass } from "./showScoreAdapters";

export type AppContext = {
  profile: UserProfile;
  organizations: Organization[];
  organizationMembers: OrganizationMember[];
  shows: Show[];
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  contacts: Contact[];
  horses: Horse[];
  classes: ClassRecord[];
  divisions: Division[];
  entries: Entry[];
  invoices: Invoice[];
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
  const { data: existing, error: selectError } = await client
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<UserProfile>();

  if (selectError) {
    throw selectError;
  }

  if (existing) {
    return existing;
  }

  const emailName = user.email?.split("@")[0] ?? "user";
  const [firstName, ...rest] = emailName.split(/[._-]/).filter(Boolean);
  const { data: created, error: insertError } = await client
    .from("user_profiles")
    .insert({
      user_id: user.id,
      first_name: titleCase(firstName),
      last_name: titleCase(rest.join(" ")),
      type_user: "admin",
    })
    .select("*")
    .single<UserProfile>();

  if (insertError) {
    throw insertError;
  }

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
    horsesResult,
    classesResult,
    divisionsResult,
    entriesResult,
    invoicesResult,
  ] =
    await Promise.all([
    client.from("organizations").select("*").order("created_at", { ascending: false }).returns<Organization[]>(),
    client.from("organization_members").select("*").order("created_at", { ascending: false }).returns<OrganizationMember[]>(),
    client.from("shows").select("*").order("start_date", { ascending: true }).returns<Show[]>(),
    client.from("show_days").select("*").order("day_date", { ascending: true }).returns<ShowDay[]>(),
    client.from("contacts").select("*").order("created_at", { ascending: false }).returns<Contact[]>(),
    client.from("horses").select("*").order("created_at", { ascending: false }).returns<Horse[]>(),
    client.from("classes").select("*").order("created_at", { ascending: false }).returns<ClassRecord[]>(),
    client.from("divisions").select("*").order("created_at", { ascending: false }).returns<Division[]>(),
    client.from("entries").select("*").order("created_at", { ascending: false }).returns<Entry[]>(),
    client.from("invoices").select("*").order("created_at", { ascending: false }).limit(20).returns<Invoice[]>(),
  ]);
  const showScoreClassSetups = await loadShowScoreClassSetups();

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

  if (horsesResult.error) {
    throw horsesResult.error;
  }

  if (classesResult.error) {
    throw classesResult.error;
  }

  if (divisionsResult.error) {
    throw divisionsResult.error;
  }

  if (entriesResult.error) {
    throw entriesResult.error;
  }

  if (invoicesResult.error) {
    throw invoicesResult.error;
  }

  return {
    profile,
    organizations: organizationsResult.data ?? [],
    organizationMembers: organizationMembersResult.data ?? [],
    shows: showsResult.data ?? [],
    showDays: showDaysResult.data ?? [],
    showScoreClassSetups,
    contacts: contactsResult.data ?? [],
    horses: horsesResult.data ?? [],
    classes: classesResult.data ?? [],
    divisions: divisionsResult.data ?? [],
    entries: entriesResult.data ?? [],
    invoices: invoicesResult.data ?? [],
  };
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
  const { data, error } = await client
    .from("contacts")
    .insert({
      organization_id: input.organization_id,
      type: input.type,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email || null,
      phone: input.phone || null,
      barn_name: input.barn_name || null,
    })
    .select("*")
    .single<Contact>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateContact(id: string, input: ContactUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("contacts")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<Contact>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createHorse(input: HorseInput) {
  const client = requireSupabase();
  const { data: horse, error: horseError } = await client
    .from("horses")
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      primary_owner_contact_id: input.primary_owner_contact_id,
      breed: input.breed || null,
      color: input.color || null,
      gender: input.gender || null,
      birth_year: input.birth_year || null,
      registration_number: input.registration_number || null,
    })
    .select("*")
    .single<Horse>();

  if (horseError) {
    throw horseError;
  }

  const { error: relationError } = await client.from("horse_contacts").insert({
    organization_id: input.organization_id,
    horse_id: horse.id,
    contact_id: input.primary_owner_contact_id,
    role: "owner",
    can_create_entries: true,
    can_modify_entries: true,
    can_book_stalls: true,
    can_pay_invoices: true,
  });

  if (relationError) {
    throw relationError;
  }

  return horse;
}

export async function updateHorse(id: string, input: HorseUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("horses")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<Horse>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createClass(input: ClassInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("classes")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      show_day_id: input.show_day_id || null,
      name: input.name,
      code: input.code || null,
      arena: input.arena || null,
      pattern: input.pattern || null,
      custom_pattern: input.custom_pattern ?? null,
      judge_name: input.judge_name || null,
      sort_order: input.sort_order ?? 1,
      entry_fee: input.entry_fee ?? null,
      status: "open",
      is_public: true,
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

export async function createDivision(input: DivisionInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("divisions")
    .insert({
      organization_id: input.organization_id,
      show_id: input.show_id,
      class_id: input.class_id,
      name: input.name,
      level: input.level ?? null,
      entry_fee: input.entry_fee ?? null,
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

export async function createEntry(input: EntryInput) {
  const client = requireSupabase();
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
      base_fee: input.base_fee ?? null,
      total_fees: input.base_fee ?? null,
      status: "draft",
    })
    .select("*")
    .single<Entry>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateEntry(id: string, input: EntryUpdateInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("entries")
    .update(cleanPayload(input))
    .eq("id", id)
    .select("*")
    .single<Entry>();

  if (error) {
    throw error;
  }

  return data;
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

export async function prepareShowScoreClassSetup(input: {
  classRecord: ClassRecord;
  entries: Entry[];
  divisions: Division[];
  horses: Horse[];
  contacts: Contact[];
}) {
  const client = requireSupabase();
  const runs = buildShowScoreRunsForClass(input.classRecord.id, input.entries, {
    contacts: input.contacts,
    divisions: input.divisions,
    horses: input.horses,
  });
  const judges = input.classRecord.judge_name
    ? [{ id: "judge-1", name: input.classRecord.judge_name, order: 1 }]
    : [{ id: "judge-1", name: "", order: 1 }];

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

  return data;
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

function cleanPayload<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function isMissingShowScoreSchemaError(error: { code?: string; message?: string }) {
  const message = String(error.message || "").toLowerCase();
  return error.code === "42P01" || (message.includes("schema cache") && message.includes("show_score_class_setups"));
}
