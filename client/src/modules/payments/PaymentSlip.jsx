import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useFetch, useMoney } from '../../app/hooks.js';
import { fmtDateTime, titleCase } from '../../app/format.js';
import { Loading, PageHeader } from '../../components/ui.jsx';
import PrintHeader from '../../components/PrintHeader.jsx';

export default function PaymentSlip() {
  const { id } = useParams();
  const money = useMoney();
  const { data: p, loading, error } = useFetch(`/payments/${id}`);
  if (loading) return <Loading />;
  if (error) return <div className="callout bad">{error}</div>;
  const m = (v) => money(v);

  return (
    <>
      <PageHeader title={`Payment slip ${p.slipNo}`}>
        <Link className="btn" to={p.sale ? `/sales/${p.sale.id}` : '/payments'}><ArrowLeft /> Back</Link>
        <button className="btn btn-primary" onClick={() => window.print()}><Printer /> Print A4</button>
      </PageHeader>
      <div className="a4-scroll">
        <div className="a4">
          <PrintHeader store={p.store} title="PAYMENT SLIP">
            <div><strong>{p.slipNo}</strong></div>
            <div>{fmtDateTime(p.createdAt)}</div>
          </PrintHeader>

          <div className="v-meta">
            <div className="v-box">
              <h4>Received from</h4>
              {p.customer ? (<><strong>{p.customer.name}</strong><div>{p.customer.phone}</div>{p.customer.address && <div>{p.customer.address}</div>}</>) : <strong>Walk-in customer</strong>}
            </div>
            <div className="v-box">
              <h4>Against</h4>
              {p.sale ? (<><strong>Voucher {p.sale.voucherNo}</strong><div>Voucher total: {m(p.sale.total)}</div></>) : <strong>Advance deposit</strong>}
              <div>Method: {titleCase(p.method)}{p.reference ? ` · Ref ${p.reference}` : ''}</div>
            </div>
          </div>

          <table>
            <thead><tr><th>Description</th><th className="r">Amount</th></tr></thead>
            <tbody>
              <tr><td>Payment received ({titleCase(p.method)})</td><td className="r">{m(p.amount)}</td></tr>
              {Number(p.appliedAmount) > 0 && <tr><td>Applied to voucher {p.sale?.voucherNo}</td><td className="r">{m(p.appliedAmount)}</td></tr>}
              {Number(p.creditedAmount) > 0 && <tr><td>{p.sale ? 'Excess credited to customer account' : 'Credited to customer account'}</td><td className="r">{m(p.creditedAmount)}</td></tr>}
            </tbody>
          </table>

          <div className="v-totals">
            <div className="grand"><span>Amount received</span><span>{m(p.amount)}</span></div>
            {p.saleDueAfter != null && <div className={Number(p.saleDueAfter) > 0 ? 'due' : ''}><span>Voucher balance after payment</span><span>{m(p.saleDueAfter)}</span></div>}
            {p.customer && <div><span>Customer credit balance (now)</span><span>{m(p.customer.credit)}</span></div>}
          </div>

          {p.note && <div className="v-notes">{p.note}</div>}
          {p.store.voucherNotes && <div className="v-notes">{p.store.voucherNotes}</div>}

          <div className="v-sign"><div>Customer signature</div><div>Received by{p.user?.name ? ` (${p.user.name})` : ''}</div></div>
          <div className="v-foot">Computer-generated slip · {p.store.name}</div>
        </div>
      </div>
    </>
  );
}
