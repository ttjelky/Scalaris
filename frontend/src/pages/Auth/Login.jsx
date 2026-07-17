import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { parseApiError } from '../../utils/apiErrors';
import { redirectToDiscordAuthorize, MissingDiscordClientIdError } from '../../utils/discordAuth';
import AuthLayout from './AuthLayout';
import form from './Form.module.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/home';

  const [values, setValues] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const onDiscordLogin = () => {
    setError('');
    try {
      redirectToDiscordAuthorize();
    } catch (err) {
      setError(
        err instanceof MissingDiscordClientIdError
          ? 'Вхід через Discord тимчасово недоступний.'
          : 'Не вдалося почати вхід через Discord. Спробуй ще раз.'
      );
    }
  };

  const onChange = (e) => {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(values.login, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      const { generalError } = parseApiError(err, {
        fallback: 'Неправильний email/юзернейм або пароль. Спробуй ще раз.',
      });
      setError(generalError);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="З поверненням"
      title="Зашнуровуйся"
      subtitle="Увійди, щоб продовжити з того самого місця."
      pending={pending}
      footer={
        <span>
          Вперше тут?{' '}
          <Link to="/register" className={form.link}>
            Створити акаунт
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

        <label className={form.field}>
          <span className={form.label}>Email або юзернейм</span>
          <input
            className={form.input}
            type="text"
            name="login"
            autoComplete="username"
            inputMode="email"
            placeholder="you@scalaris.app"
            value={values.login}
            onChange={onChange}
            required
          />
        </label>

        <label className={form.field}>
          <span className={form.label}>Пароль</span>
          <input
            className={form.input}
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={values.password}
            onChange={onChange}
            required
          />
        </label>

        <div style={{ textAlign: 'right', marginTop: '-8px' }}>
          <Link to="/forgot-password" className={form.link} style={{ fontSize: '13px' }}>
            Забули пароль?
          </Link>
        </div>

        <button className={form.submit} type="submit" disabled={pending}>
          {pending ? 'Заходимо…' : 'Вхід'}
        </button>

        <div className={form.divider}>
          <span>або</span>
        </div>

        <button className={form.discordButton} type="button" onClick={onDiscordLogin} disabled={pending}>
          <DiscordMark />
          Увійти через Discord
        </button>
      </form>
    </AuthLayout>
  );
}

function DiscordMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.211.375-.457.879-.63 1.281a18.27 18.27 0 0 0-5.51 0A12.6 12.6 0 0 0 9.115 3a19.74 19.74 0 0 0-4.435 1.371C1.676 8.845.937 13.208 1.307 17.51a19.9 19.9 0 0 0 5.993 2.98c.483-.647.913-1.334 1.283-2.055a12.9 12.9 0 0 1-2.021-.955c.17-.121.336-.248.497-.378 3.897 1.766 8.126 1.766 11.977 0 .162.13.328.257.497.378-.641.383-1.32.71-2.023.956.37.72.8 1.407 1.283 2.054a19.85 19.85 0 0 0 6-2.98c.434-4.981-.734-9.305-3.476-13.14ZM8.62 14.807c-1.174 0-2.14-1.06-2.14-2.362 0-1.303.945-2.363 2.14-2.363 1.205 0 2.161 1.07 2.14 2.363 0 1.303-.945 2.362-2.14 2.362Zm6.76 0c-1.174 0-2.14-1.06-2.14-2.362 0-1.303.945-2.363 2.14-2.363 1.205 0 2.161 1.07 2.14 2.363 0 1.303-.935 2.362-2.14 2.362Z" />
    </svg>
  );
}
