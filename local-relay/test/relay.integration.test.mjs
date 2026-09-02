import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const relayDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

test("relays current state, rejects stale updates, and restores state after restart", { timeout: 15_000 }, async (context) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "showscore-relay-integration-"));
  const port = await reservePort();
  const pairingCode = "482731";
  const videoBytes = Buffer.from("showscore-local-mp4-test");
  const mediaPort = await reservePort();
  let mediaServer = http.createServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": videoBytes.length,
    });
    response.end(videoBytes);
  });
  await new Promise((resolve) => mediaServer.listen(mediaPort, "127.0.0.1", resolve));
  let relayProcess = null;

  context.after(async () => {
    if (relayProcess) await stopRelay(relayProcess);
    if (mediaServer) await closeServer(mediaServer);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });

  relayProcess = await startRelay({ dataDirectory, pairingCode, port });
  const producer = await connectClient(`ws://127.0.0.1:${port}/ws/producer`);
  producer.socket.send(JSON.stringify({
    type: "producer.hello",
    producerId: "announcer-test",
    pairingCode,
  }));
  assert.equal((await producer.next((message) => message.type === "producer.ready")).lastVersion, "0");

  const viewer = await connectClient(`ws://127.0.0.1:${port}/ws/viewer`);
  await viewer.next((message) => message.type === "viewer.ready");
  const tvViewer = await connectClient(`ws://127.0.0.1:${port}/ws/viewer?kind=tv`);
  await tvViewer.next((message) => message.type === "viewer.ready");

  producer.socket.send(JSON.stringify(snapshotMessage(
    "200",
    "Current rider",
    `http://127.0.0.1:${mediaPort}/competition.mp4`
  )));
  const current = await viewer.next((message) => message.type === "snapshot");
  assert.equal(current.snapshot.liveClasses[0].activeRun.rider, "Current rider");
  const tvCurrent = await tvViewer.next((message) => message.type === "snapshot");
  assert.equal(tvCurrent.snapshot.liveClasses[0].activeRun.rider, "Current rider");

  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/status`);
  const status = await statusResponse.json();
  assert.equal(status.overlayViewerCount, 1);
  assert.equal(status.tvViewerCount, 1);
  assert.ok(status.tvUrls.some((item) => item.url.endsWith("/tv")));
  assert.ok(status.tvUrls.some((item) => item.kind === "arena" && item.arena === "Main Arena"));
  assert.ok(status.tvUrls.some((item) => item.kind === "competition" && item.arena === "Main Arena"));
  assert.ok(status.tvUrls.some((item) => item.kind === "standings" && item.arena === "Main Arena"));
  assert.equal(status.sponsorCount, 1);

  const mediaStatus = await waitForMediaReady(port);
  assert.equal(mediaStatus.ready, true);
  assert.equal(mediaStatus.size, videoBytes.length);
  const rangedVideoResponse = await fetch(
    `http://127.0.0.1:${port}/media/competition-video.mp4`,
    { headers: { Range: "bytes=2-5" } }
  );
  assert.equal(rangedVideoResponse.status, 206);
  assert.equal(rangedVideoResponse.headers.get("accept-ranges"), "bytes");
  assert.deepEqual(
    Buffer.from(await rangedVideoResponse.arrayBuffer()),
    videoBytes.subarray(2, 6)
  );

  producer.socket.send(JSON.stringify(snapshotMessage("199", "Stale rider")));
  const staleAcknowledgement = await producer.next(
    (message) => message.type === "snapshot.ack" && message.version === "199"
  );
  assert.equal(staleAcknowledgement.accepted, false);
  assert.equal(staleAcknowledgement.currentVersion, "200");

  producer.socket.close();
  viewer.socket.close();
  tvViewer.socket.close();
  await closeServer(mediaServer);
  mediaServer = null;
  await stopRelay(relayProcess);
  relayProcess = await startRelay({ dataDirectory, pairingCode, port });

  const restoredViewer = await connectClient(`ws://127.0.0.1:${port}/ws/viewer`);
  const restored = await restoredViewer.next((message) => message.type === "snapshot");
  assert.equal(restored.version, "200");
  assert.equal(restored.snapshot.liveClasses[0].activeRun.rider, "Current rider");
  const restoredMediaStatus = await waitForMediaReady(port);
  assert.equal(restoredMediaStatus.ready, true);

  const overlayResponse = await fetch(`http://127.0.0.1:${port}/overlay`);
  const overlayHtml = await overlayResponse.text();
  assert.equal(overlayResponse.status, 200);
  assert.match(overlayHtml, /Drag en cours/);
  assert.match(overlayHtml, /sponsor-takeover/);

  const tvResponse = await fetch(`http://127.0.0.1:${port}/tv`);
  const tvHtml = await tvResponse.text();
  assert.equal(tvResponse.status, 200);
  assert.match(tvHtml, /ShowScore TV locale/);
  assert.match(tvHtml, /competition-panel/);

  restoredViewer.socket.close();
});

function snapshotMessage(version, rider, videoUrl = "") {
  return {
    type: "snapshot.publish",
    producerId: "announcer-test",
    version,
    snapshot: {
      schemaVersion: 1,
      show: {
        id: "show-1",
        name: "Test show",
        tvDisplayVideoArena: "Main Arena",
        tvDisplayVideoPath: "test/show-1/competition.mp4",
        tvDisplayVideoUrl: videoUrl,
        tvDisplayVideoName: "competition.mp4",
        tvDisplayVideoSize: 24,
      },
      association: {
        sponsorGroups: [{
          id: "gold",
          name: "Gold",
          logos: [{ id: "sponsor-1", logoDataUrl: "data:image/png;base64,bG9nbw==" }],
        }],
      },
      liveClasses: [
        {
          classId: "class-1",
          arena: "Main Arena",
          activeRun: { id: "run-1", rider },
        },
      ],
      livePaidWarmups: [],
    },
  };
}

async function waitForMediaReady(port) {
  let status = null;
  await waitUntil(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/media/status`);
    status = await response.json();
    return status.ready;
  }, 5000);
  return status;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startRelay({ dataDirectory, pairingCode, port }) {
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: relayDirectory,
    env: {
      ...process.env,
      SHOWSCORE_RELAY_CODE: pairingCode,
      SHOWSCORE_RELAY_DATA_DIR: dataDirectory,
      SHOWSCORE_RELAY_HOST: "127.0.0.1",
      SHOWSCORE_RELAY_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  await waitUntil(() => output.includes("ShowScore Local Relay est prêt"), 5000, () => {
    throw new Error(`Relay failed to start:\n${output}`);
  });
  return child;
}

async function stopRelay(child) {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
}

async function connectClient(url) {
  const socket = new WebSocket(url);
  const messages = [];

  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    messages.push(message);
  });

  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  return {
    socket,
    async next(predicate) {
      await waitUntil(() => messages.some(predicate), 3000);
      const index = messages.findIndex(predicate);
      return messages.splice(index, 1)[0];
    },
  };
}

async function waitUntil(predicate, timeoutMs, onTimeout) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      if (onTimeout) return onTimeout();
      throw new Error("Timed out waiting for relay event");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
