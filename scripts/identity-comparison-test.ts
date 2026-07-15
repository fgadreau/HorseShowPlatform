import {
  compareContactIdentity,
  compareExternalContactIdentity,
  compareExternalHorseIdentity,
  compareHorseHealthIdentity,
  compareHorseIdentity,
  identityIdentifierEqual,
  identityPhoneEqual,
} from "../src/lib/identityComparison";
import {
  applyExternalImportDecision,
  buildExternalImportFields,
  buildExternalImportProposal,
  decideExternalImport,
  defaultAcceptedExternalImportKeys,
  withExternalImportDecision,
} from "../src/lib/externalImportProposal";
import { birthYearFromDocumentAge, prepareHorseDocumentValidation } from "../src/lib/horseDocumentIdentity";
import type { Horse, HorseDocument } from "../src/types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const exactContact = compareContactIdentity(
  { first_name: "Émilie", last_name: "Lavoie", email: "Emilie@example.test", phone: null, date_of_birth: null },
  { first_name: "Emilie", last_name: "Lavoie", email: "emilie@example.test", phone: null, date_of_birth: null },
);
assert(exactContact?.confidence === "certain" && exactContact.reasons.includes("same_email"), "Exact normalized email must be certain");

const probableContact = compareContactIdentity(
  { first_name: "Francois", last_name: "Gagnon", date_of_birth: "1988-04-12" },
  { first_name: "François", last_name: "Gagnonn", date_of_birth: "1988-04-12" },
);
assert(probableContact?.confidence === "certain" && probableContact.reasons.includes("same_birth_date"), "Similar name plus birth date must be a strong candidate");

const exactHorse = compareHorseIdentity(
  { name: "Smart Whiz", registration_number: "AQHA-123", gender: "G", primary_owner_contact_id: "owner-a" },
  { name: "Smart Wiz", registration_number: "aqha 123", gender: "G", primary_owner_contact_id: "owner-b" },
);
assert(exactHorse?.confidence === "certain" && exactHorse.reasons.includes("same_registration_number"), "Exact normalized registration must be certain");

const unrelatedContact = compareContactIdentity(
  { first_name: "Alice", last_name: "Martin", phone: "514-555-1111" },
  { first_name: "Robert", last_name: "Tremblay", phone: "418-555-2222" },
);
assert(unrelatedContact === null, "Unrelated contacts must not be suggested");

const externalContactMatch = compareExternalContactIdentity(
  {
    first_name: "Émilie",
    last_name: "Lavoie",
    external_identifier: "NRHA-001 234",
    email: "emilie@example.test",
  },
  {
    first_name: "Emilie",
    last_name: "Lavoie",
    external_identifier: "nrha 001 234",
    email: "EMILIE@example.test",
  },
);
assert(externalContactMatch.verdict === "match", "An aligned official contact record must match");
assert(externalContactMatch.profile === "external_contact", "External contact comparison must retain its workflow profile");
assert(externalContactMatch.evidence.some((item) => item.field === "identifier" && item.outcome === "exact"), "External comparison must explain the exact identifier");

const externalContactConflict = compareExternalContactIdentity(
  { first_name: "Alice", last_name: "Martin", external_identifier: "123", date_of_birth: "1990-01-01" },
  { first_name: "Alice", last_name: "Tremblay", external_identifier: "123", date_of_birth: "1991-01-01" },
);
assert(externalContactConflict.verdict === "mismatch", "A strong official contact identity conflict must not be accepted");
assert(externalContactConflict.reasons.includes("different_date_of_birth"), "Contact mismatch must preserve a structured birth-date reason");

const externalHorseMatch = compareExternalHorseIdentity(
  { name: "Smart Whiz", external_identifier: "NRHA-7788", date_of_birth: "2018-03-02", gender: "G" },
  { name: "Smart Whiz", external_identifier: "nrha 7788", date_of_birth: "03/02/2018", gender: "Gelding" },
);
assert(externalHorseMatch.verdict === "match", "An aligned external horse record must match across normalized date and sex values");

const externalHorseConflict = compareExternalHorseIdentity(
  { name: "Smart Whiz", external_identifier: "7788", date_of_birth: "2018-03-02", gender: "G" },
  { name: "Smart Whiz", external_identifier: "7788", date_of_birth: "2019-03-02", gender: "Mare" },
);
assert(externalHorseConflict.verdict === "mismatch", "Birth-date or sex conflicts must block external horse concordance");
assert(externalHorseConflict.evidence.filter((item) => item.outcome === "different").length === 2, "Every strong horse conflict must be reported separately");

const healthDocumentMatch = compareHorseHealthIdentity(
  { name: "Miss Québec", date_of_birth: "2017-05-01", gender: "F" },
  { name: "Miss Quebec", date_of_birth: "2017-05-01", gender: "Mare" },
);
assert(healthDocumentMatch.verdict === "match" && healthDocumentMatch.profile === "health_document_horse", "Health-document identity uses the same primitive with a stricter profile");

const insufficientHealthDocument = compareHorseHealthIdentity(
  { name: "Miss Quebec" },
  { name: "Miss Quebec" },
);
assert(insufficientHealthDocument.verdict === "insufficient_data", "A name alone must not validate a health document identity");

