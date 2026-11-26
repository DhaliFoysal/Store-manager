import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../../app/api.js';
import { startBridge, stopBridge } from './bridge.js';
import { deliverScan } from './focusFill.js';
import { scanReceived, sessionCleared, sessionStarted } from './scannerSlice.js';

// ── automatic (re)connection of the permanent link ──
let pairing = false; // a request is in flight
let stoppedByUser = false; // "Stop listening on this PC" was pressed
let blockedUntil = 0; // 401/403: this user may not use the scanner – don't hammer the API
let retryTimer = null;

function autoPair(dispatch) {
  if (pairing || stoppedByUser || Date.now() < blockedUntil) return;
  pairing = true;
  api.post('/scanner/sessions')
    .then(({ data }) => { dispatch(sessionStarted(data)); startBridge(dispatch, data); })
    .catch((e) => {
      const status = e?.response?.status;
      if (status === 401 || status === 403) { blockedUntil = Date.now() + 60_000; return; }
      clearTimeout(retryTimer); // server restarting / network down: try again shortly
      retryTimer = setTimeout(() => autoPair(dispatch), 5000);
    })
    .finally(() => { pairing = false; });
}

// Re-opens the live stream after a reload and reconnects by itself whenever the stream was dropped
function useBridgeAutostart() {
  const dispatch = useDispatch();
  const { session, connection } = useSelector((s) => s.scanner);

  useEffect(() => {
    if (session && connection === 'idle') startBridge(dispatch, session);
  }, [session, connection, dispatch]);

  useEffect(() => {
    if (!session) autoPair(dispatch);
  }, [session, dispatch]);
}

/** Pairing state + actions for the PC side. */
export function useScanner() {
  const dispatch = useDispatch();
  const state = useSelector((s) => s.scanner);
  useBridgeAutostart();

  // returns the SAME permanent link for this user every time
  const pair = useCallback(async () => {
    stoppedByUser = false;
    const { data } = await api.post('/scanner/sessions');
    dispatch(sessionStarted(data));
    startBridge(dispatch, data);
  }, [dispatch]);

  // stop listening on this PC only – the phone link stays valid
  const unpair = useCallback(() => {
    stoppedByUser = true;
    stopBridge();
    dispatch(sessionCleared());
  }, [dispatch]);

  // throw the old phone link away and create a new one
  const renew = useCallback(async () => {
    stoppedByUser = false;
    const { data } = await api.post('/scanner/sessions/renew');
    stopBridge();
    dispatch(sessionStarted(data));
    startBridge(dispatch, data);
  }, [dispatch]);

  // a code from this device's own camera: goes to the focused text box too
  const injectScan = useCallback(
    (code, source = 'camera') => dispatch(scanReceived(deliverScan({ id: crypto.randomUUID(), code, source, ts: Date.now(), match: null }))),
    [dispatch],
  );

  return { ...state, pair, unpair, renew, injectScan };
}

/**
 * Call `handler(code, scan)` for every code from the paired phone that was NOT already typed into a focused text box.
 * Codes that arrived before this page was opened are NOT replayed.
 */
export function useScanListener(handler) {
  const last = useSelector((s) => s.scanner.lastScan);
  const seen = useRef(last?.id ?? null);
  const fn = useRef(handler);
  fn.current = handler;
  useBridgeAutostart();

  useEffect(() => {
    if (last && last.id !== seen.current) {
      seen.current = last.id;
      if (!last.filled) fn.current(last.code, last);
    }
  }, [last]);
}
