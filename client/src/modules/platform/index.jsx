import { ClipboardCheck, Building2 } from 'lucide-react';
import Registrations from './Registrations.jsx';
import Stores from './Stores.jsx';

// Only the platform super admin has the 'platform.manage' permission.
export default {
  name: 'platform',
  order: 70,
  nav: [
    { label: 'Registrations', to: '/platform/registrations', icon: ClipboardCheck, permission: 'platform.manage', group: 'Platform' },
    { label: 'Stores', to: '/platform/stores', icon: Building2, permission: 'platform.manage', group: 'Platform' },
  ],
  routes: [
    { path: 'platform/registrations', element: <Registrations />, permission: 'platform.manage' },
    { path: 'platform/stores', element: <Stores />, permission: 'platform.manage' },
  ],
};
