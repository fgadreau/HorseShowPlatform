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
  ContactInput,
  ContactRole,
  ContactRoleName,
  ContactUpdateInput,
  Division,
  DivisionInput,
  DivisionUpdateInput,
  Entry,
  EntryInput,
  EntryUpdateInput,
  Horse,
  HorseContact,
  HorseInput,
  HorseUpdateInput,
  Invoice,
  InvoiceLineItem,
  Organization,
  OrganizationInput,
  OrganizationMember,
  SanctioningBody,
  Show,
  ShowDay,
  ShowScoreClassSetup,
  ShowInput,
  ShowUpdateInput,
  StallBooking,
  StallBookingInput,
  StallBookingUpdateInput,
  StallOption,
  StallOptionInput,
  StallOptionUpdateInput,
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
  contactRoles: ContactRole[];
  horses: Horse[];
  horseContacts: HorseContact[];
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
    contactRolesResult,
    horsesResult,
    horseContactsResult,
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
  ] = await Promise.all([
    client.from("organizations").select("*").order("created_at", { ascending: false }).returns<Organization[]>(),
    client.from("organization_members").select("*").order("created_at", { ascending: false }).returns<OrganizationMember[]>(),
    client.from("shows").select("*").order("start_date", { ascending: true }).returns<Show[]>(),
    client.from("show_days").select("*").order("day_date", { ascending: true }).returns<ShowDay[]>(),
    client.from("contacts").select("*").order("created_at", { ascending: false }).returns<Contact[]>(),
    client.from("contact_roles").select("*").order("created_at", { ascending: false }).returns<ContactRole[]>(),
    client.from("horses").select("*").order("created_at", { ascending: false }).returns<Horse[]>(),
    client.from("horse_contacts").select("*").order("created_at", { ascending: false }).returns<HorseContact[]>(),
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

  const contactRoles = contactRolesResult.error
    ? isMissingSchemaError(contactRolesResult.error, "contact_roles")
      ? deriveContactRolesFromContacts(contactsResult.data ?? [])
      : null
    : contactRolesResult.data ?? [];

  if (!contactRoles) {
    throw contactRolesResult.error;
  }

  if (horsesResult.error) {
    throw horsesResult.error;
  }

  if (horseContactsResult.error) {
    throw horseContactsResult.error;
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

  return {
    profile,
    organizations: organizationsResult.data ?? [],
    organizationMembers: organizationMembersResult.data ?? [],
    shows: showsResult.data ?? [],
    showDays: showDaysResult.data ?? [],
    showScoreClassSetups,
    contacts: contactsResult.data ?? [],
    contactRoles,
    horses: horsesResult.data ?? [],
    horseContacts: horseContactsResult.data ?? [],
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
  const normalizedEmail = input.email?.trim().toLowerCase() || null;
  const roles = uniqueRoles([input.type, ...(input.roles ?? [])]);

  if (normalizedEmail) {
    const { data: existing, error: existingError } = await client
      .from("contacts")
      .select("*")
      .eq("organization_id", input.organization_id)
      .eq("email", normalizedEmail)
      .maybeSingle<Contact>();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      await ensureContactRoles({
        organization_id: existing.organization_id,
        contact_id: existing.id,
        roles,
        source: input.roles?.length ? "manual" : "contact_type",
      });

      return existing;
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
    })
    .select("*")
    .single<Contact>();

  if (error) {
    if (error.code === "23505" && normalizedEmail) {
      const { data: existing, error: retryError } = await client
        .from("contacts")
        .select("*")
        .eq("organization_id", input.organization_id)
        .eq("email", normalizedEmail)
        .maybeSingle<Contact>();

      if (retryError) {
        throw retryError;
      }

      if (existing) {
        await ensureContactRoles({
          organization_id: existing.organization_id,
          contact_id: existing.id,
          roles,
          source: input.roles?.length ? "manual" : "contact_type",
        });

        return existing;
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

  if (input.type) {
    await ensureContactRole({
      organization_id: data.organization_id,
      contact_id: data.id,
      role: input.type,
      source: "contact_type",
    });
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
      created_by_user_id: input.created_by_user_id || null,
    })
    .select("*")
    .single<Horse>();

  if (horseError) {
    throw horseError;
  }

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

  return horse;
}

export async function updateHorse(id: string, input: HorseUpdateInput) {
  const client = requireSupabase();
  const { agent_contact_id: agentContactId, ...horseInput } = input;
  const { data, error } = await client
    .from("horses")
    .update(cleanPayload(horseInput))
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
      eligibility_rules: input.eligibility_rules ?? {},
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
      class_template_division_id: input.class_template_division_id || null,
      name: input.name,
      code: input.code || null,
      level: input.level ?? null,
      entry_fee: input.entry_fee ?? null,
      judge_fee: input.judge_fee ?? null,
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
  return isMissingSchemaError(error, "show_score_class_setups");
}

function isMissingSchemaError(error: { code?: string; message?: string }, relationName: string) {
  const message = String(error.message || "").toLowerCase();
  return error.code === "42P01" || (message.includes("schema cache") && message.includes(relationName));
}
