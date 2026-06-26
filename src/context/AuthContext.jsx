import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AVISO_SESION_KEY, api } from '../config/api';

const AuthContext = createContext();

const MENSAJE_SESION_VENCIDA = 'Tu sesión venció. Inicia sesión nuevamente para continuar.';
const DISPOSITIVO_ID_KEY = 'hilosDispositivoId';

const normalizarRol = (rol = '') => String(rol || '').trim().toLowerCase();

const normalizarUsuario = (usuario) => {
  if (!usuario || typeof usuario !== 'object') return null;

  return {
    ...usuario,
    rol: normalizarRol(usuario.rol),
  };
};

const obtenerIpPublicaCliente = async () => {
  const consultar = async (url) => {
    const respuesta = await fetch(url, { cache: 'no-store' });
    if (!respuesta.ok) return '';
    const data = await respuesta.json();
    return String(data.ip || '').trim();
  };

  try {
    return await Promise.race([
      consultar('https://api.ipify.org?format=json'),
      new Promise((resolve) => setTimeout(() => resolve(''), 2500)),
    ]);
  } catch {
    return '';
  }
};

const crearIdDispositivo = () => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) {
    return `disp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const valores = new Uint32Array(4);
  cryptoApi.getRandomValues(valores);
  return Array.from(valores, (valor) => valor.toString(16).padStart(8, '0')).join('-');
};

const obtenerIdDispositivo = () => {
  const actual = localStorage.getItem(DISPOSITIVO_ID_KEY);
  if (actual) return actual;

  const nuevo = crearIdDispositivo();
  localStorage.setItem(DISPOSITIVO_ID_KEY, nuevo);
  return nuevo;
};

const detectarSistemaOperativo = () => {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Desconocido';
};

const detectarNavegador = () => {
  const ua = navigator.userAgent || '';
  if (ua.includes('Electron')) return 'Electron';
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Desconocido';
};

const obtenerInfoDispositivo = () => {
  const plataforma = navigator.userAgent.includes('Electron') ? 'App escritorio' : 'Web';
  const sistemaOperativo = detectarSistemaOperativo();
  const navegador = detectarNavegador();

  return {
    id: obtenerIdDispositivo(),
    nombre: `${plataforma} · ${sistemaOperativo} · ${navegador}`,
    navegador,
    sistemaOperativo,
    idioma: navigator.language || '',
    zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    pantalla: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
  };
};

const obtenerExpiracionToken = (token) => {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;

    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));

    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [avisoSesion, setAvisoSesion] = useState(() => sessionStorage.getItem(AVISO_SESION_KEY) || '');

  const limpiarSesionLocal = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario(null);
  };

  const expulsarPorSesionVencida = (mensaje = MENSAJE_SESION_VENCIDA) => {
    sessionStorage.setItem(AVISO_SESION_KEY, mensaje);
    setAvisoSesion(mensaje);
    limpiarSesionLocal();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem('usuario');

    if (token && usuarioGuardado) {
      try {
        const usuarioParseado = JSON.parse(usuarioGuardado);
        const usuarioNormalizado = normalizarUsuario(usuarioParseado);

        if (!usuarioNormalizado) {
          limpiarSesionLocal();
        } else {
          setUsuario(usuarioNormalizado);
        }
      } catch {
        limpiarSesionLocal();
      }
    } else {
      setUsuario(null);
    }

    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    const expiraEn = obtenerExpiracionToken(token);
    if (!expiraEn) return undefined;

    const tiempoRestante = expiraEn - Date.now();
    if (tiempoRestante <= 0) {
      expulsarPorSesionVencida();
      return undefined;
    }

    const timer = window.setTimeout(() => {
      expulsarPorSesionVencida();
    }, tiempoRestante);

    return () => window.clearTimeout(timer);
  }, [token, navigate]);

  const login = async (email, password) => {
    const plataforma = navigator.userAgent.includes('Electron') ? 'desktop' : 'web';
    const ipPublicaCliente = await obtenerIpPublicaCliente();
    const dispositivo = obtenerInfoDispositivo();
    const { data } = await api.post('/auth/login', {
      email,
      password,
      plataforma,
      ipPublicaCliente,
      dispositivo,
    });

    const usuarioNormalizado = normalizarUsuario(data.usuario);

    localStorage.setItem('token', data.token);
    localStorage.setItem('usuario', JSON.stringify(usuarioNormalizado));
    sessionStorage.removeItem(AVISO_SESION_KEY);
    window.__hilosRedirigiendoPorSesion = false;

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

  const logout = async () => {
    setAvisoSesion('');
    sessionStorage.removeItem(AVISO_SESION_KEY);
    window.__hilosRedirigiendoPorSesion = false;

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
      expulsarPorSesionVencida(event.detail?.mensaje || MENSAJE_SESION_VENCIDA);
    };

    window.addEventListener('auth:expulsado', expulsar);
    return () => window.removeEventListener('auth:expulsado', expulsar);
  }, [navigate]);

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
      limpiarAvisoSesion: () => {
        sessionStorage.removeItem(AVISO_SESION_KEY);
        setAvisoSesion('');
      },
    }),
    [usuario, token, loading, avisoSesion]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
