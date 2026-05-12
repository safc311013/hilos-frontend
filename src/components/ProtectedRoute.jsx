import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

const normalizarRol = (rol = '') => String(rol || '').trim().toLowerCase();

const getRutaPorRol = (rol) => {
  const rolNormalizado = normalizarRol(rol);

  if (rolNormalizado === 'admin' || rolNormalizado === 'supervisor') return '/';
  if (rolNormalizado === 'cajero') return '/pos';
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

  if (usuario.debeCambiarPassword) {
    return <Navigate to="/login" replace state={{ requiereCambioPassword: true }} />;
  }

  const rolUsuario = normalizarRol(usuario?.rol);
  const rolesPermitidos = roles.map(normalizarRol);

  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(rolUsuario)) {
    return <Navigate to={getRutaPorRol(rolUsuario)} replace />;
  }

  return children;
}
