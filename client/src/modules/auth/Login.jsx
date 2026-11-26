import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { login } from '../../app/slices.js';
import { Field } from '../../components/ui.jsx';
import AuthShell from './AuthShell.jsx';

export default function Login() {
  const dispatch = useDispatch();
  const error = useSelector((s) => s.auth.error);
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await dispatch(login({ email: form.email.trim(), password: form.password }));
    setBusy(false);
  };

  return (
    <AuthShell>
      <h2>Welcome back</h2>
      <p className="muted" style={{ marginTop: 0 }}>Sign in to your store account.</p>
      <form className="stack" onSubmit={submit} style={{ marginTop: 22 }}>
        {error && <div className="callout bad">{error}</div>}
        <Field label="E-mail">
          <input type="email" autoComplete="username" autoFocus required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="flex between">
          <span />
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="muted" style={{ marginTop: 22, textAlign: 'center' }}>
        New store? <Link to="/register">Request an account</Link>
      </p>
    </AuthShell>
  );
}
