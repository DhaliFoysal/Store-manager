import crypto from "node:crypto";

/**
 * In-memory live state for a PAIRING (one per user, stored in the DB, never expires).
 * Only listeners / online-status live here; tokens come from the DB so the phone link survives restarts.
 */
const PHONE_TIMEOUT_MS = 45_000;
const IDLE_EVICT_MS = 30 * 60_000;

const sessions = new Map(); // key = pairing code

export const rand = (n) => crypto.randomBytes(n).toString("base64url");

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function ensureSession({
  code,
  storeId,
  userId,
  phoneToken,
  streamToken,
}) {
  let s = sessions.get(code);
  if (!s) {
    s = {
      id: code,
      storeId,
      userId,
      phoneToken,
      streamToken,
      listeners: new Set(),
      createdAt: Date.now(),
      expiresAt: Infinity,
      lastActive: Date.now(),
      phoneSeenAt: 0,
      phoneOnline: false,
    };
    sessions.set(code, s);
  } else {
    s.phoneToken = phoneToken;
    s.streamToken = streamToken;
  }
  return s;
}

export const getSession = (id) => sessions.get(id) || null;

export function emit(s, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of s.listeners) {
    try {
      res.write(payload);
    } catch {
      s.listeners.delete(res);
    }
  }
}

export function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  emit(s, "closed", {});
  for (const res of s.listeners) {
    try {
      res.end();
    } catch {
      /* already gone */
    }
  }
  s.listeners.clear();
  sessions.delete(id);
}

export function touchPhone(s) {
  s.phoneSeenAt = Date.now();
  s.lastActive = s.phoneSeenAt;
  if (!s.phoneOnline) {
    s.phoneOnline = true;
    emit(s, "phone", { online: true });
  }
}

export function sweep(now = Date.now()) {
  for (const s of [...sessions.values()]) {
    if (s.phoneOnline && now - s.phoneSeenAt > PHONE_TIMEOUT_MS) {
      s.phoneOnline = false;
      emit(s, "phone", { online: false });
    }
    if (s.listeners.size || s.phoneOnline) s.lastActive = now;
    else if (now - s.lastActive > IDLE_EVICT_MS) {
      sessions.delete(s.id);
      continue;
    } // re-created from DB on demand
    for (const res of s.listeners) {
      try {
        res.write(": ping\n\n");
      } catch {
        s.listeners.delete(res);
      }
    }
  }
}

const timer = setInterval(sweep, 15_000);
timer.unref();

export const newScanId = () => crypto.randomUUID();
export const _sessionCount = () => sessions.size;
