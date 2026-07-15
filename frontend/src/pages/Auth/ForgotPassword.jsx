import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AuthLayout from './AuthLayout';
import form from './Form.module.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const onChange = (e) => setEmail(e.target.value);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const { data } = await api.post('/users/password-reset/', { email });
      // In development, the token is returned in the response
      if (data.token) {
        setResetToken(data.token);
      }
      setSent(true);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Щось пішло не так. Спробуй ще раз трохи пізніше.');
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Перевір пошту"
        title="Лист вже в дорозі"
        subtitle={`Ми надіслали посилання для відновлення паролю на ${email}. Перевір папку "Спам", якщо не бачиш листа.`}
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
            className={form.input}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@scalaris.app"
            value={email}
            onChange={onChange}
            required
          />
        </label>

        <button className={form.submit} type="submit" disabled={pending}>
          {pending ? 'Надсилаємо…' : 'Надіслати посилання'}
        </button>
      </form>
    </AuthLayout>
  );
}