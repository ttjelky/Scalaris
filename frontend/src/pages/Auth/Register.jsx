import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

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
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        setFieldErrors((prev) => ({
          ...prev,
          ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
        }));
      } else {
        setError('Щось пішло не так під час створення акаунта. Спробуй ще раз.');
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
      </form>
    </AuthLayout>
  );
}
