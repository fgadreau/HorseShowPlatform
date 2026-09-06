import { Brand } from "../../components/Brand";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Clock, DollarSign, ExternalLink, MapPin, Shield, Stethoscope, Users } from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/display";
import { fetchPublicShow, type PublicShowContext } from "../../services/supabaseServices";
import type { Block, ClassRecord, PayoutCalculation, PayoutResultSnapshotRow, ShowDay } from "../../types/domain";
import { showScorePatternLabel } from "../classes/showScorePatterns";
import { classScheduleStartLabel, sortScheduleBlocks } from "../classes/classUtils";

function totalAddedMoney(classes: ClassRecord[]) {
  return classes.reduce((sum, d) => sum + (d.added_money ?? 0), 0);
}

function stallPriceRange(stallOptions: PublicShowContext["stallOptions"], currency: string) {
  const prices = stallOptions.filter((s) => s.category === "stall" || s.category === null).map((s) => s.price);
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCurrency(min, currency) : `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
}

function showDateRange(startDate: string, endDate: string) {
  if (startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function ScheduleDay({ day, blocks, classes }: { day: ShowDay; blocks: Block[]; classes: ClassRecord[] }) {
  const dayClasses = sortScheduleBlocks(blocks.filter((block) => block.show_day_id === day.id));

  return (
    <div className="public-schedule-day">
      <div className="public-schedule-day-header">
        <CalendarDays size={16} />
        <strong>{day.day_name ?? formatDate(day.day_date)}</strong>
        <span className="public-schedule-day-date">{formatDate(day.day_date)}</span>
        {day.start_time ? <span className="public-muted">Début {day.start_time.slice(0, 5)}</span> : null}
      </div>
      <div className="public-block-list">
        {dayClasses.map((block) => {
          if (block.block_type !== "competition") {
            return (
              <div className="public-event-block" key={block.id}>
                <Clock size={14} />
                <span>
                  <strong>{block.name}</strong>
                  {[block.display_label, classScheduleStartLabel(block, "fr", blocks)].filter(Boolean).join(" · ")}
                </span>
              </div>
            );
          }

          const blockClasses = classes.filter((d) => d.block_id === block.id);
          const blockAddedMoney = totalAddedMoney(blockClasses);

          return (
            <div className="public-class-block" key={block.id}>
              <div className="public-class-block-header">
                <strong>{block.name}</strong>
                <div className="public-class-block-meta">
                  <span><Clock size={12} />{classScheduleStartLabel(block, "fr", blocks)}</span>
                  {block.pattern ? <span>Pattern {showScorePatternLabel(block.pattern)}</span> : null}
                  {blockAddedMoney > 0 ? <span className="public-money-badge"><DollarSign size={12} />{formatCurrency(blockAddedMoney, "CAD")} added</span> : null}
                </div>
              </div>
              {blockClasses.length > 0 ? (
                <div className="public-classRecord-list">
                  {blockClasses.map((div) => (
                    <div className="public-classRecord-row" key={div.id}>
                      <span>{div.name}</span>
                      <div className="public-classRecord-meta">
                        {div.added_money > 0 ? <span>{formatCurrency(div.added_money, "CAD")}</span> : null}
                        {div.entry_fee != null ? <span>Inscription {formatCurrency(div.entry_fee, "CAD")}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {!dayClasses.length ? <p className="public-muted">Programme à confirmer.</p> : null}
      </div>
    </div>
  );
}

function PublishedResults({
  calculations,
  blocks,
  currency,
  classes,
}: {
  calculations: PayoutCalculation[];
  blocks: Block[];
  currency: string;
  classes: ClassRecord[];
}) {
  const published = calculations.filter((calculation) => calculation.status === "published");

  if (!published.length) {
    return null;
  }

  return (
    <section className="public-section public-results-section">
      <h2>Résultats</h2>
      <div className="public-results-list">
        {published.map((calculation) => {
          const classRecord = classes.find((candidate) => candidate.id === calculation.class_id);
          const block = classRecord ? blocks.find((candidate) => candidate.id === classRecord.block_id) : null;
          const rows = calculation.result_snapshot ?? [];

          return (
            <div className="public-results-card" key={calculation.id}>
              <div className="public-results-card-header">
                <div>
                  <strong>{classRecord ? classRecord.name : "Classe"}</strong>
                  {block ? <span>{block.name}</span> : null}
                </div>
                <span>{formatCurrency(calculation.net_purse, calculation.currency || currency)}</span>
              </div>
              {rows.length ? (
                <div className="public-results-table-wrap">
                  <table className="public-results-table">
                    <thead>
                      <tr>
                        <th>Rang</th>
                        <th>Dossard</th>
                        <th>Cavalier</th>
                        <th>Cheval</th>
                        <th>Score</th>
                        <th>Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: PayoutResultSnapshotRow) => (
                        <tr key={row.entry_id}>
                          <td>{row.rank ?? "-"}</td>
                          <td>{row.back_number ?? "-"}</td>
                          <td>{row.rider_name}</td>
                          <td>{row.horse_name}</td>
                          <td>{row.final_score == null ? resultStatusLabel(row.status) : row.final_score.toFixed(3).replace(/\.?0+$/, "")}</td>
                          <td>{row.payout_amount > 0 ? formatCurrency(row.payout_amount, calculation.currency || currency) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="public-muted">Résultats à confirmer.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PublicShowPage({ slug }: { slug: string }) {
  const [ctx, setCtx] = useState<PublicShowContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchPublicShow(slug)
      .then((result) => {
        if (!result) {
          setNotFound(true);
        } else {
          setCtx(result);
          document.title = `${result.show.name} — Horse Show Platform`;
          setOrUpdateMeta("og:title", result.show.name);
          setOrUpdateMeta("og:description", buildOgDescription(result));
          setOrUpdateMeta("og:type", "event");
          setOrUpdateMeta("twitter:card", "summary");
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="public-loading">
        <div className="public-spinner" />
      </div>
    );
  }

  if (notFound || !ctx) {
    return (
      <div className="public-not-found">
        <AlertTriangle size={40} />
        <h1>Show introuvable</h1>
        <p>Ce show n'existe pas ou n'est pas encore public.</p>
        <a href="/">Retour à l'accueil</a>
      </div>
    );
  }

  const { show, organization, healthPolicy, showDays, blocks, classes, payoutCalculations, stallOptions, announcements, membershipRequirements, externalCredentialIssuers } = ctx;
  const currency = show.default_currency ?? organization.currency ?? "CAD";
  const addedMoneyTotal = totalAddedMoney(classes);
  const stallRange = stallPriceRange(stallOptions, currency);
  const hasHealthRequirement = Boolean(
    healthPolicy
      && (
        healthPolicy.coggins_required
        || healthPolicy.influenza_required
        || healthPolicy.rhino_required
        || healthPolicy.identity_validation_requirement !== "none"
        || healthPolicy.association_review_required
      ),
  );
  const requiredMemberships = membershipRequirements.filter((r) => r.is_required);

  const entriesCloseDate = blocks
    .filter((c) => c.block_type === "competition" && c.entries_close_at)
    .map((c) => c.entries_close_at!)
    .sort()[0] ?? null;

  return (
    <div className="public-show-page">
      <div className="public-brand-bar"><a href="/"><Brand /></a></div>
      <header className="public-show-header">
        <div className="public-show-header-inner">
          <div className="public-org-badge">{organization.name}</div>
          <h1 className="public-show-title">{show.name}</h1>
          <div className="public-show-meta">
            <span><CalendarDays size={16} />{showDateRange(show.start_date, show.end_date)}</span>
            {show.venue ? <span><MapPin size={16} />{show.venue}</span> : null}
            {show.location ? <span><MapPin size={16} />{show.location}</span> : null}
          </div>
          <div className="public-show-stats">
            {addedMoneyTotal > 0 ? (
              <div className="public-stat">
                <DollarSign size={20} />
                <div>
                  <strong>{formatCurrency(addedMoneyTotal, currency)}</strong>
                  <span>Added money total</span>
                </div>
              </div>
            ) : null}
            {stallRange ? (
              <div className="public-stat">
                <span className="public-stat-icon">🏠</span>
                <div>
                  <strong>{stallRange}</strong>
                  <span>Stalles / nuit</span>
                </div>
              </div>
            ) : null}
            <div className="public-stat">
              <CalendarDays size={20} />
              <div>
                <strong>{showDays.length}</strong>
                <span>Journée{showDays.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
            {entriesCloseDate ? (
              <div className="public-stat">
                <Clock size={20} />
                <div>
                  <strong>{formatDate(entriesCloseDate.slice(0, 10))}</strong>
                  <span>Limite inscriptions</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="public-show-main">
        {announcements.length > 0 ? (
          <section className="public-announcements">
            {announcements.map((a) => (
              <div className="public-announcement" key={a.id}>
                <strong>{a.title}</strong>
                <p>{a.body}</p>
                <time>{formatDate(a.created_at.slice(0, 10))}</time>
              </div>
            ))}
          </section>
        ) : null}

        <div className="public-show-grid">
          <section className="public-section public-schedule-section">
            <h2>Programme</h2>
            {showDays.map((day) => (
              <ScheduleDay key={day.id} day={day} blocks={blocks} classes={classes} />
            ))}
            {!showDays.length ? <p className="public-muted">Le programme sera publié prochainement.</p> : null}
          </section>

          <PublishedResults calculations={payoutCalculations} blocks={blocks} currency={currency} classes={classes} />

          <aside className="public-sidebar">
            <section className="public-section">
              <h2>Exigences de participation</h2>
              <ul className="public-requirements-list">
                {hasHealthRequirement ? (
                  <>
                    {healthPolicy?.coggins_required ? (
                      <li className="public-req">
                        <Stethoscope size={16} />
                        <span>
                          {healthPolicy.coggins_validity_rule === "calendar_year"
                            ? <>Coggins requis — test effectué durant <strong>l’année du concours</strong></>
                            : <>Coggins requis — valide pendant <strong>{healthPolicy.coggins_validity_months} mois</strong></>}
                        </span>
                      </li>
                    ) : null}
                    {healthPolicy?.influenza_required ? (
                      <li className="public-req">
                        <Stethoscope size={16} />
                        <span>Vaccination influenza requise — valide pendant <strong>{healthPolicy.vaccine_validity_months} mois</strong></span>
                      </li>
                    ) : null}
                    {healthPolicy?.rhino_required ? (
                      <li className="public-req">
                        <Stethoscope size={16} />
                        <span>Vaccination rhino requise — valide pendant <strong>{healthPolicy.vaccine_validity_months} mois</strong></span>
                      </li>
                    ) : null}
                    {healthPolicy?.combo_vaccine_accepted && healthPolicy.influenza_required && healthPolicy.rhino_required ? (
                      <li className="public-req">
                        <Stethoscope size={16} />
                        <span>Un certificat combiné influenza/rhino est accepté.</span>
                      </li>
                    ) : null}
                    {healthPolicy && healthPolicy.identity_validation_requirement !== "none" ? (
                      <li className="public-req">
                        <Shield size={16} />
                        <span>
                          {healthPolicy.identity_validation_requirement === "verified"
                            ? "L’identité du cheval doit être vérifiée sur les documents."
                            : "L’identité du cheval doit être identifiée sur les documents."}
                        </span>
                      </li>
                    ) : null}
                    {healthPolicy?.association_review_required ? (
                      <li className="public-req">
                        <Shield size={16} />
                        <span>Les documents doivent être approuvés par l’association.</span>
                      </li>
                    ) : null}
                  </>
                ) : null}
                {requiredMemberships.map((req) => {
                  const extOrg = externalCredentialIssuers.find((o) => o.id === req.external_credential_issuer_id);
                  return (
                    <li className="public-req" key={req.id}>
                      <Shield size={16} />
                      <span>Membership <strong>{extOrg?.name ?? req.external_credential_issuer_id}</strong> requis</span>
                    </li>
                  );
                })}
                {!hasHealthRequirement && !requiredMemberships.length ? (
                  <li className="public-req public-req-none">
                    <span>Aucune exigence spéciale pour ce show.</span>
                  </li>
                ) : null}
              </ul>
            </section>

            {show.entry_payment_policy === "card_on_file_preauth" ? (
              <section className="public-section">
                <h2>Paiement</h2>
                <p className="public-policy-text">
                  <Shield size={14} />
                  Carte de crédit requise à l'inscription. La préautorisation est effectuée avant le show.
                </p>
              </section>
            ) : null}

            {stallOptions.length > 0 ? (
              <section className="public-section">
                <h2>Hébergement</h2>
                <ul className="public-stall-list">
                  {stallOptions.map((s) => (
                    <li className="public-stall-row" key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        {s.description ? <p className="public-muted">{s.description}</p> : null}
                      </div>
                      <span className="public-stall-price">{formatCurrency(s.price, currency)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="public-section public-cta-section">
              <h2>Participer</h2>
              <p>Inscrivez-vous en créant votre compte ou en vous connectant.</p>
              <a className="public-cta-button" href="/">
                <Users size={18} />
                S'inscrire au show
              </a>
              {organization.website_url ? (
                <a className="public-org-link" href={organization.website_url} rel="noopener noreferrer" target="_blank">
                  <ExternalLink size={14} />
                  Site de {organization.name}
                </a>
              ) : null}
            </section>
          </aside>
        </div>
      </main>

      <footer className="public-show-footer">
        <span>{organization.name}</span>
        {organization.primary_contact_email ? (
          <a href={`mailto:${organization.primary_contact_email}`}>{organization.primary_contact_email}</a>
        ) : null}
        <span>Propulsé par Horse Show Platform</span>
      </footer>
    </div>
  );
}

function resultStatusLabel(status: PayoutResultSnapshotRow["status"]) {
  switch (status) {
    case "scratch":
      return "Scratch";
    case "no_score":
      return "No score";
    case "disqualified":
      return "DQ";
    case "pending":
      return "En attente";
    case "scored":
    default:
      return "-";
  }
}

function setOrUpdateMeta(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function buildOgDescription(ctx: PublicShowContext) {
  const currency = ctx.show.default_currency ?? ctx.organization.currency ?? "CAD";
  const parts: string[] = [];
  parts.push(showDateRange(ctx.show.start_date, ctx.show.end_date));
  if (ctx.show.venue) parts.push(ctx.show.venue);
  const added = totalAddedMoney(ctx.classes);
  if (added > 0) parts.push(`${formatCurrency(added, currency)} added money`);
  return parts.join(" · ");
}

export { PublicShowPage };
