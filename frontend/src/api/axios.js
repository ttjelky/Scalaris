import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

const api = axios.create({ baseURL: BASE_URL });

const getTokens = () => ({
  access: localStorage.getItem('access'),
  refresh: localStorage.getItem('refresh'),
});

const setAccessToken = (access) => localStorage.setItem('access', access);

const clearTokens = () => {
  localStorage.removeItem('access');
  localStorage.removeItem('refresh');
};

api.interceptors.request.use((config) => {
  const { access } = getTokens();
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const { refresh } = getTokens();

    if (error.response?.status === 401 && refresh && !original._retry) {
      original._retry = true;
      try {
        refreshPromise ??= axios
          .post(`${BASE_URL}/users/login/refresh/`, { refresh })
          .finally(() => {
            refreshPromise = null;
          });
        const { data } = await refreshPromise;
        setAccessToken(data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch (refreshError) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export { clearTokens, getTokens, setAccessToken };
export default api;
