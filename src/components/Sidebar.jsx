import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  ReceiptText,
  BarChart3,
  Users,
  FileText,
  Printer,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, roles: ['admin', 'supervisor'] },
  { to: '/inventario', label: 'Inventario', icon: Boxes, roles: ['admin', 'supervisor'] },
  { to: '/pos', label: 'Punto de Venta', icon: ShoppingCart, roles: ['admin', 'supervisor', 'cajero'] },
  { to: '/ventas', label: 'Ventas', icon: ReceiptText, roles: ['admin', 'supervisor'] },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['admin', 'supervisor'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, roles: ['admin', 'supervisor'] },
  { to: '/impresora', label: 'Impresora', icon: Printer, roles: ['admin', 'supervisor', 'cajero'] },
];

export default function Sidebar({ open = false, onClose = () => {} }) {
  const location = useLocation();
  const { usuario } = useAuth();

  const rolTexto =
    usuario?.rol === 'admin'
      ? 'Administrador'
      : usuario?.rol === 'supervisor'
      ? 'Supervisor'
      : usuario?.rol === 'cajero'
      ? 'Cajero'
      : 'Usuario';

  const linksFiltrados = links.filter((item) => item.roles.includes(usuario?.rol));

  const handleLinkClick = () => {
    onClose();
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-slate-800 bg-slate-950 text-white transition-transform duration-300 ease-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:z-40 lg:translate-x-0`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 pt-5 pb-4 lg:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Menú
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Navegación</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-slate-800 px-5 pt-6 pb-4 lg:pt-6">
          <div className="flex flex-col items-center text-center">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-[120px] w-[120px] object-contain sm:h-[140px] sm:w-[140px] lg:h-[170px] lg:w-[170px]"
            />

            <div className="mt-3">
              <h2 className="text-base font-semibold leading-tight text-white lg:text-lg">
                {usuario?.nombre || 'Usuario'}
              </h2>

              <p className="mt-2 inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">
                {rolTexto}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
          {linksFiltrados.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={handleLinkClick}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon size={20} />
                <span className="text-[15px] sm:text-[16px] lg:text-[17px]">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
