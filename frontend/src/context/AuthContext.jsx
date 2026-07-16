import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { clearAccessToken, onAuthFailure, setAccessToken } from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);
  const authBootstrapPromiseRef = useRef(null);
  const hasRunBootstrap = useRef(false);

  const loadMe = async () => {
    try {
      const { data } = await api.get('/users/me/');
      setUser(data);
      setAuthFailed(false);
    } catch {
      setUser(null);
      setAuthFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    onAuthFailure(() => {
      setUser(null);
      setAuthFailed(true);
    });

    // Run bootstrap only once per app mount to avoid race conditions from
    // StrictMode double-mounting or rapid re-renders
    if (!hasRunBootstrap.current) {
      hasRunBootstrap.current = true;
      if (!authBootstrapPromiseRef.current) {
        authBootstrapPromiseRef.current = loadMe();
      }
    }
  }, []);

  const login = async (login, password) => {
    setLoading(true);
    setAuthFailed(false);
    const { data } = await api.post('/users/login/', { username: login, password });
    setAccessToken(data.access);
    // Fetch user details after setting access token
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
      await api.post('/users/logout/');
    } catch {
      // The refresh cookie may have already expired or been rotated; the
      // browser still needs to end up logged out, so clearing the local state is enough.
    }
    clearAccessToken();
    setUser(null);
    setAuthFailed(false);
    setLoading(false);
  };

  // Merge partial fields into the current user (e.g. after a PATCH /users/me/)
  // so the rest of the app sees the update immediately, without a refetch.
  const updateUser = (updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const value = useMemo(
    () => ({ user, loading, authFailed, isAuthenticated: !!user, login, register, logout, updateUser }),
    [user, loading, authFailed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
