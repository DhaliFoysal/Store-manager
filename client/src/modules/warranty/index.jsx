import { ShieldCheck } from 'lucide-react';
import Warranty from './Warranty.jsx';

export default {
  name: 'warranty',
  order: 35,
  nav: [{ label: 'Warranty', to: '/warranty', icon: ShieldCheck, permission: 'warranty.view', group: 'Customers' }],
  routes: [{ path: 'warranty', element: <Warranty />, permission: 'warranty.view' }],
};
