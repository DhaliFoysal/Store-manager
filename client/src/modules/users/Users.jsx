import { useState } from 'react';
import { useSelector } from 'react-redux';
import { KeyRound, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { api } from '../../app/api.js';
import { useFetch, useToast } from '../../app/hooks.js';
import { fmtDateTime, titleCase } from '../../app/format.js';
import { Empty, Field, Loading, Modal, PageHeader, StatusBadge, useConfirm } from '../../components/ui.jsx';

export default function Users() {
  const me = useSelector((s) => s.auth.user);
  const toast = useToast();
  const { data, loading, reload } = useFetch('/users');
  const [editing, setEditing] = useState(null);
  const [pwFor, setPwFor] = useState(null);
  const [confirm, dialog] = useConfirm();

  // owner manages admins + users; admins manage users only; nobody edits the owner here
  const canManage = (u) => u.role !== 'OWNER' && u.id !== me.id && (me.role === 'OWNER' || u.role === 'USER');

  const toggle = async (u) => {
    const next = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (next === 'INACTIVE' && !(await confirm({ title: 'Deactivate user', message: `${u.name} will be signed out and unable to log in until reactivated.`, confirmLabel: 'Deactivate', danger: true }))) return;
    try { await api.put(`/users/${u.id}`, { status: next }); toast.success(`User ${next === 'ACTIVE' ? 'activated' : 'deactivated'}`); reload(); } catch (e) { toast.fail(e); }
  };
  const remove = async (u) => {
    if (!(await confirm({ title: 'Delete user', message: `Permanently delete ${u.name}? If they have processed sales, deactivate them instead.`, danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/users/${u.id}`); toast.success('User deleted'); reload(); } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title="Users & roles" subtitle="Create accounts for your team and decide what each person can do">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus /> New user</button>
      </PageHeader>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No users" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id}>
                  <td><div className="cell-title">{u.name} {u.id === me.id && <span className="badge">You</span>}</div><div className="cell-sub">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div></td>
                  <td><StatusBadge value={u.role} label={titleCase(u.role)} />{u.role === 'USER' && <div className="cell-sub">{(u.permissions || []).length} permissions</div>}</td>
                  <td><StatusBadge value={u.status} /></td>
                  <td className="nowrap">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="muted">Never</span>}</td>
                  <td>{canManage(u) && (
                    <div className="actions">
                      <button className="btn btn-sm" onClick={() => setEditing(u)}><Pencil /> Edit</button>
                      <button className="btn btn-sm" onClick={() => setPwFor(u)}><KeyRound /> Password</button>
                      <button className="btn btn-sm" onClick={() => toggle(u)}><Power /> {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-sm btn-icon btn-danger" onClick={() => remove(u)} aria-label="Delete"><Trash2 /></button>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <UserForm initial={editing} actorRole={me.role} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {pwFor && <PasswordForm user={pwFor} onClose={() => setPwFor(null)} />}
      {dialog}
    </>
  );
}

function UserForm({ initial, actorRole, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!initial.id;
  const { data: meta } = useFetch('/meta/permissions');
  const [f, setF] = useState({
    name: initial.name || '', email: initial.email || '', phone: initial.phone || '', role: initial.role || 'USER',
    status: initial.status || 'ACTIVE', password: '', permissions: initial.permissions || [],
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleKey = (key) => setF((s) => ({ ...s, permissions: s.permissions.includes(key) ? s.permissions.filter((k) => k !== key) : [...s.permissions, key] }));

  const groups = {};
  (meta?.permissions || []).forEach((p) => { (groups[p.group] ||= []).push(p); });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: f.name, phone: f.phone || null, role: f.role, status: f.status, permissions: f.role === 'USER' ? f.permissions : [] };
      if (editing) await api.put(`/users/${initial.id}`, body);
      else await api.post('/users', { ...body, email: f.email.trim(), password: f.password });
      toast.success('User saved');
      onSaved();
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? `Edit ${initial.name}` : 'New user'} size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="user-form" disabled={busy}>{busy ? 'Saving…' : 'Save user'}</button></>}>
      <form id="user-form" className="stack" onSubmit={save}>
        <div className="row two">
          <Field label="Full name"><input required autoFocus value={f.name} onChange={set('name')} /></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <div className="row two">
          <Field label="E-mail (sign-in)"><input type="email" required disabled={editing} value={f.email} onChange={set('email')} /></Field>
          {!editing && <Field label="Initial password" hint="At least 8 characters, a letter and a number"><input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>}
        </div>
        <div className="row two">
          <Field label="Role" hint={f.role === 'ADMIN' ? 'Admins can do everything except edit the store profile.' : 'Users only get the permissions ticked below.'}>
            <select value={f.role} onChange={set('role')}>
              {actorRole === 'OWNER' && <option value="ADMIN">Admin</option>}
              <option value="USER">User</option>
            </select>
          </Field>
          <Field label="Status"><select value={f.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
        </div>

        {f.role === 'USER' && (
          <div>
            <div className="label">Permissions</div>
            {Object.entries(groups).map(([group, perms]) => (
              <div key={group}>
                <div className="perm-group-title">{group}</div>
                <div className="perm-grid">
                  {perms.map((p) => (
                    <label key={p.key} className="check"><input type="checkbox" checked={f.permissions.includes(p.key)} onChange={() => toggleKey(p.key)} /> {p.label}</label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}

function PasswordForm({ user, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post(`/users/${user.id}/password`, { password }); toast.success('Password changed'); onClose(); }
    catch (err) { toast.fail(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Set password for ${user.name}`} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="pw-form" disabled={busy}>Change password</button></>}>
      <form id="pw-form" className="stack" onSubmit={save}>
        <div className="callout warn">They will be signed out on every device.</div>
        <Field label="New password" hint="At least 8 characters, a letter and a number"><input type="password" required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
