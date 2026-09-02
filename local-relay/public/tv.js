const elements = {
  associationLogo: document.querySelector("#association-logo"),
  centerLogo: document.querySelector("#center-logo"),
  competitionLogo: document.querySelector("#competition-logo"),
  showName: document.querySelector("#show-name"),
  showMeta: document.querySelector("#show-meta"),
  arenaBadge: document.querySelector("#arena-badge"),
  centerPanel: document.querySelector("#center-panel"),
  centerKicker: document.querySelector("#center-kicker"),
  centerTitle: document.querySelector("#center-title"),
  centerSubtitle: document.querySelector("#center-subtitle"),
  centerMeta: document.querySelector("#center-meta"),
  livePanel: document.querySelector("#live-panel"),
  classTitle: document.querySelector("#class-title"),
  classSubtitle: document.querySelector("#class-subtitle"),
  currentMeta: document.querySelector("#current-meta"),
  currentTimer: document.querySelector("#current-timer"),
  currentName: document.querySelector("#current-name"),
  currentDetails: document.querySelector("#current-details"),
  currentScore: document.querySelector("#current-score"),
  nextMeta: document.querySelector("#next-meta"),
  nextName: document.querySelector("#next-name"),
  nextDetails: document.querySelector("#next-details"),
  secondMeta: document.querySelector("#second-meta"),
  secondName: document.querySelector("#second-name"),
  secondDetails: document.querySelector("#second-details"),
  previousList: document.querySelector("#previous-list"),
  standingsPanel: document.querySelector("#standings-panel"),
  standingsKicker: document.querySelector("#standings-kicker"),
  standingsTitle: document.querySelector("#standings-title"),
  standingsBlock: document.querySelector("#standings-block"),
  standingsProgress: document.querySelector("#standings-progress"),
  standingsTable: document.querySelector("#standings-table"),
  standingsRows: document.querySelector("#standings-rows"),
  standingsEmpty: document.querySelector("#standings-empty"),
  sponsorRail: document.querySelector("#sponsor-rail"),
  sponsorLevel: document.querySelector("#sponsor-level"),
  sponsorList: document.querySelector("#sponsor-list"),
  competitionPanel: document.querySelector("#competition-panel"),
  competitionVideo: document.querySelector("#competition-video"),
  competitionFallback: document.querySelector("#competition-fallback"),
  competitionMediaStatus: document.querySelector("#competition-media-status"),
  competitionShow: document.querySelector("#competition-show"),
  competitionArena: document.querySelector("#competition-arena"),
  competitionStatus: document.querySelector("#competition-status"),
  competitionTitle: document.querySelector("#competition-title"),
  competitionCurrent: document.querySelector("#competition-current"),
  competitionCurrentDetails: document.querySelector("#competition-current-details"),
  competitionCurrentScore: document.querySelector("#competition-current-score"),
  competitionNext: document.querySelector("#competition-next"),
  competitionNextDetails: document.querySelector("#competition-next-details"),
  competitionNextScore: document.querySelector("#competition-next-score"),
  competitionLast: document.querySelector("#competition-last"),
  competitionLastDetails: document.querySelector("#competition-last-details"),
  competitionLastScore: document.querySelector("#competition-last-score"),
};

const params = new URLSearchParams(location.search);
const selectedArena = String(params.get("arena") || "").trim();
const requestedMode = String(params.get("mode") || "").toLowerCase();
const displayMode = ["competition", "standings"].includes(requestedMode)
  ? requestedMode
  : "general";
let reconnectAttempt = 0;
let reconnectTimer = null;
let currentSnapshot = null;
let sponsorSlides = [];
let sponsorSlideIndex = 0;
let sponsorSignature = "";
let standingsSlides = [];
let standingsSlideIndex = 0;
let standingsSignature = "";
let competitionVideoVersion = "";
let competitionVideoShow = null;

