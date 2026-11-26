import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { bootstrap } from './app/slices.js';
import { navItems, openRoutes, privateRoutes, publicRoutes } from './app/moduleRegistry.js';
import Layout from './components/Layout.jsx';
import { Empty } from './components/ui.jsx';

function Splash() {
  return (
    <div className="splash">
      <span className="spinner" />
    </div>
  );
}

function RequireAuth({ children }) {
  const status = useSelector((s) => s.auth.status);
  if (status === 'loading') return <Splash />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}

function homePath(permissions) {
  const first = [...navItems].sort((a, b) => a.sort - b.sort).find((n) => !n.permission || permissions.includes(n.permission));
  return first?.to || '/account';
}

function PublicOnly({ children }) {
  const { status, permissions } = useSelector((s) => s.auth);
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') return <Navigate to={homePath(permissions)} replace />;
  return children;
}

function Can({ permission, children }) {
  const permissions = useSelector((s) => s.auth.permissions);
  if (permission && !permissions.includes(permission)) {
    return <Empty title="Access denied">Your account doesn't have permission to open this page.</Empty>;
  }
  return children;
}

function Home() {
  const permissions = useSelector((s) => s.auth.permissions);
  return <Navigate to={homePath(permissions)} replace />;
}

export default function App() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(bootstrap());
  }, [dispatch]);

  return (
    <Routes>
      {openRoutes.map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      {publicRoutes.map((r) => (
        <Route key={r.path} path={r.path} element={<PublicOnly>{r.element}</PublicOnly>} />
      ))}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        {privateRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<Can permission={r.permission}>{r.element}</Can>} />
        ))}
        <Route path="*" element={<Empty title="Page not found" />} />
      </Route>
    </Routes>
  );
}
