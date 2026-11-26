import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, Banknote, Printer } from 'lucide-react';
import { api } from '../../app/api.js';
import { useCan, useFetch, useMoney, useToast } from '../../app/hooks.js';
import { fmtDate, fmtDateTime, titleCase } from '../../app/format.js';
import { Field, Loading, Modal, PageHeader, StatusBadge } from '../../components/ui.jsx';
import PrintHeader from '../../components/PrintHeader.jsx';
import ReceivePaymentModal from '../payments/ReceivePaymentModal.jsx';

export default function Voucher() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const money = useMoney();
  const can = useCan();
  const toast = useToast();
  const { data: s, loading, error, reload } = useFetch(`/sales/${id}`);
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  // ?print=1 (from the POS / list) opens the browser print dialog once the voucher is on screen
  useEffect(() => {
    if (s && params.get('print') === '1') {
      const t = setTimeout(() => { window.print(); setParams({}, { replace: true }); }, 350);
      return () => clearTimeout(t);
    }
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !s) return <Loading />;
  if (error) return <div className="callout bad">{error}</div>;
  const m = (v) => money(v);
  const due = Number(s.dueAmount);
  const notes = [s.store.voucherNotes, s.notes].filter(Boolean).join('\n\n');

  const doVoid = async () => {
    try {
      await api.post(`/sales/${s.id}/void`, { reason });
      toast.success('Voucher voided and stock restored');
      setVoiding(false);
      reload();
    } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title={`Voucher ${s.voucherNo}`} subtitle={<StatusBadge value={s.status} />}>
        <Link className="btn" to="/sales"><ArrowLeft /> Back</Link>
        {due > 0 && s.status !== 'VOID' && can('payments.create') && <button className="btn" onClick={() => setPaying(true)}><Banknote /> Receive payment</button>}
        {s.status !== 'VOID' && can('sales.void') && <button className="btn btn-danger" onClick={() => setVoiding(true)}><Ban /> Void</button>}
        <button className="btn btn-primary" onClick={() => window.print()}><Printer /> Print A4</button>
      </PageHeader>

      <div className="a4-scroll">
        <div className="a4">
          {s.status === 'VOID' && <div className="stamp">VOID</div>}
          <PrintHeader store={s.store} title="VOUCHER">
            <div><strong>{s.voucherNo}</strong></div>
            <div>{fmtDateTime(s.createdAt)}</div>
            <div>Status: <strong>{titleCase(s.status)}</strong></div>
          </PrintHeader>

          <div className="v-meta">
            <div className="v-box">
              <h4>Billed to</h4>
              {s.customer ? (<><strong>{s.customer.name}</strong><div>Phone: {s.customer.phone}</div>{s.customer.address && <div style={{ whiteSpace: 'pre-line' }}>{s.customer.address}</div>}</>) : <strong>Walk-in customer</strong>}
            </div>
            <div className="v-box">
              <h4>Sale details</h4>
              <div>Served by: {s.user.name}</div>
              <div>Warehouse: {s.warehouse.name}</div>
              <div>Date: {fmtDate(s.createdAt)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr><th style={{ width: 28 }}>#</th><th>Description</th><th>Serial no.</th><th>Warranty until</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">Disc.</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {s.items.map((it, i) => (
                <tr key={it.id}>
                  <td>{i + 1}</td>
                  <td><strong>{it.productName}</strong><div style={{ color: '#8a7683', fontSize: 10 }}>{it.sku}</div></td>
                  <td className="mono">{it.serialNumber || '—'}</td>
                  <td>{it.warrantyEnd ? <>{fmtDate(it.warrantyEnd)}<div style={{ color: '#8a7683', fontSize: 10 }}>{it.warrantyMonths} month(s)</div></> : '—'}</td>
                  <td className="r">{it.quantity}</td>
                  <td className="r">{m(it.unitPrice)}</td>
                  <td className="r">{Number(it.discount) > 0 ? m(it.discount) : '—'}</td>
                  <td className="r"><strong>{m(it.lineTotal)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="v-totals">
            <div><span>Subtotal</span><span>{m(s.subtotal)}</span></div>
            {Number(s.discount) > 0 && <div><span>Discount</span><span>− {m(s.discount)}</span></div>}
            <div className="grand"><span>Total</span><span>{m(s.total)}</span></div>
            {Number(s.creditUsed) > 0 && <div><span>Paid from customer credit</span><span>{m(s.creditUsed)}</span></div>}
            <div><span>Total paid</span><span>{m(s.paidAmount)}</span></div>
            <div className={due > 0 ? 'due' : ''}><span>Balance due</span><span>{m(s.dueAmount)}</span></div>
            {s.customer && Number(s.customer.credit) > 0 && <div><span>Customer credit balance</span><span>{m(s.customer.credit)}</span></div>}
          </div>

          {s.payments.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <strong style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--m-600)' }}>Payments</strong>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  {s.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.slipNo}</td><td>{fmtDateTime(p.createdAt)}</td><td>{titleCase(p.method)}</td>
                      <td className="r">{m(p.amount)}{Number(p.creditedAmount) > 0 && <span style={{ color: '#8a7683' }}> (incl. {m(p.creditedAmount)} to credit)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {s.status === 'VOID' && <div className="v-notes">Voided on {fmtDateTime(s.voidedAt)} — {s.voidReason}</div>}
          {notes && <div className="v-notes"><strong>Notes</strong>{'\n'}{notes}</div>}

          <div className="v-sign"><div>Customer signature</div><div>Authorized signature</div></div>
          <div className="v-foot">Thank you for your business · {s.store.name}</div>
        </div>
      </div>

      {paying && <ReceivePaymentModal sale={s} onClose={() => setPaying(false)} onDone={() => { setPaying(false); reload(); }} />}
      {voiding && (
        <Modal title={`Void ${s.voucherNo}`} size="sm" onClose={() => setVoiding(false)}
          footer={<><button className="btn" onClick={() => setVoiding(false)}>Cancel</button><button className="btn btn-danger" disabled={reason.trim().length < 3} onClick={doVoid}>Void voucher</button></>}>
          <div className="stack">
            <div className="callout warn">Items return to stock and serial numbers become available again.{s.customer ? ' Everything the customer paid is added to their credit.' : ' This voucher has no customer — refund any cash paid manually.'}</div>
            <Field label="Reason"><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
