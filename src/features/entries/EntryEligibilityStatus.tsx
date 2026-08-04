import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { evaluateEntryEligibilityRequirements } from "../../services/supabaseServices";
import type { Entry, EntryEligibilityRequirementAssessment, Show } from "../../types/domain";
import { uiText } from "../dashboard/shared";

export function useEntryEligibilityAssessments(entries: Entry[], shows: Show[]) {
  const [assessments, setAssessments] = useState<Record<string, EntryEligibilityRequirementAssessment>>({});
  const entrySignature = useMemo(() => entries.map((entry) => `${entry.id}:${entry.status}:${entry.class_id}:${entry.horse_id}:${entry.rider_contact_id ?? ""}`).join("|"), [entries]);
  const showSignature = useMemo(() => shows.map((show) => `${show.id}:${show.start_date}`).join("|"), [shows]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(entries.map(async (entry) => {
      const show = shows.find((candidate) => candidate.id === entry.show_id);
      try {
        return await evaluateEntryEligibilityRequirements(entry.id, show?.start_date);
      } catch {
        return null;
      }
    })).then((results) => {
      if (cancelled) return;
      setAssessments(Object.fromEntries(results.filter((result): result is EntryEligibilityRequirementAssessment => Boolean(result)).map((result) => [result.entry_id, result])));
    });
    return () => { cancelled = true; };
  }, [entrySignature, showSignature]);

  return assessments;
}

export function EntryEligibilityStatus({ assessment, locale }: {
  assessment?: EntryEligibilityRequirementAssessment;
  locale: Locale;
}) {
  if (!assessment || assessment.status === "not_required") return null;

  const missingLabels = assessment.groups
    .filter((group) => !group.passed)
    .flatMap((group) => group.checks.filter((check) => !check.passed).map((check) => check.label ?? check.requirement_type));
  const label = assessment.status === "compliant"
    ? uiText(locale, "Admissible", "Eligible")
    : assessment.status === "warning"
      ? uiText(locale, "À vérifier", "Review needed")
      : uiText(locale, "Exigences manquantes", "Missing requirements");
  const tone = assessment.status === "compliant" ? "approved" : assessment.status === "warning" ? "warning" : "error";

  return <span className={`badge ${tone}`} title={missingLabels.join(" · ")}>{label}</span>;
}
