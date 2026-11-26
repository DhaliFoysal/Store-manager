import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import './scanner.css';

// Only formats that shops really use. itf / codabar / code_93 are removed: they produce many false reads.
const WANTED = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'];
const GTIN = new Set(['ean_13', 'ean_8', 'upc_a']); // have a check digit we can verify
const CONFIRM_READS = 2; // the same code must be read this many times in a row …
const CONFIRM_WINDOW_MS = 1200; // … within this time before it is accepted
const REPEAT_BLOCK_MS = 1800; // the same code is ignored for this long after it was accepted

function gtinValid(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false;
  const d = code.split('').map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const plausible = (code, format) => code.length >= 3 && (!GTIN.has(format) || gtinValid(code));

let audioCtx;
function beep() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 1500;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.09);
  } catch {
    /* audio not available */
  }
}

/**
 * Camera barcode scanner (works on phones and PC webcams).
 * Uses the browser's native BarcodeDetector when present (Chrome on Android) and falls back to ZXing.
 * A code is accepted only when it is read twice in a row and (for EAN/UPC) its check digit is correct,
 * which removes the wrong readings. Keeps scanning until unmounted.
 * NOTE: browsers only allow camera access on HTTPS (or localhost) – see SCANNER.md.
 */
export default function CameraScanner({ onDetect, paused = false }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const last = useRef({ code: '', at: 0 });
  const pending = useRef({ code: '', n: 0, at: 0 });
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  onDetectRef.current = onDetect;
  pausedRef.current = paused;

  const [status, setStatus] = useState('starting'); // starting | ready | error
  const [error, setError] = useState('');
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let controls = null;
    let timer = null;
    const video = videoRef.current;

    const accept = (code) => {
      const now = Date.now();
      if (code === last.current.code && now - last.current.at < REPEAT_BLOCK_MS) return;
      last.current = { code, at: now };
      navigator.vibrate?.(60);
      beep();
      setFlash((n) => n + 1);
      onDetectRef.current(code);
    };

    // every raw read goes through here: validate, then require repeated confirmation
    const read = (raw, format = '') => {
      if (pausedRef.current) return;
      const code = String(raw || '').trim();
      if (!code || !plausible(code, format)) return;
      const now = Date.now();
      const p = pending.current;
      if (p.code === code && now - p.at < CONFIRM_WINDOW_MS) p.n += 1;
      else { p.code = code; p.n = 1; }
      p.at = now;
      if (p.n >= CONFIRM_READS) { p.n = 0; accept(code); }
    };

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('insecure');
        setStatus('error');
        return;
      }
      const constraints = {
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          video.srcObject = stream;
          await video.play();
          const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || WANTED;
          const detector = new window.BarcodeDetector({ formats: WANTED.filter((f) => supported.includes(f)) });
          const tick = async () => {
            if (stopped) return;
            try {
              if (video.readyState >= 2) {
                const found = await detector.detect(video);
                for (const f of found) read(f.rawValue, f.format);
              }
            } catch {
              /* a frame failed to decode – try the next one */
            }
            timer = setTimeout(tick, 100);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
          const hints = new Map([
            [DecodeHintType.POSSIBLE_FORMATS, WANTED.map((f) => BarcodeFormat[f.toUpperCase()]).filter((v) => v !== undefined)],
            [DecodeHintType.TRY_HARDER, true],
          ]);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
          controls = await reader.decodeFromConstraints(constraints, video, (result) => {
            if (result) read(result.getText(), String(BarcodeFormat[result.getBarcodeFormat()] || '').toLowerCase());
          });
          stream = video.srcObject;
        }
        if (stopped) return;
        const track = stream?.getVideoTracks?.()[0];
        trackRef.current = track || null;
        const caps = track?.getCapabilities?.() || {};
        // continuous auto-focus = sharp barcodes = correct reads
        if (caps.focusMode?.includes?.('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        setTorch({ supported: !!caps.torch, on: false });
        setStatus('ready');
      } catch (e) {
        if (stopped) return;
        setError(e?.name === 'NotAllowedError' ? 'denied' : e?.name === 'NotFoundError' ? 'nocamera' : 'camera');
        setStatus('error');
      }
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      try {
        controls?.stop();
      } catch {
        /* ignore */
      }
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    const next = !torch.on;
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: next }] });
      setTorch({ supported: true, on: next });
    } catch {
      /* torch not controllable on this device */
    }
  };

  const messages = {
    insecure: (
      <>
        <strong>Camera needs a secure (HTTPS) connection.</strong>
        <div style={{ marginTop: 6, fontSize: 13 }}>Start the app with <code>npm run dev:lan</code> and open the https:// address on the phone.</div>
      </>
    ),
    denied: <strong>Camera permission was denied. Allow camera access for this site in the browser settings, then reload.</strong>,
    nocamera: <strong>No camera was found on this device.</strong>,
    camera: <strong>The camera could not be started. Close other apps that use it and try again.</strong>,
  };

  return (
    <div className="cam">
      <video ref={videoRef} playsInline muted />
      {status === 'ready' && <div className="cam-frame" />}
      {flash > 0 && <div key={flash} className="cam-flash" />}
      {status === 'starting' && <div className="cam-msg"><span className="spinner" /></div>}
      {status === 'error' && <div className="cam-msg" style={{ background: 'rgba(29,18,25,.92)' }}><div>{messages[error]}</div></div>}
      {status === 'ready' && torch.supported && (
        <div className="cam-bar">
          <button type="button" className="btn btn-sm" onClick={toggleTorch}><Zap /> {torch.on ? 'Torch off' : 'Torch'}</button>
        </div>
      )}
    </div>
  );
}
