import { useEffect, useMemo, useState } from "react";
import { NoticeBanner } from "../../components/ui";
import { errorMessage } from "../../lib/display";
import {
  configureOrganizationDiscipline,
  createEligibilityRequirement,
  setOrganizationDisciplineGoverningBody,
  updateEligibilityRequirement,
  type AppContext,
} from "../../services/supabaseServices";
import type { EligibilityRequirement, Organization } from "../../types/domain";
import type { Notice } from "../../types/ui";

export function DisciplineRequirementsSettings({ context, organization, onRefresh }: {
  context: AppContext;
  organization: Organization;
  onRefresh: () => void;
}) {
  const directories = context.organizationDisciplines.filter((directory) => directory.organization_id === organization.id && directory.is_active);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState(directories[0]?.id ?? "");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    if (!directories.some((directory) => directory.id === selectedDirectoryId)) {
      setSelectedDirectoryId(directories[0]?.id ?? "");
    }
  }, [directories, selectedDirectoryId]);

  const selectedDirectory = directories.find((directory) => directory.id === selectedDirectoryId) ?? null;
  const selectedDiscipline = context.disciplines.find((discipline) => discipline.id === selectedDirectory?.discipline_id) ?? null;
  const requirements = context.eligibilityRequirements.filter((requirement) => requirement.organization_id === organization.id);
  const directoryRequirements = requirements.filter((requirement) => requirement.organization_discipline_id === selectedDirectoryId);
  const allowedBodyIds = new Set(context.disciplineGoverningBodies.filter((link) => link.discipline_id === selectedDiscipline?.id && link.is_active).map((link) => link.governing_body_id));
  const allowedIssuerIds = new Set(context.disciplineCredentialIssuers.filter((link) => link.discipline_id === selectedDiscipline?.id && link.is_active).map((link) => link.external_credential_issuer_id));
  const selectedBodyIds = new Set(context.organizationDisciplineGoverningBodies.filter((link) => link.organization_discipline_id === selectedDirectoryId && link.is_active).map((link) => link.governing_body_id));
  const availableBodies = context.sanctioningBodies.filter((body) => allowedBodyIds.has(body.id));
  const availableIssuers = context.externalCredentialIssuers.filter((issuer) => allowedIssuerIds.has(issuer.id));
  const insuranceProducts = context.externalCredentialProducts.filter((product) => allowedIssuerIds.has(product.external_credential_issuer_id) && product.includes_liability_insurance && product.is_active);
  const hostRequirement = directoryRequirements.find((requirement) => requirement.requirement_type === "host_membership" && requirement.subject_type === "rider");

  const activeRequirementKeys = useMemo(() => new Set(directoryRequirements.filter((requirement) => requirement.is_active && requirement.is_required).map(requirementKey)), [directoryRequirements]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusyKey(key);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", message: success });
      await onRefresh();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusyKey("");
    }
  }

  async function toggleDirectory(disciplineId: string, active: boolean) {
    const current = directories.find((directory) => directory.discipline_id === disciplineId);
    await run(`directory:${disciplineId}`, () => configureOrganizationDiscipline({
      organization_id: organization.id,
      discipline_id: disciplineId,
      is_active: active,
      is_default: active && (!directories.length || current?.is_default),
      requires_host_membership: true,
    }), "Répertoire mis à jour.");
  }

  async function setDefaultDirectory(disciplineId: string) {
    await run(`default:${disciplineId}`, () => configureOrganizationDiscipline({
      organization_id: organization.id,
      discipline_id: disciplineId,
      is_active: true,
      is_default: true,
      requires_host_membership: requirements.some((requirement) => requirement.organization_discipline_id === directories.find((directory) => directory.discipline_id === disciplineId)?.id && requirement.requirement_type === "host_membership" && requirement.is_active),
    }), "Répertoire par défaut mis à jour.");
  }

  async function toggleHostMembership(enabled: boolean) {
    if (!selectedDirectory) return;
    await run("host", () => configureOrganizationDiscipline({
      organization_id: organization.id,
      discipline_id: selectedDirectory.discipline_id,
      is_active: true,
      is_default: selectedDirectory.is_default,
      requires_host_membership: enabled,
    }), "Exigence maison mise à jour.");
  }

  async function toggleRequirement(template: RequirementTemplate, enabled: boolean) {
    if (!selectedDirectory) return;
    const existing = directoryRequirements.find((requirement) => requirementKey(requirement) === requirementKey(template));
    const key = requirementKey(template);
    await run(key, () => existing
      ? updateEligibilityRequirement(existing.id, { is_active: enabled, is_required: enabled })
      : createEligibilityRequirement({
          organization_id: organization.id,
          scope_type: "organization_discipline",
          organization_discipline_id: selectedDirectory.id,
          requirement_type: template.requirement_type,
          subject_type: template.subject_type,
          external_credential_issuer_id: template.external_credential_issuer_id,
          credential_product_id: template.credential_product_id,
          credential_type: template.credential_type,
          requirement_group_code: template.requirement_group_code,
          match_rule: template.match_rule,
          label: template.label,
          enforcement_mode: "blocking",
          created_by_user_id: context.profile.id,
        }), "Exigence mise à jour.");
  }

  return (
    <section className="panel span-2">
      <div className="panel-header"><div><h2>Disciplines et admissibilité</h2><p>L’association choisit ses exigences parmi les options rendues disponibles par le Platform Admin.</p></div></div>
      {notice ? <NoticeBanner notice={notice} /> : null}

      <fieldset className="stack nested-fieldset">
        <legend>Répertoires de l’association</legend>
        {context.disciplines.map((discipline) => {
          const directory = directories.find((candidate) => candidate.discipline_id === discipline.id);
          return <div className="row-actions" key={discipline.id}>
            <label className="check-row"><input checked={Boolean(directory)} disabled={Boolean(busyKey) || (Boolean(directory) && directories.length === 1)} type="checkbox" onChange={(event) => void toggleDirectory(discipline.id, event.target.checked)} /><span>{discipline.name}</span></label>
            {directory ? <label className="check-row"><input checked={directory.is_default} disabled={Boolean(busyKey)} name="default-directory" type="radio" onChange={() => void setDefaultDirectory(discipline.id)} /><span>Par défaut</span></label> : null}
          </div>;
        })}
      </fieldset>

      {directories.length ? <label>Configurer le répertoire
        <select value={selectedDirectoryId} onChange={(event) => setSelectedDirectoryId(event.target.value)}>
          {directories.map((directory) => <option key={directory.id} value={directory.id}>{context.disciplines.find((discipline) => discipline.id === directory.discipline_id)?.name ?? "Discipline"}</option>)}
        </select>
      </label> : <p className="muted-line">Active au moins une discipline pour créer son répertoire.</p>}

      {selectedDirectory ? <div className="stack">
        <fieldset className="stack nested-fieldset">
          <legend>Adhésion maison</legend>
          <label className="check-row"><input checked={Boolean(hostRequirement?.is_active && hostRequirement.is_required)} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void toggleHostMembership(event.target.checked)} /><span>Exiger une carte de membre active de {organization.name} pour le cavalier</span></label>
        </fieldset>

        <fieldset className="stack nested-fieldset">
          <legend>Organismes sanctionneurs disponibles pour les classes</legend>
          {availableBodies.map((body) => <label className="check-row" key={body.id}><input checked={selectedBodyIds.has(body.id)} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void run(`body:${body.id}`, () => setOrganizationDisciplineGoverningBody({ organization_discipline_id: selectedDirectory.id, governing_body_id: body.id, is_active: event.target.checked, created_by_user_id: context.profile.id }), "Organisme disponible mis à jour.")} /><span>{body.name}</span></label>)}
          {!availableBodies.length ? <span className="muted-line">Aucun organisme sanctionneur compatible configuré par le Platform Admin.</span> : null}
        </fieldset>

        <fieldset className="stack nested-fieldset">
          <legend>Adhésions et enregistrements exigés par défaut</legend>
          {availableIssuers.filter((issuer) => issuer.issuer_type !== "insurance_provider").map((issuer) => {
            const template: RequirementTemplate = issuer.issuer_type === "breed_registry"
              ? { requirement_type: "horse_registration", subject_type: "horse", external_credential_issuer_id: issuer.id, credential_product_id: null, credential_type: "registration", requirement_group_code: null, match_rule: "all", label: `Enregistrement du cheval — ${issuer.name}` }
              : { requirement_type: "external_contact_credential", subject_type: "rider", external_credential_issuer_id: issuer.id, credential_product_id: null, credential_type: "membership", requirement_group_code: null, match_rule: "all", label: `Adhésion du cavalier — ${issuer.name}` };
            return <label className="check-row" key={issuer.id}><input checked={activeRequirementKeys.has(requirementKey(template))} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void toggleRequirement(template, event.target.checked)} /><span>{template.label}</span></label>;
          })}
          {!availableIssuers.length ? <span className="muted-line">Aucun organisme émetteur compatible configuré pour cette discipline.</span> : null}
        </fieldset>

        <fieldset className="stack nested-fieldset">
          <legend>Preuve d’assurance du cavalier — options acceptées</legend>
          {insuranceProducts.map((product) => {
            const issuer = context.externalCredentialIssuers.find((candidate) => candidate.id === product.external_credential_issuer_id);
            const template: RequirementTemplate = { requirement_type: "rider_insurance", subject_type: "rider", external_credential_issuer_id: product.external_credential_issuer_id, credential_product_id: product.id, credential_type: "membership", requirement_group_code: `rider-insurance:${selectedDirectory.id}`, match_rule: "at_least_one", label: `${issuer?.name ?? "Organisme"} — ${product.name}` };
            return <label className="check-row" key={product.id}><input checked={activeRequirementKeys.has(requirementKey(template))} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void toggleRequirement(template, event.target.checked)} /><span>{template.label}</span></label>;
          })}
          {(() => {
            const template: RequirementTemplate = { requirement_type: "rider_insurance", subject_type: "rider", external_credential_issuer_id: null, credential_product_id: null, credential_type: "insurance", requirement_group_code: `rider-insurance:${selectedDirectory.id}`, match_rule: "at_least_one", label: "Preuve d’assurance personnelle approuvée" };
            return <label className="check-row"><input checked={activeRequirementKeys.has(requirementKey(template))} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void toggleRequirement(template, event.target.checked)} /><span>{template.label}</span></label>;
          })()}
          <span className="input-help">Lorsqu’il y a plusieurs options cochées, une seule preuve valide suffit.</span>
        </fieldset>
      </div> : null}
    </section>
  );
}

type RequirementTemplate = Pick<EligibilityRequirement, "requirement_type" | "subject_type" | "external_credential_issuer_id" | "credential_product_id" | "credential_type" | "requirement_group_code" | "match_rule" | "label">;

function requirementKey(requirement: RequirementTemplate) {
  return [requirement.requirement_type, requirement.subject_type, requirement.external_credential_issuer_id ?? "", requirement.credential_product_id ?? "", requirement.requirement_group_code ?? ""].join(":");
}
