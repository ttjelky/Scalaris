import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import form from './Form.module.css';

// ⚠️ Тимчасовий прямий виклик — заміни URL на свій реальний ендпоінт
// (або підключи через свій axios-інстанс, якщо він у тебе є в src/api).
async function requestPasswordReset(email) {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.detail || 'Request failed');
    err.response = { data };
    throw err;
  }
  return res.json().catch(() => ({}));
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const onChange = (e) => setEmail(e.target.value);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      await requestPasswordReset(email);
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
        <div />
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