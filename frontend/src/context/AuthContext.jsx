import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { clearAccessToken, onAuthFailure, setAccessToken, tryRestoreSession } from '../api/axios';
import { getDiscordRedirectUri } from '../utils/discordAuth';

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

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me/');
      setUser(data);
      setAuthFailed(false);
    } catch {
      setUser(null);
      setAuthFailed(true);
    }
  }, []);

  const bootstrapAuth = useCallback(async () => {
    const restored = await tryRestoreSession();
    if (!restored) {
      setUser(null);
      setAuthFailed(false);
      setLoading(false);
      return;
    }

    try {
      await loadMe();
    } finally {
      setLoading(false);
    }
  }, [loadMe]);

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
        authBootstrapPromiseRef.current = bootstrapAuth();
      }
    }
  }, [bootstrapAuth]);

  const login = useCallback(
    async (loginValue, password) => {
      // Навмисно НЕ чіпаємо тут `loading` — форма сама показує свій pending-стан.
      const { data } = await api.post('/users/login/', { username: loginValue, password });
      setAccessToken(data.access);
      setAuthFailed(false);
      // Успішний логін: підтягуємо профіль. loadMe() сам виставить/скине
      // `loading`, але оскільки на цей момент бутстрап вже давно завершено
      // (loading === false), це не викличе жодного повноекранного флешу —
      // просто оновиться `user` і форма зробить navigate().
      await loadMe();
    },
    [loadMe]
  );

  // Той самий контракт відповіді, що й /users/login/ (access-токен у тілі +
  // refresh у httpOnly-кукі), тож решта логіки — та сама, що й у login().
  const loginWithDiscord = useCallback(
    async (code) => {
      const { data } = await api.post('/users/auth/discord/', {
        code,
        redirect_uri: getDiscordRedirectUri(),
      });
      setAccessToken(data.access);
      setAuthFailed(false);
      await loadMe();
    },
    [loadMe]
  );

  const register = useCallback(
    async ({ username, email, password, passwordConfirm }) => {
      await api.post('/users/register/', {
        username,
        email,
        password,
        password_confirm: passwordConfirm,
      });
      await login(username, password);
    },
    [login]
  );

  const logout = useCallback(async () => {
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
  }, []);

  // Merge partial fields into the current user (e.g. after a PATCH /users/me/)
  // so the rest of the app sees the update immediately, without a refetch.
  const updateUser = useCallback((updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const value = useMemo(
    () => ({ user, loading, authFailed, isAuthenticated: !!user, login, loginWithDiscord, register, logout, updateUser }),
    [user, loading, authFailed, login, loginWithDiscord, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}