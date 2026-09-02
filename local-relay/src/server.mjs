import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  MAX_SNAPSHOT_BYTES,
  parseRelayMessage,
  validateSnapshotEnvelope,
} from "./protocol.mjs";
import { createStateStore } from "./stateStore.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const relayRoot = path.resolve(moduleDirectory, "..");
const publicDirectory = path.join(relayRoot, "public");
const dataDirectory = process.env.SHOWSCORE_RELAY_DATA_DIR || path.join(relayRoot, "data");
const host = process.env.SHOWSCORE_RELAY_HOST || "0.0.0.0";
const port = Number(process.env.SHOWSCORE_RELAY_PORT || 3000);
const publicHost = String(process.env.SHOWSCORE_RELAY_PUBLIC_HOST || "").trim();
const store = createStateStore({ dataDirectory });
const mediaDirectory = path.join(dataDirectory, "media");
const competitionVideoPath = path.join(mediaDirectory, "competition-video.mp4");
const competitionVideoMetadataPath = path.join(
  mediaDirectory,
  "competition-video.json"
);
const competitionVideoDownloadPath = path.join(
  mediaDirectory,
  "competition-video.download"
);
const MAX_COMPETITION_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const viewers = new Set();
let producer = null;
let competitionVideoMetadata = loadCompetitionVideoMetadata();
let activeVideoDownload = null;
let pendingVideoConfig = null;
let videoDownloadError = "";

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/status") {
    return sendJson(response, 200, relayStatus());
  }
  if (request.method === "GET" && url.pathname === "/api/state") {
    return sendJson(response, 200, store.getEnvelope() || { type: "snapshot", version: "0", snapshot: null });
  }
  if (request.method === "GET" && url.pathname === "/api/media/status") {
    return sendJson(response, 200, getCompetitionVideoStatus());
  }
  if (
    ["GET", "HEAD"].includes(request.method) &&
    url.pathname === "/media/competition-video.mp4"
  ) {
    return serveCompetitionVideo(request, response);
  }

  const route = STATIC_ROUTES[url.pathname] || null;
  if (!route || request.method !== "GET") {
    return sendText(response, 404, "Not found", "text/plain; charset=utf-8");
  }

  try {
    const body = fs.readFileSync(path.join(publicDirectory, route.file));
    response.writeHead(200, {
      "Content-Type": route.contentType,
      "Cache-Control": route.cacheControl || "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    sendText(response, 500, "Relay asset unavailable", "text/plain; charset=utf-8");
  }
});

const webSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_SNAPSHOT_BYTES,
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (!["/ws/producer", "/ws/viewer"].includes(url.pathname)) {
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request, url);
  });
});

webSocketServer.on("connection", (webSocket, request, url) => {
  if (url.pathname === "/ws/viewer") {
    registerViewer(webSocket, url.searchParams.get("kind"));
    return;
  }

  registerProducerCandidate(webSocket, request);
});

function registerViewer(webSocket, requestedKind) {
  webSocket.viewerKind = requestedKind === "tv" ? "tv" : "overlay";
  viewers.add(webSocket);
  send(webSocket, {
    type: "viewer.ready",
    protocolVersion: 1,
    ...relayStatus(),
  });
  const envelope = store.getEnvelope();
  if (envelope) send(webSocket, envelope);
  broadcastStatus();

  webSocket.on("close", () => {
    viewers.delete(webSocket);
    broadcastStatus();
  });
}

function registerProducerCandidate(webSocket, request) {
  let authenticated = false;
  const authenticationTimer = setTimeout(() => {
    if (!authenticated) webSocket.close(4001, "Pairing required");
  }, 5000);

  webSocket.on("message", (raw) => {
    const message = parseRelayMessage(raw);
    if (!message) {
      send(webSocket, { type: "error", message: "Invalid JSON message" });
      return;
    }

    if (!authenticated) {
      if (
        message.type !== "producer.hello" ||
        !pairingCodesMatch(message.pairingCode, store.getPairingCode())
      ) {
        send(webSocket, { type: "producer.rejected", message: "Code de jumelage invalide." });
        webSocket.close(4003, "Invalid pairing code");
        return;
      }

      authenticated = true;
      clearTimeout(authenticationTimer);
      if (producer && producer !== webSocket) {
        producer.close(4002, "Replaced by a newer producer connection");
      }
      producer = webSocket;
      webSocket.producerId = String(message.producerId || "");
      send(webSocket, {
        type: "producer.ready",
        protocolVersion: 1,
        lastVersion: store.getEnvelope()?.version || "0",
        ...relayStatus(),
      });
      return;
    }

    const validation = validateSnapshotEnvelope(message);
    if (!validation.ok) {
      send(webSocket, { type: "error", message: validation.error });
      return;
    }

    const accepted = store.acceptEnvelope(validation.envelope);
    if (accepted) {
      broadcastToViewers(validation.envelope);
      queueCompetitionVideo(validation.envelope.snapshot);
      broadcastStatus();
    }
    send(webSocket, {
      type: "snapshot.ack",
      accepted,
      version: validation.envelope.version,
      currentVersion: store.getEnvelope()?.version || "0",
    });
  });

  webSocket.on("close", () => {
    clearTimeout(authenticationTimer);
    if (producer === webSocket) producer = null;
  });
}

