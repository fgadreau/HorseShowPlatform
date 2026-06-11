import { Plus } from "lucide-react";
import { useState } from "react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { formatDate, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createShow, updateShow } from "../../services/supabaseServices";
import type { ClassRecord, Division, Entry, Invoice, Organization, Show, ShowDay, ShowScoreClassSetup, StallOption } from "../../types/domain";
import type { ViewKey } from "../../types/ui";
import { uiText } from "../dashboard/shared";
import { showPaymentSummary } from "../classes/classUtils";
import { ShowAssistant } from "./ShowAssistant";
import { ShowEditForm } from "./ShowEditForm";

function ShowsView({
  locale,
  classes,
  divisions,
  entries,
  invoices,
  organization,
  showDays,
  showScoreClassSetups,
  shows,
  stallOptions,
  onCreateShow,
  onUpdateShow,
  onViewChange,
}: {
  locale: Locale;
  classes: ClassRecord[];
  divisions: Division[];
  entries: Entry[];
  invoices: Invoice[];
  organization: Organization | null;
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  shows: Show[];
  stallOptions: StallOption[];
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<Show>;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [assistantShow, setAssistantShow] = useState<Show | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  function openAssistant(show: Show | null = null) {
    setAssistantShow(show);
    setAssistantOpen(true);
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Calendrier", "Calendar")}
        title={uiText(locale, "Concours", "Shows")}
        description={uiText(locale, "Planifie les concours, leurs dates et leur statut public avant d'ouvrir les inscriptions.", "Plan shows, dates and public status before opening entries.")}
        stats={[
          { label: uiText(locale, "Concours", "Shows"), value: String(shows.length) },
          { label: uiText(locale, "Ouverts", "Open"), value: String(shows.filter((show) => show.status === "open").length) },
        ]}
      />

      <section className="panel show-command-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Créer un concours", "Create a show")}</h2>
            <p>{organization ? uiText(locale, "Démarre un brouillon, puis complète la préparation quand tu veux.", "Start a draft, then finish readiness when you are ready.") : uiText(locale, "Crée une association d'abord.", "Create an organization first.")}</p>
          </div>
        </div>
        <button className="primary-button" disabled={!organization} type="button" onClick={() => openAssistant()}>
          <Plus size={18} />
          {uiText(locale, "Créer un concours", "Create show")}
        </button>
      </section>

      {editingShow ? (
        <ShowEditForm
          locale={locale}
          show={editingShow}
          onCancel={() => setEditingShow(null)}
          onUpdateShow={async (id, input) => {
            await onUpdateShow(id, input);
            setEditingShow(null);
          }}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Concours", "Shows")}</h2>
            <p>{shows.length ? uiText(locale, `${shows.length} concours dans cette association.`, `${shows.length} show${shows.length === 1 ? "" : "s"} in this organization.`) : uiText(locale, "Aucun concours pour l'instant.", "No shows yet.")}</p>
          </div>
        </div>
        <div className="table shows-table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Nom", "Name")}</span>
            <span>Dates</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>Action</span>
          </div>
          {shows.map((show) => (
            <div className="table-row" key={show.id}>
              <strong>{show.name}</strong>
              <span>
                {formatDate(show.start_date)} - {formatDate(show.end_date)}
              </span>
              <div>
                <span className={`badge ${show.status}`}>{show.status}</span>
                <span className="muted-line">{showPaymentSummary(show)}</span>
              </div>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => openAssistant(show)}>
                  {show.status === "draft" ? uiText(locale, "Continuer", "Continue") : uiText(locale, "Checklist", "Checklist")}
                </button>
                <button className="text-button" type="button" onClick={() => setEditingShow(show)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
              </div>
            </div>
          ))}
          {!shows.length ? <EmptyState label={uiText(locale, "Crée le premier concours de cette association.", "Create the first show for this organization.")} /> : null}
        </div>
      </section>

      {assistantOpen ? (
        <ShowAssistant
          locale={locale}
          classes={classes}
          divisions={divisions}
          entries={entries}
          initialShow={assistantShow}
          invoices={invoices}
          organization={organization}
          showDays={showDays}
          showScoreClassSetups={showScoreClassSetups}
          stallOptions={stallOptions}
          onClose={() => setAssistantOpen(false)}
          onCreateShow={onCreateShow}
          onUpdateShow={onUpdateShow}
          onViewChange={(view) => {
            setAssistantOpen(false);
            onViewChange(view);
          }}
        />
      ) : null}
    </div>
  );
}

export { ShowsView };
