import { Receipt } from 'lucide-react';
import Payments from './Payments.jsx';
import PaymentSlip from './PaymentSlip.jsx';

export default {
  name: 'payments',
  order: 25,
  nav: [{ label: 'Payment slips', to: '/payments', icon: Receipt, permission: 'payments.view', group: 'Sales' }],
  routes: [
    { path: 'payments', element: <Payments />, permission: 'payments.view' },
    { path: 'payments/:id/slip', element: <PaymentSlip />, permission: 'payments.view' },
  ],
};
