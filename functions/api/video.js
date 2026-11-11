import { BufferSource, Input, MP4, WEBM } from "mediabunny";

const MAX_BYTES = 5_000_000;
const MAX_SECONDS = 10;
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

function reply(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isOpen(env) {
  const start = Date.parse(env.VIDEO_ABRE);
  const end = Date.parse(env.VIDEO_CIERRA);
  const now = Date.now();
  return SCRIPT_URL.test(env.VIDEO_SCRIPT_URL) && env.VIDEO_UPLOAD_KEY?.length >= 32
    && now >= start && now < end;
}

export function onRequestGet({ env }) {
  return reply({ open: Boolean(isOpen(env)) });
}

async function readClip(request) {
  if (!request.body || Number(request.headers.get("Content-Length")) > MAX_BYTES) return null;

  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const clip = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    clip.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return clip;
}

async function inspectClip(bytes) {
  const media = new Input({ source: new BufferSource(bytes), formats: [MP4, WEBM] });
  try {
    const format = await media.getFormat();
    const tracks = await media.getTracks();
    const videoTracks = tracks.filter((track) => track.isVideoTrack());
    const audioTracks = tracks.filter((track) => track.isAudioTrack());
    if (videoTracks.length !== 1 || audioTracks.length > 1
      || tracks.length !== videoTracks.length + audioTracks.length) return null;

    const start = await media.getFirstTimestamp(tracks);
    const end = await media.computeDuration(tracks);
    const duration = end - start;
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS || end > MAX_SECONDS) {
      return null;
    }

    return format === MP4 ? "mp4" : "webm";
  } catch {
    return null;
  } finally {
    media.dispose();
  }
}

function encodeClip(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  const parts = [];
  // Los bloques son múltiplos de tres para evitar relleno en el medio.
  for (let offset = 0; offset < bytes.length; offset += 24_576) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 24_576))));
  }
  return parts.join("");
}

export async function onRequestPost({ request, env }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return reply({ error: "Origen no permitido." }, 403);
  }
  if (!isOpen(env)) return reply({ error: "Los envíos están cerrados." }, 403);

  const id = request.headers.get("X-Upload-Id");
  if (!UPLOAD_ID.test(id)) return reply({ error: "Envío inválido." }, 400);

  try {
    const bytes = await readClip(request);
    if (!bytes) return reply({ error: "El video supera los 5 MB." }, 413);

    const format = await inspectClip(bytes);
    if (!format) return reply({ error: "Grabá un video de hasta 10 segundos." }, 422);

    const response = await fetch(env.VIDEO_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ key: env.VIDEO_UPLOAD_KEY, id, format, video: encodeClip(bytes) }),
      signal: AbortSignal.timeout(30_000),
    });
    const result = response.ok ? await response.json() : null;
    if (result?.ok === true) return reply({ ok: true });
    if (result?.error === "full") return reply({ error: "Se completó el cupo de videos de esta fecha." }, 409);
  } catch {
    // Un reintento usa el mismo ID para recuperar una confirmación perdida.
  }
  return reply({ error: "No pudimos confirmar el envío. Podés reintentar." }, 502);
}
