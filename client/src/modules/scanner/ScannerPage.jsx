import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDateTime } from '../../app/format.js';
import { Empty, PageHeader, Tabs } from '../../components/ui.jsx';
import CameraScanner from './CameraScanner.jsx';
import PairingPanel from './PairingPanel.jsx';
import { useScanner } from './hooks.js';
import './scanner.css';

export default function ScannerPage() {
  const [tab, setTab] = useState('wireless');
  const { history, injectScan } = useScanner();

  return (
    <>
      <PageHeader title="Barcode scanners" subtitle="Scan with this device's camera, or with your Android phone over the same Wi-Fi">
        <Link className="btn btn-primary" to="/pos">Go to POS</Link>
      </PageHeader>

      <div className="split">
        <div className="card">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'wireless', label: 'Wireless (phone → this PC)' }, { value: 'camera', label: 'Camera (this device)' }]} />
          <div className="card-pad">
            {tab === 'wireless' ? <PairingPanel /> : (
              <div className="stack">
                <CameraScanner onDetect={(code) => injectScan(code, 'camera')} />
                <small className="muted">Codes scanned here appear in the live feed and are delivered to whichever page is open (POS, stock, product form).</small>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Live scans</span><span className="muted">{history.length}</span></div>
          {history.length === 0 ? <Empty title="No scans yet">Scan a barcode — it will show up here instantly.</Empty> : (
            <div className="scan-feed">
              {history.map((h) => (
                <div className="row-item" key={h.id}>
                  <div>
                    <div className="mono cell-title">{h.code}</div>
                    <div className="cell-sub">{h.match ? h.match.name : h.source === 'manual' ? 'typed on phone' : 'not matched'} · {fmtDateTime(h.ts)}</div>
                  </div>
                  <span className="badge">{h.source}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <small className="muted" style={{ display: 'block', marginTop: 10 }}>Tip: keep the POS page open on the PC — codes from the phone are added to the cart automatically.</small>
    </>
  );
}
