const elements = {
  overlay: document.querySelector("#overlay"),
  bar: document.querySelector("#bar"),
  logo: document.querySelector("#association-logo"),
  eyebrow: document.querySelector("#eyebrow"),
  className: document.querySelector("#class-name"),
  associationName: document.querySelector("#association-name"),
  active: document.querySelector("#active"),
  waiting: document.querySelector("#waiting"),
  lastScore: document.querySelector("#last-score"),
  takeover: document.querySelector("#sponsor-takeover"),
  takeoverTitle: document.querySelector("#takeover-title"),
  takeoverList: document.querySelector("#takeover-list"),
};

const selectedArena = new URLSearchParams(location.search).get("arena")?.trim() || "";
let reconnectAttempt = 0;
let reconnectTimer = null;
let sponsorTimer = null;
let sponsorSlides = [];
let sponsorIndex = 0;

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws/viewer?kind=overlay`);

  socket.addEventListener("open", () => { reconnectAttempt = 0; });
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "snapshot" && message.snapshot) render(message.snapshot);
    } catch (error) {
      // Keep displaying the last valid local snapshot.
    }
  });
  socket.addEventListener("close", () => {
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 15000);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  });
}

function render(snapshot) {
  const show = snapshot.show || {};
  const association = snapshot.association || {};
  const liveItem = pickLiveItem(
    snapshot.liveClasses || [],
    snapshot.livePaidWarmups || [],
    selectedArena
  );
  const neutral = show.obsOverlayMode === "neutral";
  const dragActive = Boolean(liveItem?.activeDragItem || liveItem?.dragBreak?.isActive);

  sponsorSlides = buildSponsorSlides(association.sponsorGroups || []);
  const sponsorTakeover = dragActive && !neutral && sponsorSlides.length > 0;
  elements.takeover.hidden = !sponsorTakeover;
  elements.bar.hidden = sponsorTakeover;
  elements.overlay.dataset.mode = sponsorTakeover ? "sponsor-takeover" : neutral ? "neutral" : liveItem ? "live" : "waiting";

  if (sponsorTakeover) {
    startSponsorTakeover();
    return;
  }
  stopSponsorTakeover();

  elements.eyebrow.textContent = neutral ? "Vous regardez" : show.name || "ShowScore local";
  elements.className.textContent = neutral
    ? show.name || "ShowScore"
    : liveItem
      ? `${liveItem.className || "Bloc"}${liveItem.classCode ? ` (${liveItem.classCode})` : ""}`
      : "En attente du prochain passage";
  elements.associationName.textContent = neutral ? association.name || "" : selectedArena || liveItem?.arena || association.name || "";
  renderLogo(association);

  if (!neutral) {
    renderRun(
      elements.active,
      dragActive ? null : liveItem?.activeRun,
      dragActive ? "Drag de surface" : "Aucun concurrent en piste"
    );
    renderRun(
      elements.waiting,
      liveItem?.activeDragItem?.nextRun || liveItem?.dragBreak?.nextRun || liveItem?.nextRun || liveItem?.secondNextRun,
      "Aucun prochain concurrent"
    );
    const lastScore = liveItem?.latestScore || (liveItem?.lastPassedRuns || []).find((run) => run.scoreTotal);
    renderRun(elements.lastScore, lastScore, "Aucun pointage", true);
    queueMarqueeRefresh();
  }
}

function pickLiveItem(classes, warmups, arena) {
  const normalizedArena = normalize(arena);
  const items = [
    ...classes,
    ...warmups.map((warmup) => ({
      ...warmup,
      className: warmup.name || "Paid warm up",
      activeRun: warmup.activeEntry || warmup.stagedEntry,
      nextRun: warmup.nextEntry,
      secondNextRun: warmup.secondNextEntry,
    })),
  ];
  const eligible = normalizedArena
    ? items.filter((item) => normalize(item?.arena) === normalizedArena)
    : items;
  return eligible.find((item) => item.activeDragItem || item.dragBreak?.isActive)
    || eligible.find((item) => item.activeRun)
    || eligible.find((item) => item.nextRun)
    || eligible[0]
    || null;
}

function renderRun(target, run, fallback, includeScore = false) {
  target.replaceChildren();
  const primary = document.createElement("span");
  primary.className = "metric__primary overflow-marquee";
  const primaryText = !run
    ? fallback
    : run.identityHidden
      ? `#${run.draw || "—"}`
      : [run.draw ? `#${run.draw}` : "", run.rider].filter(Boolean).join(" · ") || fallback;
  setMarqueeContent(primary, primaryText);
  target.append(primary);

  if (includeScore && run?.scoreTotal) {
    const score = document.createElement("strong");
    score.textContent = run.scoreTotal;
    target.append(score);
  }

  const secondaryText = run?.identityHidden
    ? "Identité masquée"
    : [
        run?.backNumber ? `Dossard ${run.backNumber}` : "",
        run?.horse,
        run?.owner ? `Propriétaire / Owner: ${run.owner}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
  if (secondaryText) {
    const secondary = document.createElement("small");
    secondary.className = "overflow-marquee";
    setMarqueeContent(secondary, secondaryText);
    target.append(secondary);
  }
}

function setMarqueeContent(target, value) {
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
  const isHorseOwnerLine = target.tagName === "SMALL";
  const duration = isHorseOwnerLine
    ? Math.min(12, Math.max(4, distance / 52))
    : Math.min(42, Math.max(14, distance / 13));
  target.style.setProperty("--marquee-distance", `${-distance}px`);
  target.style.setProperty("--marquee-duration", `${duration}s`);
  target.classList.add("is-scrolling");
}

function renderLogo(association) {
  elements.logo.replaceChildren();
  if (association.logoDataUrl) {
    const image = document.createElement("img");
    image.src = association.logoDataUrl;
    image.alt = association.name || "Association";
    elements.logo.append(image);
    return;
  }
  elements.logo.textContent = fallbackLogoText(association);
}

function buildSponsorSlides(groups) {
  return groups.flatMap((group) => {
    const logos = Array.isArray(group.logos) ? group.logos.filter((logo) => logo.logoDataUrl) : [];
    const slides = [];
    for (let index = 0; index < logos.length; index += 2) {
      slides.push({ name: group.name || "", logos: logos.slice(index, index + 2) });
    }
    return slides;
  });
}

function startSponsorTakeover() {
  clearInterval(sponsorTimer);
  const draw = () => {
    const slide = sponsorSlides[sponsorIndex % sponsorSlides.length];
    elements.takeoverTitle.textContent = slide.name ? `Merci à nos commanditaires · ${slide.name}` : "Merci à nos commanditaires";
    elements.takeoverList.style.setProperty("--sponsor-count", Math.min(slide.logos.length, 2));
    elements.takeoverList.replaceChildren(...slide.logos.map((logo) => {
      const tile = document.createElement("div");
      tile.className = "takeover__sponsor";
      const image = document.createElement("img");
      image.src = logo.logoDataUrl;
      image.alt = logo.name || "Commanditaire";
      tile.append(image);
      return tile;
    }));
    sponsorIndex += 1;
  };
  draw();
  if (sponsorSlides.length > 1) sponsorTimer = setInterval(draw, 8000);
}

function stopSponsorTakeover() {
  clearInterval(sponsorTimer);
  sponsorTimer = null;
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
window.addEventListener("resize", queueMarqueeRefresh);

connect();
