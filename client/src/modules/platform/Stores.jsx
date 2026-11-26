import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../../app/api.js';
import { useFetch, useToast } from '../../app/hooks.js';
import { fmtDate } from '../../app/format.js';
import { Empty, Field, Loading, Modal, PageHeader, StatusBadge, useConfirm } from '../../components/ui.jsx';

export default function Stores() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/platform/stores');
  const [resetFor, setResetFor] = useState(null);
  const [confirm, dialog] = useConfirm();

  const toggle = async (s) => {
    const next = s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (next === 'SUSPENDED' && !(await confirm({ title: 'Suspend store', message: `${s.name} and all its users will be locked out immediately.`, danger: true, confirmLabel: 'Suspend' }))) return;
    try { await api.patch(`/platform/stores/${s.id}/status`, { status: next }); toast.success('Store updated'); reload(); } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title="Stores" subtitle="All approved stores on this platform" />
      <div className="card">
        {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No stores yet" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Store</th><th>Owner</th><th>Status</th><th className="right">Users</th><th className="right">Products</th><th className="right">Vouchers</th><th>Since</th><th /></tr></thead>
            <tbody>
              {data.data.map((s) => {
                const owner = s.users[0];
                return (
                  <tr key={s.id}>
                    <td className="cell-title">{s.name}</td>
                    <td>{owner?.name}<div className="cell-sub">{owner?.email}</div></td>
                    <td><StatusBadge value={s.status} /></td>
                    <td className="right">{s._count.users}</td><td className="right">{s._count.products}</td><td className="right">{s._count.sales}</td>
                    <td>{fmtDate(s.createdAt)}</td>
                    <td><div className="actions">
                      {owner && <button className="btn btn-sm" onClick={() => setResetFor(owner)}><KeyRound /> Reset owner password</button>}
                      <button className={`btn btn-sm ${s.status === 'ACTIVE' ? 'btn-danger' : ''}`} onClick={() => toggle(s)}>{s.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      {resetFor && <ResetPassword owner={resetFor} onClose={() => setResetFor(null)} />}
      {dialog}
    </>
  );
}

function ResetPassword({ owner, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try { await api.post(`/platform/owners/${owner.id}/password`, { password }); toast.success('Owner password reset'); onClose(); } catch (err) { toast.fail(err); }
  };
  return (
    <Modal title={`Reset password for ${owner.name}`} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="owner-pw">Reset</button></>}>
      <form id="owner-pw" className="stack" onSubmit={save}>
        <Field label="New password" hint="At least 8 characters, a letter and a number"><input type="password" required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
