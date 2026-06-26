import axios from 'axios';

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
).replace(/\/+$/, '');

const AVISO_SESION_KEY = 'avisoSesion';

export const api = axios.create({
  baseURL: API_URL,
});

const esRutaAuthSinExpulsion = (url = '') => {
  return ['/auth/login', '/auth/login-app', '/auth/cambiar-password', '/auth/logout']
    .some((ruta) => String(url).includes(ruta));
};

const obtenerRutaLogin = () => {
  if (window.location.protocol === 'file:') return '#/login';
  return '/login';
};

const redirigirALogin = () => {
  const yaEstaEnLogin = window.location.pathname === '/login' || window.location.hash === '#/login';
  if (yaEstaEnLogin) return;

  if (window.location.protocol === 'file:') {
    window.location.hash = obtenerRutaLogin();
    return;
  }

  window.location.assign(obtenerRutaLogin());
};

const expulsarPorSesion = (mensaje) => {
  if (window.__hilosRedirigiendoPorSesion) return;
  window.__hilosRedirigiendoPorSesion = true;

  sessionStorage.setItem(AVISO_SESION_KEY, mensaje);
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.dispatchEvent(new CustomEvent('auth:expulsado', { detail: { mensaje } }));
  setTimeout(redirigirALogin, 0);
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const teniaToken = Boolean(localStorage.getItem('token'));
    const codigo = error.response?.data?.codigo;
    const codigosExpulsion = ['SESION_VENCIDA', 'SESION_INVALIDA', 'USUARIO_INACTIVO'];
    const es401Protegido = error.response?.status === 401
      && teniaToken
      && !esRutaAuthSinExpulsion(error.config?.url);

    if (es401Protegido && (!codigo || codigosExpulsion.includes(codigo))) {
      const mensaje = codigo === 'USUARIO_INACTIVO'
        ? 'Tu cuenta fue desactivada. Comunícate con un administrador.'
        : 'Tu sesión venció. Inicia sesión nuevamente para continuar.';
      expulsarPorSesion(mensaje);
    }

    return Promise.reject(error);
  }
);

export { API_URL, AVISO_SESION_KEY };
