import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Printer } from 'lucide-react';
import { useCan, useDebounce, useFetch, useMoney } from '../../app/hooks.js';
import { fmtDateTime, titleCase } from '../../app/format.js';
import { Empty, Field, Loading, Modal, PageHeader, Pagination, SearchInput } from '../../components/ui.jsx';
import { CustomerPicker } from '../../components/pickers.jsx';
import ReceivePaymentModal from './ReceivePaymentModal.jsx';

export default function Payments() {
  const can = useCan();
  const money = useMoney();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading, reload } = useFetch('/payments', { q: dq, page });
  const [picking, setPicking] = useState(false);
  const [customer, setCustomer] = useState(null);

  return (
    <>
      <PageHeader title="Payment slips" subtitle="Every payment received, linked to its voucher">
        {can('payments.create') && <button className="btn btn-primary" onClick={() => setPicking(true)}><Banknote /> New payment</button>}
      </PageHeader>
      <div className="card">
        <div className="toolbar"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search slip no., voucher, customer or reference…" /></div>
        {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No payments yet" /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Slip</th><th>Date</th><th>Customer</th><th>Voucher</th><th>Method</th><th className="right">Amount</th><th className="right">Credited</th><th /></tr></thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-title">{p.slipNo}</td>
                    <td className="nowrap">{fmtDateTime(p.createdAt)}</td>
                    <td>{p.customer ? <Link to={`/customers/${p.customer.id}`}>{p.customer.name}</Link> : <span className="muted">Walk-in</span>}</td>
                    <td>{p.sale ? <Link to={`/sales/${p.sale.id}`}>{p.sale.voucherNo}</Link> : <span className="muted">Deposit</span>}</td>
                    <td>{titleCase(p.method)}</td>
                    <td className="right cell-title">{money(p.amount)}</td>
                    <td className="right">{Number(p.creditedAmount) > 0 ? money(p.creditedAmount) : '—'}</td>
                    <td><div className="actions"><Link className="btn btn-sm" to={`/payments/${p.id}/slip`}><Printer /> Slip</Link></div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </div>

      {picking && !customer && (
        <Modal title="Who is paying?" size="sm" onClose={() => setPicking(false)}>
          <Field label="Customer"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
        </Modal>
      )}
      {picking && customer && (
        <ReceivePaymentModal customer={customer} onClose={() => { setPicking(false); setCustomer(null); }} onDone={() => { setPicking(false); setCustomer(null); reload(); }} />
      )}
    </>
  );
}