const healthDocumentBirthYearMatch = compareHorseHealthIdentity(
  { name: "Miss Quebec", date_of_birth: "2017-05-01", breed: "Quarter Horse" },
  { name: "Miss Quebec", birth_year: 2017, breed: "Quarter horse" },
);
assert(healthDocumentBirthYearMatch.verdict === "match", "A document birth year may support identity when the full date is unavailable");
assert(healthDocumentBirthYearMatch.evidence.some((item) => item.field === "birth_year" && item.outcome === "exact"), "Birth-year fallback must remain visible in evidence");

assert(birthYearFromDocumentAge(8, "2026-07-15") === 2018, "A document age must use its explicit reference date");
assert(birthYearFromDocumentAge(8, null) === null, "An age without a reference date must not invent a birth year");

const gradeHorse = {
  id: "horse-grade",
  name: "Grade Mare",
  breed: "Quarter Horse type",
  color: null,
  gender: "F",
  date_of_birth: null,
  birth_year: 2018,
  registration_number: null,
  registration_status: "grade",
  sire_name: null,
  dam_name: null,
  primary_owner_contact_id: "owner-grade",
  created_at: "2026-07-15T00:00:00.000Z",
} satisfies Horse;
const registrationDocument = {
  id: "document-registration",
  horse_id: gradeHorse.id,
  document_category: "registration",
  document_type: "breed_registration",
  registration_number: "AQHA-123",
  horse_name: "Grade Mare",
  horse_date_of_birth: null,
  horse_external_id: null,
  breed_name: "Quarter Horse type",
} as HorseDocument;
const gradeRegistrationValidation = prepareHorseDocumentValidation({
  document: registrationDocument,
  horse: gradeHorse,
  extracted: {
    horse_name: "Grade Mare",
    birth_year: 2018,
    breed: "Quarter Horse type",
    identifier: "AQHA-123",
  },
});
assert(gradeRegistrationValidation.comparison.verdict === "mismatch", "A registration document must flag a horse explicitly declared grade");
assert(gradeRegistrationValidation.comparison.reasons.includes("grade_horse_has_registration_document"), "The grade conflict must be explicit and auditable");
assert(gradeHorse.registration_number === null && gradeHorse.registration_status === "grade", "Document comparison must never mutate the HSP horse");

assert(identityIdentifierEqual("AQHA-123", "aqha 123"), "Identifier equality must be shared across workflows");
assert(identityPhoneEqual("+1 (514) 555-1234", "514-555-1234"), "Phone equality must be shared across workflows");

const importFields = buildExternalImportFields([
  { key: "email", currentValue: "", proposedValue: "official@example.test" },
  { key: "phone", currentValue: "514-555-0000", proposedValue: "418-555-0000", equals: identityPhoneEqual },
  { key: "memberNumber", currentValue: "NRHA-123", proposedValue: "nrha 123", equals: identityIdentifierEqual },
]);
assert(importFields.length === 2, "An import must omit values that are already equivalent");
assert(importFields[0].changeType === "fill_missing", "A missing local value must be identified as a safe fill");
assert(importFields[1].changeType === "replace_existing", "An existing conflict must be identified as a replacement");

const defaultImportKeys = defaultAcceptedExternalImportKeys(importFields);
assert(defaultImportKeys.length === 1 && defaultImportKeys[0] === "email", "Only missing local values may be selected by default");

const importProposal = buildExternalImportProposal({
  subjectType: "contact",
  sourceCode: "nrha_member_lookup",
  sourceRecordKey: "123",
  capturedAt: "2026-07-14T12:00:00.000Z",
  comparison: externalContactConflict,
  fields: importFields,
});
const partialImportDecision = decideExternalImport(importProposal, ["email"], "2026-07-14T12:01:00.000Z");
assert(partialImportDecision.acceptedFields.join(",") === "email", "A partial import must retain only explicitly accepted fields");
assert(partialImportDecision.rejectedFields.join(",") === "phone", "Refused fields must be explicit in the audit decision");
assert(partialImportDecision.fields.find((field) => field.key === "phone")?.currentValue === "514-555-0000", "A refusal must preserve the original local value in evidence");
const partiallyImportedValues = applyExternalImportDecision(
  { email: "", phone: "514-555-0000", memberNumber: "NRHA-123" },
  partialImportDecision,
);
assert(partiallyImportedValues.email === "official@example.test", "An explicitly accepted field must be applied");
assert(partiallyImportedValues.phone === "514-555-0000", "An unselected existing value must never be overwritten");

const refusedImportDecision = decideExternalImport(importProposal, [], "2026-07-14T12:02:00.000Z");
assert(refusedImportDecision.acceptedFields.length === 0, "Refusing an import must never accept a field implicitly");
assert(refusedImportDecision.rejectedFields.length === importFields.length, "Refusing an import must retain every rejected proposal");
const importEvidencePayload = withExternalImportDecision({ lookup: { id: 123 } }, refusedImportDecision);
assert("lookup" in importEvidencePayload && "externalImportDecision" in importEvidencePayload, "Import evidence must augment, not replace, the source snapshot payload");

console.log("identity comparison tests passed");