document.body.dataset.tvMode = displayMode;
elements.competitionPanel.hidden = displayMode !== "competition";
elements.standingsPanel.hidden = displayMode !== "standings";

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws/viewer?kind=tv`);

  socket.addEventListener("open", () => { reconnectAttempt = 0; });
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "snapshot" && message.snapshot) {
        currentSnapshot = message.snapshot;
        updateSponsorSlides(currentSnapshot.association?.sponsorGroups || []);
        updateStandingsSlides(currentSnapshot);
        render();
      }
    } catch (error) {
      // Keep the last valid local screen visible.
    }
  });
  socket.addEventListener("close", () => {
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 15000);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  });
}

function render() {
  if (!currentSnapshot) return;
  const association = currentSnapshot.association || {};
  const show = currentSnapshot.show || {};
  const liveItem = pickLiveItem(currentSnapshot, selectedArena);

  renderBrand(association, show);
  renderSponsors();

  if (displayMode === "competition") {
    renderCompetition(association, show, liveItem);
    return;
  }

  if (displayMode === "standings") {
    renderStandings(show);
    return;
  }

  if (show.isTvDisplayPaused) {
    renderCenter({
      state: "paused",
      kicker: "Live en pause / Live paused",
      title: show.tvDisplayMessageFr || "Le live est temporairement en pause.",
      subtitle: show.tvDisplayMessageEn || "The live display is temporarily paused.",
      meta: [association.name, show.venue, show.location].filter(Boolean).join(" · "),
    });
    return;
  }

  if (!liveItem) {
    renderCenter({
      state: "waiting",
      kicker: "Bienvenue à / Welcome to",
      title: show.name || association.name || "ShowScore local",
      subtitle: association.name && association.name !== show.name ? association.name : "",
      meta: [show.venue, show.location].filter(Boolean).join(" · "),
    });
    return;
  }

  renderLive(liveItem);
}

function renderBrand(association, show) {
  elements.showName.textContent = show.name || association.name || "ShowScore local";
  elements.showMeta.textContent = [association.name, show.venue, show.location]
    .filter(Boolean)
    .join(" · ");
  elements.arenaBadge.hidden = !selectedArena;
  elements.arenaBadge.textContent = selectedArena ? `Manège / Arena · ${selectedArena}` : "";
  [elements.associationLogo, elements.centerLogo, elements.competitionLogo].forEach(
    (target) => renderLogo(target, association)
  );
}

function renderLogo(target, association) {
  target.replaceChildren();
  if (association.logoDataUrl) {
    const image = document.createElement("img");
    image.src = association.logoDataUrl;
    image.alt = association.name || "Association";
    target.append(image);
  } else {
    target.textContent = fallbackLogoText(association);
  }
}

function renderCenter({ state, kicker, title, subtitle, meta }) {
  document.body.dataset.tvState = state;
  elements.centerPanel.hidden = false;
  elements.livePanel.hidden = true;
  elements.centerKicker.textContent = kicker;
  elements.centerTitle.textContent = title;
  elements.centerSubtitle.textContent = subtitle;
  elements.centerMeta.textContent = meta;
}

function renderLive(liveItem) {
  const item = liveItem.item;
  const current = getCurrent(liveItem);
  const upcoming = getUpcoming(liveItem);
  const previous = getPrevious(liveItem);
  document.body.dataset.tvState = current?.type === "drag" ? "drag" : "live";
  elements.centerPanel.hidden = true;
  elements.livePanel.hidden = false;
  elements.classTitle.textContent = liveItem.kind === "warmup"
    ? item.name || "Paid warm up"
    : item.className || "Classe / Class";
  elements.classSubtitle.textContent = liveItem.kind === "warmup"
    ? [item.arena, item.durationMinutesPerRider ? `${item.durationMinutesPerRider} min/cavalier · min/rider` : ""].filter(Boolean).join(" · ")
    : [item.classCode, item.arena, item.pattern].filter(Boolean).join(" · ");
  renderParticipant("current", current);
  renderParticipant("next", upcoming[0]);
  renderParticipant("second", upcoming[1]);
  renderPrevious(previous);
  renderTimer(liveItem);
  queueMarqueeRefresh();
}

function renderParticipant(slot, participant) {
  const data = participant || { name: "—", meta: "", details: "", score: "" };
  elements[`${slot}Meta`].textContent = slot === "current" && data.order
    ? `Ordre / Draw · ${data.order}`
    : data.meta || "";
  setMarqueeText(elements[`${slot}Name`], data.name || "—");
  setMarqueeText(elements[`${slot}Details`], slot === "current"
    ? [data.backNumber ? `Dossard / Back ${data.backNumber}` : "", data.details]
      .filter(Boolean)
      .join(" · ")
    : data.details || "");
  if (slot === "current") {
    elements.currentScore.hidden = !data.score;
    elements.currentScore.textContent = data.score ? `Score · ${data.score}` : "";
  }
}

function renderPrevious(previous) {
  const cards = previous.slice(0, 2).map((participant) => {
    const card = document.createElement("article");
    card.className = "previous";
    const name = document.createElement("strong");
    name.className = "previous__name";
    name.textContent = participant.name || "—";
    const details = document.createElement("span");
    details.className = "previous__details";
    details.textContent = [participant.meta, participant.details]
      .filter(Boolean)
      .join(" · ");
    card.append(name, details);
    if (participant.score) {
      const score = document.createElement("strong");
      score.className = "previous__score";
      score.textContent = participant.score;
      score.setAttribute("aria-label", `Score ${participant.score}`);
      card.append(score);
    }
    return card;
  });
  while (cards.length < 2) {
    const empty = document.createElement("article");
    empty.className = "previous";
    empty.innerHTML = "<strong>—</strong><span>Aucun passage / No completed run</span>";
    cards.push(empty);
  }
  elements.previousList.replaceChildren(...cards);
}

function renderTimer(liveItem) {
  const item = liveItem.item;
  const isDrag = Boolean(item.activeDragItem || item.dragBreak?.isActive);
  let startedAt = item.activeStartedAt || item.activeDragItem?.startedAt || item.dragBreak?.startedAt;
  let durationSeconds = null;
  if (liveItem.kind === "warmup") {
    durationSeconds = isDrag
      ? Number(item.dragDurationSeconds) || Number(item.dragDurationMinutes || 0) * 60
      : Number(item.durationMinutesPerRider || 0) * 60;
  } else if (isDrag) {
    durationSeconds = Number(item.activeDragItem?.durationMinutes || item.dragBreak?.durationMinutes || 0) * 60;
  }

  if (!startedAt || !durationSeconds) {
    elements.currentTimer.hidden = true;
    return;
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
  elements.currentTimer.hidden = false;
  elements.currentTimer.textContent = `${isDrag ? "Hersage / Drag" : "Chrono / Timer"} · ${formatTimer(remainingSeconds)}`;
}

function renderCompetition(association, show, liveItem) {
  document.body.dataset.tvState = liveItem ? "live" : "waiting";
  elements.competitionPanel.hidden = false;
  setMarqueeText(elements.competitionShow, show.name || association.name || "ShowScore");
  setMarqueeText(elements.competitionArena, selectedArena ? `Manège / Arena · ${selectedArena}` : "");
  const current = liveItem ? getCurrent(liveItem) : null;
  const upcoming = liveItem ? getUpcoming(liveItem) : [];
  const previous = liveItem ? getPrevious(liveItem) : [];
  elements.competitionStatus.textContent = current?.type === "drag"
    ? "Hersage en cours / Drag in progress"
    : liveItem
      ? "En direct / Live"
      : "En attente / Waiting";
  setMarqueeText(elements.competitionTitle, liveItem
    ? liveItem.kind === "warmup"
      ? liveItem.item.name || "Paid warm up"
      : liveItem.item.className || "Classe / Class"
    : "Les données apparaîtront dès le lancement du live.");
  renderCompetitionParticipant("Current", current);
  renderCompetitionParticipant("Next", upcoming[0]);
  renderCompetitionParticipant("Last", previous[0]);
  competitionVideoShow = show;
  refreshCompetitionVideo();
  queueMarqueeRefresh();
}

async function refreshCompetitionVideo() {
  if (displayMode !== "competition") return;

  const show = competitionVideoShow || {};
  const configuredArena = normalize(show.tvDisplayVideoArena);
  const arenaMatches = !configuredArena || configuredArena === normalize(selectedArena);
  const isConfigured = Boolean(show.tvDisplayVideoPath || show.tvDisplayVideoUrl);

  if (!isConfigured || !arenaMatches) {
    showCompetitionFallback("");
    return;
  }

  try {
    const response = await fetch("/api/media/status", { cache: "no-store" });
    const status = await response.json();
    if (!status.ready) {
      showCompetitionFallback(
        status.downloading
          ? "Préparation de la vidéo locale… / Preparing local video…"
          : status.error || "Vidéo locale en attente… / Waiting for local video…"
      );
      return;
    }

    const nextVersion = String(status.version || status.size || "ready");
    if (competitionVideoVersion !== nextVersion) {
      competitionVideoVersion = nextVersion;
      elements.competitionVideo.src = `${status.localUrl || "/media/competition-video.mp4"}?v=${encodeURIComponent(nextVersion)}`;
      elements.competitionVideo.load();
    }
    elements.competitionFallback.hidden = true;
    elements.competitionVideo.hidden = false;
    elements.competitionMediaStatus.hidden = true;
    elements.competitionVideo.play().catch(() => {
      // Chrome may briefly defer autoplay while the tab becomes visible.
    });
  } catch (error) {
    showCompetitionFallback("Vidéo locale indisponible / Local video unavailable");
  }
}

function showCompetitionFallback(message) {
  elements.competitionVideo.hidden = true;
  elements.competitionVideo.pause();
  elements.competitionFallback.hidden = false;
  elements.competitionMediaStatus.hidden = !message;
  elements.competitionMediaStatus.textContent = message;
}

function renderCompetitionParticipant(slot, participant) {
  setMarqueeText(elements[`competition${slot}`], participant?.name || "—");
  setMarqueeText(elements[`competition${slot}Details`], participant
    ? [participant.meta, participant.details].filter(Boolean).join(" · ")
    : "");
  const score = elements[`competition${slot}Score`];
  score.hidden = !participant?.score;
  score.textContent = participant?.score ? `Score · ${participant.score}` : "";
}

function updateStandingsSlides(snapshot) {
  const classView = pickStandingsClass(snapshot, selectedArena);
  const groups = Array.isArray(classView?.classStandings)
    ? classView.classStandings
    : [];
  const qualifiedRiderCount = normalizeQualifiedRiderCount(classView?.qualifiedRiderCount);
  const signature = JSON.stringify([
    classView?.classId || "",
    qualifiedRiderCount,
    ...groups.map((group) => [
      group.id,
      (group.entries || []).map((entry) => [entry.id, entry.rank, entry.scoreTotal]),
    ]),
  ]);
  standingsSlides = buildStandingsSlides(groups, 7, qualifiedRiderCount).map((slide) => ({
    ...slide,
    blockClassId: classView?.classId || "",
    blockName: classView?.className || "",
  }));
  if (signature !== standingsSignature) standingsSlideIndex = 0;
  standingsSignature = signature;
}

function renderStandings(show) {
  const slide = standingsSlides[standingsSlideIndex % standingsSlides.length] || null;
  const entries = slide?.entries || [];
  document.body.dataset.tvState = slide ? "standings" : "waiting";
  elements.standingsPanel.hidden = false;
  elements.standingsKicker.textContent = selectedArena
    ? `Classement en direct / Live standings · ${selectedArena}`
    : "Classement en direct / Live standings";
  elements.standingsTitle.textContent = slide
    ? [slide.classCode, slide.className].filter(Boolean).join(" — ")
    : "Classements / Standings";
  elements.standingsBlock.textContent = slide?.blockName || show.name || "";
  elements.standingsProgress.textContent = standingsSlides.length
    ? `${(standingsSlideIndex % standingsSlides.length) + 1} / ${standingsSlides.length}`
    : "—";
  elements.standingsTable.hidden = !slide;
  elements.standingsEmpty.hidden = Boolean(slide);
  elements.standingsRows.style.setProperty(
    "--standings-row-count",
    String(Math.max(1, entries.length))
  );
  elements.standingsRows.replaceChildren(...entries.map(createStandingRow));
  queueMarqueeRefresh();
}

function createStandingRow(entry) {
  const row = document.createElement("div");
  row.className = "standings__row";

  const rank = document.createElement("strong");
  rank.className = "standings__rank";
  rank.textContent = entry.rank || "—";

  const identity = document.createElement("div");
  identity.className = "standings__identity";
  const rider = document.createElement("strong");
  rider.textContent = entry.rider || "Cavalier / Rider";
  const details = document.createElement("span");
  details.className = "standings__details";
  setMarqueeText(
    details,
    [
      entry.horse || "—",
      entry.owner ? `Propriétaire / Owner: ${entry.owner}` : "",
    ].filter(Boolean).join(" · ")
  );
  identity.append(rider, details);

  const back = document.createElement("span");
  back.className = "standings__back";
  back.textContent = entry.backNumber || "—";

  const score = document.createElement("strong");
  score.className = "standings__score";
  score.textContent = entry.scoreTotal || "—";
  row.append(rank, identity, back, score);
  return row;
}

function buildStandingsSlides(groups, entriesPerSlide, qualifiedRiderCount = 6) {
  const pageSize = Math.max(1, Number.parseInt(entriesPerSlide, 10) || 7);
  return (Array.isArray(groups) ? groups : []).flatMap((group, groupIndex) => {
    const rankedEntries = applyCompetitionRanks(group?.entries);
    const entries = selectQualifiedEntries(rankedEntries, qualifiedRiderCount);
    const slides = [];
    for (let index = 0; index < entries.length; index += pageSize) {
      slides.push({
        id: `${group?.id || `standing-${groupIndex + 1}`}-${index}`,
        classCode: group?.classCode || group?.code || "",
        className: group?.className || "Classe / Class",
        entries: entries.slice(index, index + pageSize),
      });
    }
    return slides;
  });
}

function applyCompetitionRanks(entries) {
  let previousScore = null;
  let currentRank = 0;
  return (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const score = parseStandingScore(entry?.scoreTotal);
    const tiedWithPrevious =
      index > 0 && score != null && previousScore != null && score === previousScore;
    if (!tiedWithPrevious) currentRank = index + 1;
    previousScore = score;
    return { ...entry, rank: currentRank };
  });
}

function parseStandingScore(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/(\d+)\s+1\/2/g, "$1.5")
    .replace(/½/g, ".5")
    .replace(/,/g, ".");
  const score = Number(normalized);
  return Number.isFinite(score) ? score : null;
}

function normalizeQualifiedRiderCount(value) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? count : 6;
}

function selectQualifiedEntries(entries, qualifiedRiderCount) {
  const ranked = Array.isArray(entries) ? entries : [];
  const count = normalizeQualifiedRiderCount(qualifiedRiderCount);
  if (ranked.length <= count) return ranked;
  const cutoff = ranked[count - 1];
  const cutoffRank = Number(cutoff?.rank);
  const cutoffScore = String(cutoff?.scoreTotal || "").trim();
  return ranked.filter((entry, index) => {
    if (index < count) return true;
    const entryRank = Number(entry?.rank);
    if (Number.isFinite(cutoffRank) && Number.isFinite(entryRank) && entryRank === cutoffRank) {
      return true;
    }
    return Boolean(cutoffScore) && String(entry?.scoreTotal || "").trim() === cutoffScore;
  });
}

function pickStandingsClass(snapshot, arena) {
  const classes = filterArena(snapshot.liveClasses || [], arena);
  return classes.find((item) => item.activeDragItem || item.dragBreak?.isActive || item.activeRun)
    || classes.find((item) => !item.isComplete && item.scoringStarted && item.classStandings?.length)
    || classes.find((item) => item.classStandings?.length)
    || null;
}

function pickLiveItem(snapshot, arena) {
  const classes = filterArena(snapshot.liveClasses || [], arena);
  const warmups = filterArena(snapshot.livePaidWarmups || [], arena);
  const activeWarmup = warmups.find((item) => item.activeDragItem)
    || warmups.find((item) => item.activeEntry)
    || warmups.find((item) => item.isPublicLive && item.stagedEntry);
  const activeClass = classes.find((item) => item.activeDragItem || item.dragBreak?.isActive)
    || classes.find((item) => item.activeRun)
    || classes.find((item) => !item.isComplete && item.scoringStarted && (item.nextRun || item.latestScore));
  if (activeWarmup) return { kind: "warmup", item: activeWarmup };
  if (activeClass) return { kind: "class", item: activeClass };
  return null;
}

function filterArena(items, arena) {
  const key = normalize(arena);
  return key ? items.filter((item) => normalize(item.arena) === key) : items;
}

function getCurrent(liveItem) {
  const item = liveItem.item;
  const drag = item.activeDragItem || (item.dragBreak?.isActive ? item.dragBreak : null);
  if (drag) return formatDrag(drag);
  return liveItem.kind === "warmup"
    ? formatRun(item.onCourseEntry || item.activeEntry || item.stagedEntry || item.nextEntry, false)
    : formatRun(item.activeRun || item.nextRun, false);
}

function getUpcoming(liveItem) {
  const item = liveItem.item;
  if (liveItem.kind === "warmup") {
    const currentEntry = item.onCourseEntry || item.activeEntry || item.stagedEntry;
    return [item.nextEntry, item.secondNextEntry]
      .filter((entry) => entry && entry.id !== currentEntry?.id)
      .map((entry) => formatRun(entry, false))
      .filter(Boolean);
  }
  const isDrag = Boolean(item.activeDragItem || item.dragBreak?.isActive);
  const currentRun = isDrag ? null : item.activeRun || item.nextRun;
  return [item.activeDragItem?.nextRun || item.dragBreak?.nextRun || item.nextRun, item.secondNextRun]
    .filter((run) => run && run.id !== currentRun?.id)
    .map((run) => formatRun(run, false))
    .filter(Boolean);
}

function getPrevious(liveItem) {
  const items = liveItem.kind === "warmup"
    ? liveItem.item.lastPassedEntries || []
    : liveItem.item.lastPassedRuns || [];
  return items.map((item) => formatRun(item, true)).filter(Boolean);
}

function formatRun(run, includeScore) {
  if (!run) return null;
  const order = run.draw ? `#${run.draw}` : "";
  if (run.identityHidden) {
    return { type: "run", name: order ? `Ordre / Draw ${order}` : "Ordre en piste / On-course draw", meta: "", details: "", score: "", order: run.draw || "", backNumber: run.backNumber || "" };
  }
  return {
    type: "run",
    name: run.rider || "Cavalier / Rider",
    meta: [order, run.backNumber ? `Back ${run.backNumber}` : ""].filter(Boolean).join(" · "),
    details: [run.horse, run.owner ? `Propriétaire / Owner: ${run.owner}` : ""].filter(Boolean).join(" · "),
    score: includeScore ? String(run.scoreTotal || "") : "",
    order: run.draw || "",
    backNumber: run.backNumber || "",
  };
}

