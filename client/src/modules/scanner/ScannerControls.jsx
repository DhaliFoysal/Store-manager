import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Camera, Smartphone } from 'lucide-react';
import { Modal } from '../../components/ui.jsx';
import CameraScanner from './CameraScanner.jsx';
import PairingPanel from './PairingPanel.jsx';
import { deliverScan } from './focusFill.js';

// keep the text box the user clicked focused when they press these buttons
const keepFocus = (e) => e.preventDefault();

/** Header button for any page: opens the phone-pairing dialog and shows live status. */
export function PhoneScannerButton() {
  const [open, setOpen] = useState(false);
  const { session, phoneOnline } = useSelector((s) => s.scanner);
  return (
    <>
      <button className="btn" onMouseDown={keepFocus} onClick={() => setOpen(true)}>
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

/** Opens this device's camera (phone or webcam). Each code goes into the clicked text box, otherwise to `onCode`. */
export function CameraScanButton({ onCode, label = 'Camera' }) {
  const [open, setOpen] = useState(false);
  const [lastCode, setLastCode] = useState('');

  const handle = (code) => {
    setLastCode(code);
    const r = deliverScan({ code });
    if (!r.filled) onCode(code);
  };

  return (
    <>
      <button className="btn" onMouseDown={keepFocus} onClick={() => setOpen(true)}><Camera /> {label}</button>
      {open && (
        <Modal title="Camera scanner" onClose={() => setOpen(false)}
          footer={<button className="btn btn-primary" onMouseDown={keepFocus} onClick={() => setOpen(false)}>Done</button>}>
          <div className="stack">
            <CameraScanner onDetect={handle} />
            <div className="muted">{lastCode ? <>Last scan: <span className="mono cell-title">{lastCode}</span></> : 'Point the camera at a barcode — scanning continues until you press Done.'}</div>
          </div>
        </Modal>
      )}
    </>
  );
}
