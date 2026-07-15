import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { clearTokens, getTokens } from '../api/axios';

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
    const { access } = getTokens();
    if (access) {
      loadMe();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (login, password) => {
    const { data } = await api.post('/users/login/', { username: login, password });
    localStorage.setItem('access', data.access);
    localStorage.setItem('refresh', data.refresh);
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
    const { refresh } = getTokens();
    try {
      if (refresh) await api.post('/users/logout/', { refresh });
    } catch {
      // token already invalid/expired — fine, we're clearing it anyway
    }
    clearTokens();
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
