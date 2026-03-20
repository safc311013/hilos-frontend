import { createContext, useContext, useEffect, useState } from 'react';
import { API_URL } from '../config/api';
import { useAuth } from './AuthContext';

const RealtimeContext = createContext();

export const RealtimeProvider = ({ children }) => {
  const { token } = useAuth();
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    if (!token) return;

    const url = `${API_URL}/realtime/events?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    const handleEvent = (tipo) => (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLastEvent({
          tipo,
          payload,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error(`Error al procesar evento realtime de ${tipo}:`, error);
      }
    };

    const onProductos = handleEvent('productos');
    const onUsuarios = handleEvent('usuarios');
    const onVentas = handleEvent('ventas');

    eventSource.addEventListener('productos', onProductos);
    eventSource.addEventListener('usuarios', onUsuarios);
    eventSource.addEventListener('ventas', onVentas);

    eventSource.onerror = (error) => {
      console.error('Error en conexión SSE:', error);
    };

    return () => {
      eventSource.removeEventListener('productos', onProductos);
      eventSource.removeEventListener('usuarios', onUsuarios);
      eventSource.removeEventListener('ventas', onVentas);
      eventSource.close();
    };
  }, [token]);

  return (
    <RealtimeContext.Provider value={{ lastEvent }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => useContext(RealtimeContext);