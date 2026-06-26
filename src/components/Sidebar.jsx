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
  DatabaseBackup,
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
  { to: '/copias-seguridad', label: 'Copias de seguridad', icon: DatabaseBackup, roles: ['admin'] },
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
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-dvh w-72 flex-col border-r border-slate-900 bg-black text-white transition-transform duration-200 ease-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:z-40 lg:translate-x-0`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3 lg:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Menú
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Navegación</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-800 px-5 py-4 lg:py-5 [@media(max-height:760px)]:py-3">
          <div className="flex flex-col items-center text-center">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-[96px] w-[96px] object-contain sm:h-[108px] sm:w-[108px] lg:h-[118px] lg:w-[118px] [@media(max-height:760px)]:h-[78px] [@media(max-height:760px)]:w-[78px]"
            />

            <div className="mt-2 [@media(max-height:760px)]:mt-1">
              <h2 className="text-sm font-semibold leading-tight text-white lg:text-base">
                {usuario?.nombre || 'Usuario'}
              </h2>

              <p className="mt-1.5 inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 [@media(max-height:760px)]:mt-1">
                {rolTexto}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col justify-center gap-1.5 px-4 py-4 [@media(max-height:760px)]:gap-1 [@media(max-height:760px)]:py-3">
          {linksFiltrados.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={handleLinkClick}
                className={`flex min-h-0 items-center gap-3 rounded-xl px-4 py-2.5 transition [@media(max-height:760px)]:py-2 ${
                  active
                    ? 'border border-white bg-white text-black'
                    : 'border border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon size={19} className="shrink-0" />
                <span className="text-[15px] font-medium leading-tight">
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
