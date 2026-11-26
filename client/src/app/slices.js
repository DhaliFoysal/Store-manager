import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errMsg, refreshSession, setAccessToken } from './api.js';

// ───────── auth ─────────
export const bootstrap = createAsyncThunk('auth/bootstrap', async () => {
  const session = await refreshSession();
  setAccessToken(session.accessToken);
  return session;
});

export const login = createAsyncThunk('auth/login', async (creds, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', creds);
    setAccessToken(data.accessToken);
    return data;
  } catch (e) {
    return rejectWithValue(errMsg(e));
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
});

export const reloadSession = createAsyncThunk('auth/reload', async () => (await api.get('/auth/me')).data);

const applySession = (state, { payload }) => {
  state.status = 'authenticated';
  state.user = payload.user;
  state.permissions = payload.permissions;
  state.store = payload.store;
  state.error = null;
};

const authSlice = createSlice({
  name: 'auth',
  initialState: { status: 'loading', user: null, permissions: [], store: null, error: null },
  reducers: {
    // used by the Axios interceptor after a silent refresh / by change-password
    sessionApplied(state, action) {
      if (action.payload.accessToken) setAccessToken(action.payload.accessToken);
      applySession(state, action);
    },
    sessionExpired(state) {
      setAccessToken(null);
      state.status = 'anonymous';
      state.user = null;
      state.permissions = [];
      state.store = null;
    },
  },
  extraReducers: (b) => {
    b.addCase(bootstrap.fulfilled, applySession)
      .addCase(bootstrap.rejected, (s) => {
        s.status = 'anonymous';
      })
      .addCase(login.fulfilled, applySession)
      .addCase(login.rejected, (s, a) => {
        s.error = a.payload || 'Sign-in failed';
      })
      .addCase(reloadSession.fulfilled, (s, a) => {
        s.user = a.payload.user;
        s.permissions = a.payload.permissions;
        s.store = a.payload.store;
      })
      .addCase(logout.fulfilled, (s) => {
        s.status = 'anonymous';
        s.user = null;
        s.permissions = [];
        s.store = null;
      })
      .addCase(logout.rejected, (s) => {
        s.status = 'anonymous';
        s.user = null;
        s.permissions = [];
        s.store = null;
      });
  },
});
export const { sessionApplied, sessionExpired } = authSlice.actions;
export const authReducer = authSlice.reducer;

// ───────── toasts ─────────
let toastId = 0;
const uiSlice = createSlice({
  name: 'ui',
  initialState: { toasts: [] },
  reducers: {
    toastAdded: (s, a) => {
      s.toasts.push(a.payload);
    },
    toastRemoved: (s, a) => {
      s.toasts = s.toasts.filter((t) => t.id !== a.payload);
    },
  },
});
export const uiReducer = uiSlice.reducer;
export const notify = (message, type = 'info') => (dispatch) => {
  const id = ++toastId;
  dispatch(uiSlice.actions.toastAdded({ id, message, type }));
  setTimeout(() => dispatch(uiSlice.actions.toastRemoved(id)), 4500);
};
export const dismissToast = uiSlice.actions.toastRemoved;

// ───────── shared lookups (categories, warehouses) ─────────
export const loadLookups = createAsyncThunk('lookups/load', async () => {
  const [categories, warehouses] = await Promise.all([api.get('/categories'), api.get('/warehouses')]);
  return { categories: categories.data.data, warehouses: warehouses.data.data };
});

const lookupSlice = createSlice({
  name: 'lookups',
  initialState: { categories: [], warehouses: [], loaded: false },
  reducers: { invalidate: (s) => { s.loaded = false; } },
  extraReducers: (b) => {
    b.addCase(loadLookups.fulfilled, (s, a) => {
      s.categories = a.payload.categories;
      s.warehouses = a.payload.warehouses;
      s.loaded = true;
    });
  },
});
export const invalidateLookups = lookupSlice.actions.invalidate;
export const lookupReducer = lookupSlice.reducer;
