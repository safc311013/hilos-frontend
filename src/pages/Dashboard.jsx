import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import Loader from '../components/Loader';
import { api } from '../config/api';
import { useRealtime } from '../context/RealtimeContext';
import usePermisos from '../hooks/usePermisos';
import { PERMISOS } from '../utils/permisos';
import {
  Boxes,
  TriangleAlert,
  ReceiptText,
  BadgeDollarSign,
  BanknoteArrowUp,
  ChartColumnBig,
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { usuario, puede } = usePermisos();
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const { lastEvent } = useRealtime();

  const cargarResumen = async () => {
    const { data } = await api.get('/reportes/resumen');
    setResumen(data);
  };

  useEffect(() => {
    if (!puede(PERMISOS.VER_DASHBOARD)) return;

    const init = async () => {
      try {
        setLoading(true);
        await cargarResumen();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [usuario]);

  useEffect(() => {
    if (!lastEvent || !puede(PERMISOS.VER_DASHBOARD)) return;

    const refrescar = async () => {
      try {
        await cargarResumen();
      } catch (error) {
        console.error('No se pudo actualizar el panel en tiempo real', error);
      }
    };

    refrescar();
  }, [lastEvent, usuario]);

  const tarjetas = useMemo(() => {
    if (!resumen) return [];

    return [
      {
        title: 'Productos',
        value: resumen.totalProductos,
        helper: 'En inventario',
        icon: Boxes,
        boxClass: 'bg-slate-100 text-slate-700',
      },
      {
        title: 'Stock bajo',
        value: resumen.stockBajo,
        helper: 'Por reponer',
        icon: TriangleAlert,
        boxClass: 'bg-amber-50 text-amber-700',
      },
      {
        title: 'Ventas hoy',
        value: resumen.ventasHoy,
        helper: 'Tickets de hoy',
        icon: ReceiptText,
        boxClass: 'bg-slate-100 text-slate-700',
      },
      {
        title: 'Ingreso hoy',
        value: `$${Number(resumen.totalVentasHoy || 0).toFixed(2)}`,
        helper: 'Venta del día',
        icon: BadgeDollarSign,
        boxClass: 'bg-slate-100 text-slate-700',
      },
      {
        title: 'Ingreso histórico',
        value: `$${Number(resumen.totalHistorico || 0).toFixed(2)}`,
        helper: 'Total acumulado',
        icon: BanknoteArrowUp,
        boxClass: 'bg-slate-100 text-slate-700',
      },
      {
        title: 'Ventas históricas',
        value: resumen.cantidadVentasHistoricas,
        helper: 'Tickets totales',
        icon: ChartColumnBig,
        boxClass: 'bg-slate-100 text-slate-700',
      },
    ];
  }, [resumen]);

  if (!puede(PERMISOS.VER_DASHBOARD)) {
    return (
      <Layout>
        <Header title="Panel" />
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          No tienes permiso para ver el panel.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Header title="Panel" />

      {loading || !resumen ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
          <Loader />
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
                  Operación de hoy
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Inventario, ventas e ingresos actualizados
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:flex sm:flex-wrap">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs text-gray-500">Hoy</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {new Date().toLocaleDateString('es-MX')}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">Rol</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800 capitalize">
                    {usuario?.rol === 'admin'
                      ? 'Administrador'
                      : usuario?.rol === 'supervisor'
                      ? 'Supervisor'
                      : usuario?.rol || 'Usuario'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
            {tarjetas.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500">{item.title}</p>
                      <h3 className="mt-1.5 break-words text-2xl font-bold text-gray-900 sm:text-[28px]">
                        {item.value}
                      </h3>
                      <p className="mt-1.5 text-sm text-gray-500">{item.helper}</p>
                    </div>

                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.boxClass}`}
                    >
                      <Icon size={20} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <h4 className="text-base font-semibold text-gray-800 sm:text-lg">
                Inventario
              </h4>
              <p className="mt-1 text-sm text-gray-500">
                Existencias registradas y productos por reponer
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Productos registrados</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {resumen.totalProductos}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/inventario?stock=bajo')}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:border-amber-300 hover:bg-amber-100"
                >
                  <p className="text-sm text-amber-700">Stock bajo</p>
                  <p className="mt-2 text-2xl font-bold text-amber-700">
                    {resumen.stockBajo}
                  </p>
                  <p className="mt-2 text-xs text-amber-700/80">
                    Clic para ver solo productos con stock bajo
                  </p>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <h4 className="text-base font-semibold text-gray-800 sm:text-lg">
                Ventas
              </h4>
              <p className="mt-1 text-sm text-gray-500">
                Ingresos y tickets registrados
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Ingreso hoy</p>
                  <p className="mt-2 break-words text-2xl font-bold text-gray-900">
                    ${Number(resumen.totalVentasHoy || 0).toFixed(2)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/ventas?fecha=hoy')}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-100"
                >
                  <p className="text-sm text-emerald-700">Ventas hoy</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700">
                    {resumen.ventasHoy}
                  </p>
                  <p className="mt-2 text-xs text-emerald-700/80">
                    Clic para ver solo las ventas de hoy
                  </p>
                </button>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-700">Ingreso histórico</p>
                  <p className="mt-2 break-words text-2xl font-bold text-slate-800">
                    ${Number(resumen.totalHistorico || 0).toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-700">Ventas históricas</p>
                  <p className="mt-2 text-2xl font-bold text-slate-800">
                    {resumen.cantidadVentasHistoricas}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
