import { configureStore } from '@reduxjs/toolkit';
import { authReducer, lookupReducer, uiReducer, sessionApplied, sessionExpired } from './slices.js';
import { moduleReducers } from './moduleRegistry.js';
import { configureAuthCallbacks } from './api.js';

export const store = configureStore({
  reducer: { auth: authReducer, ui: uiReducer, lookups: lookupReducer, ...moduleReducers },
});

configureAuthCallbacks({
  onRefreshed: (session) => store.dispatch(sessionApplied(session)),
  onFailure: () => store.dispatch(sessionExpired()),
});
