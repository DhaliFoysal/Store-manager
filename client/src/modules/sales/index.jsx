import { FileText, ScanBarcode } from 'lucide-react';
import POS from './POS.jsx';
import SalesList from './SalesList.jsx';
import Voucher from './Voucher.jsx';
import { cartReducer } from './cartSlice.js';

export default {
  name: 'sales',
  order: 20,
  nav: [
    { label: 'POS', to: '/pos', icon: ScanBarcode, permission: 'sales.create', group: 'Sales' },
    { label: 'Vouchers', to: '/sales', icon: FileText, permission: 'sales.view', group: 'Sales', end: true },
  ],
  routes: [
    { path: 'pos', element: <POS />, permission: 'sales.create' },
    { path: 'sales', element: <SalesList />, permission: 'sales.view' },
    { path: 'sales/:id', element: <Voucher />, permission: 'sales.view' },
  ],
  reducers: { cart: cartReducer }, // merged into the Redux store automatically
};
