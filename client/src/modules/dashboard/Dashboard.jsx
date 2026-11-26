import { Link } from 'react-router-dom';
import { useFetch, useMoney } from '../../app/hooks.js';
import { fmtDate } from '../../app/format.js';
import { Empty, Loading, PageHeader, StatusBadge } from '../../components/ui.jsx';

export default function Dashboard() {
  const money = useMoney();
  const { data, loading, error } = useFetch('/dashboard/summary');
  if (loading) return <Loading />;
  if (error) return <div className="callout bad">{error}</div>;

  const max = Math.max(1, ...data.last7Days.map((d) => Number(d.total)));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="How the shop is doing right now" />
      <div className="stat-grid">
        <div className="card stat"><div className="stat-label">Sales today</div><div className="stat-value">{money(data.today.total)}</div><div className="stat-note">{data.today.count} vouchers</div></div>
        <div className="card stat"><div className="stat-label">Sales this month</div><div className="stat-value">{money(data.month.total)}</div><div className="stat-note">{data.month.count} vouchers</div></div>
        <div className="card stat bad"><div className="stat-label">Outstanding dues</div><div className="stat-value">{money(data.outstanding.total)}</div><div className="stat-note">{data.outstanding.count} unpaid vouchers</div></div>
        <div className="card stat ok"><div className="stat-label">Customer credit held</div><div className="stat-value">{money(data.customerCredit)}</div><div className="stat-note">{data.customers} customers</div></div>
        <div className="card stat warn"><div className="stat-label">Low stock items</div><div className="stat-value">{data.lowStockCount}</div><div className="stat-note">of {data.products} products</div></div>
        <div className="card stat warn"><div className="stat-label">Warranties expiring (30 days)</div><div className="stat-value">{data.warrantyExpiring}</div><div className="stat-note">{data.openClaims} open claims</div></div>
      </div>

      <div className="split">
        <div className="card">
          <div className="card-header"><span className="card-title">Last 7 days</span></div>
          <div className="card-pad">
            <div className="bars">
              {data.last7Days.map((d) => (
                <div className="bar-col" key={d.date}>
                  <span className="bar-val">{Number(d.total) > 0 ? Math.round(Number(d.total)).toLocaleString() : ''}</span>
                  <div className="bar" style={{ height: `${(Number(d.total) / max) * 100}%` }} title={money(d.total)} />
                  <span className="bar-lbl">{new Date(d.date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Low stock</span><Link to="/inventory">View all</Link></div>
          {data.lowStock.length === 0 ? <Empty title="All stocked up" /> : (
            <table className="table"><tbody>
              {data.lowStock.map((p) => (
                <tr key={p.id}>
                  <td><div className="cell-title">{p.name}</div><div className="cell-sub">{p.sku}</div></td>
                  <td className="right"><StatusBadge value={p.totalStock === 0 ? 'DUE' : 'PARTIAL'} label={`${p.totalStock} left`} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-header"><span className="card-title">Recent vouchers</span><Link to="/sales">All vouchers</Link></div>
        {data.recentSales.length === 0 ? <Empty title="No sales yet">Open the POS to make your first sale.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Voucher</th><th>Customer</th><th>Date</th><th>Status</th><th className="right">Total</th></tr></thead>
            <tbody>
              {data.recentSales.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/sales/${s.id}`} className="cell-title">{s.voucherNo}</Link></td>
                  <td>{s.customer?.name || <span className="muted">Walk-in</span>}</td>
                  <td>{fmtDate(s.createdAt)}</td>
                  <td><StatusBadge value={s.status} /></td>
                  <td className="right">{money(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
