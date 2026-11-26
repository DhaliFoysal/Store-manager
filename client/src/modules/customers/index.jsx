import { Users } from 'lucide-react';
import Customers from './Customers.jsx';
import CustomerDetail from './CustomerDetail.jsx';

export default {
  name: 'customers',
  order: 40,
  nav: [{ label: 'Customers', to: '/customers', icon: Users, permission: 'customers.view', group: 'Customers' }],
  routes: [
    { path: 'customers', element: <Customers />, permission: 'customers.view' },
    { path: 'customers/:id', element: <CustomerDetail />, permission: 'customers.view' },
  ],
};
