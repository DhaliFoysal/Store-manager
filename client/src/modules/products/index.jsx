import { Package } from 'lucide-react';
import Products from './Products.jsx';

export default {
  name: 'products',
  order: 30,
  nav: [{ label: 'Products', to: '/products', icon: Package, permission: 'products.view', group: 'Catalogue' }],
  routes: [{ path: 'products', element: <Products />, permission: 'products.view' }],
};
