import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Camera, Smartphone } from 'lucide-react';
import { Modal } from '../../components/ui.jsx';
import CameraScanner from './CameraScanner.jsx';
import PairingPanel from './PairingPanel.jsx';

/** Header button for any page: opens the phone-pairing dialog and shows live status. */
export function PhoneScannerButton() {
  const [open, setOpen] = useState(false);
  const { session, phoneOnline } = useSelector((s) => s.scanner);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Smartphone /> Phone scanner
        {session && <span className={`phone-dot ${phoneOnline ? 'ok' : ''}`} style={{ margin: 0 }} />}
      </button>
      {open && (
        <Modal title="Wireless phone scanner" onClose={() => setOpen(false)}>
          <PairingPanel />
        </Modal>
      )}
    </>
  );
}

/** Opens this device's camera (phone or webcam) and feeds every code to `onCode`. Stays open for multiple scans. */
export function CameraScanButton({ onCode, label = 'Camera' }) {
  const [open, setOpen] = useState(false);
  const [lastCode, setLastCode] = useState('');
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><Camera /> {label}</button>
      {open && (
        <Modal title="Camera scanner" onClose={() => setOpen(false)}
          footer={<button className="btn btn-primary" onClick={() => setOpen(false)}>Done</button>}>
          <div className="stack">
            <CameraScanner onDetect={(code) => { setLastCode(code); onCode(code); }} />
            <div className="muted">{lastCode ? <>Last scan: <span className="mono cell-title">{lastCode}</span></> : 'Point the camera at a barcode — scanning continues until you press Done.'}</div>
          </div>
        </Modal>
      )}
    </>
  );
}
