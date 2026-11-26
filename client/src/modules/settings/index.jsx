import { Store, UserRound } from 'lucide-react';
import StoreProfile from './StoreProfile.jsx';
import Account from './Account.jsx';

export default {
  name: 'settings',
  order: 60,
  nav: [
    { label: 'Store profile', to: '/settings/store', icon: Store, permission: 'store.manage', group: 'Administration' },
    { label: 'My account', to: '/account', icon: UserRound, group: 'Administration' },
  ],
  routes: [
    { path: 'settings/store', element: <StoreProfile />, permission: 'store.manage' },
    { path: 'account', element: <Account /> },
  ],
};
