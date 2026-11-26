import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, MapPin, Phone } from 'lucide-react';
import { useCan, useFetch, useMoney } from '../../app/hooks.js';
import { fmtDate, fmtDateTime, titleCase } from '../../app/format.js';
import { Empty, Loading, PageHeader, StatusBadge, Tabs } from '../../components/ui.jsx';
import ReceivePaymentModal from '../payments/ReceivePaymentModal.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const money = useMoney();
  const can = useCan();
  const { data, loading, error, reload } = useFetch(`/customers/${id}`);
  const [tab, setTab] = useState('sales');
  const [paying, setPaying] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <div className="callout bad">{error}</div>;
  const { customer, summary, sales, payments, ledger } = data;

  return (
    <>
      <PageHeader title={customer.name} subtitle={<><Phone size={13} /> {customer.phone}{customer.email && ` · ${customer.email}`}</>}>
        <Link className="btn" to="/customers"><ArrowLeft /> Back</Link>
        {can('payments.create') && <button className="btn btn-primary" onClick={() => setPaying(true)}><Banknote /> Receive payment / deposit</button>}
      </PageHeader>

      <div className="stat-grid">
        <div className="card stat"><div className="stat-label">Address</div><div style={{ marginTop: 6 }}>{customer.address ? <><MapPin size={14} /> {customer.address}</> : <span className="muted">Not provided</span>}</div></div>
        <div className="card stat bad"><div className="stat-label">Outstanding due</div><div className="stat-value">{money(summary.totalDue)}</div></div>
        <div className="card stat ok"><div className="stat-label">Credit balance</div><div className="stat-value">{money(customer.credit)}</div><div className="stat-note">Spendable on future vouchers</div></div>
        <div className="card stat"><div className="stat-label">Lifetime purchases</div><div className="stat-value">{money(summary.totalPurchases)}</div><div className="stat-note">{summary.voucherCount} vouchers</div></div>
      </div>

      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sales', label: 'Vouchers' }, { value: 'payments', label: 'Payments' }, { value: 'ledger', label: 'Credit history' }]} />
        <div className="table-wrap">
          {tab === 'sales' && (sales.length === 0 ? <Empty title="No vouchers yet" /> : (
            <table className="table">
              <thead><tr><th>Voucher</th><th>Date</th><th>Status</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Due</th></tr></thead>
              <tbody>{sales.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/sales/${s.id}`} className="cell-title">{s.voucherNo}</Link></td>
                  <td>{fmtDate(s.createdAt)}</td><td><StatusBadge value={s.status} /></td>
                  <td className="right">{money(s.total)}</td><td className="right">{money(s.paidAmount)}</td>
                  <td className="right" style={{ color: Number(s.dueAmount) > 0 ? 'var(--bad)' : undefined }}>{money(s.dueAmount)}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}
          {tab === 'payments' && (payments.length === 0 ? <Empty title="No payments yet" /> : (
            <table className="table">
              <thead><tr><th>Slip</th><th>Date</th><th>Voucher</th><th>Method</th><th className="right">Amount</th><th className="right">Credited</th></tr></thead>
              <tbody>{payments.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/payments/${p.id}/slip`} className="cell-title">{p.slipNo}</Link></td>
                  <td>{fmtDateTime(p.createdAt)}</td>
                  <td>{p.sale ? <Link to={`/sales/${p.sale.id}`}>{p.sale.voucherNo}</Link> : <span className="muted">Deposit</span>}</td>
                  <td>{titleCase(p.method)}</td><td className="right">{money(p.amount)}</td>
                  <td className="right">{Number(p.creditedAmount) > 0 ? money(p.creditedAmount) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}
          {tab === 'ledger' && (ledger.length === 0 ? <Empty title="No credit activity" /> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Type</th><th>Note</th><th className="right">Amount</th><th className="right">Balance</th></tr></thead>
              <tbody>{ledger.map((l) => (
                <tr key={l.id}>
                  <td>{fmtDateTime(l.createdAt)}</td><td>{titleCase(l.type)}</td><td className="muted">{l.note || '—'}</td>
                  <td className="right" style={{ color: Number(l.amount) >= 0 ? 'var(--ok)' : 'var(--bad)', fontWeight: 600 }}>{Number(l.amount) >= 0 ? '+' : ''}{money(l.amount)}</td>
                  <td className="right">{money(l.balanceAfter)}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      </div>
      {paying && <ReceivePaymentModal customer={customer} onClose={() => setPaying(false)} onDone={() => { setPaying(false); reload(); }} />}
    </>
  );
}
