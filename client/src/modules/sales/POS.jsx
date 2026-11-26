import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ScanLine, Trash2, UserPlus } from 'lucide-react';
import { api } from '../../app/api.js';
import { useCan, useDebounce, useDefaultWarehouse, useLookups, useMoney, useToast } from '../../app/hooks.js';
import { fromCents, titleCase, toCents } from '../../app/format.js';
import { Empty, Field, Modal, PageHeader } from '../../components/ui.jsx';
import { CustomerPicker } from '../../components/pickers.jsx';
import CustomerForm from '../customers/CustomerForm.jsx';
import { useScanListener } from '../scanner/hooks.js';
import { CameraScanButton, PhoneScannerButton } from '../scanner/ScannerControls.jsx';
import { addProduct, addUnit, computeTotals, patchLine, removeLine, resetCart, setField, setWarehouse } from './cartSlice.js';

const METHODS = ['CASH', 'CARD', 'BKASH', 'NAGAD', 'BANK'];

export default function POS() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const can = useCan();
  const cart = useSelector((s) => s.cart);
  const { warehouses } = useLookups();
  const defaultWh = useDefaultWarehouse();
  const t = useMemo(() => computeTotals(cart), [cart]);
  const canOverride = can('sales.override_price');

  const [code, setCode] = useState('');
  const dq = useDebounce(code, 250);
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const [done, setDone] = useState(null);
  const scanRef = useRef(null);

  useEffect(() => {
    if (!cart.warehouseId && defaultWh) dispatch(setWarehouse(defaultWh.id));
  }, [cart.warehouseId, defaultWh, dispatch]);

  useEffect(() => { scanRef.current?.focus(); }, [done]);

  // type-ahead product search (barcode scans finish with Enter, which clears this)
  useEffect(() => {
    if (dq.trim().length < 2 || !cart.warehouseId) { setSuggestions([]); return; }
    let live = true;
    api.get('/sales/search', { params: { q: dq.trim(), warehouseId: cart.warehouseId } })
      .then((r) => live && setSuggestions(r.data.data)).catch(() => {});
    return () => { live = false; };
  }, [dq, cart.warehouseId]);

  const addFromProduct = (p) => {
    if (p.available <= 0) return toast.error(`${p.name} is out of stock in this warehouse`);
    dispatch(addProduct(p));
    if (p.trackSerial) toast.info('Scan or choose a serial number for this item');
  };

  // One entry point for EVERY scan source: USB/keyboard scanner, camera, and the paired phone
  const handleCode = async (raw) => {
    const value = String(raw || '').trim();
    if (!value) return;
    if (!cart.warehouseId) return toast.error('Choose a warehouse first');
    try {
      const { data } = await api.get('/sales/lookup', { params: { code: value, warehouseId: cart.warehouseId } });
      if (data.kind === 'unit') {
        if (cart.items.some((l) => l.unitId === data.unit.id)) return toast.error('That serial number is already in the cart');
        dispatch(addUnit(data));
      } else addFromProduct(data.product);
    } catch (err) { toast.fail(err); }
  };

  // codes arriving from the paired Android phone
  useScanListener(handleCode);

  // a hardware scanner "types" the code and presses Enter
  const onScan = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setCode(''); setSuggestions([]);
    handleCode(value);
  };

  const usedUnitIds = cart.items.map((l) => l.unitId).filter(Boolean);
  const missingSerial = cart.items.some((l) => l.trackSerial && !l.unitId);
  const needsCustomer = t.due > 0 || t.creditUsed > 0;
  const blocked = !cart.items.length || missingSerial || (needsCustomer && !cart.customer);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/sales', {
        customerId: cart.customer?.id ?? null,
        warehouseId: cart.warehouseId,
        items: cart.items.map((l) => ({
          productId: l.productId, unitId: l.unitId || undefined, quantity: l.qty,
          ...(toCents(l.price) !== toCents(l.basePrice) ? { unitPrice: Number(l.price) } : {}),
          discount: Number(l.discount || 0),
        })),
        discount: fromCents(t.discount),
        creditUsed: fromCents(t.creditUsed),
        paidAmount: fromCents(t.paid),
        paymentMethod: cart.method,
        paymentReference: cart.reference || null,
        notes: cart.notes || null,
      });
      setDone(data);
      dispatch(resetCart());
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Point of sale" subtitle="Scan a barcode or serial number — items are added instantly">
        <PhoneScannerButton />
        <CameraScanButton onCode={handleCode} />
        <select style={{ width: 'auto' }} value={cart.warehouseId || ''} onChange={(e) => dispatch(setWarehouse(Number(e.target.value)))}>
          {warehouses.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </PageHeader>

      <div className="pos">
        <div className="stack">
          <div className="card card-pad">
            <div className="scan-box">
              <ScanLine />
              <input ref={scanRef} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onScan} autoComplete="off"
                placeholder="Scan barcode / serial number, or type a product name…" />
              {suggestions.length > 0 && code.trim().length >= 2 && (
                <div className="picker-menu">
                  {suggestions.map((p) => (
                    <div key={p.id} className="picker-item" onMouseDown={(e) => { e.preventDefault(); addFromProduct(p); setCode(''); setSuggestions([]); scanRef.current?.focus(); }}>
                      <div className="flex between"><span className="cell-title">{p.name}</span><strong>{money(p.salePrice)}</strong></div>
                      <div className="cell-sub">{p.sku} · {p.available} in stock{p.trackSerial ? ' · serial tracked' : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            {cart.items.length === 0 ? <Empty title="Cart is empty" icon={ScanLine}>Scan an item to start the sale.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Item</th><th>Serial no.</th><th className="right">Price</th><th className="right">Qty</th><th className="right">Disc.</th><th className="right">Amount</th><th /></tr></thead>
                <tbody>
                  {cart.items.map((l, i) => (
                    <tr key={l.key}>
                      <td><div className="cell-title">{l.name}</div><div className="cell-sub mono">{l.sku}{l.warrantyMonths ? ` · ${l.warrantyMonths} mo warranty` : ''}</div></td>
                      <td style={{ minWidth: 190 }}>
                        {l.trackSerial ? (
                          <SerialSelect line={l} warehouseId={cart.warehouseId} usedIds={usedUnitIds}
                            onPick={(u) => dispatch(patchLine({ key: l.key, patch: { unitId: u?.id || null, serial: u?.serialNumber || null } }))} />
                        ) : <span className="muted">—</span>}
                      </td>
                      <td className="right">
                        <input className="price-input" type="number" step="0.01" min="0" value={l.price} disabled={!canOverride}
                          title={canOverride ? '' : 'You are not allowed to change prices'}
                          onChange={(e) => dispatch(patchLine({ key: l.key, patch: { price: e.target.value } }))} />
                      </td>
                      <td className="right">
                        {l.trackSerial ? 1 : (
                          <input className="qty-input" type="number" min="1" max={l.available} value={l.qty}
                            onChange={(e) => dispatch(patchLine({ key: l.key, patch: { qty: Math.max(1, Math.min(l.available, Number(e.target.value) || 1)) } }))} />
                        )}
                      </td>
                      <td className="right"><input className="price-input" style={{ width: 90 }} type="number" step="0.01" min="0" value={l.discount} placeholder="0"
                        onChange={(e) => dispatch(patchLine({ key: l.key, patch: { discount: e.target.value } }))} /></td>
                      <td className="right cell-title">{money(fromCents(t.lines[i].net))}</td>
                      <td><button className="btn btn-sm btn-icon btn-danger" onClick={() => dispatch(removeLine(l.key))} aria-label="Remove"><Trash2 /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>

        <div className="card card-pad pos-summary stack">
          <Field label="Customer">
            <CustomerPicker value={cart.customer} onChange={(c) => { dispatch(setField({ field: 'customer', value: c })); dispatch(setField({ field: 'creditUsed', value: '' })); }} />
            {!cart.customer && can('customers.manage') && (
              <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setNewCustomer(true)}><UserPlus /> New customer</button>
            )}
          </Field>

          <div>
            <div className="sum-row"><span className="muted">Subtotal</span><span>{money(fromCents(t.subtotal))}</span></div>
            <div className="sum-row"><span className="muted">Discount</span>
              <input className="price-input" type="number" step="0.01" min="0" placeholder="0.00" value={cart.discount} onChange={(e) => dispatch(setField({ field: 'discount', value: e.target.value }))} /></div>
            {Number(cart.customer?.credit) > 0 && (
              <div className="sum-row"><span className="muted">Use credit <small>(max {money(cart.customer.credit)})</small></span>
                <input className="price-input" type="number" step="0.01" min="0" placeholder="0.00" value={cart.creditUsed} onChange={(e) => dispatch(setField({ field: 'creditUsed', value: e.target.value }))} /></div>
            )}
            <div className="sum-row total"><span>Total</span><span>{money(fromCents(t.total))}</span></div>
          </div>

          <div className="row two">
            <Field label="Payment method">
              <select value={cart.method} onChange={(e) => dispatch(setField({ field: 'method', value: e.target.value }))}>
                {METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
              </select>
            </Field>
            <Field label="Amount received">
              <input type="number" step="0.01" min="0" value={cart.paidTouched ? cart.paid : fromCents(t.payable)}
                onChange={(e) => dispatch(setField({ field: 'paid', value: e.target.value }))} />
            </Field>
          </div>

          {t.due > 0 && <div className="callout bad">Balance due <strong>{money(fromCents(t.due))}</strong>{cart.customer ? ' — will stay open on the customer’s account.' : ' — select a customer to sell on credit.'}</div>}
          {t.excess > 0 && cart.customer && <div className="callout ok"><strong>{money(fromCents(t.excess))}</strong> over the total will be <strong>credited to {cart.customer.name}</strong>.</div>}
          {t.excess > 0 && !cart.customer && <div className="callout warn">Change to return: <strong>{money(fromCents(t.excess))}</strong></div>}
          {missingSerial && <div className="callout warn">Choose a serial number for every serial-tracked item.</div>}

          <Field label="Voucher note (optional)"><input value={cart.notes} onChange={(e) => dispatch(setField({ field: 'notes', value: e.target.value }))} /></Field>

          <button className="btn btn-primary btn-lg btn-block" disabled={blocked || busy} onClick={submit}>
            {busy ? 'Processing…' : `Complete sale · ${money(fromCents(t.total))}`}
          </button>
          {cart.items.length > 0 && <button className="btn btn-block" onClick={() => dispatch(resetCart())}>Clear cart</button>}
        </div>
      </div>

      {newCustomer && <CustomerForm onClose={() => setNewCustomer(false)} onSaved={(c) => { setNewCustomer(false); dispatch(setField({ field: 'customer', value: { ...c, credit: c.credit ?? 0 } })); }} />}

      {done && (
        <Modal title="Sale completed" size="sm" onClose={() => setDone(null)}
          footer={<>
            <button className="btn" onClick={() => setDone(null)}>New sale</button>
            <button className="btn btn-primary" onClick={() => navigate(`/sales/${done.sale.id}?print=1`)}>Print voucher</button>
          </>}>
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={52} color="var(--ok)" />
            <h3 style={{ margin: '8px 0 2px' }}>{done.sale.voucherNo}</h3>
            <div className="muted">Total {money(done.sale.total)}</div>
            {Number(done.sale.dueAmount) > 0 && <div className="callout bad" style={{ marginTop: 12 }}>Balance due {money(done.sale.dueAmount)}</div>}
            {Number(done.creditedExcess) > 0 && <div className="callout ok" style={{ marginTop: 12 }}>{money(done.creditedExcess)} credited to the customer’s account</div>}
            {Number(done.changeReturned) > 0 && <div className="callout warn" style={{ marginTop: 12 }}>Give change: {money(done.changeReturned)}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}

function SerialSelect({ line, warehouseId, usedIds, onPick }) {
  const [units, setUnits] = useState([]);
  useEffect(() => {
    let live = true;
    api.get('/sales/available-units', { params: { productId: line.productId, warehouseId } })
      .then((r) => live && setUnits(r.data.data)).catch(() => {});
    return () => { live = false; };
  }, [line.productId, warehouseId]);

  const options = units.filter((u) => u.id === line.unitId || !usedIds.includes(u.id));
  return (
    <select value={line.unitId || ''} onChange={(e) => onPick(units.find((u) => u.id === Number(e.target.value)) || null)}>
      <option value="">Select serial… ({options.length})</option>
      {options.map((u) => <option key={u.id} value={u.id}>{u.serialNumber}</option>)}
    </select>
  );
}
