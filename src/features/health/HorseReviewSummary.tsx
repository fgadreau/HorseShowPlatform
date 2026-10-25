import type { Contact, ExternalCredentialIssuer, Horse, HorseExternalIdentifier } from "../../types/domain";
import type { Locale } from "../../lib/i18n";
import { contactLabel, formatDate } from "../../lib/display";
import { uiText } from "../dashboard/shared";

export function HorseReviewSummary({ locale, horse, contacts = [], identifiers = [], issuers = [] }: {
  locale: Locale; horse?: Horse; contacts?: Contact[];
  identifiers?: HorseExternalIdentifier[]; issuers?: ExternalCredentialIssuer[];
}) {
  if (!horse) return null;
  const missing = uiText(locale, "Non renseigné", "Not provided");
  const owner = contacts.find(contact => contact.id === horse.primary_owner_contact_id);
  const fields = [
    [uiText(locale, "Nom dans l’application", "Name in the application"), horse.name],
    [uiText(locale, "Naissance", "Birth date"), horse.date_of_birth ? formatDate(horse.date_of_birth) : horse.birth_year ? String(horse.birth_year) : missing],
    [uiText(locale, "Sexe", "Sex"), horse.gender === "M" ? uiText(locale,"Étalon","Stallion") : horse.gender === "F" ? uiText(locale,"Jument","Mare") : horse.gender === "G" ? uiText(locale,"Hongre","Gelding") : missing],
    [uiText(locale, "Race", "Breed"), horse.breed || missing],
    [uiText(locale, "Robe", "Color"), horse.color || missing],
    [uiText(locale, "Numéro principal", "Primary number"), horse.registration_number || missing],
    [uiText(locale, "Propriétaire", "Owner"), owner ? contactLabel(owner) : missing],
    [uiText(locale, "Père", "Sire"), horse.sire_name || missing],
    [uiText(locale, "Mère", "Dam"), horse.dam_name || missing],
    ...identifiers.filter(identifier => identifier.horse_id === horse.id).map(identifier => [issuers.find(issuer => issuer.id === identifier.external_credential_issuer_id)?.code ?? uiText(locale,"Référence externe","External reference"), identifier.identifier_value]),
  ];
  return <section className="health-review-horse-summary" aria-label={uiText(locale,"Fiche du cheval dans l’application","Horse record in the application")}>
    <h3>{uiText(locale,"Fiche du cheval dans l’application","Horse record in the application")}</h3>
    <dl>{fields.map(([label,value], index) => <div key={`${label}:${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}
