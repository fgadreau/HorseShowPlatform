import { useMemo, useState } from "react";
import { NoticeBanner } from "../../components/ui";
import { errorMessage } from "../../lib/display";
import { createEligibilityRequirement, updateEligibilityRequirement } from "../../services/supabaseServices";
import type { DisciplineCredentialIssuer, EligibilityRequirement, ExternalCredentialIssuer, ExternalCredentialProduct, IncentiveProgram, Organization } from "../../types/domain";
import type { Notice } from "../../types/ui";

export function EligibilityRequirementsEditor({
  createdByUserId,
  disciplineCredentialIssuers,
  externalCredentialIssuers,
  externalCredentialProducts,
  inheritedRequirements,
  incentivePrograms,
  organization,
  disciplineIds,
  ownRequirements,
  scopeId,
  scopeType,
  onRefresh,
}: {
  createdByUserId: string;
  disciplineCredentialIssuers: DisciplineCredentialIssuer[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  externalCredentialProducts: ExternalCredentialProduct[];
  inheritedRequirements: EligibilityRequirement[];
  incentivePrograms: IncentiveProgram[];
  organization: Organization;
  disciplineIds: string[];
  ownRequirements: EligibilityRequirement[];
  scopeId: string;
  scopeType: "block" | "class" | "block_template" | "class_template";
  onRefresh: () => Promise<void> | void;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const allowedIssuerIds = useMemo(() => new Set(
    disciplineCredentialIssuers
      .filter((link) => disciplineIds.includes(link.discipline_id) && link.is_active)
      .map((link) => link.external_credential_issuer_id),
  ), [disciplineCredentialIssuers, disciplineIds]);
  const issuers = externalCredentialIssuers.filter((issuer) => allowedIssuerIds.has(issuer.id));
  const insuranceProducts = externalCredentialProducts.filter((product) => allowedIssuerIds.has(product.external_credential_issuer_id) && product.includes_liability_insurance && product.is_active);
  const activeKeys = new Set(ownRequirements.filter((requirement) => requirement.is_active && requirement.is_required).map(requirementKey));
  const insuranceGroup = `${scopeType}-rider-insurance:${scopeId}`;

  async function toggle(template: RequirementTemplate, enabled: boolean) {
    const key = requirementKey(template);
    const existing = ownRequirements.find((requirement) => requirementKey(requirement) === key);
    setBusyKey(key);
    setNotice(null);
    try {
      if (existing) {
        await updateEligibilityRequirement(existing.id, { is_active: enabled, is_required: enabled });
      } else {
        await createEligibilityRequirement({
          organization_id: organization.id,
          scope_type: scopeType,
          block_id: scopeType === "block" ? scopeId : null,
          class_id: scopeType === "class" ? scopeId : null,
          block_template_id: scopeType === "block_template" ? scopeId : null,
          class_template_id: scopeType === "class_template" ? scopeId : null,
          requirement_type: template.requirement_type,
          subject_type: template.subject_type,
          external_credential_issuer_id: template.external_credential_issuer_id,
          credential_product_id: template.credential_product_id,
          credential_type: template.credential_type,
          incentive_program_id: template.incentive_program_id,
          requirement_group_code: template.requirement_group_code,
          match_rule: template.match_rule,
          enforcement_mode: "blocking",
          label: template.label,
          created_by_user_id: createdByUserId,
        });
      }
      setNotice({ tone: "success", message: "Exigence mise à jour." });
      await onRefresh();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusyKey("");
    }
  }

  const templates: RequirementTemplate[] = [
    { requirement_type: "host_membership", subject_type: "rider", external_credential_issuer_id: null, credential_product_id: null, incentive_program_id: null, credential_type: "membership", requirement_group_code: null, match_rule: "all", label: "Carte de membre de l’association pour le cavalier" },
    ...issuers.filter((issuer) => issuer.issuer_type !== "insurance_provider").map((issuer): RequirementTemplate => issuer.issuer_type === "breed_registry"
      ? { requirement_type: "horse_registration", subject_type: "horse", external_credential_issuer_id: issuer.id, credential_product_id: null, incentive_program_id: null, credential_type: "registration", requirement_group_code: null, match_rule: "all", label: `Enregistrement du cheval — ${issuer.name}` }
      : { requirement_type: "external_contact_credential", subject_type: "rider", external_credential_issuer_id: issuer.id, credential_product_id: null, incentive_program_id: null, credential_type: "membership", requirement_group_code: null, match_rule: "all", label: `Adhésion du cavalier — ${issuer.name}` }),
    ...((scopeType === "class" || scopeType === "class_template")
      ? incentivePrograms.filter((program) => program.organization_id === organization.id && program.is_active).map((program): RequirementTemplate => ({
          requirement_type: "program_nomination",
          subject_type: "horse",
          external_credential_issuer_id: null,
          credential_product_id: null,
          incentive_program_id: program.id,
          credential_type: null,
          requirement_group_code: null,
          match_rule: "all",
          label: `Nomination obligatoire — ${program.name_fr}`,
        }))
      : []),
  ];

  return <div className="stack">
    {notice ? <NoticeBanner notice={notice} /> : null}
    <fieldset className="stack nested-fieldset">
      <legend>Exigences héritées</legend>
      {inheritedRequirements.filter((requirement) => requirement.is_active && requirement.is_required).map((requirement) => <div className="check-row" key={requirement.id}><span>🔒 {requirement.label ?? requirement.requirement_type}</span><small>{scopeLabel(requirement.scope_type)}</small></div>)}
      {!inheritedRequirements.some((requirement) => requirement.is_active && requirement.is_required) ? <span className="muted-line">Aucune exigence héritée.</span> : null}
    </fieldset>
    <fieldset className="stack nested-fieldset">
      <legend>{scopeType === "block" || scopeType === "block_template" ? "Exigences communes à toutes les inscriptions du bloc" : "Exigences supplémentaires de cette classe"}</legend>
      {templates.map((template) => <label className="check-row" key={requirementKey(template)}><input checked={activeKeys.has(requirementKey(template))} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void toggle(template, event.target.checked)} /><span>{template.label}</span></label>)}
    </fieldset>
    <fieldset className="stack nested-fieldset">
      <legend>Options acceptées pour l’assurance</legend>
      {insuranceProducts.map((product) => {
        const issuer = externalCredentialIssuers.find((candidate) => candidate.id === product.external_credential_issuer_id);
        const template: RequirementTemplate = { requirement_type: "rider_insurance", subject_type: "rider", external_credential_issuer_id: product.external_credential_issuer_id, credential_product_id: product.id, incentive_program_id: null, credential_type: "membership", requirement_group_code: insuranceGroup, match_rule: "at_least_one", label: `${issuer?.name ?? "Organisme"} — ${product.name}` };
        return <label className="check-row" key={product.id}><input checked={activeKeys.has(requirementKey(template))} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void toggle(template, event.target.checked)} /><span>{template.label}</span></label>;
      })}
      {(() => {
        const template: RequirementTemplate = { requirement_type: "rider_insurance", subject_type: "rider", external_credential_issuer_id: null, credential_product_id: null, incentive_program_id: null, credential_type: "insurance", requirement_group_code: insuranceGroup, match_rule: "at_least_one", label: "Preuve d’assurance personnelle approuvée" };
        return <label className="check-row"><input checked={activeKeys.has(requirementKey(template))} disabled={Boolean(busyKey)} type="checkbox" onChange={(event) => void toggle(template, event.target.checked)} /><span>{template.label}</span></label>;
      })()}
      <span className="input-help">Les options cochées dans ce groupe sont alternatives : une seule preuve valide suffit.</span>
    </fieldset>
  </div>;
}

type RequirementTemplate = Pick<EligibilityRequirement, "requirement_type" | "subject_type" | "external_credential_issuer_id" | "credential_product_id" | "incentive_program_id" | "credential_type" | "requirement_group_code" | "match_rule" | "label">;

function requirementKey(requirement: RequirementTemplate) {
  return [requirement.requirement_type, requirement.subject_type, requirement.external_credential_issuer_id ?? "", requirement.credential_product_id ?? "", requirement.incentive_program_id ?? "", requirement.requirement_group_code ?? ""].join(":");
}

function scopeLabel(scope: EligibilityRequirement["scope_type"]) {
  if (scope === "organization_discipline") return "Association / discipline";
  if (scope === "block") return "Bloc";
  return "Classe";
}
