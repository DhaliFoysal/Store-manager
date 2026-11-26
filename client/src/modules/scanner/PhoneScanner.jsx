import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Keyboard, Pause, Play } from 'lucide-react';
import CameraScanner from './CameraScanner.jsx';
import './scanner.css';

const SAVED = 'phone-scanner-link';
const readSaved = () => {
  try { return JSON.parse(localStorage.getItem(SAVED)); } catch { return null; }
};
const writeSaved = (v) => {
  try { if (v) localStorage.setItem(SAVED, JSON.stringify(v)); else localStorage.removeItem(SAVED); } catch { /* private mode */ }
};

/**
 * Opened on the Android phone:  /scan?s=<session>&t=<phone token>
 * No sign-in – the token only allows sending scans to that one PC session.
 * The link is remembered on the phone, so opening plain /scan later reconnects the camera automatically.
 */
export default function PhoneScanner() {
  const [params] = useSearchParams();
  const [creds] = useState(() => {
    const s = params.get('s');
    const t = params.get('t');
    if (s && t) return { s, t, fromUrl: true };
    const saved = readSaved();
    return saved?.s && saved?.t ? { ...saved, fromUrl: false } : { s: null, t: null, fromUrl: false };
  });
  const { s, t } = creds;
  const base = `/api/scanner/sessions/${encodeURIComponent(s || '')}`;

  const [link, setLink] = useState(s && t ? 'checking' : 'invalid'); // checking | ok | pc-away | invalid
  const [result, setResult] = useState(null); // { ok, code, text }
  const [recent, setRecent] = useState([]);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState('');
  const [camKey, setCamKey] = useState(0);
  const [queued, setQueued] = useState(0);
  const sending = useRef(false);
  const queue = useRef([]); // scans taken while the PC was not listening

  const post = useCallback((code, source) => axios.post(`${base}/scan`, { token: t, code, source }), [base, t]);

  const flush = useCallback(async () => {
    while (queue.current.length) {
      const item = queue.current[0];
      try {
        await post(item.code, item.source);
        queue.current.shift();
        setQueued(queue.current.length);
      } catch (e) {
        if (e.response?.status !== 409) queue.current.shift(); // bad code: drop it; 409 = PC still away: keep
        setQueued(queue.current.length);
        break;
      }
    }
  }, [post]);

  // connect + heartbeat every 20 s (also tells the PC the phone is online)
  useEffect(() => {
    if (!s || !t) return;
    let alive = true;
    const hello = () =>
      axios.post(`${base}/hello`, { token: t })
        .then((r) => {
          if (!alive) return;
          setLink(r.data.pcListening ? 'ok' : 'pc-away');
          writeSaved({ s, t }); // the link works -> remember it on this phone
          if (r.data.pcListening) flush();
        })
        .catch((e) => {
          if (!alive) return;
          if (e.response?.status === 401) {
            setLink('invalid');
            writeSaved(null);
          } else setLink('pc-away'); // network problem: keep the saved link, just retry
        });
    hello();
    const id = setInterval(hello, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [s, t, base, flush, creds.fromUrl]);

  // keep the screen on and restart the camera after the browser was in the background
  useEffect(() => {
    let lock = null;
    const req = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ } };
    req();
    const onVis = () => {
      if (document.visibilityState === 'visible') { req(); setCamKey((k) => k + 1); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
    };
  }, []);

  const send = useCallback(async (code, source = 'camera') => {
    if (sending.current) return;
    sending.current = true;
    try {
      const { data } = await post(code, source);
      const text = data.match ? `${data.match.name}${data.match.status && data.match.status !== 'IN_STOCK' ? ` (${data.match.status.toLowerCase()})` : ''}` : 'Sent — not found in your products';
      setResult({ ok: !!data.match, sent: true, code, text });
      setRecent((r) => [{ code, text, ok: !!data.match, at: Date.now() }, ...r].slice(0, 20));
      setLink('ok');
    } catch (e) {
      const status = e.response?.status;
      if (status === 401) {
        setLink('invalid');
        writeSaved(null);
        setResult({ ok: false, sent: false, code, text: e.response?.data?.message || 'Link is no longer valid' });
      } else if (status === 409 || !e.response) {
        // PC not listening / network down: keep the scan and deliver it as soon as the PC is back
        queue.current.push({ code, source });
        queue.current = queue.current.slice(-30);
        setQueued(queue.current.length);
        setLink('pc-away');
        setResult({ ok: false, sent: false, code, text: 'Saved — will be sent when the PC is connected' });
      } else {
        setResult({ ok: false, sent: false, code, text: e.response?.data?.message || 'Could not send' });
      }
    } finally {
      sending.current = false;
    }
  }, [post]);

  if (link === 'invalid') {
    return (
      <div className="phone">
        <div className="callout bad"><strong>This scanner link is invalid.</strong><div style={{ marginTop: 4 }}>On the computer, open the app, show the pairing QR code and scan it with this phone. (This happens only if “Generate new link” was pressed, or the account was deactivated.)</div></div>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="phone-head">
        <strong style={{ fontSize: 17 }}>Phone scanner</strong>
        <span><span className={`phone-dot ${link === 'ok' ? 'ok' : ''}`} />{link === 'ok' ? 'Connected to PC' : link === 'checking' ? 'Connecting…' : 'PC not listening'}</span>
      </div>

      {link === 'pc-away' && <div className="callout warn">The computer isn't listening right now. Keep the app open on the PC. Scans are kept{queued ? ` (${queued} waiting)` : ''} and sent automatically.</div>}

      <CameraScanner key={camKey} paused={paused} onDetect={(code) => send(code, 'camera')} />

      <div className="flex">
        <button className="btn grow" onClick={() => setPaused((p) => !p)}>{paused ? <><Play /> Resume scanning</> : <><Pause /> Pause</>}</button>
      </div>

      {result && (
        <div className={`phone-result ${result.sent ? (result.ok ? 'ok' : '') : 'bad'}`}>
          <div className="phone-code">{result.code}</div>
          <div style={{ marginTop: 2 }}>{result.sent ? '✓ ' : '✗ '}{result.text}</div>
        </div>
      )}

      <form className="flex" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { send(manual.trim(), 'manual'); setManual(''); } }}>
        <input className="grow" inputMode="text" placeholder="Type a barcode / serial manually…" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn btn-primary" disabled={!manual.trim()}><Keyboard /> Send</button>
      </form>

      {recent.length > 0 && (
        <div className="card scan-feed">
          {recent.map((r) => (
            <div className="row-item" key={r.at + r.code}>
              <span className="mono cell-title">{r.code}</span>
              <span className={r.ok ? '' : 'muted'} style={{ textAlign: 'right' }}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
