import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { LogOut, Menu } from 'lucide-react';
import { logout, dismissToast } from '../app/slices.js';
import { GROUP_ORDER, navItems } from '../app/moduleRegistry.js';
import { titleCase } from '../app/format.js';

export function Brand() {
  const store = useSelector((s) => s.auth.store);
  return (
    <div className="sidebar-brand">
      <div className="brand-mark">{store?.logoUrl ? <img src={store.logoUrl} alt="" /> : (store?.name || 'S').charAt(0).toUpperCase()}</div>
      <div style={{ minWidth: 0 }}>
        <div className="brand-name">{store?.name || 'Store Manager'}</div>
        <div className="brand-sub">{store ? 'Store Manager' : 'Platform administration'}</div>
      </div>
    </div>
  );
}

export function useVisibleNav() {
  const permissions = useSelector((s) => s.auth.permissions);
  return useMemo(() => {
    const visible = navItems.filter((n) => !n.permission || permissions.includes(n.permission));
    return GROUP_ORDER.map((g) => ({ group: g, items: visible.filter((n) => (n.group || 'Overview') === g).sort((a, b) => a.sort - b.sort) })).filter(
      (g) => g.items.length,
    );
  }, [permissions]);
}

export default function Layout() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const toasts = useSelector((s) => s.ui.toasts);
  const groups = useVisibleNav();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);

  return (
    <div className="app">
      <aside className={`sidebar no-print ${open ? 'open' : ''}`}>
        <Brand />
        <nav>
          {groups.map((g) => (
            <div className="nav-group" key={g.group}>
              <div className="nav-group-title">{g.group}</div>
              {g.items.map((n) => (
                <NavLink key={n.key} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>
                  {n.icon && <n.icon />}
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className={`scrim no-print ${open ? 'open' : ''}`} onClick={close} />

      <div className="main">
        <header className="topbar no-print">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu />
          </button>
          <div />
          <div className="user-chip">
            <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
              <div className="cell-title">{user?.name}</div>
              <div className="cell-sub">{titleCase(user?.role || '')}</div>
            </div>
            <div className="avatar">{(user?.name || '?').charAt(0).toUpperCase()}</div>
            <button className="btn btn-sm" onClick={() => dispatch(logout())}>
              <LogOut /> Sign out
            </button>
          </div>
        </header>
        <main className="content" key={location.pathname.split('/')[1]}>
          <Outlet />
        </main>
      </div>

      <div className="toasts no-print">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dispatch(dismissToast(t.id))}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