function pairingCodesMatch(candidate, expected) {
  const left = Buffer.from(String(candidate || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function broadcastToViewers(message) {
  viewers.forEach((viewer) => send(viewer, message));
}

function broadcastStatus() {
  if (producer) send(producer, { type: "relay.status", ...relayStatus() });
}

function relayStatus() {
  const openViewers = Array.from(viewers).filter(
    (viewer) => viewer.readyState === WebSocket.OPEN
  );
  return {
    producerConnected: Boolean(producer),
    viewerCount: openViewers.length,
    overlayViewerCount: openViewers.filter(
      (viewer) => viewer.viewerKind === "overlay"
    ).length,
    tvViewerCount: openViewers.filter(
      (viewer) => viewer.viewerKind === "tv"
    ).length,
    overlayUrls: getOverlayUrls(),
    tvUrls: getTvUrls(),
    lastVersion: store.getEnvelope()?.version || "0",
    lastReceivedAt: store.getEnvelope()?.receivedAt || null,
    sponsorCount: getSnapshotSponsorCount(),
    competitionVideo: getCompetitionVideoStatus(),
  };
}

function getSnapshotSponsorCount() {
  const groups = store.getEnvelope()?.snapshot?.association?.sponsorGroups;
  return (Array.isArray(groups) ? groups : []).reduce(
    (total, group) =>
      total + (Array.isArray(group?.logos) ? group.logos.length : 0),
    0
  );
}

function getTvUrls() {
  const arenas = getSnapshotArenas();
  return getOverlayUrls().flatMap((overlayUrl) => {
    const baseUrl = new URL(overlayUrl);
    baseUrl.pathname = "/tv";
    baseUrl.search = "";
    const urls = [
      { kind: "general", arena: "", url: baseUrl.toString().replace(/\/$/, "") },
    ];
    const generalStandingsUrl = new URL(baseUrl);
    generalStandingsUrl.searchParams.set("mode", "standings");
    urls.push({
      kind: "standings",
      arena: "",
      url: generalStandingsUrl.toString(),
    });

    arenas.forEach((arena) => {
      const arenaUrl = new URL(baseUrl);
      arenaUrl.searchParams.set("arena", arena);
      urls.push({ kind: "arena", arena, url: arenaUrl.toString() });

      const standingsUrl = new URL(arenaUrl);
      standingsUrl.searchParams.set("mode", "standings");
      urls.push({ kind: "standings", arena, url: standingsUrl.toString() });

      const competitionUrl = new URL(arenaUrl);
      competitionUrl.searchParams.set("mode", "competition");
      urls.push({ kind: "competition", arena, url: competitionUrl.toString() });
    });

    return urls;
  });
}

function getSnapshotArenas() {
  const snapshot = store.getEnvelope()?.snapshot || {};
  const values = [
    ...(Array.isArray(snapshot.liveClasses) ? snapshot.liveClasses : []),
    ...(Array.isArray(snapshot.livePaidWarmups) ? snapshot.livePaidWarmups : []),
  ]
    .map((item) => String(item?.arena || "").trim())
    .filter(Boolean);

  return Array.from(
    new Map(values.map((arena) => [arena.toLocaleLowerCase("fr-CA"), arena])).values()
  ).sort((left, right) => left.localeCompare(right, "fr-CA"));
}

function getOverlayUrls() {
  const urls = [buildPublicOverlayUrl(publicHost), `http://127.0.0.1:${port}/overlay`].filter(Boolean);
  Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal && !isCrostiniAddress(entry.address))
    .forEach((entry) => urls.push(`http://${entry.address}:${port}/overlay`));
  return Array.from(new Set(urls));
}

function isCrostiniAddress(address) {
  return /^100\.115\.92\./.test(String(address || ""));
}

function buildPublicOverlayUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    if (!url.port) url.port = String(port);
    url.pathname = "/overlay";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    return "";
  }
}

