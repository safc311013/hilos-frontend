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
  const [avisoSesion, setAvisoSesion] = useState('');

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
    const plataforma = navigator.userAgent.includes('Electron') ? 'desktop' : 'web';
    const { data } = await api.post('/auth/login', { email, password, plataforma });

    const usuarioNormalizado = normalizarUsuario(data.usuario);

    localStorage.setItem('token', data.token);
    localStorage.setItem('usuario', JSON.stringify(usuarioNormalizado));

    setToken(data.token);
    setUsuario(usuarioNormalizado);
    setAvisoSesion('');

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

  const limpiarSesionLocal = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario(null);
  };

  const logout = async () => {
    setAvisoSesion('');
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('No se pudo registrar el cierre de sesión', error);
    } finally {
      limpiarSesionLocal();
    }
  };

  useEffect(() => {
    const expulsar = (event) => {
      setAvisoSesion(
        event.detail?.mensaje || 'Tu sesión venció. Inicia sesión nuevamente para continuar.'
      );
      limpiarSesionLocal();
    };
    window.addEventListener('auth:expulsado', expulsar);
    return () => window.removeEventListener('auth:expulsado', expulsar);
  }, []);

  const value = useMemo(
    () => ({
      usuario,
      token,
      loading,
      autenticado: !!token && !!usuario,
      login,
      cambiarPassword,
      logout,
      avisoSesion,
      limpiarAvisoSesion: () => setAvisoSesion(''),
    }),
    [usuario, token, loading, avisoSesion]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
