import { useState } from "react";
import type { FormEvent } from "react";
import { FileText, Shield, Upload } from "lucide-react";
import { NoticeBanner, ViewIntro } from "../../components/ui";
import { errorMessage } from "../../lib/display";
import { parseNrhaRiderRankingPdf } from "../../lib/nrhaRiderRankingsPdf";
import type { Organization } from "../../types/domain";
import type { PlanTier } from "../../types/domain";
import type { NrhaRiderRanking, NrhaRiderRankingListType } from "../../types/domain";
import { replaceNrhaRiderRankings, setOrganizationPlan } from "../../services/supabaseServices";
import { getPlanLabel, PLAN_FEATURES } from "../../utils/planFeatures";
import type { Notice } from "../../types/ui";

const PLAN_OPTIONS: PlanTier[] = ["community", "professional", "premium"];
const NRHA_RIDER_LIST_OPTIONS: Array<{ label: string; value: NrhaRiderRankingListType }> = [
  { label: "Top Professional Riders", value: "top_professional_riders" },
  { label: "Top 200 Non Pro Riders", value: "top_200_non_pro_riders" },
  { label: "Top 200 Lifetime All Riders", value: "top_200_lifetime_all_riders" },
];

export function PlatformAdminView({
  currentUserProfileId,
  nrhaRiderRankings,
  organizations,
  onImportNrhaRiderRankings,
  onRefresh,
}: {
  currentUserProfileId: string | null;
  nrhaRiderRankings: NrhaRiderRanking[];
  organizations: Organization[];
  onImportNrhaRiderRankings: (input: Parameters<typeof replaceNrhaRiderRankings>[0]) => Promise<void>;
  onRefresh: () => void;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [savingOrgId, setSavingOrgId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [eligibilityYear, setEligibilityYear] = useState(String(new Date().getFullYear()));
  const [rankingFile, setRankingFile] = useState<File | null>(null);
  const [rankingListType, setRankingListType] = useState<NrhaRiderRankingListType>("top_professional_riders");
  const [importingRankings, setImportingRankings] = useState(false);

  async function handlePlanChange(org: Organization, plan: PlanTier) {
    setSavingOrgId(org.id);
    setNotice(null);
    try {
      await setOrganizationPlan({
        organizationId: org.id,
        plan,
        expiresAt: org.subscription_expires_at ?? null,
        notes: editingNotes[org.id] ?? org.subscription_notes ?? null,
      });
      setNotice({ tone: "success", message: `${org.name} -> ${getPlanLabel(plan)}` });
      await onRefresh();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setSavingOrgId(null);
    }
  }

  const sortedOrgs = [...organizations].sort((a, b) => a.name.localeCompare(b.name));
  const rankingSummary = summarizeNrhaRankings(nrhaRiderRankings, Number(eligibilityYear));

  async function handleImportRankings(event: FormEvent) {
    event.preventDefault();

    if (!rankingFile) {
      setNotice({ tone: "error", message: "Choisir un PDF NRHA à importer." });
      return;
    }

    const year = Number(eligibilityYear);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setNotice({ tone: "error", message: "Année d'application invalide." });
      return;
    }

    setImportingRankings(true);
    setNotice(null);

    try {
      const parsed = await parseNrhaRiderRankingPdf(rankingFile, rankingListType);
      await onImportNrhaRiderRankings({
        appliesToCategories: [2, 6],
        eligibilityYear: year,
        importedByUserId: currentUserProfileId,
        listType: parsed.listType,
        rows: parsed.rows.map((row) => ({
          earnings: row.earnings,
          rank: row.rank,
          riderName: row.riderName,
          sourcePayload: row.sourcePayload,
        })),
        sourceFileName: parsed.sourceFileName,
        sourceYear: parsed.sourceYear,
      });
      setNotice({ tone: "success", message: `${parsed.rows.length} riders NRHA importés.` });
      setRankingFile(null);
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setImportingRankings(false);
    }
  }

  return (
    <div className="view-container">
      <ViewIntro
        eyebrow="Platform Admin"
        title="Gestion des plans"
        description="Gérer les plans d'abonnement de toutes les organisations."
      />

      {notice ? <NoticeBanner notice={notice} /> : null}

      <section className="span-2" style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h3 style={sectionTitleStyle}>Listes NRHA annuelles</h3>
            <p style={sectionSubtitleStyle}>Catégories 2 et 6</p>
          </div>
          <FileText size={18} style={{ color: "#0f766e" }} />
        </div>

        <form className="form-grid" style={rankingImportGridStyle} onSubmit={handleImportRankings}>
          <label>
            Année d'application
            <input type="number" min="2000" max="2100" value={eligibilityYear} onChange={(event) => setEligibilityYear(event.target.value)} />
          </label>
          <label>
            Liste
            <select value={rankingListType} onChange={(event) => setRankingListType(event.target.value as NrhaRiderRankingListType)}>
              {NRHA_RIDER_LIST_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            PDF NRHA
            <input
              accept="application/pdf,.pdf"
              type="file"
              onChange={(event) => setRankingFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="primary-button" disabled={importingRankings || !rankingFile} type="submit">
            <Upload size={16} />
            {importingRankings ? "Import..." : "Importer"}
          </button>
        </form>

        <div style={rankingSummaryGridStyle}>
          {NRHA_RIDER_LIST_OPTIONS.map((option) => {
            const summary = rankingSummary.get(option.value);

            return (
              <div key={option.value} style={rankingSummaryCardStyle}>
                <span style={rankingSummaryLabelStyle}>{option.label}</span>
                <strong style={rankingSummaryValueStyle}>{summary?.count ?? 0}</strong>
                <small style={rankingSummaryMetaStyle}>
                  {summary?.sourceYear ? `Top ${summary.sourceYear}` : "Aucune source"}
                  {summary?.sourceFileName ? ` · ${summary.sourceFileName}` : ""}
                </small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="span-2">
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Organisation</th>
              <th style={thStyle}>Plan actuel</th>
              <th style={thStyle}>ShowScore</th>
              <th style={thStyle}>Statut</th>
              <th style={thStyle}>Expiration</th>
              <th style={thStyle}>Notes</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedOrgs.map((org) => (
              <OrgRow
                key={org.id}
                org={org}
                isSaving={savingOrgId === org.id}
                notes={editingNotes[org.id] ?? org.subscription_notes ?? ""}
                onPlanChange={(plan) => handlePlanChange(org, plan)}
                onNotesChange={(value) => setEditingNotes((prev) => ({ ...prev, [org.id]: value }))}
              />
            ))}
          </tbody>
        </table>
        {sortedOrgs.length === 0 ? (
          <div style={{ padding: 24, color: "#64748b", textAlign: "center" }}>Aucune organisation</div>
        ) : null}
      </section>

      <section className="span-2">
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 12 }}>Récapitulatif des features par plan</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {PLAN_OPTIONS.map((plan) => (
            <div key={plan} style={planCardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Shield size={16} style={{ color: planColor(plan) }} />
                <strong style={{ color: planColor(plan) }}>{getPlanLabel(plan)}</strong>
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
                {PLAN_FEATURES[plan].map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OrgRow({
  org,
  isSaving,
  notes,
  onPlanChange,
  onNotesChange,
}: {
  org: Organization;
  isSaving: boolean;
  notes: string;
  onPlanChange: (plan: PlanTier) => void;
  onNotesChange: (value: string) => void;
}) {
  const showScoreEnabled = Boolean(org.modules_enabled?.show_score);
  const plan = org.subscription_plan as PlanTier;

  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      <td style={tdStyle}>
        <div style={{ fontWeight: 600, color: "#111827" }}>{org.name}</div>
        {org.short_name ? <div style={{ fontSize: 12, color: "#94a3b8" }}>{org.short_name}</div> : null}
      </td>
      <td style={tdStyle}>
        <span style={{ ...planBadgeStyle, background: planBgColor(plan), color: planColor(plan) }}>
          {getPlanLabel(plan)}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: showScoreEnabled ? "#047857" : "#64748b" }}>
          {showScoreEnabled ? "Oui" : "Non"}
        </span>
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: 12, color: "#64748b" }}>{org.subscription_status}</span>
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {org.subscription_expires_at
            ? new Date(org.subscription_expires_at).toLocaleDateString("fr-CA")
            : "-"}
        </span>
      </td>
      <td style={tdStyle}>
        <input
          type="text"
          value={notes}
          placeholder="Notes internes..."
          disabled={isSaving}
          style={notesInputStyle}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </td>
      <td style={tdStyle}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PLAN_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={isSaving || plan === p}
              style={{
                ...planButtonStyle,
                opacity: plan === p ? 0.4 : 1,
                background: planBgColor(p),
                color: planColor(p),
                border: `1px solid ${planColor(p)}`,
              }}
              onClick={() => onPlanChange(p)}
            >
              {getPlanLabel(p)}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

function summarizeNrhaRankings(rankings: NrhaRiderRanking[], eligibilityYear: number) {
  const summary = new Map<NrhaRiderRankingListType, { count: number; sourceFileName: string | null; sourceYear: number | null }>();

  for (const ranking of rankings) {
    if (ranking.eligibility_year !== eligibilityYear) {
      continue;
    }

    const current = summary.get(ranking.list_type) ?? {
      count: 0,
      sourceFileName: ranking.source_file_name,
      sourceYear: ranking.source_year,
    };

    current.count += 1;
    current.sourceFileName = current.sourceFileName ?? ranking.source_file_name;
    current.sourceYear = current.sourceYear ?? ranking.source_year;
    summary.set(ranking.list_type, current);
  }

  return summary;
}

function planColor(plan: PlanTier) {
  if (plan === "premium") return "#7c3aed";
  if (plan === "professional") return "#0284c7";
  return "#64748b";
}

function planBgColor(plan: PlanTier) {
  if (plan === "premium") return "#ede9fe";
  if (plan === "professional") return "#e0f2fe";
  return "#f8fafc";
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

const planBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
};

const planButtonStyle: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const notesInputStyle: React.CSSProperties = {
  width: 140,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  color: "#374151",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #dbe7e2",
  borderRadius: 8,
  padding: 16,
  background: "#fbfdfc",
};

const sectionHeaderStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#17231f",
  fontSize: 16,
  fontWeight: 700,
  margin: 0,
};

const sectionSubtitleStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  margin: "2px 0 0",
};

const rankingImportGridStyle: React.CSSProperties = {
  alignItems: "end",
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  marginBottom: 14,
};

const rankingSummaryGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const rankingSummaryCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  minWidth: 0,
  padding: 12,
  background: "#ffffff",
};

const rankingSummaryLabelStyle: React.CSSProperties = {
  color: "#475569",
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 6,
};

const rankingSummaryValueStyle: React.CSSProperties = {
  color: "#0f766e",
  display: "block",
  fontSize: 24,
  lineHeight: 1,
  marginBottom: 6,
};

const rankingSummaryMetaStyle: React.CSSProperties = {
  color: "#64748b",
  display: "block",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const planCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 16,
  border: "1px solid #e2e8f0",
};
