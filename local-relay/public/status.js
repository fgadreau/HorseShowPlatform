const producer = document.querySelector("#producer");
const overlayViewers = document.querySelector("#overlay-viewers");
const tvViewers = document.querySelector("#tv-viewers");
const sponsorCount = document.querySelector("#sponsor-count");
const videoCache = document.querySelector("#video-cache");
const updated = document.querySelector("#updated");
const urls = document.querySelector("#urls");
const tvUrls = document.querySelector("#tv-urls");

async function refresh() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const status = await response.json();
    producer.textContent = status.producerConnected ? "Connecté" : "En attente";
    overlayViewers.textContent = String(status.overlayViewerCount || 0);
    tvViewers.textContent = String(status.tvViewerCount || 0);
    sponsorCount.textContent = String(status.sponsorCount || 0);
    videoCache.textContent = formatVideoStatus(status.competitionVideo);
    updated.textContent = status.lastReceivedAt ? new Date(status.lastReceivedAt).toLocaleTimeString("fr-CA") : "Aucune donnée";
    urls.replaceChildren(...(status.overlayUrls || []).map((url) => {
      const link = document.createElement("a");
      link.href = url;
      link.textContent = url;
      return link;
    }));
    tvUrls.replaceChildren(...(status.tvUrls || []).map((item) => {
      const link = document.createElement("a");
      link.href = item.url;
      link.textContent = `${getTvLabel(item)} · ${item.url}`;
      return link;
    }));
  } catch (error) {
    producer.textContent = "Relais indisponible";
  }
}

function formatVideoStatus(video) {
  if (!video?.configured) return "Non configurée";
  if (video.ready) return `Prête · ${formatBytes(video.size)}`;
  if (video.downloading) {
    const progress = video.expectedSize > 0
      ? ` · ${Math.min(100, Math.round((video.downloadedBytes / video.expectedSize) * 100))} %`
      : "";
    return `Copie en cours${progress}`;
  }
  return "En attente";
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} Go`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 ** 2))} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

function getTvLabel(item) {
  if (item.kind === "competition") return `Compétition · ${item.arena}`;
  if (item.kind === "standings") return item.arena ? `Classement · ${item.arena}` : "Classement général";
  if (item.kind === "arena") return `Manège · ${item.arena}`;
  return "Vue générale";
}

refresh();
setInterval(refresh, 2000);
