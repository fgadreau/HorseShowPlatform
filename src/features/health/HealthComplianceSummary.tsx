import { useEffect, useState } from "react";
import { errorMessage, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { listHorseHealthCompliance } from "../../services/supabaseServices";
import type { HorseHealthComplianceOverview, HorseHealthComplianceReason, HorseHealthComplianceStatus } from "../../types/domain";
import { uiText } from "../dashboard/shared";

export type HealthComplianceTone = "success" | "warning" | "error" | "neutral";

export function healthComplianceTone(status: HorseHealthComplianceStatus): HealthComplianceTone {
  if (status === "compliant" || status === "not_required") {
    return "success";
  }

  if (status === "pending_review") {
    return "warning";
  }

  return "error";
}

export function healthComplianceStatusLabel(status: HorseHealthComplianceStatus, locale: Locale) {
  if (status === "compliant") {
    return uiText(locale, "À jour", "Up to date");
  }
  if (status === "not_required") {
    return uiText(locale, "Aucun document requis", "No document required");
  }
  if (status === "pending_review") {
    return uiText(locale, "En attente", "Pending");
  }
  return uiText(locale, "Mise à jour requise", "Update required");
}

function requirementLabel(requirement: HorseHealthComplianceReason["requirement"], locale: Locale) {
  if (requirement === "coggins") {
    return "Coggins";
  }
  if (requirement === "influenza") {
    return uiText(locale, "Influenza", "Influenza");
  }
  return uiText(locale, "Rhino", "Rhino");
}

export function healthComplianceReasonLabel(reason: HorseHealthComplianceReason, locale: Locale) {
  const requirement = requirementLabel(reason.requirement, locale);
  if (reason.status === "missing") {
    return uiText(locale, `${requirement} : document manquant`, `${requirement}: missing document`);
  }
  if (reason.status === "missing_date") {
    return uiText(locale, `${requirement} : date absente`, `${requirement}: missing date`);
  }
  if (reason.status === "future_date") {
    return uiText(locale, `${requirement} : date postérieure au concours`, `${requirement}: date is after the show`);
  }
  if (reason.status === "expired") {
    return reason.expires_on
      ? uiText(locale, `${requirement} : expiré le ${formatDate(reason.expires_on)}`, `${requirement}: expired ${formatDate(reason.expires_on)}`)
      : uiText(locale, `${requirement} : expiré`, `${requirement}: expired`);
  }
  if (reason.status === "rejected") {
    return uiText(locale, `${requirement} : document rejeté`, `${requirement}: document rejected`);
  }
  if (reason.status === "identity_pending") {
    return uiText(locale, `${requirement} : identité à confirmer`, `${requirement}: identity confirmation pending`);
  }
  if (reason.status === "identity_mismatch") {
    return uiText(locale, `${requirement} : identité différente`, `${requirement}: identity mismatch`);
  }
  if (reason.status === "review_pending") {
    return uiText(locale, `${requirement} : révision de l'association requise`, `${requirement}: association review required`);
  }
  if (reason.status === "review_rejected") {
    return uiText(locale, `${requirement} : refusé par l'association`, `${requirement}: rejected by association`);
  }
  return uiText(locale, `${requirement} : ${reason.status}`, `${requirement}: ${reason.status}`);
}

export function healthComplianceReasonSummary(result: HorseHealthComplianceOverview, locale: Locale) {
  if (!result.reasons.length) {
    return result.compliance_status === "not_required"
      ? uiText(locale, "Cette association ne demande aucun document santé.", "This association does not require health documents.")
      : uiText(locale, "Toutes les exigences sont satisfaites.", "All requirements are satisfied.");
  }

  return result.reasons.map((reason) => healthComplianceReasonLabel(reason, locale)).join(" · ");
}

export function useHorseHealthComplianceOverview(input: {
  horseIds: string[];
  organizationId?: string;
  referenceDate: string;
  refreshToken?: string;
}) {
  const [results, setResults] = useState<HorseHealthComplianceOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const horseIdsKey = input.horseIds.join("|");

  useEffect(() => {
    let cancelled = false;

    if (!input.organizationId && !input.horseIds.length) {
      setResults([]);
      setError("");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError("");
    const horseIdBatches = input.horseIds.length
      ? Array.from({ length: Math.ceil(input.horseIds.length / 100) }, (_, index) => input.horseIds.slice(index * 100, (index + 1) * 100))
      : [[]];

    void Promise.all(
      horseIdBatches.map((horseIds) =>
        listHorseHealthCompliance({
          horse_ids: horseIds,
          organization_id: input.organizationId,
          reference_date: input.referenceDate,
        }),
      ),
    )
      .then((batchResults) => {
        if (!cancelled) {
          setResults(batchResults.flat());
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setResults([]);
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [horseIdsKey, input.organizationId, input.referenceDate, input.refreshToken]);

  return { error, loading, results };
}

export function HorseAssociationComplianceGroups({
  locale,
  results,
}: {
  locale: Locale;
  results: HorseHealthComplianceOverview[];
}) {
  const groups = [
    {
      key: "current",
      label: uiText(locale, "À jour", "Up to date"),
      tone: "success" as const,
      results: results.filter((result) => result.compliance_status === "compliant" || result.compliance_status === "not_required"),
    },
    {
      key: "pending",
      label: uiText(locale, "En attente", "Pending"),
      tone: "warning" as const,
      results: results.filter((result) => result.compliance_status === "pending_review"),
    },
    {
      key: "required",
      label: uiText(locale, "Mise à jour requise", "Update required"),
      tone: "error" as const,
      results: results.filter((result) => result.compliance_status === "non_compliant"),
    },
  ].filter((group) => group.results.length);

  if (!groups.length) {
    return <span className="muted-line">{uiText(locale, "Aucune association liée.", "No linked association.")}</span>;
  }

  return (
    <div className="health-association-groups">
      {groups.map((group) => (
        <div className="health-association-group" key={group.key}>
          <span className={`health-association-group-label ${group.tone}`}>{group.label}</span>
          <div className="horse-chip-row">
            {group.results.map((result) => (
              <span
                className={`horse-status-chip ${group.tone}`}
                key={result.organization_id}
                title={healthComplianceReasonSummary(result, locale)}
              >
                <strong>{result.organization_short_name || result.organization_name}</strong>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
