import { useState } from 'react';
import { ArrowLeftRight, Link2, PackagePlus, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../app/api.js';
import { useCan, useDebounce, useFetch, useLookups, useToast } from '../../app/hooks.js';
import { fmtDate, fmtDateTime, titleCase } from '../../app/format.js';
import { Badge, Empty, Loading, PageHeader, Pagination, SearchInput, StatusBadge, Tabs, useConfirm } from '../../components/ui.jsx';
import { StockActionModal } from './StockActionModal.jsx';
import { useScanListener } from '../scanner/hooks.js';
import { CameraScanButton, PhoneScannerButton } from '../scanner/ScannerControls.jsx';

export default function Inventory() {
  const can = useCan();
  const [tab, setTab] = useState('stock');
  const [action, setAction] = useState(null); // 'receive' | 'transfer' | 'adjust'
  const [version, setVersion] = useState(0);
  const [scanned, setScanned] = useState(''); // last code from a camera / the paired phone
  const manage = can('inventory.manage');

  // a code from the phone fills the focused search box; otherwise it jumps to the serial-number search (unless a stock dialog is open)
  useScanListener((code) => {
    if (action || document.activeElement?.hasAttribute('data-scan-target')) return;
    setScanned(code); setTab('serials');
  });

  return (
    <>
      <PageHeader title="Stock & serial numbers" subtitle="See what you hold, where it is, and track every serial number">
        <PhoneScannerButton />
        <CameraScanButton onCode={(code) => { setScanned(code); setTab('serials'); }} />
        {manage && (
          <>
            <button className="btn" onClick={() => setAction('adjust')}><SlidersHorizontal /> Adjust</button>
            <button className="btn" onClick={() => setAction('transfer')}><ArrowLeftRight /> Transfer</button>
            <button className="btn btn-primary" onClick={() => setAction('receive')}><PackagePlus /> Receive stock</button>
          </>
        )}
      </PageHeader>
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stock', label: 'Stock levels' }, { value: 'serials', label: 'Serial number search' }, { value: 'moves', label: 'Movements' }]} />
        {tab === 'stock' && <StockTab key={version} />}
        {tab === 'serials' && <SerialTab key={`${version}-${scanned}`} manage={manage} initialQuery={scanned} />}
        {tab === 'moves' && <MovementsTab key={version} />}
      </div>
      {action && <StockActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); setVersion((v) => v + 1); }} />}
    </>
  );
}

function StockTab() {
  const { warehouses, categories } = useLookups();
  const [q, setQ] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading } = useFetch('/inventory/stock', { q: dq, warehouseId, categoryId, lowOnly: lowOnly || undefined, page });
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Search product, SKU or barcode (or scan)…" />
        <select value={warehouseId} onChange={(e) => reset(setWarehouseId)(e.target.value)}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={categoryId} onChange={(e) => reset(setCategoryId)(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={lowOnly} onChange={(e) => reset(setLowOnly)(e.target.checked)} /> Low stock only</label>
      </div>
      {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No stock found" /> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th>Category</th><th>Warehouse</th><th className="right">Qty here</th><th className="right">Total (all)</th></tr></thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td><div className="cell-title">{r.product.name} {r.product.trackSerial && <Badge>Serial</Badge>}</div><div className="cell-sub mono">{r.product.sku}</div></td>
                  <td>{r.product.category?.name || <span className="muted">—</span>}</td>
                  <td>{r.warehouse.name}</td>
                  <td className="right cell-title">{r.quantity}</td>
                  <td className="right">{r.product.totalStock <= r.product.reorderLevel ? <span className="badge badge-bad">{r.product.totalStock} · low</span> : r.product.totalStock}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pagination meta={data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

function SerialTab({ manage, initialQuery = '' }) {
  const toast = useToast();
  const { warehouses } = useLookups();
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading, reload } = useFetch('/inventory/units', { q: dq, status, warehouseId, page });
  const [confirm, dialog] = useConfirm();

  const mark = async (u, next) => {
    if (!(await confirm({ title: 'Update serial status', message: `Mark ${u.serialNumber} as ${titleCase(next)}?`, confirmLabel: 'Yes, update' }))) return;
    try { await api.patch(`/inventory/units/${u.id}`, { status: next }); toast.success('Updated'); reload(); } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Scan or type a serial number…" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          {['IN_STOCK', 'SOLD', 'DEFECTIVE', 'LOST'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No serial numbers match" /> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Serial number</th><th>Product</th><th>Status</th><th>Location / sold to</th><th>Warranty until</th>{manage && <th />}</tr></thead>
            <tbody>
              {data.data.map((u) => {
                const sale = u.saleItem?.sale;
                return (
                  <tr key={u.id}>
                    <td className="mono cell-title">{u.serialNumber}</td>
                    <td><div className="cell-title">{u.product.name}</div><div className="cell-sub">{u.product.sku}</div></td>
                    <td><StatusBadge value={u.status} /></td>
                    <td>
                      {u.status === 'SOLD' && sale ? (
                        <><Link to={`/sales/${sale.id}`}><Link2 size={13} /> {sale.voucherNo}</Link><div className="cell-sub">{sale.customer ? `${sale.customer.name} · ${sale.customer.phone}` : 'Walk-in'} · {fmtDate(sale.createdAt)}</div></>
                      ) : u.warehouse.name}
                    </td>
                    <td>{u.saleItem?.warrantyEnd ? fmtDate(u.saleItem.warrantyEnd) : '—'}</td>
                    {manage && <td><div className="actions">
                      {u.status === 'IN_STOCK' && <button className="btn btn-sm" onClick={() => mark(u, 'DEFECTIVE')}>Mark defective</button>}
                      {(u.status === 'DEFECTIVE' || u.status === 'LOST') && <button className="btn btn-sm" onClick={() => mark(u, 'IN_STOCK')}>Back in stock</button>}
                    </div></td>}
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <Pagination meta={data.meta} onPage={setPage} />
        </>
      )}
      {dialog}
    </>
  );
}

function MovementsTab() {
  const [page, setPage] = useState(1);
  const { data, loading } = useFetch('/inventory/movements', { page });
  if (loading && !data) return <Loading />;
  if (!data?.data.length) return <Empty title="No stock movements yet" />;
  return (
    <>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>When</th><th>Product</th><th>Warehouse</th><th>Type</th><th className="right">Qty</th><th>Note</th></tr></thead>
        <tbody>
          {data.data.map((m) => (
            <tr key={m.id}>
              <td className="nowrap">{fmtDateTime(m.createdAt)}</td>
              <td><div className="cell-title">{m.product.name}</div><div className="cell-sub">{m.product.sku}</div></td>
              <td>{m.warehouse.name}</td>
              <td><Badge variant={m.quantity > 0 ? 'ok' : 'muted'}>{titleCase(m.type)}</Badge></td>
              <td className="right cell-title" style={{ color: m.quantity > 0 ? 'var(--ok)' : 'var(--bad)' }}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
              <td className="muted">{m.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <Pagination meta={data.meta} onPage={setPage} />
    </>
  );
}
