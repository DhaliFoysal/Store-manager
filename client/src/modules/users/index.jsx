import { UserCog } from 'lucide-react';
import Users from './Users.jsx';

export default {
  name: 'users',
  order: 50,
  nav: [{ label: 'Users & roles', to: '/users', icon: UserCog, permission: 'users.manage', group: 'Administration' }],
  routes: [{ path: 'users', element: <Users />, permission: 'users.manage' }],
};
