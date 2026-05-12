import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../config/api';

const AuthContext = createContext();

const normalizarRol = (rol = '') => String(rol || '').trim().toLowerCase();

const normalizarUsuario = (usuario) => {
  if (!usuario || typeof usuario !== 'object') return null;

  return {
    ...usuario,
    rol: normalizarRol(usuario.rol),
  };
};

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem('usuario');

    if (token && usuarioGuardado) {
      try {
        const usuarioParseado = JSON.parse(usuarioGuardado);
        const usuarioNormalizado = normalizarUsuario(usuarioParseado);

        if (!usuarioNormalizado) {
          localStorage.removeItem('token');
          localStorage.removeItem('usuario');
          setToken(null);
          setUsuario(null);
        } else {
          setUsuario(usuarioNormalizado);
        }
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        setToken(null);
        setUsuario(null);
      }
    } else {
      setUsuario(null);
    }

    setLoading(false);
  }, [token]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });

    const usuarioNormalizado = normalizarUsuario(data.usuario);

    localStorage.setItem('token', data.token);
    localStorage.setItem('usuario', JSON.stringify(usuarioNormalizado));

    setToken(data.token);
    setUsuario(usuarioNormalizado);

    return {
      token: data.token,
      usuario: usuarioNormalizado,
      debeCambiarPassword: Boolean(usuarioNormalizado?.debeCambiarPassword),
    };
  };

  const cambiarPassword = async ({
    passwordActual,
    nuevaPassword,
    confirmarPassword,
  }) => {
    const { data } = await api.post('/auth/cambiar-password', {
      passwordActual,
      nuevaPassword,
      confirmarPassword,
    });

    const usuarioNormalizado = normalizarUsuario(data.usuario);

    localStorage.setItem('usuario', JSON.stringify(usuarioNormalizado));
    setUsuario(usuarioNormalizado);

    return usuarioNormalizado;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario(null);
  };

  const value = useMemo(
    () => ({
      usuario,
      token,
      loading,
      autenticado: !!token && !!usuario,
      login,
      cambiarPassword,
      logout,
    }),
    [usuario, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
