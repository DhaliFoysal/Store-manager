import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Link2Off, Smartphone } from 'lucide-react';
import { useFetch, useToast } from '../../app/hooks.js';
import { Field } from '../../components/ui.jsx';
import { useScanner } from './hooks.js';
import './scanner.css';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** QR-code pairing between this PC session and a phone on the same Wi-Fi. */
export default function PairingPanel() {
  const toast = useToast();
  const { session, connection, phoneOnline, pair, unpair } = useScanner();
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState('');

  const isLocal = LOCAL_HOSTS.includes(window.location.hostname);
  const net = useFetch('/scanner/network', undefined, { enabled: !!session && isLocal });
  const addresses = net.data?.addresses || [];

  // A phone cannot open "localhost" (that is the phone itself) – use this PC's Wi-Fi address instead
  const host = ip || addresses[0]?.address;
  const base = isLocal ? (host ? `${window.location.protocol}//${host}${window.location.port ? `:${window.location.port}` : ''}` : '') : window.location.origin;
  const url = session && base ? `${base}/scan?s=${session.id}&t=${session.phoneToken}` : '';
  const insecure = url.startsWith('http://');

  const doPair = async () => {
    setBusy(true);
    try { await pair(); } catch (e) { toast.fail(e); } finally { setBusy(false); }
  };

  if (!session) {
    return (
      <div className="stack">
        <p style={{ margin: 0 }} className="muted">
          Use your Android phone as a wireless scanner: scan with its camera and the code appears here instantly. Phone and PC must be on the <strong>same Wi-Fi</strong>.
        </p>
        <div><button className="btn btn-primary" disabled={busy} onClick={doPair}><Smartphone /> Connect a phone</button></div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="flex wrap">
        <span className={`badge ${connection === 'open' ? 'badge-ok' : 'badge-warn'}`}>{connection === 'open' ? 'Listening' : 'Connecting…'}</span>
        <span className={`badge ${phoneOnline ? 'badge-ok' : 'badge-muted'}`}>{phoneOnline ? 'Phone connected' : 'Waiting for phone'}</span>
      </div>

      {isLocal && !net.loading && addresses.length === 0 && (
        <div className="callout warn">No Wi-Fi / LAN address was found on this PC. Connect it to the same Wi-Fi as the phone and re-open this window.</div>
      )}
      {isLocal && addresses.length > 1 && (
        <Field label="This PC's network address" hint="Pick the one on the same Wi-Fi as the phone (usually 192.168.x.x)">
          <select value={host} onChange={(e) => setIp(e.target.value)}>
            {addresses.map((a) => <option key={a.address} value={a.address}>{a.address} ({a.name})</option>)}
          </select>
        </Field>
      )}

      {url && (
        <div className="flex wrap" style={{ alignItems: 'flex-start', gap: 18 }}>
          <div className="qr-box"><QRCodeSVG value={url} size={190} /></div>
          <div className="stack" style={{ flex: 1, minWidth: 220, gap: 8 }}>
            <div><strong>1.</strong> Open the phone's camera or any QR app and scan this code.</div>
            <div><strong>2.</strong> Allow camera access and point it at a barcode.</div>
            <div className="mono muted" style={{ wordBreak: 'break-all', fontSize: 11.5 }}>{url}</div>
            <div className="flex">
              <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link copied'))}><Copy /> Copy link</button>
              <button className="btn btn-sm btn-danger" onClick={unpair}><Link2Off /> Disconnect</button>
            </div>
          </div>
        </div>
      )}
      {insecure && (
        <div className="callout warn">
          This link is plain <code>http://</code>, so Android Chrome will block the <strong>camera</strong>. Stop the dev server and run <code>npm run dev:lan</code> instead
          (HTTPS), then pair again. On the phone tap <em>Advanced → Proceed</em> once for the self-signed certificate.
        </div>
      )}
    </div>
  );
}
