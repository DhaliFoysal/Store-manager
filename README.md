# Store Manager

Multi-store management app: stock & serial numbers, POS (barcode / serial scanner), A4 vouchers, payment slips,
customer credit, warranty tracking, users & roles.

**Stack:** Node 20+ · Express · Prisma · MySQL 8 · React 18 · Redux Toolkit · Axios · Vite

## Quick start (development)

```bash
docker compose up -d                 # MySQL on :3306  (or point DATABASE_URL at your own MySQL 8)

cd server
cp .env.example .env                 # set JWT_ACCESS_SECRET (32+ chars!), SUPER_ADMIN_* …
npm install
npx prisma migrate dev --name init   # creates the tables (commit the generated prisma/migrations)
npm run seed                         # creates the platform super admin  (SEED_DEMO=1 adds a demo store)
npm run dev                          # API on :4000

cd ../client
npm install
npm run dev                          # app on http://localhost:5173  (proxies /api and /uploads to :4000)
```

### Sign-in flow
1. A shop registers at **/register** → owner + store are created as *Pending*.
2. The **platform super admin** (seeded) signs in, opens **Registrations** and approves → the store gets a default
   warehouse and number sequences, and the owner can sign in.
3. The **owner** creates users (**Users & roles**), sets each *User's* permissions, and can deactivate, delete or
   reset the password of anyone below them. **Admin** = everything except editing the store profile; **User** = only
   the permissions ticked.

## What is where

| Requirement | Where |
|---|---|
| Admin approval of registrations | `server/src/modules/platform`, `client/src/modules/platform` |
| Users, roles (Admin/User), active/inactive, password reset by owner | `modules/users`, `client … /users` |
| Owner changes own password / forgot-password e-mail flow | `modules/auth`, `client … /settings/Account.jsx` |
| Products, categories, warehouses | `modules/products`, `categories`, `warehouses` |
| Serial numbers per unit + serial search | `modules/inventory` (`GET /api/inventory/units?q=`), *Stock & Serials → Serial number search* |
| Stock receive / adjust / transfer, movement history | `modules/inventory` |
| POS with scanner, auto voucher | `modules/sales`, `client … /sales/POS.jsx` |
| **Overpayment → customer credit** | `sales/service.js` (at sale) and `payments/module.js` (later payments) – credit changes only via `customers/ledger.js` |
| Payment slips linked to vouchers, settle dues | `modules/payments` |
| Customers with address & phone | `modules/customers` |
| Warranty tracking + claims | `modules/warranty` |
| A4 voucher with logo / address / phone / notes | `client/src/modules/sales/Voucher.jsx`, `components/PrintHeader.jsx`, print CSS in `styles/theme.css` |
| Logo, address, phone, notes editable | *Store profile* page (`modules/settings`, `modules/stores`) |

### How money works at the POS
`total = Σ lines − discount`. The customer may pay **more** than the total: with a customer selected, the excess is
added to their credit balance (ledger entry + payment slip show it); for a walk-in the POS shows *change to return*.
Paying **less** leaves a balance due on the voucher (a customer is required); settle it later with
**Receive payment** on the voucher — again, paying more than the due amount credits the rest. Stored credit can be
spent at the POS (*Use credit*) or against a voucher (payment method *Stored credit*).
All amounts are `DECIMAL(14,2)` in MySQL and `Prisma.Decimal` in code — never floats.

## Adding a new business feature (the modular part)

**Server** – create `server/src/modules/<name>/module.js`; it is discovered automatically:

```js
import { Router } from 'express';
import { requirePermission } from '../../core/auth.js';
const router = Router();
router.get('/', requirePermission('suppliers.view'), async (req, res) => { /* req.user.storeId is always set */ });

export default {
  name: 'suppliers', path: 'suppliers', scope: 'store',   // 'public' | 'store' | 'platform'
  dependsOn: [],                                           // fails fast at boot if a module is missing
  permissions: [{ key: 'suppliers.view', label: 'View suppliers' }],   // shows up in the user-permission picker
  router,
};
```
Add its tables to `prisma/schema.prisma` and run `prisma migrate dev`. Stock must only change through
`inventory/service.js → adjustStock`, customer credit only through `customers/ledger.js → adjustCredit`.

**Client** – create `client/src/modules/<name>/index.jsx`; it is discovered automatically:

```jsx
export default {
  name: 'suppliers', order: 45,
  nav:    [{ label: 'Suppliers', to: '/suppliers', icon: Truck, permission: 'suppliers.view', group: 'Catalogue' }],
  routes: [{ path: 'suppliers', element: <Suppliers />, permission: 'suppliers.view' }],
  reducers: { suppliers: suppliersReducer },   // optional – merged into the Redux store
};
```
No central router, sidebar or store file needs editing.

## Production

* `cd client && npm run build` → serve `client/dist` from nginx and proxy `/api` and `/uploads` to the Node process,
  so the browser sees **one origin** (the refresh-token cookie is `HttpOnly; SameSite=Strict`).
* `NODE_ENV=production`, `TRUST_PROXY=1` behind nginx, strong `JWT_ACCESS_SECRET`, `CLIENT_URL=https://your.domain`.
* `npx prisma migrate deploy` on each release. Persist `UPLOAD_DIR` (logos) on a volume. Back up MySQL.
* Configure `SMTP_*` so password-reset e-mails are delivered (in development the link is printed to the server log).
* Run the API under a process manager (systemd / pm2 / Docker); it shuts down gracefully on SIGTERM.

```nginx
location /api/     { proxy_pass http://127.0.0.1:4000; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
location /uploads/ { proxy_pass http://127.0.0.1:4000; }
location /         { root /var/www/store-manager; try_files $uri /index.html; }
```

## Security notes
Access tokens (15 min) live in memory only; refresh tokens are rotated, stored hashed, and revoked on password
change / deactivation. The user record is re-checked on every request, so deactivating a user or suspending a store
takes effect immediately. Every query is scoped by `storeId`. Inputs are validated with zod; login / register /
reset endpoints are rate-limited; uploads are limited to PNG/JPG/WebP ≤ 2 MB with server-generated file names.

## Known limitations / next steps
* No tax/VAT lines, purchase orders or supplier ledger yet (the module system is the place to add them).
* Voiding a voucher returns what the customer paid to their *credit*; cash refunds for walk-ins are manual.
* Dashboard "days" use the server time zone (`TZ` in `.env`).
* No automated tests are included yet.
