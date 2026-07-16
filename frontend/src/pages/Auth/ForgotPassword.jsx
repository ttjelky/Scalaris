import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { parseApiError } from '../../utils/apiErrors';
import AuthLayout from './AuthLayout';
import form from './Form.module.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const onChange = (e) => {
    setEmail(e.target.value);
    if (fieldErrors.email) setFieldErrors({});
    if (error) setError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setPending(true);
    try {
      const { data } = await api.post('/users/password-reset/', { email });
      // In development, the token is returned in the response
      if (data.token) {
        setResetToken(data.token);
      }
      setSent(true);
    } catch (err) {
      const { fieldErrors: apiFieldErrors, generalError } = parseApiError(err, {
        fallback: 'Щось пішло не так. Спробуй ще раз трохи пізніше.',
      });
      setFieldErrors(apiFieldErrors);
      if (generalError && Object.keys(apiFieldErrors).length === 0) {
        setError(generalError);
      }
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Перевір пошту"
        title="Лист вже в дорозі"
        subtitle={`Якщо акаунт з поштою ${email} існує, ми надіслали на неї посилання для відновлення паролю. Перевір папку "Спам", якщо не бачиш листа.`}
        footer={
          <span>
            Згадав пароль?{' '}
            <Link to="/login" className={form.link}>
              Увійти
            </Link>
          </span>
        }
      >
        {resetToken && (
          <div
            style={{
              wordBreak: 'break-all',
              fontSize: '12px',
              background: '#f0f0f0',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '12px',
            }}
          >
            <strong>Dev token:</strong> {resetToken}
          </div>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Забули пароль"
      title="Скинь пароль"
      subtitle="Вкажи email, і ми надішлемо посилання для відновлення доступу."
      pending={pending}
      footer={
        <span>
          Згадав пароль?{' '}
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

        <label className={form.field}>
          <span className={form.label}>Email</span>
          <input
            className={`${form.input} ${fieldErrors.email ? form.inputError : ''}`}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@scalaris.app"
            value={email}
            onChange={onChange}
            required
          />
          {fieldErrors.email && <span className={form.fieldError}>{fieldErrors.email}</span>}
        </label>

        <button className={form.submit} type="submit" disabled={pending}>
          {pending ? 'Надсилаємо…' : 'Надіслати посилання'}
        </button>
      </form>
    </AuthLayout>
  );
}
