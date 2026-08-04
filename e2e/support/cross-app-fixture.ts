import { expect } from "@playwright/test";
import { createE2EAdminClient } from "./admin";
import { buildContactScenarios } from "./data-factory";
import type { E2ERunState } from "./run-state";

export const FULL_CLASS_CONFIG = {
  addedMoney: 100,
  classCode: "1100",
  className: "Open",
  eligibilityNotes: "Carte NRHA active; cheval admissible et cavalier en règle.",
  entryFee: 150,
  judgeFee: 25,
  payoutNotes: "[E2E] Trophée, redevance NRHA et retenue validés avant publication.",
  payoutPercentages: "60, 40",
  retainagePercent: 10,
  sanctioningFeePercent: 5,
  trophyFee: 30,
} as const;

export const EXPECTED_PAYOUT = {
  addedMoney: 100,
  awards: [198.51, 132.34],
  baseAfterTrophy: 270,
  finalNetEntryFee: 230.85,
  grossEntryFees: 300,
  netEntryFee: 256.5,
  netPurse: 330.85,
  retainageAmount: 25.65,
  sanctioningFeeAmount: 13.5,
  trophyFee: 30,
} as const;

export type CrossAppFixture = {
  blockId: string;
  classId: string;
  entryIds: string[];
  horseIds: string[];
  organizationDisciplineId: string;
  participantNames: string[];
  showDayId: string;
  showId: string;
};

export async function createCrossAppEntries(state: E2ERunState, blockName: string): Promise<CrossAppFixture> {
  const admin = createE2EAdminClient();
  const { data: show, error: showError } = await admin
    .from("shows")
    .select("id")
    .eq("organization_id", state.organizationId)
    .eq("slug", state.showSlug)
    .single<{ id: string }>();
  if (showError) throw showError;

  const { error: showVisibilityError } = await admin
    .from("shows")
    .update({
      is_public: true,
      show_schedule_public: true,
      show_draw_public: true,
      show_results_public: true,
      show_standings_public: true,
    })
    .eq("id", show.id);
  if (showVisibilityError) throw showVisibilityError;

  const { data: block, error: blockError } = await admin
    .from("blocks")
    .select("id,show_day_id")
    .eq("organization_id", state.organizationId)
    .eq("show_id", show.id)
    .eq("name", blockName)
    .single<{ id: string; show_day_id: string }>();
  if (blockError) throw blockError;

  const { data: classRecord, error: classError } = await admin
    .from("classes")
    .select("id,organization_discipline_id")
    .eq("block_id", block.id)
    .eq("code", FULL_CLASS_CONFIG.classCode)
    .single<{ id: string; organization_discipline_id: string }>();
  if (classError) throw classError;

  const scenarios = buildContactScenarios(state, 3);
  const participantScenarios = [scenarios[0], scenarios[2]];
  const { data: contacts, error: contactsError } = await admin
    .from("contacts")
    .select("id,email,first_name,last_name")
    .in("email", participantScenarios.map((scenario) => scenario.email));
  if (contactsError) throw contactsError;
  if ((contacts ?? []).length !== 2) throw new Error("Les deux contacts E2E requis pour les inscriptions sont introuvables.");

  const contactByEmail = new Map((contacts ?? []).map((contact) => [contact.email, contact]));
  const orderedContacts = participantScenarios.map((scenario) => {
    const contact = contactByEmail.get(scenario.email);
    if (!contact) throw new Error(`Contact E2E introuvable: ${scenario.email}`);
    return contact;
  });
  const horseIds = [crypto.randomUUID(), crypto.randomUUID()];
  const entryIds = [crypto.randomUUID(), crypto.randomUUID()];
  const horseNames = [`[E2E] Argent QA — ${state.runId}`, `[E2E] Éclair Préprod — ${state.runId}`];

  const { error: horseError } = await admin.from("horses").insert(
    horseIds.map((id, index) => ({
      id,
      name: horseNames[index],
      breed: "Quarter Horse",
      color: index === 0 ? "Alezan" : "Bai",
      gender: "G",
      birth_year: 2017 + index,
      registration_number: `E2E-${state.runId}-${index + 1}`,
      registration_status: "registered",
      primary_owner_contact_id: orderedContacts[index].id,
      created_by_user_id: state.profileId,
    })),
  );
  if (horseError) throw horseError;

  const { error: horseDirectoryError } = await admin.from("directory_horses").insert(
    horseIds.map((horseId) => ({
      organization_discipline_id: classRecord.organization_discipline_id,
      horse_id: horseId,
      source: "entry",
      created_by_user_id: state.profileId,
    })),
  );
  if (horseDirectoryError) throw horseDirectoryError;

  const { error: horseContactError } = await admin.from("horse_contacts").insert(
    horseIds.map((horseId, index) => ({
      horse_id: horseId,
      contact_id: orderedContacts[index].id,
      role: "owner",
      can_create_entries: true,
      can_modify_entries: true,
      can_book_stalls: true,
      can_pay_invoices: true,
    })),
  );
  if (horseContactError) throw horseContactError;

  const { error: entryError } = await admin.from("entries").insert(
    entryIds.map((id, index) => ({
      id,
      organization_id: state.organizationId,
      show_id: show.id,
      horse_id: horseIds[index],
      class_id: classRecord.id,
      created_by_user_id: state.profileId,
      owner_contact_id: orderedContacts[index].id,
      rider_contact_id: orderedContacts[index].id,
      payer_contact_id: orderedContacts[index].id,
      status: "active",
      entry_number: 101 + index,
      base_fee: FULL_CLASS_CONFIG.entryFee,
      total_fees: FULL_CLASS_CONFIG.entryFee,
      is_late: false,
      late_fee_percent: 0,
      late_fee_amount: 0,
    })),
  );
  if (entryError) throw entryError;

  return {
    blockId: block.id,
    classId: classRecord.id,
    entryIds,
    horseIds,
    organizationDisciplineId: classRecord.organization_discipline_id,
    participantNames: orderedContacts.map((contact) => `${contact.first_name} ${contact.last_name}`),
    showDayId: block.show_day_id,
    showId: show.id,
  };
}

