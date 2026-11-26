import { Warehouse } from 'lucide-react';
import Warehouses from './Warehouses.jsx';

export default {
  name: 'warehouses',
  order: 32,
  nav: [{ label: 'Warehouses', to: '/warehouses', icon: Warehouse, group: 'Catalogue' }],
  routes: [{ path: 'warehouses', element: <Warehouses /> }],
};
