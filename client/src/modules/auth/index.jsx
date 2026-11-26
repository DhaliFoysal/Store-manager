import Login from './Login.jsx';
import Register from './Register.jsx';
import { ForgotPassword, ResetPassword } from './PasswordPages.jsx';

export default {
  name: 'auth',
  order: 0,
  publicRoutes: [
    { path: '/login', element: <Login /> },
    { path: '/register', element: <Register /> },
    { path: '/forgot-password', element: <ForgotPassword /> },
    { path: '/reset-password', element: <ResetPassword /> },
  ],
};
