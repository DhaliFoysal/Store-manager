import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../../app/api.js';
import { startBridge, stopBridge } from './bridge.js';
import { scanReceived, sessionCleared, sessionStarted } from './scannerSlice.js';

let autoTried = false; // the permanent link is fetched automatically once per page load

// Re-opens the live stream after a reload, and connects automatically (same link every time)
function useBridgeAutostart() {
  const dispatch = useDispatch();
  const { session, connection } = useSelector((s) => s.scanner);

  useEffect(() => {
    if (session && connection === 'idle') startBridge(dispatch, session);
  }, [session, connection, dispatch]);

  useEffect(() => {
    if (session || autoTried) return;
    autoTried = true;
    api.post('/scanner/sessions')
      .then(({ data }) => { dispatch(sessionStarted(data)); startBridge(dispatch, data); })
      .catch((e) => { if (e?.response?.status !== 403) autoTried = false; });
  }, [session, dispatch]);
}

/** Pairing state + actions for the PC side. */
export function useScanner() {
  const dispatch = useDispatch();
  const state = useSelector((s) => s.scanner);
  useBridgeAutostart();

  // returns the SAME permanent link for this user every time
  const pair = useCallback(async () => {
    const { data } = await api.post('/scanner/sessions');
    dispatch(sessionStarted(data));
    startBridge(dispatch, data);
  }, [dispatch]);

  // stop listening on this PC only – the phone link stays valid
  const unpair = useCallback(() => {
    stopBridge();
    dispatch(sessionCleared());
  }, [dispatch]);

  // throw the old phone link away and create a new one
  const renew = useCallback(async () => {
    const { data } = await api.post('/scanner/sessions/renew');
    stopBridge();
    dispatch(sessionStarted(data));
    startBridge(dispatch, data);
  }, [dispatch]);

  const injectScan = useCallback(
    (code, source = 'camera') => dispatch(scanReceived({ id: crypto.randomUUID(), code, source, ts: Date.now(), match: null })),
    [dispatch],
  );

  return { ...state, pair, unpair, renew, injectScan };
}

/**
 * Call `handler(code, scan)` for every code that arrives from the paired phone.
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
      fn.current(last.code, last);
    }
  }, [last]);
}
