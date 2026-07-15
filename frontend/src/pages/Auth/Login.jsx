import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(values.login, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Неправильний email/юзернейм або пароль. Спробуй ще раз.');
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
      </form>
    </AuthLayout>
  );
}