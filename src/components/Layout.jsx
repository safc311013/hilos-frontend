import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abrirSidebar = () => setSidebarOpen(true);
  const cerrarSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar open={sidebarOpen} onClose={cerrarSidebar} />

      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Hilos en Nogada
            </p>
            <h1 className="text-base font-bold text-gray-900">Panel</h1>
          </div>

          <button
            type="button"
            onClick={sidebarOpen ? cerrarSidebar : abrirSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
            aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <main className="min-h-screen px-4 py-4 sm:px-5 sm:py-5 lg:ml-72 lg:p-6">
        {children}
      </main>
    </div>
  );
}
