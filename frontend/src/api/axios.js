import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
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

let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    // The refresh call intentionally uses the bare axios client here so the
    // interceptor does not try to re-enter itself while the cookie-based
    // refresh request is still in flight.
    refreshPromise = axios
      .post(
        '/api/users/login/refresh/',
        {},
        { withCredentials: true }
      )
      .then(({ data }) => {
        setAccessToken(data.access);
        return data.access;
      })
      .catch((error) => {
        clearAccessToken();
        throw error;
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