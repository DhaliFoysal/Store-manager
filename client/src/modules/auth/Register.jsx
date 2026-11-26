import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api, errMsg } from '../../app/api.js';
import { Field } from '../../components/ui.jsx';
import AuthShell from './AuthShell.jsx';

export default function Register() {
  const [form, setForm] = useState({ storeName: '', name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/register', { ...form, email: form.email.trim(), phone: form.phone.trim() || null });
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center' }}>
          <CheckCircle2 size={54} color="var(--m-600)" />
          <h2 style={{ marginTop: 12 }}>Request received</h2>
          <p className="muted">An administrator will review your registration. You'll be able to sign in as soon as it is approved.</p>
          <Link className="btn btn-primary" to="/login">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2>Create your store account</h2>
      <p className="muted" style={{ marginTop: 0 }}>New accounts are activated after admin approval.</p>
      <form className="stack" onSubmit={submit} style={{ marginTop: 18 }}>
        {error && <div className="callout bad">{error}</div>}
        <Field label="Store name"><input required value={form.storeName} onChange={set('storeName')} /></Field>
        <div className="row two">
          <Field label="Your name"><input required value={form.name} onChange={set('name')} /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label="E-mail"><input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 8 characters with a letter and a number">
          <input type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Submitting…' : 'Request account'}</button>
      </form>
      <p className="muted" style={{ marginTop: 18, textAlign: 'center' }}>
        Already approved? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