export async function assertFullClassConfiguration(fixture: CrossAppFixture) {
  const admin = createE2EAdminClient();
  const { data: classRecord, error } = await admin
    .from("classes")
    .select("*")
    .eq("id", fixture.classId)
    .single<Record<string, unknown>>();
  if (error) throw error;

  expect(classRecord).toMatchObject({
    added_money: FULL_CLASS_CONFIG.addedMoney,
    back_number_policy_override: "horse_rider_team",
    code: FULL_CLASS_CONFIG.classCode,
    entry_fee: FULL_CLASS_CONFIG.entryFee,
    judge_fee: FULL_CLASS_CONFIG.judgeFee,
    name: FULL_CLASS_CONFIG.className,
    payout_notes: FULL_CLASS_CONFIG.payoutNotes,
    payout_schedule_type: "house_custom",
    retainage_percent: FULL_CLASS_CONFIG.retainagePercent,
    sanctioning_fee_percent: FULL_CLASS_CONFIG.sanctioningFeePercent,
    trophy_or_plaque_fee: FULL_CLASS_CONFIG.trophyFee,
  });
  expect(classRecord.eligibility_rules).toMatchObject({ notes: FULL_CLASS_CONFIG.eligibilityNotes });
  expect(classRecord.payout_rules).toMatchObject({
    custom_brackets: [
      expect.objectContaining({ min_entries: "1", max_entries: "5", percentages: FULL_CLASS_CONFIG.payoutPercentages }),
    ],
  });

  const { data: nrhaBody, error: bodyError } = await admin
    .from("governing_bodies")
    .select("id")
    .eq("code", "NRHA")
    .single<{ id: string }>();
  if (bodyError) throw bodyError;
  const { data: assignment, error: assignmentError } = await admin
    .from("class_governing_bodies")
    .select("reporting_class_code,eligibility_profile_code")
    .eq("class_id", fixture.classId)
    .eq("governing_body_id", nrhaBody.id)
    .single<{ reporting_class_code: string; eligibility_profile_code: string }>();
  if (assignmentError) throw assignmentError;
  expect(assignment).toEqual({
    reporting_class_code: FULL_CLASS_CONFIG.classCode,
    eligibility_profile_code: "category_1_ancillary_year_end",
  });
}
