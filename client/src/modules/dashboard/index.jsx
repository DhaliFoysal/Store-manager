import { LayoutDashboard } from 'lucide-react';
import Dashboard from './Dashboard.jsx';

export default {
  name: 'dashboard',
  order: 10,
  nav: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, permission: 'reports.view', group: 'Overview' }],
  routes: [{ path: 'dashboard', element: <Dashboard />, permission: 'reports.view' }],
};