function send(webSocket, message) {
  if (webSocket?.readyState === WebSocket.OPEN) {
    webSocket.send(JSON.stringify(message));
  }
}

function sendJson(response, statusCode, value) {
  sendText(response, statusCode, JSON.stringify(value), "application/json; charset=utf-8");
}

function sendText(response, statusCode, value, contentType) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(value);
}

function loadCompetitionVideoMetadata() {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(competitionVideoMetadataPath, "utf8")
    );
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function getCompetitionVideoConfig(snapshot = store.getEnvelope()?.snapshot) {
  const show = snapshot?.show || {};
  const showId = String(show.id || "").trim();
  const sourcePath = String(show.tvDisplayVideoPath || "").trim();
  const sourceUrl = String(show.tvDisplayVideoUrl || "").trim();
  const sourceId = sourcePath || sourceUrl;
  const cacheKey = sourceId
    ? crypto
        .createHash("sha256")
        .update(`${showId}\n${sourceId}`)
        .digest("hex")
    : "";

  return {
    configured: Boolean(showId && sourceId),
    showId,
    sourcePath,
    sourceUrl,
    cacheKey,
    arena: String(show.tvDisplayVideoArena || "").trim(),
    name: String(show.tvDisplayVideoName || "video.mp4").trim() || "video.mp4",
    expectedSize: Number(show.tvDisplayVideoSize) || 0,
  };
}

function isCompetitionVideoReady(config = getCompetitionVideoConfig()) {
  return Boolean(
    config.configured &&
      competitionVideoMetadata?.cacheKey === config.cacheKey &&
      fs.existsSync(competitionVideoPath)
  );
}

function getCompetitionVideoStatus() {
  const config = getCompetitionVideoConfig();
  const ready = isCompetitionVideoReady(config);
  let size = 0;

  if (ready) {
    try {
      size = fs.statSync(competitionVideoPath).size;
    } catch (error) {
      size = 0;
    }
  }

  return {
    configured: config.configured,
    ready: ready && size > 0,
    downloading: activeVideoDownload?.cacheKey === config.cacheKey,
    downloadedBytes:
      activeVideoDownload?.cacheKey === config.cacheKey
        ? activeVideoDownload.downloadedBytes
        : 0,
    expectedSize: config.expectedSize,
    size,
    arena: config.arena,
    name: config.name,
    version: ready ? String(competitionVideoMetadata?.version || config.cacheKey.slice(0, 12)) : "",
    localUrl: ready ? "/media/competition-video.mp4" : "",
    error: config.configured && !ready ? videoDownloadError : "",
  };
}

function queueCompetitionVideo(snapshot) {
  const config = getCompetitionVideoConfig(snapshot);
  if (!config.configured || isCompetitionVideoReady(config)) return;

  if (!config.sourceUrl) {
    videoDownloadError =
      "Vidéo configurée, mais son adresse Internet n'est pas encore disponible.";
    return;
  }

  pendingVideoConfig = config;
  if (!activeVideoDownload) processPendingVideoDownload();
}

async function processPendingVideoDownload() {
  while (pendingVideoConfig) {
    const config = pendingVideoConfig;
    pendingVideoConfig = null;
    if (isCompetitionVideoReady(config)) continue;

    activeVideoDownload = { ...config, downloadedBytes: 0 };
    videoDownloadError = "";
    broadcastStatus();

    try {
      await downloadCompetitionVideo(config);
    } catch (error) {
      videoDownloadError = String(
        error?.message || "Impossible de mettre la vidéo en cache."
      );
      try {
        fs.unlinkSync(competitionVideoDownloadPath);
      } catch (unlinkError) {
        // The temporary file may not exist yet.
      }
    } finally {
      activeVideoDownload = null;
      broadcastStatus();
    }
  }
}

