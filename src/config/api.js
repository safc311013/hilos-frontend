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
    const ruta = String(error.config?.url || '');
    const teniaToken = Boolean(localStorage.getItem('token'));
    if (error.response?.status === 401 && teniaToken && !ruta.includes('/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth:expulsado'));
    }
    return Promise.reject(error);
  }
);

export { API_URL };
