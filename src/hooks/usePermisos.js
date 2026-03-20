import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tienePermiso } from '../utils/permisos';

export default function usePermisos() {
  const { usuario } = useAuth();

  const puede = useCallback(
    (permiso) => {
      return tienePermiso(usuario?.rol, permiso);
    },
    [usuario?.rol]
  );

  return {
    usuario,
    puede,
  };
}