import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errMsg } from '../../app/api.js';
import { Field } from '../../components/ui.jsx';
import AuthShell from './AuthShell.jsx';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setMsg(data.message);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2>Reset your password</h2>
      <p className="muted" style={{ marginTop: 0 }}>We'll e-mail you a link to choose a new one.</p>
      {msg ? (
        <div className="stack" style={{ marginTop: 18 }}>
          <div className="callout ok">{msg}</div>
          <Link className="btn" to="/login">Back to sign in</Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} style={{ marginTop: 18 }}>
          {error && <div className="callout bad">{error}</div>}
          <Field label="E-mail"><input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <Link to="/login" style={{ textAlign: 'center' }}>Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2>Choose a new password</h2>
      {!token && <div className="callout bad" style={{ marginTop: 14 }}>This reset link is missing its token.</div>}
      <form className="stack" onSubmit={submit} style={{ marginTop: 18 }}>
        {error && <div className="callout bad">{error}</div>}
        <Field label="New password" hint="At least 8 characters with a letter and a number">
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password">
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !token}>{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </AuthShell>
  );
}
