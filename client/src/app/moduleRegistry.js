/**
 * Feature modules are auto-discovered: any  src/modules/<name>/index.jsx  with a default export
 *
 *   export default {
 *     name: 'products',
 *     order: 20,                                   // sidebar / registration order
 *     nav:   [{ label, to, icon, permission, group }],
 *     routes:[{ path, element, permission }],       // inside the signed-in layout
 *     publicRoutes: [{ path, element }],            // login, register … (signed-in users are redirected away)
 *     openRoutes:   [{ path, element }],            // reachable by everyone, signed in or not (e.g. phone scanner)
 *     reducers: { cart: cartReducer },              // merged into the Redux store
 *   }
 *
 * is picked up automatically – no central file needs editing.
 */
const found = import.meta.glob('../modules/*/index.jsx', { eager: true });

export const modules = Object.values(found)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

export const GROUP_ORDER = ['Overview', 'Sales', 'Catalogue', 'Customers', 'Administration', 'Platform'];

export const navItems = modules.flatMap((m, mi) => (m.nav || []).map((n, i) => ({ ...n, key: `${m.name}-${i}`, sort: mi * 100 + i })));
export const privateRoutes = modules.flatMap((m) => m.routes || []);
export const publicRoutes = modules.flatMap((m) => m.publicRoutes || []);
export const openRoutes = modules.flatMap((m) => m.openRoutes || []);
export const moduleReducers = Object.assign({}, ...modules.map((m) => m.reducers || {}));
