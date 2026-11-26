import { createSlice } from '@reduxjs/toolkit';

const KEY = 'scanner.session';

// the pairing survives a page reload (sessionStorage = this browser tab only)
const load = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
};
const save = (s) => {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable – pairing just won't survive a reload */
  }
};

const slice = createSlice({
  name: 'scanner',
  initialState: { session: load(), connection: 'idle', phoneOnline: false, lastScan: null, history: [] },
  reducers: {
    sessionStarted(state, { payload }) {
      state.session = payload;
      state.history = [];
      state.lastScan = null;
      state.phoneOnline = false;
      save(payload);
    },
    sessionCleared(state) {
      state.session = null;
      state.connection = 'idle';
      state.phoneOnline = false;
      save(null);
    },
    connectionChanged(state, { payload }) {
      state.connection = payload;
    },
    phoneChanged(state, { payload }) {
      state.phoneOnline = payload;
    },
    // a code arrived from the phone (or the local camera); `id` is unique, so listeners never see one twice
    scanReceived(state, { payload }) {
      state.lastScan = payload;
      state.history.unshift(payload);
      state.history = state.history.slice(0, 50);
    },
  },
});

export const { sessionStarted, sessionCleared, connectionChanged, phoneChanged, scanReceived } = slice.actions;
export const scannerReducer = slice.reducer;
