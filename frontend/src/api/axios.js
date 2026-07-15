import axios from 'axios';

/**
 * Reconstructed per the project's described behaviour, adapted for the
 * cookie-based refresh flow:
 *  - the ACCESS token now lives only in this module's memory (never in
 *    localStorage) — it disappears on full page reload, which is fine
 *    because the refresh cookie silently mints a new one.
 *  - the REFRESH token never touches JS at all anymore; it travels as an
 *    httpOnly cookie the browser attaches automatically (`withCredentials`).
 *
 * NOTE: if your original axios.js had extra logic (custom base URL,
 * request/response logging, etc.) beyond what's described in the project
 * context, merge that back in — this file only reconstructs the
 * auth-related parts.
 */

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // sends/receives the httpOnly refresh cookie
});

let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

// AuthContext subscribes here instead of us hard-redirecting from inside
// the interceptor. A window.location redirect would remount the whole app
// (including AuthProvider), which re-triggers loadMe() -> 401 -> failed
// refresh -> redirect -> remount -> ... forever for anyone who simply isn't
// logged in yet. Letting React Router's own guards (ProtectedRoute /
// PublicOnlyRoute) react to `isAuthenticated` flipping to false is enough,
// and never causes a full reload.
let onAuthFailureCallback = null;

export function onAuthFailure(callback) {
  onAuthFailureCallback = callback;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Dedup concurrent refresh attempts: if five requests 401 at once, only one
// refresh call goes out and the rest await its result.
let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        'http://localhost:8000/api/users/login/refresh/',
        {},
        { withCredentials: true }
      )
      .then(({ data }) => {
        setAccessToken(data.access);
        return data.access;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isRefreshCall = config?.url?.includes('/login/refresh/');

    if (response?.status === 401 && !config._retry && !isRefreshCall) {
      config._retry = true;
      try {
        const newAccess = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${newAccess}`;
        return api(config);
      } catch {
        clearAccessToken();
        onAuthFailureCallback?.();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
