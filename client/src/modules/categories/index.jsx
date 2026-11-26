import { Tags } from 'lucide-react';
import Categories from './Categories.jsx';

export default {
  name: 'categories',
  order: 31,
  nav: [{ label: 'Categories', to: '/categories', icon: Tags, group: 'Catalogue' }],
  routes: [{ path: 'categories', element: <Categories /> }],
};
