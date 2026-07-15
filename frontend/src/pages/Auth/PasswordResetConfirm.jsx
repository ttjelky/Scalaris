import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
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
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      await api.post('/users/password-reset-confirm/', {
        token,
        password,
        password_confirm: passwordConfirm,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Щось пішло не так. Спробуй ще раз.');
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
          </p>
        )}

        {!tokenFromUrl && (
          <label className={form.field}>
            <span className={form.label}>Reset token</span>
            <input
              className={form.input}
              type="text"
              name="token"
              placeholder="Вставь токен зі свого email"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </label>
        )}

        <label className={form.field}>
          <span className={form.label}>Новий пароль</span>
          <input
            className={form.input}
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <label className={form.field}>
          <span className={form.label}>Повтори пароль</span>
          <input
            className={form.input}
            type="password"
            name="password_confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
          />
        </label>

        <button className={form.submit} type="submit" disabled={pending}>
          {pending ? 'Змінюємо…' : 'Встановити новий пароль'}
        </button>
      </form>
    </AuthLayout>
  );
}
