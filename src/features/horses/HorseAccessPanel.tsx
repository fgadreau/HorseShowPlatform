import { useEffect, useState } from "react";
import { ModalDialog, SearchSelect } from "../../components/ui";
import { billingRpc } from "../../services/billingFolio";
import { contactLabel, errorMessage } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Contact, Discipline, Organization, OrganizationDiscipline } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { HorseForOwnerForm } from "./HorseForOwnerForm";

type AgentCandidate = { horse_id: string; name: string; registration_number: string | null; already_authorized: boolean };
type AccessRequest = { id: string; horse_name: string; status: string; requester_name: string; message: string; is_mine: boolean; can_review: boolean };
type OwnerRequest = { id: string; owner_first_name: string; owner_last_name: string; proposed_owner_contact_id?: string | null; details: { name: string }; status: string; requester_name: string; is_mine: boolean; can_review: boolean };

export function HorseAccessPanel({ organization, contacts, directories = [], disciplines = [], locale, staff = false, onRefresh }: {
  organization: Organization; contacts: Contact[]; directories?: OrganizationDiscipline[]; disciplines?: Discipline[]; locale: Locale; staff?: boolean; onRefresh?: () => void | Promise<void>;
}) {
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<AgentCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [ownerRequests, setOwnerRequests] = useState<OwnerRequest[]>([]);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setCandidates([]); setSearched(false); setRequests([]); setOwnerRequests([]); setError("");
    void Promise.all([billingRpc("list_horse_agent_requests", { p_org: organization.id }), billingRpc("list_horse_owner_confirmations", { p_org: organization.id })])
      .then(([agent, owner]) => { if (live) { setRequests(agent); setOwnerRequests(owner); } })
      .catch(error => { if (live) setError(errorMessage(error)); });
    return () => { live = false; };
  }, [organization.id, revision]);
  async function changed() { setRevision(value => value + 1); await onRefresh?.(); }
  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); await changed(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const status = (value: string) => ({ pending: uiText(locale, "En attente — aucun nouvel accès accordé", "Pending — no new access granted"), approved: uiText(locale, "Approuvée", "Approved"), rejected: uiText(locale, "Refusée", "Rejected"), cancelled: uiText(locale, "Annulée", "Cancelled") }[value] ?? value);
  return <section className="panel span-2 stack">
    <div className="panel-header"><div><h2>{uiText(locale, "Propriétaires et accès comme agent", "Owners and agent access")}</h2><p>{uiText(locale, "La propriété reste au contact désigné. Un accès d’agent permet les inscriptions et réservations, sans transfert de propriété ni droit de paiement automatique.", "Ownership stays with the designated contact. Agent access permits entries and reservations, without transferring ownership or automatically granting payment rights.")}</p></div></div>
    {!staff ? <div className="row-actions"><button className="ghost-button" type="button" disabled={!directories.length} onClick={() => { setCreating(true); setError(""); }}>{uiText(locale, "Créer pour un autre propriétaire", "Create for another owner")}</button><button className="primary-button" type="button" onClick={() => { setSearching(true); setError(""); }}>{uiText(locale, "Demander à devenir agent d’un cheval", "Request access as a horse agent")}</button></div> : null}
    <div className="row-actions"><button className="ghost-button" type="button" disabled={busy} onClick={() => void run(async () => {}, uiText(locale, "Demandes actualisées.", "Requests refreshed."))}>{uiText(locale, "Actualiser les demandes", "Refresh requests")}</button></div>
    {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {creating ? <ModalDialog className="horse-form-modal" eyebrow={uiText(locale, "Propriété du cheval", "Horse ownership")} title={uiText(locale, "Créer pour un autre propriétaire", "Create for another owner")} onClose={() => setCreating(false)}>
      <HorseForOwnerForm key={organization.id} orgId={organization.id} directories={directories} disciplines={disciplines} locale={locale} onSaved={async () => { setCreating(false); setNotice(uiText(locale, "Création ou demande de confirmation enregistrée. Consulte le suivi ci-dessous.", "Creation or confirmation request saved. Check its status below.")); await changed(); }} />
    </ModalDialog> : null}
    {searching ? <ModalDialog className="horse-form-modal" eyebrow={uiText(locale, "Cheval existant", "Existing horse")} title={uiText(locale, "Demander un accès comme agent", "Request agent access")} onClose={() => setSearching(false)}>
      <form className="stack" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { setCandidates(await billingRpc("search_horse_agent_candidates", { p_org: organization.id, p_query: query.trim() })); setSearched(true); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } }}>
        <p>{uiText(locale, "Recherche le nom exact ou le numéro du cheval dans cette association. Seuls le nom et le numéro du cheval sont affichés. Le propriétaire ou le secrétariat doit approuver la demande.", "Search by exact horse name or number in this association. Only the horse name and number are shown. The owner or office must approve your request.")}</p>
        <label>{uiText(locale, "Nom exact ou numéro du cheval", "Exact horse name or number")}<input required minLength={3} maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setCandidates([]); setSearched(false); }} /></label>
        <div className="row-actions"><button className="ghost-button" disabled={busy} type="submit">{uiText(locale, "Rechercher le cheval", "Find horse")}</button></div>
        <label>{uiText(locale, "Message au propriétaire ou au secrétariat (facultatif)", "Message to the owner or office (optional)")}<textarea maxLength={500} value={message} onChange={event => setMessage(event.target.value)} /></label>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {searched && !candidates.length ? <p>{uiText(locale, "Aucun cheval trouvé. Vérifie le nom, le numéro ou l’association avant de créer une nouvelle fiche.", "No horse found. Check the name, number or association before creating a new record.")}</p> : null}
      {candidates.map(candidate => <article className="form-section stack" key={candidate.horse_id}><strong>{candidate.name}</strong>{candidate.registration_number ? <p>{candidate.registration_number}</p> : null}<div className="row-actions"><button className="primary-button" type="button" disabled={busy || candidate.already_authorized} onClick={() => void run(async () => { await billingRpc("request_horse_agent_access", { p_org: organization.id, p_horse: candidate.horse_id, p_message: message }); setSearching(false); }, uiText(locale, "Demande envoyée. Aucun accès ne sera accordé avant approbation.", "Request submitted. Access will be granted only after approval."))}>{candidate.already_authorized ? uiText(locale, "Déjà lié à ton compte", "Already linked to your account") : uiText(locale, "Demander à devenir agent", "Request to become agent")}</button></div></article>)}
    </ModalDialog> : null}
    <h3>{uiText(locale, "Demandes d’agent", "Agent requests")}</h3>
    {!requests.length ? <p className="muted-line">{uiText(locale, "Aucune demande d’agent à afficher.", "No agent requests to display.")}</p> : null}
    {requests.map(request => <article className="form-section stack" key={request.id}><strong>{request.horse_name} · {request.requester_name}</strong><p>{status(request.status)}</p>{request.message ? <p>{request.message}</p> : null}
      {request.status === "pending" ? <div className="row-actions">{request.can_review ? <><button className="primary-button" disabled={busy} type="button" onClick={() => void run(() => billingRpc("decide_horse_agent_request", { p_request: request.id, p_action: "approve" }), uiText(locale, "Accès d’agent approuvé.", "Agent access approved."))}>{uiText(locale, "Approuver l’accès d’agent", "Approve agent access")}</button><button className="ghost-button" disabled={busy} type="button" onClick={() => void run(() => billingRpc("decide_horse_agent_request", { p_request: request.id, p_action: "reject" }), uiText(locale, "Demande refusée.", "Request rejected."))}>{uiText(locale, "Refuser", "Reject")}</button></> : null}{request.is_mine ? <button className="ghost-button" disabled={busy} type="button" onClick={() => void run(() => billingRpc("decide_horse_agent_request", { p_request: request.id, p_action: "cancel" }), uiText(locale, "Demande annulée.", "Request cancelled."))}>{uiText(locale, "Annuler ma demande", "Cancel my request")}</button> : null}</div> : null}
    </article>)}
    <h3>{uiText(locale, "Créations de chevaux à confirmer", "Horse creations awaiting confirmation")}</h3>
    {!ownerRequests.length ? <p className="muted-line">{uiText(locale, "Aucune confirmation de propriétaire à afficher.", "No owner confirmations to display.")}</p> : null}
    {ownerRequests.map(request => <article className="form-section stack" key={request.id}><strong>{request.details.name} · {request.owner_first_name} {request.owner_last_name}</strong><p>{request.requester_name} · {status(request.status)}</p>
      {request.status === "pending" && request.can_review ? <>{request.proposed_owner_contact_id ? <p>{uiText(locale, "Propriétaire identifié par son numéro NRHA : ", "Owner identified by NRHA number: ")}<strong>{request.owner_first_name} {request.owner_last_name}</strong></p> : <label>{uiText(locale, "Fiche du propriétaire confirmée", "Confirmed owner record")}<SearchSelect items={contacts.map(contact => ({ id: contact.id, label: contactLabel(contact), detail: [contact.email, contact.phone, contact.date_of_birth].filter(Boolean).join(" · ") }))} placeholder={uiText(locale, "Rechercher le propriétaire confirmé", "Search confirmed owner")} value={owners[request.id] ?? ""} onChange={id => setOwners(current => ({ ...current, [request.id]: id }))} /></label>}<div className="row-actions"><button className="primary-button" disabled={busy || !(request.proposed_owner_contact_id || owners[request.id])} type="button" onClick={() => void run(() => billingRpc("decide_horse_owner_confirmation", { p_request: request.id, p_action: "approve", p_owner: request.proposed_owner_contact_id || owners[request.id] }), uiText(locale, "Propriétaire confirmé et cheval créé.", "Owner confirmed and horse created."))}>{uiText(locale, "Confirmer et créer le cheval", "Confirm and create horse")}</button><button className="ghost-button" disabled={busy} type="button" onClick={() => void run(() => billingRpc("decide_horse_owner_confirmation", { p_request: request.id, p_action: "reject" }), uiText(locale, "Demande refusée.", "Request rejected."))}>{uiText(locale, "Refuser la création", "Reject creation")}</button></div></> : null}
      {request.status === "pending" && request.is_mine ? <div className="row-actions"><button className="ghost-button" disabled={busy} type="button" onClick={() => void run(() => billingRpc("decide_horse_owner_confirmation", { p_request: request.id, p_action: "cancel" }), uiText(locale, "Demande annulée.", "Request cancelled."))}>{uiText(locale, "Annuler cette création", "Cancel this creation")}</button></div> : null}
    </article>)}
  </section>;
}
