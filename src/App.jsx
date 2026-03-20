import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventario from './pages/Inventario';
import POS from './pages/POS';
import Ventas from './pages/Ventas';
import Reportes from './pages/Reportes';
import Usuarios from './pages/Usuarios';
import Cotizaciones from './pages/Cotizaciones';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RealtimeProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute roles={['admin', 'supervisor']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/inventario"
              element={
                <ProtectedRoute roles={['admin', 'supervisor']}>
                  <Inventario />
                </ProtectedRoute>
              }
            />

            <Route
              path="/pos"
              element={
                <ProtectedRoute roles={['admin', 'supervisor', 'cajero']}>
                  <POS />
                </ProtectedRoute>
              }
            />

            <Route
              path="/ventas"
              element={
                <ProtectedRoute roles={['admin', 'supervisor']}>
                  <Ventas />
                </ProtectedRoute>
              }
            />

            <Route
              path="/reportes"
              element={
                <ProtectedRoute roles={['admin', 'supervisor']}>
                  <Reportes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/usuarios"
              element={
                <ProtectedRoute roles={['admin']}>
                  <Usuarios />
                </ProtectedRoute>
              }
            />

            <Route
              path="/cotizaciones"
              element={
                <ProtectedRoute roles={['admin', 'supervisor', 'cajero']}>
                  <Cotizaciones />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RealtimeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}