import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errMsg } from '../../app/api.js';
import { Field } from '../../components/ui.jsx';
import AuthShell from './AuthShell.jsx';

// Step 1: ask for the e-mail, a 6-digit code is sent
export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2>Reset your password</h2>
      <p className="muted" style={{ marginTop: 0 }}>We'll e-mail you a 6-digit verification code.</p>
      <form className="stack" onSubmit={submit} style={{ marginTop: 18 }}>
        {error && <div className="callout bad">{error}</div>}
        <Field label="E-mail"><input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        <Link to="/login" style={{ textAlign: 'center' }}>Back to sign in</Link>
      </form>
    </AuthShell>
  );
}

// Step 2: enter the code · Step 3: choose a new password
export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('code'); // code | password
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await api.post('/auth/verify-reset-code', { email: email.trim(), code: code.trim() });
      setStep('password');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setInfo('If the e-mail is registered, a new code was sent (you can request one per minute).');
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { email: email.trim(), code: code.trim(), password });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'password') {
    return (
      <AuthShell>
        <h2>Choose a new password</h2>
        <p className="muted" style={{ marginTop: 0 }}>Code verified for {email}.</p>
        <form className="stack" onSubmit={save} style={{ marginTop: 18 }}>
          {error && <div className="callout bad">{error}</div>}
          <Field label="New password" hint="At least 8 characters with a letter and a number">
            <input type="password" autoComplete="new-password" autoFocus required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password">
            <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2>Enter the code</h2>
      <p className="muted" style={{ marginTop: 0 }}>We sent a 6-digit code to your e-mail. It is valid for 10 minutes.</p>
      <form className="stack" onSubmit={verify} style={{ marginTop: 18 }}>
        {error && <div className="callout bad">{error}</div>}
        {info && <div className="callout ok">{info}</div>}
        <Field label="E-mail"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Verification code">
          <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
            style={{ letterSpacing: '0.4em', fontSize: 22, textAlign: 'center' }}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 6 || !email.trim()}>{busy ? 'Checking…' : 'Verify code'}</button>
        <div className="flex between">
          <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={!email.trim()}>Send a new code</button>
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </AuthShell>
  );
}
