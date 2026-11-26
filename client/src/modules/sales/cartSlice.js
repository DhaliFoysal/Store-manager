import { createSlice } from '@reduxjs/toolkit';
import { toCents } from '../../app/format.js';

const initialState = {
  items: [],
  customer: null,
  warehouseId: null,
  discount: '',
  creditUsed: '',
  method: 'CASH',
  paid: '',
  paidTouched: false,
  reference: '',
  notes: '',
};

let seq = 0;
const newLine = (product, extra = {}) => ({
  key: `l${++seq}`,
  productId: product.id,
  name: product.name,
  sku: product.sku,
  trackSerial: product.trackSerial,
  basePrice: Number(product.salePrice),
  price: String(product.salePrice),
  qty: 1, // non-serial products only; serial lines use units.length
  discount: '',
  units: [], // serial-tracked products: [{ id, serial }]
  available: product.available ?? product.totalStock ?? 0,
  warrantyMonths: product.warrantyMonths || 0,
  ...extra,
});

// quantity of a line: number of serials for serial-tracked products, otherwise qty
export const lineQty = (l) => (l.trackSerial ? l.units.length : l.qty);

const slice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addProduct(state, { payload: product }) {
      if (product.trackSerial) {
        // one row per product – serials are added into that row
        if (!state.items.some((l) => l.productId === product.id && l.trackSerial)) state.items.push(newLine(product));
        return;
      }
      const existing = state.items.find((l) => l.productId === product.id && !l.trackSerial);
      if (existing) {
        if (existing.qty < existing.available) existing.qty += 1;
        return;
      }
      state.items.push(newLine(product));
    },
    addUnit(state, { payload: { product, unit } }) {
      const u = { id: unit.id, serial: unit.serialNumber };
      const line = state.items.find((l) => l.productId === product.id && l.trackSerial);
      if (line) {
        if (!line.units.some((x) => x.id === u.id)) line.units.push(u);
      } else {
        state.items.push(newLine(product, { units: [u] }));
      }
    },
    addLineUnit(state, { payload: { key, unit } }) {
      const line = state.items.find((l) => l.key === key);
      if (!line || !unit || line.units.some((x) => x.id === unit.id)) return;
      line.units.push({ id: unit.id, serial: unit.serialNumber });
    },
    removeLineUnit(state, { payload: { key, unitId } }) {
      const line = state.items.find((l) => l.key === key);
      if (line) line.units = line.units.filter((u) => u.id !== unitId);
    },
    patchLine(state, { payload: { key, patch } }) {
      const line = state.items.find((l) => l.key === key);
      if (line) Object.assign(line, patch);
    },
    removeLine(state, { payload: key }) {
      state.items = state.items.filter((l) => l.key !== key);
    },
    setField(state, { payload: { field, value } }) {
      state[field] = value;
      if (field === 'paid') state.paidTouched = true;
    },
    setWarehouse(state, { payload }) {
      if (state.warehouseId !== payload) {
        // stock & serials are per warehouse – a different one means a fresh cart
        state.items = [];
        state.warehouseId = payload;
      }
    },
    resetCart(state) {
      return { ...initialState, warehouseId: state.warehouseId };
    },
  },
});

export const { addProduct, addUnit, addLineUnit, removeLineUnit, patchLine, removeLine, setField, setWarehouse, resetCart } = slice.actions;
export const cartReducer = slice.reducer;

// All money maths in integer cents
export function computeTotals(cart) {
  const lines = cart.items.map((l) => {
    const gross = toCents(l.price) * lineQty(l);
    return { key: l.key, gross, net: Math.max(0, gross - toCents(l.discount)) };
  });
  const subtotal = lines.reduce((a, l) => a + l.net, 0);
  const discount = Math.min(toCents(cart.discount), subtotal);
  const total = subtotal - discount;
  const creditUsed = Math.min(toCents(cart.creditUsed), total, toCents(cart.customer?.credit));
  const payable = total - creditUsed;
  const paid = cart.paidTouched ? toCents(cart.paid) : payable;
  const applied = Math.min(paid, payable);
  const excess = paid - applied;
  const due = payable - applied;
  return { lines, subtotal, discount, total, creditUsed, payable, paid, applied, excess, due };
}
