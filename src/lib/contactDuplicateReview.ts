import type { Contact, ContactInput } from "../types/domain";
import type { ContactIdentityCandidate } from "../services/supabaseServices";
import { compareContactIdentity } from "./identityComparison";

// These records have already been authorized by the caller's contact list.
// A local match must be reviewed on every creation, even after a previous
// homonym confirmation. It is never an instruction to merge records.
export function localContactIdentityCandidates(input: ContactInput, contacts: Contact[]): ContactIdentityCandidate[] {
  return contacts.flatMap(contact => {
    const match = compareContactIdentity(input, contact)
      ?? compareContactIdentity({ ...input, middle_name: null }, { ...contact, middle_name: null });
    if (!match || !match.reasons.some(reason => ["same_name", "similar_name", "same_email", "same_phone"].includes(reason))) return [];
    return [{
      contact_id: contact.id, first_name: contact.first_name, middle_name: contact.middle_name ?? null,
      last_name: contact.last_name, date_of_birth: contact.date_of_birth ?? null,
      email_hint: contact.email ? contact.email.replace(/^(.).*(@.*)$/, "$1***$2") : null,
      phone_hint: contact.phone ? `***${contact.phone.replace(/\D/g, "").slice(-4)}` : null,
      already_linked: true, search_signature: "", ...match,
    }];
  }).sort((a, b) => b.score - a.score);
}

export function mergeContactIdentityCandidates(local: ContactIdentityCandidate[], remote: ContactIdentityCandidate[]) {
  return [...new Map([...local, ...remote].map(candidate => [candidate.contact_id, candidate])).values()]
    .sort((a, b) => b.score - a.score);
}
