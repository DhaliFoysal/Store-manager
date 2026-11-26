import { ScanLine } from 'lucide-react';
import ScannerPage from './ScannerPage.jsx';
import PhoneScanner from './PhoneScanner.jsx';
import { scannerReducer } from './scannerSlice.js';

export default {
  name: 'scanner',
  order: 28,
  nav: [{ label: 'Scanners', to: '/scanner', icon: ScanLine, permission: 'sales.create', group: 'Sales' }],
  routes: [{ path: 'scanner', element: <ScannerPage />, permission: 'sales.create' }],
  // the phone page is opened from a QR code and must work signed-out, even on a browser that IS signed in
  openRoutes: [{ path: '/scan', element: <PhoneScanner /> }],
  reducers: { scanner: scannerReducer },
};
