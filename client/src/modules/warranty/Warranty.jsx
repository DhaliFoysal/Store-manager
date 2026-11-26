import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { api } from '../../app/api.js';
import { useCan, useDebounce, useFetch, useToast } from '../../app/hooks.js';
import { fmtDate, fmtDateTime, titleCase } from '../../app/format.js';
import { Empty, Field, Loading, Modal, PageHeader, Pagination, SearchInput, StatusBadge, Tabs } from '../../components/ui.jsx';

export default function Warranty() {
  const [tab, setTab] = useState('items');
  const can = useCan();
  return (
    <>
      <PageHeader title="Warranty" subtitle="Track every warranty-covered item and manage repair / replacement claims" />
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'items', label: 'Covered items' }, { value: 'claims', label: 'Claims' }]} />
        {tab === 'items' ? <ItemsTab manage={can('warranty.manage')} /> : <ClaimsTab manage={can('warranty.manage')} />}
      </div>
    </>
  );
}

function ItemsTab({ manage }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading, reload } = useFetch('/warranty/items', { q: dq, state, page });
  const [claimFor, setClaimFor] = useState(null);

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Serial number, voucher, customer or phone…" />
        <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}>
          <option value="all">All covered items</option><option value="active">Active</option>
          <option value="expiring">Expiring in 30 days</option><option value="expired">Expired</option>
        </select>
      </div>
      {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No warranty items found" /> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Item</th><th>Serial no.</th><th>Customer</th><th>Voucher</th><th>Sold</th><th>Warranty ends</th><th>Claims</th>{manage && <th />}</tr></thead>
            <tbody>
              {data.data.map((it) => (
                <tr key={it.id}>
                  <td className="cell-title">{it.productName}</td>
                  <td className="mono">{it.serialNumber || '—'}</td>
                  <td>{it.sale.customer ? <><Link to={`/customers/${it.sale.customer.id}`}>{it.sale.customer.name}</Link><div className="cell-sub">{it.sale.customer.phone}</div></> : <span className="muted">Walk-in</span>}</td>
                  <td><Link to={`/sales/${it.sale.id}`}>{it.sale.voucherNo}</Link></td>
                  <td className="nowrap">{fmtDate(it.sale.createdAt)}</td>
                  <td className="nowrap">{fmtDate(it.warrantyEnd)} <StatusBadge value={it.state} /></td>
                  <td>{it.claims.length ? it.claims.map((c) => <div key={c.id} className="cell-sub">{c.ticketNo} · {titleCase(c.status)}</div>) : <span className="muted">—</span>}</td>
                  {manage && <td><div className="actions"><button className="btn btn-sm" onClick={() => setClaimFor(it)}><Wrench /> New claim</button></div></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pagination meta={data.meta} onPage={setPage} />
        </>
      )}
      {claimFor && <ClaimForm item={claimFor} onClose={() => setClaimFor(null)} onSaved={() => { setClaimFor(null); reload(); }} />}
    </>
  );
}

function ClaimForm({ item, onClose, onSaved }) {
  const toast = useToast();
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsAck, setNeedsAck] = useState('');

  const save = async (e, ack = false) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/warranty/claims', { saleItemId: item.id, issue, acknowledgeOutOfWarranty: ack });
      toast.success(`Claim ${data.ticketNo} registered`);
      onSaved();
    } catch (err) {
      if (err.response?.data?.details?.code === 'OUT_OF_WARRANTY') setNeedsAck(err.response.data.message);
      else toast.fail(err);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Register warranty claim" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        {needsAck ? <button className="btn btn-danger" disabled={busy} onClick={() => save(null, true)}>Register as out-of-warranty</button>
          : <button className="btn btn-primary" form="claim-form" disabled={busy}>Register claim</button>}
      </>}>
      <form id="claim-form" className="stack" onSubmit={save}>
        <div className="callout"><strong>{item.productName}</strong>{item.serialNumber && <> · <span className="mono">{item.serialNumber}</span></>}<div>Warranty ends {fmtDate(item.warrantyEnd)} <StatusBadge value={item.state} /></div></div>
        {needsAck && <div className="callout warn">{needsAck}</div>}
        <Field label="Problem reported"><textarea required autoFocus value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

const CLAIM_STATUSES = ['RECEIVED', 'IN_REPAIR', 'REPAIRED', 'REPLACED', 'REJECTED', 'RETURNED'];

function ClaimsTab({ manage }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading, reload } = useFetch('/warranty/claims', { q: dq, status, page });
  const [editing, setEditing] = useState(null);

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Ticket, serial, voucher or customer…" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All claims</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option>
          {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>
      {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No claims" /> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Ticket</th><th>Item</th><th>Customer</th><th>Problem</th><th>Received</th><th>Status</th>{manage && <th />}</tr></thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id}>
                  <td className="cell-title">{c.ticketNo}{c.outOfWarranty && <div><span className="badge badge-warn">Out of warranty</span></div>}</td>
                  <td>{c.saleItem.productName}<div className="cell-sub mono">{c.saleItem.serialNumber}</div></td>
                  <td>{c.saleItem.sale.customer?.name || <span className="muted">Walk-in</span>}<div className="cell-sub">{c.saleItem.sale.customer?.phone}</div></td>
                  <td style={{ maxWidth: 260 }}>{c.issue}{c.resolution && <div className="cell-sub">→ {c.resolution}</div>}</td>
                  <td className="nowrap">{fmtDateTime(c.receivedAt)}</td>
                  <td><StatusBadge value={c.status} />{c.replacementSerial && <div className="cell-sub mono">New: {c.replacementSerial}</div>}</td>
                  {manage && <td><div className="actions"><button className="btn btn-sm" onClick={() => setEditing(c)}>Update</button></div></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pagination meta={data.meta} onPage={setPage} />
        </>
      )}
      {editing && <ClaimUpdate claim={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function ClaimUpdate({ claim, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ status: claim.status, resolution: claim.resolution || '', replacementSerial: claim.replacementSerial || '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.patch(`/warranty/claims/${claim.id}`, f); toast.success('Claim updated'); onSaved(); }
    catch (err) { toast.fail(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Update ${claim.ticketNo}`} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="claim-upd" disabled={busy}>Save</button></>}>
      <form id="claim-upd" className="stack" onSubmit={save}>
        <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{CLAIM_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
        <Field label="Resolution / notes"><textarea value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} /></Field>
        {f.status === 'REPLACED' && <Field label="Replacement serial number"><input className="mono" value={f.replacementSerial} onChange={(e) => setF({ ...f, replacementSerial: e.target.value })} /></Field>}
      </form>
    </Modal>
  );
}
