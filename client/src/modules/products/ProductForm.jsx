import { useState } from 'react';
import { api } from '../../app/api.js';
import { useDefaultWarehouse, useLookups, useToast } from '../../app/hooks.js';
import { Field, Modal } from '../../components/ui.jsx';
import { useScanListener } from '../scanner/hooks.js';

export const parseSerials = (text) => text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);

export default function ProductForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const { categories, warehouses } = useLookups();
  const defaultWh = useDefaultWarehouse();
  const editing = !!initial.id;
  const [form, setForm] = useState({
    name: initial.name || '', sku: initial.sku || '', barcode: initial.barcode || '', categoryId: initial.categoryId || '',
    description: initial.description || '', costPrice: initial.costPrice ?? '', salePrice: initial.salePrice ?? '',
    warrantyMonths: initial.warrantyMonths ?? 0, trackSerial: !!initial.trackSerial, reorderLevel: initial.reorderLevel ?? 0,
    isActive: initial.isActive ?? true,
  });
  const [stock, setStock] = useState({ warehouseId: defaultWh?.id || '', quantity: '', serials: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const serials = parseSerials(stock.serials);

  // paired phone: serial products → opening-stock serial list, otherwise → the barcode field
  useScanListener((code) => {
    if (form.trackSerial && !editing) {
      setStock((s) => (parseSerials(s.serials).some((x) => x.toLowerCase() === code.toLowerCase()) ? s : { ...s, serials: `${s.serials.trim() ? `${s.serials.trim()}\n` : ''}${code}` }));
    } else {
      setForm((f) => ({ ...f, barcode: code }));
    }
  });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      ...form,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      costPrice: Number(form.costPrice || 0), salePrice: Number(form.salePrice || 0),
      warrantyMonths: Number(form.warrantyMonths || 0), reorderLevel: Number(form.reorderLevel || 0),
      barcode: form.barcode.trim() || null,
    };
    try {
      if (editing) await api.put(`/products/${initial.id}`, body);
      else {
        const hasStock = form.trackSerial ? serials.length > 0 : Number(stock.quantity) > 0;
        if (hasStock) {
          body.initialStock = { warehouseId: Number(stock.warehouseId), ...(form.trackSerial ? { serials } : { quantity: Number(stock.quantity) }) };
        }
        await api.post('/products', body);
      }
      toast.success('Product saved');
      onSaved();
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="product-form" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></>}>
      <form id="product-form" className="stack" onSubmit={save}>
        <Field label="Product name"><input required autoFocus value={form.name} onChange={set('name')} /></Field>
        <div className="row">
          <Field label="SKU"><input required value={form.sku} onChange={set('sku')} /></Field>
          <Field label="Barcode" hint="Scan it here, or leave blank"><input value={form.barcode} onChange={set('barcode')} /></Field>
          <Field label="Category">
            <select value={form.categoryId} onChange={set('categoryId')}>
              <option value="">— None —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Cost price"><input type="number" step="0.01" min="0" value={form.costPrice} onChange={set('costPrice')} /></Field>
          <Field label="Selling price"><input type="number" step="0.01" min="0" required value={form.salePrice} onChange={set('salePrice')} /></Field>
          <Field label="Warranty (months)" hint="0 = no warranty"><input type="number" min="0" max="120" value={form.warrantyMonths} onChange={set('warrantyMonths')} /></Field>
          <Field label="Reorder level" hint="Low-stock alert at or below"><input type="number" min="0" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field>
        </div>
        <Field label="Description"><textarea value={form.description} onChange={set('description')} /></Field>
        <div className="flex wrap" style={{ gap: 24 }}>
          <label className="check"><input type="checkbox" checked={form.trackSerial} disabled={editing && initial.totalStock > 0} onChange={set('trackSerial')} /> Track serial numbers (every unit has its own serial)</label>
          {editing && <label className="check"><input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Active</label>}
        </div>

        {!editing && (
          <div className="card card-pad" style={{ background: 'var(--m-50)', boxShadow: 'none' }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Opening stock (optional)</div>
            <div className="stack">
              <Field label="Warehouse">
                <select value={stock.warehouseId} onChange={(e) => setStock({ ...stock, warehouseId: e.target.value })}>
                  {warehouses.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
              {form.trackSerial ? (
                <Field label={`Serial numbers (${serials.length})`} hint="One per line — scan them in, or paste a list">
                  <textarea className="mono" rows={5} value={stock.serials} onChange={(e) => setStock({ ...stock, serials: e.target.value })} />
                </Field>
              ) : (
                <Field label="Quantity"><input type="number" min="0" value={stock.quantity} onChange={(e) => setStock({ ...stock, quantity: e.target.value })} /></Field>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
