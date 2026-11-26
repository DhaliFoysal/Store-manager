import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import './scanner.css';

const WANTED = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'];

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
 * Keeps scanning until unmounted; the same code is ignored for 1.8 s so one barcode is not sent repeatedly.
 * NOTE: browsers only allow camera access on HTTPS (or localhost) – see SCANNER.md.
 */
export default function CameraScanner({ onDetect, paused = false }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const last = useRef({ code: '', at: 0 });
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

    const handle = (code) => {
      const now = Date.now();
      if (pausedRef.current || !code) return;
      if (code === last.current.code && now - last.current.at < 1800) return;
      last.current = { code, at: now };
      navigator.vibrate?.(60);
      beep();
      setFlash((n) => n + 1);
      onDetectRef.current(code);
    };

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('insecure');
        setStatus('error');
        return;
      }
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
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
                if (found[0]?.rawValue) handle(found[0].rawValue);
              }
            } catch {
              /* a frame failed to decode – try the next one */
            }
            timer = setTimeout(tick, 120);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result) => {
            if (result) handle(result.getText());
          });
          stream = video.srcObject;
        }
        if (stopped) return;
        const track = stream?.getVideoTracks?.()[0];
        trackRef.current = track || null;
        setTorch({ supported: !!track?.getCapabilities?.().torch, on: false });
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
