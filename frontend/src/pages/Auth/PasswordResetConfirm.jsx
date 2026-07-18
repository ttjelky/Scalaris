import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { parseApiError } from '../../utils/apiErrors';
import AuthLayout from './AuthLayout';
import form from './Form.module.css';

export default function PasswordResetConfirm() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const redirectTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  const clearFieldError = (name) =>
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const onTokenChange = (e) => {
    setToken(e.target.value);
    clearFieldError('token');
  };
  const onPasswordChange = (e) => {
    setPassword(e.target.value);
    clearFieldError('password');
  };
  const onPasswordConfirmChange = (e) => {
    setPasswordConfirm(e.target.value);
    clearFieldError('passwordConfirm');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (password !== passwordConfirm) {
      setFieldErrors({ passwordConfirm: 'Паролі не збігаються.' });
      return;
    }

    setPending(true);
    try {
      await api.post('/users/password-reset-confirm/', {
        token,
        password,
        password_confirm: passwordConfirm,
      });
      setSuccess(true);
      redirectTimer.current = setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const { fieldErrors: apiFieldErrors, generalError } = parseApiError(err, {
        fallback: 'Щось пішло не так. Спробуй ще раз.',
      });
      setFieldErrors(apiFieldErrors);
      // Помилки про недійсний/використаний токен приходять як `detail`
      // (а не прив'язані до конкретного поля) — показуємо їх окремим
      // банером зверху форми, це стосується всієї спроби, а не одного інпуту.
      if (generalError) {
        setError(generalError);
      }
    } finally {
      setPending(false);
    }
  };

  if (success) {
    return (
      <AuthLayout
        eyebrow="Успіх"
        title="Пароль змінено"
        subtitle="Твій пароль успішно змінено. Тебе буде перенаправлено на сторінку входу."
        footer={
          <span>
            Хочеш повернутись назад?{' '}
            <Link to="/login" className={form.link}>
              Увійти зараз
            </Link>
          </span>
        }
      >
        <div />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Встановлення паролю"
      title="Новий пароль"
      subtitle="Введи новий пароль для свого акаунту."
      pending={pending}
      footer={
        <span>
          Згадав старий?{' '}
          <Link to="/login" className={form.link}>
            Увійти
          </Link>
        </span>
      }
    >
      <form className={form.form} onSubmit={onSubmit} noValidate>
        {error && (
          <p className={form.formError} role="alert">
            {error}
            {' '}
            <Link to="/forgot-password" className={form.link} style={{ fontSize: 'inherit' }}>
              Запросити нове посилання
            </Link>
          </p>
        )}

        {!tokenFromUrl && (
          <label className={form.field}>
            <span className={form.label}>Reset token</span>
            <input
              className={`${form.input} ${fieldErrors.token ? form.inputError : ''}`}
              type="text"
              name="token"
              placeholder="Вставь токен зі свого email"
              value={token}
              onChange={onTokenChange}
              required
            />
            {fieldErrors.token && <span className={form.fieldError}>{fieldErrors.token}</span>}
          </label>
        )}

        <label className={form.field}>
          <span className={form.label}>Новий пароль</span>
          <input
            className={`${form.input} ${fieldErrors.password ? form.inputError : ''}`}
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={onPasswordChange}
            required
          />
          {fieldErrors.password && <span className={form.fieldError}>{fieldErrors.password}</span>}
        </label>

        <label className={form.field}>
          <span className={form.label}>Повтори пароль</span>
          <input
            className={`${form.input} ${fieldErrors.passwordConfirm ? form.inputError : ''}`}
            type="password"
            name="password_confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            value={passwordConfirm}
            onChange={onPasswordConfirmChange}
            required
          />
          {fieldErrors.passwordConfirm && (
            <span className={form.fieldError}>{fieldErrors.passwordConfirm}</span>
          )}
        </label>

        <button className={form.submit} type="submit" disabled={pending}>
          {pending ? 'Змінюємо…' : 'Встановити новий пароль'}
        </button>
      </form>
    </AuthLayout>
  );
}
