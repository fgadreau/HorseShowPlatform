import type { User } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";
import type { Invoice, Organization, OrganizationInput, Show, ShowInput, UserProfile } from "../types/domain";

export type AppContext = {
  profile: UserProfile;
  organizations: Organization[];
  shows: Show[];
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

  const [organizationsResult, showsResult, invoicesResult] = await Promise.all([
    client.from("organizations").select("*").order("created_at", { ascending: false }).returns<Organization[]>(),
    client.from("shows").select("*").order("start_date", { ascending: true }).returns<Show[]>(),
    client.from("invoices").select("*").order("created_at", { ascending: false }).limit(20).returns<Invoice[]>(),
  ]);

  if (organizationsResult.error) {
    throw organizationsResult.error;
  }

  if (showsResult.error) {
    throw showsResult.error;
  }

  if (invoicesResult.error) {
    throw invoicesResult.error;
  }

  return {
    profile,
    organizations: organizationsResult.data ?? [],
    shows: showsResult.data ?? [],
    invoices: invoicesResult.data ?? [],
  };
}

export async function createOrganization(profileId: string, input: OrganizationInput) {
  const client = requireSupabase();
  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .insert({
      name: input.name,
      slug: slugify(input.slug || input.name),
      primary_contact_email: input.primary_contact_email || null,
      timezone: input.timezone || "America/Toronto",
      currency: input.currency || "CAD",
      created_by_user_id: profileId,
    })
    .select("*")
    .single<Organization>();

  if (organizationError) {
    throw organizationError;
  }

  const { error: memberError } = await client.from("organization_members").insert({
    organization_id: organization.id,
    user_id: profileId,
    role: "admin",
  });

  if (memberError) {
    throw memberError;
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
