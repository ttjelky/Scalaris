import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { parseApiError } from '../../utils/apiErrors';
import { redirectToDiscordAuthorize, MissingDiscordClientIdError } from '../../utils/discordAuth';
import AuthLayout from './AuthLayout';
import form from './Form.module.css';

const initialValues = { username: '', email: '', password: '', passwordConfirm: '' };

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const onDiscordRegister = () => {
    setError('');
    try {
      redirectToDiscordAuthorize();
    } catch (err) {
      setError(
        err instanceof MissingDiscordClientIdError
          ? 'Реєстрація через Discord тимчасово недоступна.'
          : 'Не вдалося почати реєстрацію через Discord. Спробуй ще раз.'
      );
    }
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const validate = () => {
    const errors = {};
    if (values.username.trim().length < 3) errors.username = 'Мінімум 3 символи.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Введи коректний email.';
    if (values.password.length < 8) errors.password = 'Мінімум 8 символів.';
    if (values.password !== values.passwordConfirm) errors.passwordConfirm = 'Паролі не збігаються.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setPending(true);
    try {
      await register(values);
      navigate('/home', { replace: true });
    } catch (err) {
      const { fieldErrors: apiFieldErrors, generalError } = parseApiError(err, {
        fallback: 'Щось пішло не так під час створення акаунта. Спробуй ще раз.',
      });

      if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...apiFieldErrors }));
      }
      if (generalError && Object.keys(apiFieldErrors).length === 0) {
        setError(generalError);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Приєднуйся до клубу"
      title="Почни свій забіг"
      subtitle="Створи акаунт, щоб бачити активності та зʼявитися на карті."
      pending={pending}
      footer={
        <span>
          Вже є акаунт?{' '}
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

        <div className={form.row}>
          <label className={form.field}>
            <span className={form.label}>Юзернейм</span>
            <input
              className={`${form.input} ${fieldErrors.username ? form.inputError : ''}`}
              type="text"
              name="username"
              autoComplete="username"
              placeholder="нікнейм"
              value={values.username}
              onChange={onChange}
              required
            />
            {fieldErrors.username && <span className={form.fieldError}>{fieldErrors.username}</span>}
          </label>

          <label className={form.field}>
            <span className={form.label}>Email</span>
            <input
              className={`${form.input} ${fieldErrors.email ? form.inputError : ''}`}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="email@mail.com"
              value={values.email}
              onChange={onChange}
              required
            />
            {fieldErrors.email && <span className={form.fieldError}>{fieldErrors.email}</span>}
          </label>
        </div>

        <label className={form.field}>
          <span className={form.label}>Пароль</span>
          <input
            className={`${form.input} ${fieldErrors.password ? form.inputError : ''}`}
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Мінімум 8 символів"
            value={values.password}
            onChange={onChange}
            required
          />
          {fieldErrors.password && <span className={form.fieldError}>{fieldErrors.password}</span>}
        </label>

        <label className={form.field}>
          <span className={form.label}>Підтвердження пароля</span>
          <input
            className={`${form.input} ${fieldErrors.passwordConfirm ? form.inputError : ''}`}
            type="password"
            name="passwordConfirm"
            autoComplete="new-password"
            placeholder="Введи ще раз"
            value={values.passwordConfirm}
            onChange={onChange}
            required
          />
          {fieldErrors.passwordConfirm && (
            <span className={form.fieldError}>{fieldErrors.passwordConfirm}</span>
          )}
        </label>

        <button className={form.submit} type="submit" disabled={pending}>
          {pending ? 'Створюємо акаунт…' : 'Створити акаунт'}
        </button>

        <div className={form.divider}>
          <span>або</span>
        </div>

        <button className={form.discordButton} type="button" onClick={onDiscordRegister} disabled={pending}>
          <DiscordMark />
          Зареєструватися через Discord
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
