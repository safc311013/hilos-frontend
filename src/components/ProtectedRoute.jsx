import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

const getRutaPorRol = (rol) => {
  if (rol === 'admin' || rol === 'supervisor') return '/';
  if (rol === 'cajero') return '/pos';
  return '/login';
};

export default function ProtectedRoute({ children, roles = [] }) {
  const { autenticado, loading, usuario } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-gray-100 px-4">
        <Loader />
      </div>
    );
  }

  if (!autenticado || !usuario) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles.length > 0 && !roles.includes(usuario.rol)) {
    return <Navigate to={getRutaPorRol(usuario.rol)} replace />;
  }

  return children;
}