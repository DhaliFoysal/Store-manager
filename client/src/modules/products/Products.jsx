import { useState } from 'react';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../app/api.js';
import { useCan, useDebounce, useFetch, useLookups, useMoney, useToast } from '../../app/hooks.js';
import { Badge, Empty, Loading, PageHeader, Pagination, SearchInput, StatusBadge, useConfirm } from '../../components/ui.jsx';
import { StockActionModal } from '../inventory/StockActionModal.jsx';
import ProductForm from './ProductForm.jsx';

export default function Products() {
  const can = useCan();
  const toast = useToast();
  const money = useMoney();
  const { categories } = useLookups();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, loading, reload } = useFetch('/products', { q: dq, categoryId, lowStock: lowStock || undefined, page });
  const [editing, setEditing] = useState(null);
  const [stockFor, setStockFor] = useState(null); // product whose stock is being managed
  const [confirm, dialog] = useConfirm();
  const manage = can('products.manage');
  const stockManage = can('inventory.manage');

  const remove = async (p) => {
    if (!(await confirm({ title: 'Delete product', message: `Delete "${p.name}"? This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/products/${p.id}`); toast.success('Product deleted'); reload(); } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title="Products" subtitle="Your catalogue, prices, warranty terms and stock levels">
        {manage && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus /> Add product</button>}
      </PageHeader>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, SKU, barcode or serial number (or scan)…" />
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={lowStock} onChange={(e) => { setLowStock(e.target.checked); setPage(1); }} /> Low stock only</label>
        </div>
        {loading && !data ? <Loading /> : !data?.data.length ? <Empty title="No products found" /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Product</th><th>Category</th><th className="right">Cost</th><th className="right">Price</th><th>Warranty</th><th className="right">Stock</th>{(manage || stockManage) && <th />}</tr></thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.55 }}>
                    <td>
                      <div className="cell-title">{p.name} {!p.isActive && <StatusBadge value="INACTIVE" />}</div>
                      <div className="cell-sub mono">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div>
                    </td>
                    <td>{p.category?.name || <span className="muted">—</span>}</td>
                    <td className="right muted">{money(p.costPrice)}</td>
                    <td className="right cell-title">{money(p.salePrice)}</td>
                    <td>{p.warrantyMonths ? `${p.warrantyMonths} mo` : <span className="muted">None</span>}{p.trackSerial && <> <Badge>Serial</Badge></>}</td>
                    <td className="right">
                      <span className={p.totalStock <= p.reorderLevel ? 'badge badge-bad' : 'cell-title'}>{p.totalStock}</span>
                    </td>
                    {(manage || stockManage) && <td><div className="actions">
                      {stockManage && <button className="btn btn-sm" onClick={() => setStockFor(p)}><Boxes /> Stock</button>}
                      {manage && <button className="btn btn-sm" onClick={() => setEditing(p)}><Pencil /> Edit</button>}
                      {manage && <button className="btn btn-sm btn-danger" onClick={() => remove(p)}><Trash2 /></button>}
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </div>
      {editing && <ProductForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {stockFor && <StockActionModal action="receive" initialProduct={stockFor} onClose={() => setStockFor(null)} onDone={() => { setStockFor(null); reload(); }} />}
      {dialog}
    </>
  );
}
