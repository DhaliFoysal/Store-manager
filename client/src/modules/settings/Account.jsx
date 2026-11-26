import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../../app/api.js';
import { useToast } from '../../app/hooks.js';
import { sessionApplied } from '../../app/slices.js';
import { titleCase } from '../../app/format.js';
import { Field, PageHeader, StatusBadge } from '../../components/ui.jsx';

export default function Account() {
  const dispatch = useDispatch();
  const toast = useToast();
  const user = useSelector((s) => s.auth.user);
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy('profile');
    try { const { data } = await api.put('/auth/me', { name: profile.name, phone: profile.phone || null }); dispatch(sessionApplied(data)); toast.success('Profile updated'); }
    catch (err) { toast.fail(err); } finally { setBusy(''); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast.error('New passwords do not match');
    setBusy('pw');
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      dispatch(sessionApplied(data)); // new tokens: other devices are signed out, this one stays signed in
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Other devices were signed out.');
    } catch (err) { toast.fail(err); } finally { setBusy(''); }
  };

  return (
    <>
      <PageHeader title="My account" subtitle={<>{user.email} · <StatusBadge value={user.role} label={titleCase(user.role)} /></>} />
      <div className="row two" style={{ alignItems: 'start' }}>
        <form className="card card-pad stack" onSubmit={saveProfile}>
          <div className="card-title">Profile</div>
          <Field label="Full name"><input required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
          <Field label="Phone"><input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
          <div><button className="btn btn-primary" disabled={busy === 'profile'}>Save profile</button></div>
        </form>

        <form className="card card-pad stack" onSubmit={changePassword}>
          <div className="card-title">Change password</div>
          <Field label="Current password"><input type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters, a letter and a number"><input type="password" autoComplete="new-password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label="Confirm new password"><input type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <div><button className="btn btn-primary" disabled={busy === 'pw'}>Change password</button></div>
          <small className="muted">Forgot your password? Sign out and use “Forgot password?” on the sign-in page.</small>
        </form>
      </div>
    </>
  );
}