async function downloadCompetitionVideo(config) {
  let sourceUrl;
  try {
    sourceUrl = new URL(config.sourceUrl);
  } catch (error) {
    throw new Error("Adresse MP4 invalide.");
  }
  if (!["http:", "https:"].includes(sourceUrl.protocol)) {
    throw new Error("L'adresse MP4 doit utiliser HTTP ou HTTPS.");
  }

  const sourceResponse = await fetch(sourceUrl, { redirect: "follow" });
  if (!sourceResponse.ok || !sourceResponse.body) {
    throw new Error(`Téléchargement MP4 refusé (${sourceResponse.status}).`);
  }

  const contentLength = Number(sourceResponse.headers.get("content-length")) || 0;
  if (contentLength > MAX_COMPETITION_VIDEO_BYTES) {
    throw new Error("La vidéo MP4 dépasse la limite locale de 2 Go.");
  }

  fs.mkdirSync(mediaDirectory, { recursive: true });
  let downloadedBytes = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      downloadedBytes += chunk.length;
      if (activeVideoDownload?.cacheKey === config.cacheKey) {
        activeVideoDownload.downloadedBytes = downloadedBytes;
      }
      if (downloadedBytes > MAX_COMPETITION_VIDEO_BYTES) {
        callback(new Error("La vidéo MP4 dépasse la limite locale de 2 Go."));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(sourceResponse.body),
    limiter,
    fs.createWriteStream(competitionVideoDownloadPath)
  );

  if (!downloadedBytes) throw new Error("Le fichier MP4 reçu est vide.");

  fs.renameSync(competitionVideoDownloadPath, competitionVideoPath);
  const metadata = {
    cacheKey: config.cacheKey,
    showId: config.showId,
    sourcePath: config.sourcePath,
    arena: config.arena,
    name: config.name,
    size: downloadedBytes,
    cachedAt: new Date().toISOString(),
    version: `${config.cacheKey.slice(0, 12)}-${downloadedBytes}`,
  };
  const metadataTemporaryPath = `${competitionVideoMetadataPath}.tmp`;
  fs.writeFileSync(metadataTemporaryPath, JSON.stringify(metadata, null, 2));
  fs.renameSync(metadataTemporaryPath, competitionVideoMetadataPath);
  competitionVideoMetadata = metadata;
}

function serveCompetitionVideo(request, response) {
  const status = getCompetitionVideoStatus();
  if (!status.ready) {
    return sendText(
      response,
      404,
      "Competition video is not cached",
      "text/plain; charset=utf-8"
    );
  }

  const size = status.size;
  const range = String(request.headers.range || "");
  let start = 0;
  let end = size - 1;
  let statusCode = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }

    if (match[1]) start = Number(match[1]);
    if (match[2]) end = Number(match[2]);
    if (!match[1] && match[2]) {
      const suffixLength = Number(match[2]);
      start = Math.max(0, size - suffixLength);
      end = size - 1;
    }
    end = Math.min(end, size - 1);

    if (start < 0 || start > end || start >= size) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
    statusCode = 206;
  }

  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
    "Content-Length": end - start + 1,
    "Content-Type": "video/mp4",
    "X-Content-Type-Options": "nosniff",
  };
  if (statusCode === 206) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  response.writeHead(statusCode, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(competitionVideoPath, { start, end }).pipe(response);
}

const STATIC_ROUTES = {
  "/": { file: "status.html", contentType: "text/html; charset=utf-8" },
  "/status.js": { file: "status.js", contentType: "text/javascript; charset=utf-8" },
  "/status.css": { file: "status.css", contentType: "text/css; charset=utf-8" },
  "/overlay": { file: "overlay.html", contentType: "text/html; charset=utf-8" },
  "/overlay.js": { file: "overlay.js", contentType: "text/javascript; charset=utf-8" },
  "/overlay.css": { file: "overlay.css", contentType: "text/css; charset=utf-8" },
  "/tv": { file: "tv.html", contentType: "text/html; charset=utf-8" },
  "/tv.js": { file: "tv.js", contentType: "text/javascript; charset=utf-8" },
  "/tv.css": { file: "tv.css", contentType: "text/css; charset=utf-8" },
};

server.listen(port, host, () => {
  const line = "=".repeat(62);
  console.log(`\n${line}`);
  console.log("ShowScore Local Relay est prêt");
  console.log(`Code de jumelage : ${store.getPairingCode()}`);
  getOverlayUrls().forEach((url) => console.log(`Overlay OBS : ${url}`));
  console.log(`Tableau du relais : http://127.0.0.1:${port}/`);
  if (!publicHost) {
    console.log("ChromeOS : l'adresse Linux 100.115.92.x n'est pas accessible aux autres appareils.");
    console.log("Active le transfert du port 3000, puis relance avec ./start-relay.sh ADRESSE_WIFI_DU_CHROMEBOOK.");
  }
  console.log(`${line}\n`);
  queueCompetitionVideo(store.getEnvelope()?.snapshot);
});

function stop() {
  viewers.forEach((viewer) => viewer.close(1001, "Relay stopping"));
  producer?.close(1001, "Relay stopping");
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
