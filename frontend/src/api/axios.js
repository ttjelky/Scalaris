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
    // Relative path — goes through the Vite proxy, same as every other
    // request. A hardcoded absolute URL here would resolve against
    // whatever device runs this JS (e.g. "localhost" on the phone itself),
    // not against the dev machine, and would also miss CORS_ALLOWED_ORIGINS.
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