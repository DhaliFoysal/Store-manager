import { connectionChanged, phoneChanged, scanReceived, sessionCleared } from './scannerSlice.js';
import { deliverScan } from './focusFill.js';

// One EventSource per browser tab, kept alive across page navigation (it lives outside React).
let es = null;
let currentId = null;

export function stopBridge() {
  if (es) es.close();
  es = null;
  currentId = null;
}

export function startBridge(dispatch, session) {
  if (es && currentId === session.id) return;
  stopBridge();
  currentId = session.id;
  dispatch(connectionChanged('connecting'));

  const source = new EventSource(`/api/scanner/sessions/${session.id}/stream?token=${encodeURIComponent(session.streamToken)}`);
  es = source;

  const parse = (e) => {
    try {
      return JSON.parse(e.data);
    } catch {
      return {};
    }
  };

  source.onopen = () => dispatch(connectionChanged('open'));
  source.addEventListener('state', (e) => dispatch(phoneChanged(!!parse(e).phoneOnline)));
  source.addEventListener('phone', (e) => dispatch(phoneChanged(!!parse(e).online)));
  // the code is typed into the focused text box first; only if there is none do page listeners get it
  source.addEventListener('scan', (e) => dispatch(scanReceived(deliverScan(parse(e)))));
  source.addEventListener('closed', () => {
    stopBridge();
    dispatch(sessionCleared());
  });
  source.onerror = () => {
    // CLOSED = the server refused (session expired / API restarted): give up and ask to re-pair.
    // CONNECTING = a network blip: the browser retries by itself.
    if (source.readyState === EventSource.CLOSED) {
      stopBridge();
      dispatch(sessionCleared());
    } else {
      dispatch(connectionChanged('connecting'));
    }
  };
}
