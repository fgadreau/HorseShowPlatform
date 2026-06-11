import { ExternalLink, Megaphone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { formatDate, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createShow, createShowAnnouncement, deleteShowAnnouncement, updateShow } from "../../services/supabaseServices";
import type { ClassRecord, Division, Entry, Invoice, Organization, Show, ShowAnnouncement, ShowDay, ShowScoreClassSetup, StallOption } from "../../types/domain";
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
  showAnnouncements,
  showDays,
  showScoreClassSetups,
  shows,
  stallOptions,
  onCreateShow,
  onCreateShowAnnouncement,
  onDeleteShowAnnouncement,
  onUpdateShow,
  onViewChange,
}: {
  locale: Locale;
  classes: ClassRecord[];
  divisions: Division[];
  entries: Entry[];
  invoices: Invoice[];
  organization: Organization | null;
  showAnnouncements: ShowAnnouncement[];
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  shows: Show[];
  stallOptions: StallOption[];
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<Show>;
  onCreateShowAnnouncement: (input: Parameters<typeof createShowAnnouncement>[0]) => Promise<void>;
  onDeleteShowAnnouncement: (id: string) => Promise<void>;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [assistantShow, setAssistantShow] = useState<Show | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [announcementsShow, setAnnouncementsShow] = useState<Show | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [submittingAnnouncement, setSubmittingAnnouncement] = useState(false);

  function openAssistant(show: Show | null = null) {
    setAssistantShow(show);
    setAssistantOpen(true);
  }

  async function handleCreateAnnouncement(e: FormEvent) {
    e.preventDefault();
    if (!organization || !announcementsShow || !announcementTitle.trim() || !announcementBody.trim()) return;
    setSubmittingAnnouncement(true);
    try {
      await onCreateShowAnnouncement({
        organization_id: organization.id,
        show_id: announcementsShow.id,
        title: announcementTitle,
        body: announcementBody,
      });
      setAnnouncementTitle("");
      setAnnouncementBody("");
    } finally {
      setSubmittingAnnouncement(false);
    }
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
          {shows.map((show) => {
            const announcementCount = showAnnouncements.filter((a) => a.show_id === show.id).length;
            return (
              <div className="table-row" key={show.id}>
                <div>
                  <strong>{show.name}</strong>
                  {show.is_public ? (
                    <a className="show-public-link muted-line" href={`/shows/${show.slug}`} rel="noopener noreferrer" target="_blank">
                      <ExternalLink size={12} />
                      {uiText(locale, "Page publique", "Public page")}
                    </a>
                  ) : null}
                </div>
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
                  <button className="text-button" type="button" onClick={() => setAnnouncementsShow(show)}>
                    <Megaphone size={14} />
                    {announcementCount > 0 ? `${announcementCount}` : uiText(locale, "Annonces", "Announcements")}
                  </button>
                </div>
              </div>
            );
          })}
          {!shows.length ? <EmptyState label={uiText(locale, "Crée le premier concours de cette association.", "Create the first show for this organization.")} /> : null}
        </div>
      </section>

      {announcementsShow ? (
        <ModalDialog
          className="announcements-modal"
          description={announcementsShow.name}
          eyebrow={uiText(locale, "Concours", "Show")}
          title={uiText(locale, "Annonces publiques", "Public announcements")}
          onClose={() => setAnnouncementsShow(null)}
        >
          <div className="announcements-modal-body">
            <div className="announcements-list">
              {showAnnouncements.filter((a) => a.show_id === announcementsShow.id).map((a) => (
                <div className="announcement-row" key={a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.body}</p>
                    <time className="muted-line">{formatDate(a.created_at.slice(0, 10))}</time>
                  </div>
                  <button className="icon-button danger-icon" title={uiText(locale, "Supprimer", "Delete")} type="button" onClick={() => onDeleteShowAnnouncement(a.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {!showAnnouncements.filter((a) => a.show_id === announcementsShow.id).length ? (
                <EmptyState label={uiText(locale, "Aucune annonce pour ce concours.", "No announcements for this show.")} />
              ) : null}
            </div>
            <form className="form-grid announcement-form" onSubmit={handleCreateAnnouncement}>
              <h3>{uiText(locale, "Nouvelle annonce", "New announcement")}</h3>
              <div className="form-field">
                <label>{uiText(locale, "Titre", "Title")}</label>
                <input
                  type="text"
                  value={announcementTitle}
                  placeholder={uiText(locale, "ex. Changement d'heure — Dimanche", "e.g. Time change — Sunday")}
                  required
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>{uiText(locale, "Message", "Message")}</label>
                <textarea
                  value={announcementBody}
                  placeholder={uiText(locale, "Détails de l'annonce...", "Announcement details...")}
                  required
                  rows={3}
                  onChange={(e) => setAnnouncementBody(e.target.value)}
                />
              </div>
              <div className="form-actions">
                <button className="primary-button" disabled={submittingAnnouncement || !announcementTitle.trim() || !announcementBody.trim()} type="submit">
                  {submittingAnnouncement ? uiText(locale, "Publication...", "Publishing...") : uiText(locale, "Publier", "Publish")}
                </button>
              </div>
            </form>
          </div>
        </ModalDialog>
      ) : null}

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