function formatDrag(item) {
  return {
    type: "drag",
    name: "Hersage / Drag",
    meta: "",
    details: item.durationMinutes ? `${item.durationMinutes} min` : "",
    score: "",
  };
}

function updateSponsorSlides(groups) {
  const signature = JSON.stringify(groups.map((group) => [group.id, (group.logos || []).map((logo) => logo.id)]));
  sponsorSlides = groups.flatMap((group) => {
    const logos = (Array.isArray(group.logos) ? group.logos : []).filter((logo) => logo.logoDataUrl);
    const slides = [];
    for (let index = 0; index < logos.length; index += 5) {
      slides.push({ name: group.name || "", logos: logos.slice(index, index + 5) });
    }
    return slides;
  });
  if (signature !== sponsorSignature) sponsorSlideIndex = 0;
  sponsorSignature = signature;
}

function renderSponsors() {
  const slide = sponsorSlides[sponsorSlideIndex % sponsorSlides.length];
  elements.sponsorLevel.textContent = slide?.name || "";
  if (!slide) {
    const empty = document.createElement("div");
    empty.className = "sponsor-empty";
    empty.textContent = "ShowScore.app";
    elements.sponsorList.style.setProperty("--sponsor-count", 1);
    elements.sponsorList.replaceChildren(empty);
    return;
  }
  elements.sponsorList.style.setProperty("--sponsor-count", Math.max(1, slide.logos.length));
  elements.sponsorList.replaceChildren(...slide.logos.map((logo) => {
    const tile = document.createElement("div");
    tile.className = "sponsor";
    const image = document.createElement("img");
    image.src = logo.logoDataUrl;
    image.alt = logo.name || "Sponsor";
    tile.append(image);
    return tile;
  }));
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function normalize(value) { return String(value || "").replace(/\s+/g, " ").trim().toLowerCase(); }
function initials(value) { return String(value || "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase(); }
function fallbackLogoText(association) {
  const shortName = String(association?.shortName || "").replace(/\s+/g, "").trim();
  if (shortName && shortName.length <= 4) return shortName.toUpperCase();
  const nameInitials = String(association?.name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return nameInitials || shortName.slice(0, 4).toUpperCase() || "SS";
}

function setMarqueeText(target, value) {
  target.classList.add("overflow-marquee");
  const text = String(value || "");
  const existingTrack = target.querySelector(".overflow-marquee__track");
  if (existingTrack?.textContent === text) return;
  const track = document.createElement("span");
  track.className = "overflow-marquee__track";
  track.textContent = text;
  target.replaceChildren(track);
}

let marqueeFrame = null;
function queueMarqueeRefresh() {
  cancelAnimationFrame(marqueeFrame);
  marqueeFrame = requestAnimationFrame(() => {
    document.querySelectorAll(".overflow-marquee").forEach(refreshMarquee);
  });
}

function refreshMarquee(target) {
  const track = target.querySelector(".overflow-marquee__track");
  if (!track) return;
  target.classList.remove("is-scrolling");
  target.style.removeProperty("--marquee-distance");
  target.style.removeProperty("--marquee-duration");
  const overflow = Math.ceil(track.scrollWidth - target.clientWidth);
  if (overflow <= 2) return;
  const distance = overflow + 36;
  const duration = Math.min(42, Math.max(14, distance / 13));
  target.style.setProperty("--marquee-distance", `${-distance}px`);
  target.style.setProperty("--marquee-duration", `${duration}s`);
  target.classList.add("is-scrolling");
}

window.addEventListener("resize", queueMarqueeRefresh);

setInterval(() => {
  if (currentSnapshot) {
    const liveItem = pickLiveItem(currentSnapshot, selectedArena);
    if (displayMode === "general" && liveItem) renderTimer(liveItem);
  }
}, 1000);

setInterval(() => {
  if (displayMode === "competition") refreshCompetitionVideo();
}, 3000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && displayMode === "competition") {
    refreshCompetitionVideo();
  }
});

setInterval(() => {
  if (sponsorSlides.length > 1) {
    sponsorSlideIndex = (sponsorSlideIndex + 1) % sponsorSlides.length;
    renderSponsors();
  }
}, 9000);

setInterval(() => {
  if (displayMode === "standings" && standingsSlides.length > 1) {
    standingsSlideIndex = (standingsSlideIndex + 1) % standingsSlides.length;
    renderStandings(currentSnapshot?.show || {});
  }
}, 10000);

connect();
