import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../../app/api.js';
import { useFetch, useToast } from '../../app/hooks.js';
import { fmtDateTime } from '../../app/format.js';
import { Empty, Loading, PageHeader, Tabs, useConfirm } from '../../components/ui.jsx';

export default function Registrations() {
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const { data, loading, reload } = useFetch('/platform/registrations', { status });
  const [confirm, dialog] = useConfirm();

  const act = async (u, action) => {
    if (action === 'reject' && !(await confirm({ title: 'Reject registration', message: `Reject ${u.store.name}? They will not be able to sign in.`, danger: true, confirmLabel: 'Reject' }))) return;
    try { await api.post(`/platform/registrations/${u.id}/${action}`); toast.success(action === 'approve' ? 'Store approved — they can sign in now' : 'Registration rejected'); reload(); }
    catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title="Registrations" subtitle="New stores must be approved before their owner can sign in" />
      <div className="card">
        <Tabs value={status} onChange={setStatus} tabs={[{ value: 'PENDING', label: 'Pending approval' }, { value: 'REJECTED', label: 'Rejected' }]} />
        {loading && !data ? <Loading /> : !data?.data.length ? <Empty title={status === 'PENDING' ? 'No pending registrations' : 'Nothing rejected'} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Store</th><th>Owner</th><th>Contact</th><th>Requested</th><th /></tr></thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id}>
                  <td className="cell-title">{u.store.name}</td>
                  <td>{u.name}</td>
                  <td>{u.email}<div className="cell-sub">{u.phone}</div></td>
                  <td className="nowrap">{fmtDateTime(u.createdAt)}</td>
                  <td><div className="actions">
                    <button className="btn btn-sm btn-primary" onClick={() => act(u, 'approve')}><Check /> Approve</button>
                    {status === 'PENDING' && <button className="btn btn-sm btn-danger" onClick={() => act(u, 'reject')}><X /> Reject</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {dialog}
    </>
  );
}
