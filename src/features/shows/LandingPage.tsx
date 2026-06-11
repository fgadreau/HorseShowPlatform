import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, ClipboardList, LogIn, MapPin } from "lucide-react";
import { formatDate } from "../../lib/display";
import { fetchPublicShows, type PublicShowSummary } from "../../services/supabaseServices";

function showLocation(show: PublicShowSummary) {
  return [show.city, show.state].filter(Boolean).join(", ") || show.location || null;
}

function showDateRange(start: string, end: string) {
  if (start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function ShowCard({ show }: { show: PublicShowSummary }) {
  return (
    <a className="landing-show-card" href={`/shows/${show.slug}`}>
      <div className="landing-show-card-org">{show.organization_name}</div>
      <div className="landing-show-card-name">{show.name}</div>
      <div className="landing-show-card-meta">
        <span>
          <CalendarDays size={13} />
          {showDateRange(show.start_date, show.end_date)}
        </span>
        {showLocation(show) ? (
          <span>
            <MapPin size={13} />
            {showLocation(show)}
          </span>
        ) : null}
      </div>
    </a>
  );
}

export function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  const [shows, setShows] = useState<PublicShowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pastOpen, setPastOpen] = useState(false);

  useEffect(() => {
    fetchPublicShows()
      .then(setShows)
      .catch(() => setShows([]))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = shows.filter((s) => s.end_date >= today);
  const past = shows.filter((s) => s.end_date < today).reverse();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-brand">
            <div className="landing-brand-mark">
              <ClipboardList size={22} />
            </div>
            <span className="landing-brand-name">ShowPlatform</span>
          </div>
          <button className="primary-button landing-signin-btn" type="button" onClick={onSignIn}>
            <LogIn size={16} />
            Se connecter
          </button>
        </div>
      </header>

      <div className="landing-hero">
        <h1 className="landing-hero-title">Concours à venir</h1>
        <p className="landing-hero-sub">Inscris-toi à un concours ou consulte le programme.</p>
      </div>

      <main className="landing-main">
        {loading ? (
          <div className="landing-loading">
            <div className="public-spinner" />
          </div>
        ) : upcoming.length === 0 && past.length === 0 ? (
          <p className="landing-empty">Aucun concours publié pour l'instant.</p>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <p className="landing-empty">Aucun concours à venir.</p>
            ) : (
              <div className="landing-show-list">
                {upcoming.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            )}

            {past.length > 0 ? (
              <div className="landing-past-section">
                <button
                  className="landing-past-toggle"
                  type="button"
                  onClick={() => setPastOpen((o) => !o)}
                >
                  <ChevronDown size={16} className={pastOpen ? "landing-chevron-open" : ""} />
                  Concours passés ({past.length})
                </button>
                {pastOpen ? (
                  <div className="landing-show-list landing-show-list-past">
                    {past.map((show) => (
                      <ShowCard key={show.id} show={show} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </main>

      <footer className="landing-footer">
        <p>
          Tu organises des concours ?{" "}
          <button className="landing-link" type="button" onClick={onSignIn}>
            Crée un compte organisateur
          </button>
        </p>
      </footer>
    </div>
  );
}
