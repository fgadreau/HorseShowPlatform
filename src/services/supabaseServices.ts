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
  ContactOrganizationLink,
  ContactRole,
  ContactRoleName,
  ContactUpdateInput,
  Division,
  DivisionInput,
  DivisionUpdateInput,
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
  Organization,
  OrganizationExternalMembershipRequirement,
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
  contactOrganizationLinks: ContactOrganizationLink[];
  contactRoles: ContactRole[];
  externalOrganizations: ExternalOrganization[];
  organizationExternalMembershipRequirements: OrganizationExternalMembershipRequirement[];
  contactExternalMemberships: ContactExternalMembership[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  horseOrganizationLinks: HorseOrganizationLink[];
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
    contactExternalMembershipsResult,
    horseExternalMembershipsResult,
    horseHealthDocumentsResult,
    horsesResult,
    horseOrganizationLinksResult,
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
    client.from("contact_organization_links").select("*").order("created_at", { ascending: false }).returns<ContactOrganizationLink[]>(),
    client.from("contact_roles").select("*").order("created_at", { ascending: false }).returns<ContactRole[]>(),
    client.from("external_organizations").select("*").order("name", { ascending: true }).returns<ExternalOrganization[]>(),
    client.from("organization_external_membership_requirements").select("*").order("created_at", { ascending: false }).returns<OrganizationExternalMembershipRequirement[]>(),
    client.from("contact_external_memberships").select("*").order("created_at", { ascending: false }).returns<ContactExternalMembership[]>(),
    client.from("horse_external_memberships").select("*").order("created_at", { ascending: false }).returns<HorseExternalMembership[]>(),
    client.from("horse_health_documents").select("*").order("created_at", { ascending: false }).returns<HorseHealthDocument[]>(),
    client.from("horses").select("*").order("created_at", { ascending: false }).returns<Horse[]>(),
    client.from("horse_organization_links").select("*").order("created_at", { ascending: false }).returns<HorseOrganizationLink[]>(),
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
    contactOrganizationLinks,
    contactRoles,
    externalOrganizations,
    organizationExternalMembershipRequirements,
    contactExternalMemberships,
    horseExternalMemberships,
    horseHealthDocuments,
    horses: horsesResult.data ?? [],
    horseOrganizationLinks,
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
  const normalizedEmail = normalizeEmail(input.email);
  const roles = uniqueRoles([input.type, ...(input.roles ?? [])]);

  if (normalizedEmail) {
    const existing = await findExistingContactByEmail(normalizedEmail, input.organization_id);

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
    })
    .select("*")
    .single<Contact>();

  if (error) {
    if (error.code === "23505" && normalizedEmail) {
      let existing = await findExistingContactByEmail(normalizedEmail, input.organization_id);

      if (!existing) {
        await claimContactsForCurrentUser();
        existing = await findExistingContactByEmail(normalizedEmail, input.organization_id);
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

export async function verifyGvlCogginsDocument(input: {
  organization_id: string;
  horse_id: string;
  source_url: string;
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
    throw new Error(`Validation GVL impossible: ${invokeError.message}`);
  }

  if (!verification) {
    throw new Error("Validation GVL impossible: aucune reponse recue.");
  }

  if (verification.error) {
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
  document_type: Extract<HorseHealthDocument["document_type"], "influenza_vaccine" | "rhino_vaccine" | "combo_vaccine" | "other">;
  file: File;
  test_or_administered_on?: string | null;
  issuer_name?: string | null;
  created_by_user_id?: string;
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
      document_url: documentUrl,
      issuer_name: input.issuer_name || null,
      test_or_administered_on: input.test_or_administered_on || null,
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

export async function reviewHorseHealthDocument(
  id: string,
  input: {
    status: Extract<HorseHealthDocument["status"], "approved" | "rejected" | "pending_review">;
    reviewed_by_user_id?: string;
    review_notes?: string | null;
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
  await ensureEntryOrganizationLinks({
    organization_id: input.organization_id,
    horse_id: input.horse_id,
    owner_contact_id: input.owner_contact_id,
    rider_contact_id: input.rider_contact_id ?? null,
    payer_contact_id: input.payer_contact_id,
    created_by_user_id: input.created_by_user_id,
  });

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
  const existing = await getEntryById(id);
  await ensureEntryOrganizationLinks({
    organization_id: existing.organization_id,
    horse_id: input.horse_id ?? existing.horse_id,
    owner_contact_id: input.owner_contact_id ?? existing.owner_contact_id,
    rider_contact_id: input.rider_contact_id === undefined ? existing.rider_contact_id : input.rider_contact_id,
    payer_contact_id: input.payer_contact_id ?? existing.payer_contact_id,
    created_by_user_id: existing.created_by_user_id,
  });

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
  await ensureStallBookingOrganizationLinks({
    organization_id: input.organization_id,
    horse_id: input.horse_id ?? null,
    booker_contact_id: input.booker_contact_id,
    payer_contact_id: input.payer_contact_id,
    created_by_user_id: input.created_by_user_id,
  });

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

async function findExistingContactByEmail(normalizedEmail: string, preferredOrganizationId?: string) {
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

  if (preferredOrganizationId) {
    const localContact = visibleContacts.find((contact) => contact.organization_id === preferredOrganizationId);

    if (localContact) {
      return localContact;
    }
  }

  return visibleContacts[0] ?? null;
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
