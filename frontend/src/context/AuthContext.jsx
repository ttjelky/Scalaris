import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { clearAccessToken, onAuthFailure, setAccessToken } from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` означає ОДНЕ конкретне: "ми ще не знаємо, чи є валідна сесія"
  // (перевірка при старті додатку). Це НЕ індикатор "триває запит логіну" —
  // за це відповідає локальний `pending` у самих формах Login/Register.
  // Раніше login() теж смикав цей прапорець, і будь-яка спроба входу
  // (навіть з неправильним паролем) на мить показувала повноекранний
  // "Checking your session..." замість форми з помилкою.
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
    // Навмисно НЕ чіпаємо тут `loading` — форма сама показує свій pending-стан.
    const { data } = await api.post('/users/login/', { username: login, password });
    setAccessToken(data.access);
    setAuthFailed(false);
    // Успішний логін: підтягуємо профіль. loadMe() сам виставить/скине
    // `loading`, але оскільки на цей момент бутстрап вже давно завершено
    // (loading === false), це не викличе жодного повноекранного флешу —
    // просто оновиться `user` і форма зробить navigate().
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
