import { useEffect, useMemo, useState } from 'react';
import { Download, Info, LogOut, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../config/api';

const MENSAJE_INICIAL = 'Sin búsquedas recientes.';

export default function Header({ title }) {
  const { usuario, logout } = useAuth();
  const [desktopInfo, setDesktopInfo] = useState(null);
  const [mostrarAcercaDe, setMostrarAcercaDe] = useState(false);
  const [buscandoActualizacion, setBuscandoActualizacion] = useState(false);
  const [mensajeManual, setMensajeManual] = useState('');

  const updateInfo = desktopInfo?.update || {};
  const actualizacionDescargada = Boolean(updateInfo.descargada);

  const estadoActualizacion = useMemo(() => {
    if (mensajeManual) return mensajeManual;
    return updateInfo.mensaje || MENSAJE_INICIAL;
  }, [mensajeManual, updateInfo.mensaje]);

  useEffect(() => {
    let activo = true;

    const cargarInfoDesktop = async () => {
      try {
        const { data } = await api.get('/desktop/info');
        if (activo && data?.desktop) {
          setDesktopInfo(data);
        }
      } catch {
        if (activo) {
          setDesktopInfo(null);
        }
      }
    };

    cargarInfoDesktop();
    const intervalo = setInterval(cargarInfoDesktop, 30000);

    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  const buscarActualizacion = async () => {
    setBuscandoActualizacion(true);
    setMensajeManual('');

    try {
      const { data } = await api.post('/desktop/check-updates');
      setMensajeManual(data?.mensaje || 'Búsqueda de actualizaciones iniciada.');

      if (data?.update) {
        setDesktopInfo((actual) => ({
          ...(actual || {}),
          update: data.update,
        }));
      }
    } catch (error) {
      const mensaje =
        error.response?.data?.mensaje ||
        'No se pudo buscar actualizaciones en este momento.';
      setMensajeManual(mensaje);
    } finally {
      setBuscandoActualizacion(false);
    }
  };

  const instalarActualizacion = async () => {
    try {
      setMensajeManual('Reiniciando para instalar la actualización...');
      await api.post('/desktop/install-update');
    } catch (error) {
      setMensajeManual(
        error.response?.data?.mensaje ||
          'No se pudo iniciar la instalación de la actualización.'
      );
    }
  };

  return (
    <>
      <header className="mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-gray-800 sm:text-3xl">{title}</h2>
          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            Bienvenido, {usuario?.nombre}
          </p>

          {actualizacionDescargada && (
            <div className="mt-3 flex max-w-xl flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Actualización lista para instalar</p>
                <p className="text-emerald-700">
                  {updateInfo.versionDisponible
                    ? `Versión ${updateInfo.versionDisponible} descargada.`
                    : 'La nueva versión ya se descargó.'}
                </p>
              </div>
              <button
                type="button"
                onClick={instalarActualizacion}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                <Download size={17} />
                Instalar
              </button>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          {desktopInfo && (
            <button
              type="button"
              onClick={() => setMostrarAcercaDe(true)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 sm:w-auto"
            >
              <Info size={18} />
              Acerca de
            </button>
          )}

          <button
            type="button"
            onClick={logout}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto sm:px-5"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </header>

      {mostrarAcercaDe && desktopInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Hilos en Nogada</h3>
                <p className="text-sm text-gray-500">Acerca de la aplicación</p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarAcercaDe(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase text-gray-500">
                  Versión actual
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {desktopInfo.version || 'No disponible'}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-800">
                  Estado de actualizaciones
                </p>
                <p className="mt-2 text-sm text-gray-600">{estadoActualizacion}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={buscarActualizacion}
                  disabled={buscandoActualizacion}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <RefreshCw
                    size={18}
                    className={buscandoActualizacion ? 'animate-spin' : ''}
                  />
                  {buscandoActualizacion ? 'Buscando...' : 'Buscar actualización'}
                </button>

                {actualizacionDescargada && (
                  <button
                    type="button"
                    onClick={instalarActualizacion}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
                  >
                    <Download size={18} />
                    Instalar ahora
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
