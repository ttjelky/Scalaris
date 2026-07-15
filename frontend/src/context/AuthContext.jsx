import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { clearAccessToken, onAuthFailure, setAccessToken } from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    try {
      const { data } = await api.get('/users/me/');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If any request's silent refresh fails later in the session (token
    // expired/revoked), just drop the user — no hard redirect here.
    // ProtectedRoute reacts to isAuthenticated flipping to false and sends
    // them to Welcome via React Router, without a full page reload.
    onAuthFailure(() => setUser(null));

    // No access token survives a reload anymore (it's memory-only), so we
    // always attempt /me/ on mount. If a valid refresh cookie exists, the
    // axios interceptor silently mints a fresh access token and retries;
    // if not, this just resolves to "logged out" — same end result as
    // before, without ever touching localStorage.
    loadMe();
  }, []);

  const login = async (login, password) => {
    // The refresh token is set by the backend as an httpOnly cookie now —
    // it's not in `data` and JS never sees it.
    const { data } = await api.post('/users/login/', { username: login, password });
    setAccessToken(data.access);
    await loadMe();
  };

  const register = async ({ username, email, password, passwordConfirm }) => {
    await api.post('/users/register/', {
      username,
      email,
      password,
      password_confirm: passwordConfirm,
    });
    await login(username, password);
  };

  const logout = async () => {
    try {
      // No body needed — the backend reads the refresh token straight
      // from the cookie the browser sends along automatically.
      await api.post('/users/logout/');
    } catch {
      // token already invalid/expired — fine, we're clearing it anyway
    }
    clearAccessToken();
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, login, register, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
