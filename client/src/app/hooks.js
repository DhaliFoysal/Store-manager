import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api, errMsg } from './api.js';
import { loadLookups, notify } from './slices.js';
import { money as fmtMoney } from './format.js';

export const useAuth = () => useSelector((s) => s.auth);

export function useCan() {
  const permissions = useSelector((s) => s.auth.permissions);
  return useCallback((perm) => !perm || permissions.includes(perm), [permissions]);
}

export function useMoney() {
  const currency = useSelector((s) => s.auth.store?.currency || 'BDT');
  return useCallback((v) => fmtMoney(v, currency), [currency]);
}

export function useToast() {
  const dispatch = useDispatch();
  return {
    success: (m) => dispatch(notify(m, 'success')),
    error: (m) => dispatch(notify(m, 'error')),
    info: (m) => dispatch(notify(m, 'info')),
    fail: (e) => dispatch(notify(errMsg(e), 'error')),
  };
}

export function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// GET helper that re-runs when `params` (any JSON-able value) changes
export function useFetch(url, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params ?? {});
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(url, { params: JSON.parse(key) })
      .then((r) => id === seq.current && setState({ data: r.data, loading: false, error: null }))
      .catch((e) => id === seq.current && setState({ data: null, loading: false, error: errMsg(e) }));
  }, [url, key, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function useLookups() {
  const dispatch = useDispatch();
  const lookups = useSelector((s) => s.lookups);
  const hasStore = useSelector((s) => !!s.auth.store);
  useEffect(() => {
    if (!lookups.loaded && hasStore) dispatch(loadLookups());
  }, [lookups.loaded, hasStore, dispatch]);
  return lookups;
}

export function useDefaultWarehouse() {
  const { warehouses } = useLookups();
  return warehouses.find((w) => w.isDefault && w.isActive) || warehouses.find((w) => w.isActive) || null;
}
