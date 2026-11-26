import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { api } from '../../app/api.js';
import { useCan, useDebounce, useFetch, useMoney, useToast } from '../../app/hooks.js';
import { Empty, Loading, PageHeader, Pagination, SearchInput, useConfirm } from '../../components/ui.jsx';
import CustomerForm from './CustomerForm.jsx';

export default function Customers() {
  const can = useCan();
  const toast = useToast();
  const money = useMoney();
  const [q, setQ] = useState('');
  const [hasDue, setHasDue] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading, reload } = useFetch('/customers', { q: dq, hasDue: hasDue || undefined, page });
  const [editing, setEditing] = useState(null);
  const [confirm, dialog] = useConfirm();
  const manage = can('customers.manage');

  const remove = async (c) => {
    if (!(await confirm({ title: 'Delete customer', message: `Delete ${c.name}?`, danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/customers/${c.id}`); toast.success('Customer deleted'); reload(); } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title="Customers" subtitle="Everyone you sell to — contact details, balances and credit">
        {manage && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus /> Add customer</button>}
      </PageHeader>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, phone, address or e-mail…" />
          <label className="check"><input type="checkbox" checked={hasDue} onChange={(e) => { setHasDue(e.target.checked); setPage(1); }} /> With unpaid balance</label>
        </div>
        {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No customers found" /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Customer</th><th>Phone</th><th>Address</th><th className="right">Vouchers</th><th className="right">Due</th><th className="right">Credit</th><th /></tr></thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/customers/${c.id}`} className="cell-title">{c.name}</Link>{c.email && <div className="cell-sub">{c.email}</div>}</td>
                    <td className="nowrap"><Phone size={13} style={{ verticalAlign: -2 }} /> {c.phone}</td>
                    <td style={{ maxWidth: 280 }}>{c.address ? <><MapPin size={13} style={{ verticalAlign: -2 }} /> {c.address}</> : <span className="muted">—</span>}</td>
                    <td className="right">{c._count.sales}</td>
                    <td className="right" style={{ color: Number(c.totalDue) > 0 ? 'var(--bad)' : undefined, fontWeight: 600 }}>{money(c.totalDue)}</td>
                    <td className="right" style={{ color: Number(c.credit) > 0 ? 'var(--ok)' : undefined, fontWeight: 600 }}>{money(c.credit)}</td>
                    <td><div className="actions">
                      <Link className="btn btn-sm" to={`/customers/${c.id}`}>Open</Link>
                      {manage && <button className="btn btn-sm btn-icon" onClick={() => setEditing(c)} aria-label="Edit"><Pencil /></button>}
                      {manage && <button className="btn btn-sm btn-icon btn-danger" onClick={() => remove(c)} aria-label="Delete"><Trash2 /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </div>
      {editing && <CustomerForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {dialog}
    </>
  );
}
