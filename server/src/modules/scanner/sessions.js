import crypto from 'node:crypto';

/**
 * In-memory pairing sessions between a PC (listening over Server-Sent Events) and a phone (posting scans).
 * They are short-lived on purpose. NOTE: memory is per Node process – if you run several API instances
 * behind a load balancer, give the scanner routes sticky routing (or move this Map to Redis).
 */
const TTL_MS = 12 * 60 * 60 * 1000; // a session lives 12 h from creation
const PHONE_TIMEOUT_MS = 45_000; // phone pings every ~20 s; silent for 45 s = offline
const MAX_PER_USER = 5;

const sessions = new Map();

const rand = (n) => crypto.randomBytes(n).toString('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function createSession({ storeId, userId }) {
  // keep only the newest few sessions per user
  const mine = [...sessions.values()].filter((s) => s.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  while (mine.length >= MAX_PER_USER) closeSession(mine.shift().id);

  const now = Date.now();
  const s = {
    id: rand(9),
    phoneToken: rand(24), // goes into the QR code – lets a phone SEND scans, nothing else
    streamToken: rand(24), // stays in the PC browser – lets the PC LISTEN
    storeId,
    userId,
    listeners: new Set(),
    createdAt: now,
    expiresAt: now + TTL_MS,
    phoneSeenAt: 0,
    phoneOnline: false,
  };
  sessions.set(s.id, s);
  return s;
}

export function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    closeSession(id);
    return null;
  }
  return s;
}

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
  emit(s, 'closed', {});
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

// phone said hello / heartbeat
export function touchPhone(s) {
  s.phoneSeenAt = Date.now();
  if (!s.phoneOnline) {
    s.phoneOnline = true;
    emit(s, 'phone', { online: true });
  }
}

// periodic upkeep: SSE keep-alive, offline detection, expiry
export function sweep(now = Date.now()) {
  for (const s of [...sessions.values()]) {
    if (s.expiresAt < now) {
      closeSession(s.id);
      continue;
    }
    if (s.phoneOnline && now - s.phoneSeenAt > PHONE_TIMEOUT_MS) {
      s.phoneOnline = false;
      emit(s, 'phone', { online: false });
    }
    for (const res of s.listeners) {
      try {
        res.write(': ping\n\n'); // keeps proxies / Wi-Fi routers from dropping the idle stream
      } catch {
        s.listeners.delete(res);
      }
    }
  }
}

const timer = setInterval(sweep, 15_000);
timer.unref();

export const newScanId = () => crypto.randomUUID();
export const _sessionCount = () => sessions.size; // for tests
