import { Suspense, lazy } from 'react';
 import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
 import { AuthProvider } from './context/AuthContext';
 import { RealtimeProvider } from './context/RealtimeContext';
 import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
 

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventario = lazy(() => import('./pages/Inventario'));
const POS = lazy(() => import('./pages/POS'));
const Ventas = lazy(() => import('./pages/Ventas'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const Cotizaciones = lazy(() => import('./pages/Cotizaciones'));
const ConfiguracionImpresora = lazy(() => import('./pages/ConfiguracionImpresora'));
const CopiasSeguridad = lazy(() => import('./pages/CopiasSeguridad'));
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
 
 export default function App() {
   return (
     <Router>
       <AuthProvider>
         <RealtimeProvider>
          <Suspense fallback={<Loader />}>
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
                  <ProtectedRoute roles={['admin', 'supervisor']}>
                    <Cotizaciones />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/impresora"
                element={
                  <ProtectedRoute roles={['admin', 'supervisor', 'cajero']}>
                    <ConfiguracionImpresora />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/copias-seguridad"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <CopiasSeguridad />
                  </ProtectedRoute>
                }
              />
 
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
         </RealtimeProvider>
       </AuthProvider>
     </Router>
   );
  }
