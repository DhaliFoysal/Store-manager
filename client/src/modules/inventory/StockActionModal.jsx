import { useEffect, useState } from 'react';
import { api } from '../../app/api.js';
import { useDefaultWarehouse, useLookups, useToast } from '../../app/hooks.js';
import { Field, Modal, Tabs } from '../../components/ui.jsx';
import { ProductPicker } from '../../components/pickers.jsx';
import { useScanListener } from '../scanner/hooks.js';

const parseSerials = (text) => text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
const TITLES = { receive: 'Receive stock', transfer: 'Transfer stock', adjust: 'Adjust stock' };

// action: initial tab ('receive' | 'transfer' | 'adjust'); initialProduct: preselect a product (used by the Products page)
export function StockActionModal({ action: initialAction = 'receive', initialProduct = null, onClose, onDone }) {
  const toast = useToast();
  const { warehouses } = useLookups();
  const defaultWh = useDefaultWarehouse();
  const active = warehouses.filter((w) => w.isActive);
  const [action, setAction] = useState(initialAction);
  const [product, setProduct] = useState(initialProduct);
  const [f, setF] = useState({ warehouseId: '', toWarehouseId: '', quantity: '', serials: '', costPrice: '', delta: '', note: '' });
  const [busy, setBusy] = useState(false);
  const serials = parseSerials(f.serials);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // serial-tracked products can't be adjusted by quantity
  useEffect(() => {
    if (product?.trackSerial && action === 'adjust') setAction('receive');
  }, [product, action]);

  useScanListener((code) => {
    if (action === 'adjust' || !product?.trackSerial) return;
    if (document.activeElement?.hasAttribute('data-scan-target')) return;
    setF((s) => (parseSerials(s.serials).some((x) => x.toLowerCase() === code.toLowerCase()) ? s : { ...s, serials: `${s.serials.trim() ? `${s.serials.trim()}\n` : ''}${code}` }));
  });

  useEffect(() => {
    if (defaultWh && !f.warehouseId) setF((s) => ({ ...s, warehouseId: String(defaultWh.id) }));
  }, [defaultWh]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!product) return toast.error('Choose a product');
    setBusy(true);
    try {
      const productId = product.id;
      if (action === 'receive') {
        await api.post('/inventory/receive', {
          productId, warehouseId: Number(f.warehouseId), note: f.note || null,
          ...(product.trackSerial ? { serials } : { quantity: Number(f.quantity) }),
          ...(f.costPrice !== '' ? { costPrice: Number(f.costPrice) } : {}),
        });
      } else if (action === 'transfer') {
        await api.post('/inventory/transfer', {
          productId, fromWarehouseId: Number(f.warehouseId), toWarehouseId: Number(f.toWarehouseId), note: f.note || null,
          ...(product.trackSerial ? { serials } : { quantity: Number(f.quantity) }),
        });
      } else {
        await api.post('/inventory/adjust', { productId, warehouseId: Number(f.warehouseId), delta: Number(f.delta), note: f.note });
      }
      toast.success('Stock updated');
      onDone();
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  const serialField = (
    <Field label={`Serial numbers (${serials.length})`} hint="One per line — scan or paste">
      <textarea className="mono" rows={5} value={f.serials} onChange={set('serials')} />
    </Field>
  );

  const tabs = Object.entries(TITLES)
    .filter(([k]) => !(k === 'adjust' && product?.trackSerial))
    .map(([value, label]) => ({ value, label }));

  return (
    <Modal title={initialProduct ? `Stock · ${initialProduct.name}` : TITLES[action]} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="stock-form" disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</button></>}>
      <div className="stack">
        <Tabs value={action} onChange={setAction} tabs={tabs} />
        <form id="stock-form" className="stack" onSubmit={submit}>
          <Field label="Product"><ProductPicker value={product} onChange={setProduct} disabled={!!initialProduct} /></Field>
          <div className="row two">
            <Field label={action === 'transfer' ? 'From warehouse' : 'Warehouse'}>
              <select required value={f.warehouseId} onChange={set('warehouseId')}>
                <option value="">Select…</option>
                {(action === 'transfer' ? warehouses : active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            {action === 'transfer' && (
              <Field label="To warehouse">
                <select required value={f.toWarehouseId} onChange={set('toWarehouseId')}>
                  <option value="">Select…</option>
                  {active.filter((w) => String(w.id) !== f.warehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            )}
          </div>

          {action !== 'adjust' && product && (product.trackSerial ? serialField : <Field label="Quantity"><input type="number" min="1" required value={f.quantity} onChange={set('quantity')} /></Field>)}
          {action === 'receive' && <Field label="New cost price" hint="Optional – updates the product's cost"><input type="number" step="0.01" min="0" value={f.costPrice} onChange={set('costPrice')} /></Field>}
          {action === 'adjust' && (
            <Field label="Change (+ to add, − to remove)" hint="Use for stock-take corrections of non-serial products">
              <input type="number" required value={f.delta} onChange={set('delta')} />
            </Field>
          )}
          <Field label={action === 'adjust' ? 'Reason' : 'Note (optional)'}><input required={action === 'adjust'} value={f.note} onChange={set('note')} /></Field>
        </form>
      </div>
    </Modal>
  );
}
