import { Boxes } from 'lucide-react';
import Inventory from './Inventory.jsx';

export default {
  name: 'inventory',
  order: 33,
  nav: [{ label: 'Stock & Serials', to: '/inventory', icon: Boxes, permission: 'inventory.view', group: 'Catalogue' }],
  routes: [{ path: 'inventory', element: <Inventory />, permission: 'inventory.view' }],
};
