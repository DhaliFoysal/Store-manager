import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../../app/api.js';
import { startBridge, stopBridge } from './bridge.js';
import { scanReceived, sessionCleared, sessionStarted } from './scannerSlice.js';

// Re-opens the live stream after a page reload (the session id is kept in sessionStorage)
function useBridgeAutostart() {
  const dispatch = useDispatch();
  const { session, connection } = useSelector((s) => s.scanner);
  useEffect(() => {
    if (session && connection === 'idle') startBridge(dispatch, session);
  }, [session, connection, dispatch]);
}

/** Pairing state + actions for the PC side. */
export function useScanner() {
  const dispatch = useDispatch();
  const state = useSelector((s) => s.scanner);
  useBridgeAutostart();

  const pair = useCallback(async () => {
    const { data } = await api.post('/scanner/sessions');
    dispatch(sessionStarted(data));
    startBridge(dispatch, data);
  }, [dispatch]);

  const unpair = useCallback(async () => {
    if (state.session) await api.delete(`/scanner/sessions/${state.session.id}`).catch(() => {});
    stopBridge();
    dispatch(sessionCleared());
  }, [dispatch, state.session]);

  // lets the local camera feed the same pipeline as the phone
  const injectScan = useCallback(
    (code, source = 'camera') => dispatch(scanReceived({ id: crypto.randomUUID(), code, source, ts: Date.now(), match: null })),
    [dispatch],
  );

  return { ...state, pair, unpair, injectScan };
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
