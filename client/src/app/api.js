import axios from 'axios';

// Access token lives in memory only (never localStorage). The refresh token is an httpOnly cookie.
let accessToken = null;
let callbacks = { onRefreshed: () => {}, onFailure: () => {} };

export const setAccessToken = (t) => {
  accessToken = t;
};
export const configureAuthCallbacks = (cb) => {
  callbacks = { ...callbacks, ...cb };
};

export const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 30_000 });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing = null;
export function refreshSession() {
  if (!refreshing) {
    refreshing = axios
      .post('/api/auth/refresh', null, { withCredentials: true })
      .then((r) => r.data)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing; // single-flight: parallel 401s share one refresh call
}

const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/register'];

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && config && !config._retry && !NO_REFRESH.some((p) => config.url?.startsWith(p))) {
      config._retry = true;
      try {
        const session = await refreshSession();
        setAccessToken(session.accessToken);
        callbacks.onRefreshed(session);
        config.headers.Authorization = `Bearer ${session.accessToken}`;
        return api(config);
      } catch {
        callbacks.onFailure();
      }
    }
    return Promise.reject(error);
  },
);

export const errMsg = (e, fallback = 'Something went wrong') =>
  e?.response?.data?.message || (e?.code === 'ERR_NETWORK' ? 'Cannot reach the server' : e?.message) || fallback;
