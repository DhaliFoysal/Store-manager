import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Keyboard, Pause, Play } from 'lucide-react';
import CameraScanner from './CameraScanner.jsx';
import './scanner.css';

/**
 * Opened on the Android phone from the QR code:  /scan?s=<session>&t=<phone token>
 * No sign-in – the token only allows sending scans to that one PC session.
 */
export default function PhoneScanner() {
  const [params] = useSearchParams();
  const s = params.get('s');
  const t = params.get('t');
  const base = `/api/scanner/sessions/${encodeURIComponent(s || '')}`;

  const [link, setLink] = useState(s && t ? 'checking' : 'invalid'); // checking | ok | pc-away | invalid
  const [result, setResult] = useState(null); // { ok, code, text }
  const [recent, setRecent] = useState([]);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState('');
  const sending = useRef(false);

  // connect + heartbeat every 20 s (also tells the PC the phone is online)
  useEffect(() => {
    if (!s || !t) return;
    let alive = true;
    const hello = () =>
      axios.post(`${base}/hello`, { token: t })
        .then((r) => alive && setLink(r.data.pcListening ? 'ok' : 'pc-away'))
        .catch((e) => alive && setLink(e.response?.status === 401 ? 'invalid' : 'pc-away'));
    hello();
    const id = setInterval(hello, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [s, t, base]);

  const send = useCallback(async (code, source = 'camera') => {
    if (sending.current) return;
    sending.current = true;
    try {
      const { data } = await axios.post(`${base}/scan`, { token: t, code, source });
      const text = data.match ? `${data.match.name}${data.match.status && data.match.status !== 'IN_STOCK' ? ` (${data.match.status.toLowerCase()})` : ''}` : 'Sent — not found in your products';
      setResult({ ok: !!data.match, sent: true, code, text });
      setRecent((r) => [{ code, text, ok: !!data.match, at: Date.now() }, ...r].slice(0, 20));
      setLink('ok');
    } catch (e) {
      const status = e.response?.status;
      if (status === 401) setLink('invalid');
      const text = e.response?.data?.message || 'Could not reach the server';
      setResult({ ok: false, sent: false, code, text });
    } finally {
      sending.current = false;
    }
  }, [base, t]);

  if (link === 'invalid') {
    return (
      <div className="phone">
        <div className="callout bad"><strong>This scanner link is invalid or has expired.</strong><div style={{ marginTop: 4 }}>On the computer, open the app and show the pairing QR code again, then scan it with this phone.</div></div>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="phone-head">
        <strong style={{ fontSize: 17 }}>Phone scanner</strong>
        <span><span className={`phone-dot ${link === 'ok' ? 'ok' : ''}`} />{link === 'ok' ? 'Connected to PC' : link === 'checking' ? 'Connecting…' : 'PC not listening'}</span>
      </div>

      {link === 'pc-away' && <div className="callout warn">The computer isn't listening right now. Keep the app open on the PC (the page with the pairing code).</div>}

      <CameraScanner paused={paused} onDetect={(code) => send(code, 'camera')} />

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
