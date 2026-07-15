import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PublicOnlyRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null; // or a splash/spinner

  return isAuthenticated ? <Navigate to="/home" replace /> : <Outlet />;
}
