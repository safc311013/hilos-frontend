import axios from 'axios';

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
).replace(/\/+$/, '');

export const api = axios.create({
  baseURL: API_URL,
});

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
    if (error.response?.status === 401 && teniaToken && codigosExpulsion.includes(codigo)) {
      const mensaje = codigo === 'USUARIO_INACTIVO'
        ? 'Tu cuenta fue desactivada. Comunícate con un administrador.'
        : 'Tu sesión venció. Inicia sesión nuevamente para continuar.';
      window.dispatchEvent(new CustomEvent('auth:expulsado', { detail: { mensaje } }));
    }
    return Promise.reject(error);
  }
);

export { API_URL };
