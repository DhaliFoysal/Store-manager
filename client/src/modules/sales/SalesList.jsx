import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Printer } from 'lucide-react';
import { useCan, useDebounce, useFetch, useMoney } from '../../app/hooks.js';
import { fmtDateTime } from '../../app/format.js';
import { Empty, Loading, PageHeader, Pagination, SearchInput, StatusBadge } from '../../components/ui.jsx';

export default function SalesList() {
  const can = useCan();
  const money = useMoney();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading } = useFetch('/sales', { q: dq, status, from, to, page });
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title="Vouchers" subtitle="Every sale, with its payment status">
        {can('sales.create') && <Link className="btn btn-primary" to="/pos"><Plus /> New sale</Link>}
      </PageHeader>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={reset(setQ)} placeholder="Voucher no., customer, phone or serial number…" />
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PAID">Paid</option>
            <option value="DUE,PARTIAL">Unpaid / partial</option>
            <option value="VOID">Void</option>
          </select>
          <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From" />
          <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To" />
        </div>
        {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No vouchers found" /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Voucher</th><th>Date</th><th>Customer</th><th>Status</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Due</th><th /></tr></thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id} style={s.status === 'VOID' ? { opacity: 0.55 } : undefined}>
                    <td><Link to={`/sales/${s.id}`} className="cell-title">{s.voucherNo}</Link><div className="cell-sub">{s._count.items} item(s) · {s.user.name}</div></td>
                    <td className="nowrap">{fmtDateTime(s.createdAt)}</td>
                    <td>{s.customer ? <Link to={`/customers/${s.customer.id}`}>{s.customer.name}</Link> : <span className="muted">Walk-in</span>}{s.customer && <div className="cell-sub">{s.customer.phone}</div>}</td>
                    <td><StatusBadge value={s.status} /></td>
                    <td className="right cell-title">{money(s.total)}</td>
                    <td className="right">{money(s.paidAmount)}</td>
                    <td className="right" style={{ color: Number(s.dueAmount) > 0 ? 'var(--bad)' : undefined, fontWeight: 600 }}>{money(s.dueAmount)}</td>
                    <td><div className="actions"><Link className="btn btn-sm" to={`/sales/${s.id}?print=1`}><Printer /> Print</Link></div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}
