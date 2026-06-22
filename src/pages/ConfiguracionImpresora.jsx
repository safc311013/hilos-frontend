import { useMemo, useState } from 'react';
import { CheckCircle2, Printer, RotateCcw, Smartphone, Monitor, Wifi } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import {
  CONFIG_IMPRESORA_DEFAULT,
  cargarConfiguracionImpresora,
  guardarConfiguracionImpresora,
  imprimirTicketConfigurado,
  normalizarConfiguracionImpresora,
  probarImpresoraIp,
} from '../utils/impresoraTickets';

const formatearMoneda = (valor) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(Number(valor || 0));
};

const ticketPrueba = {
  numeroTicket: 'PRUEBA-001',
  usuario: 'Hilos en Nogada',
  metodoPago: 'Efectivo',
  fecha: new Date().toLocaleDateString('es-MX'),
  hora: new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }),
  total: 350,
  productos: [
    {
      nombre: 'Producto de prueba',
      cantidad: 1,
      precioUnitario: 250,
      subtotal: 250,
      descuento: 0,
      montoDescuento: 0,
    },
    {
      nombre: 'Articulo con descuento',
      cantidad: 2,
      precioUnitario: 60,
      subtotal: 100,
      descuento: 16.67,
      montoDescuento: 20,
    },
  ],
};

export default function ConfiguracionImpresora() {
  const [configuracion, setConfiguracion] = useState(() => cargarConfiguracionImpresora());
  const [mensaje, setMensaje] = useState('');
  const [probandoConexion, setProbandoConexion] = useState(false);

  const configNormalizada = useMemo(
    () => normalizarConfiguracionImpresora(configuracion),
    [configuracion]
  );

  const actualizarCampo = (campo, valor) => {
    setConfiguracion((actual) => ({
      ...actual,
      [campo]: valor,
    }));
    setMensaje('');
  };

  const guardar = () => {
    const configGuardada = guardarConfiguracionImpresora(configuracion);
    setConfiguracion(configGuardada);
    setMensaje('Configuracion guardada en este dispositivo.');
  };

  const restaurar = () => {
    const configGuardada = guardarConfiguracionImpresora(CONFIG_IMPRESORA_DEFAULT);
    setConfiguracion(configGuardada);
    setMensaje('Configuracion restaurada.');
  };

  const imprimirPrueba = () => {
    guardar();
    imprimirTicketConfigurado({
      ticket: ticketPrueba,
      formatearMoneda,
      onError: setMensaje,
    });
  };

  const probarConexion = async () => {
    setProbandoConexion(true);
    setMensaje('');
    try {
      const resultado = await probarImpresoraIp(configuracion);
      setMensaje(resultado.mensaje);
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setProbandoConexion(false);
    }
  };

  return (
    <Layout>
      <Header title="Impresora de tickets" />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Printer size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Configuracion local</h3>
              <p className="mt-1 text-sm text-gray-500">
                Estos ajustes se guardan solo en este celular o computadora.
              </p>
            </div>
          </div>

          {mensaje ? (
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 size={18} />
              {mensaje}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-semibold text-gray-700">Tipo de conexion</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => actualizarCampo('tipoConexion', 'sistema')}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    configNormalizada.tipoConexion === 'sistema'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Printer size={20} />
                  <span>
                    <span className="block text-sm font-semibold">Impresora del sistema</span>
                    <span className="block text-xs font-normal text-gray-500">USB o dialogo de impresion</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => actualizarCampo('tipoConexion', 'ip')}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    configNormalizada.tipoConexion === 'ip'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Wifi size={20} />
                  <span>
                    <span className="block text-sm font-semibold">Direccion IP</span>
                    <span className="block text-xs font-normal text-gray-500">Impresora conectada a la red</span>
                  </span>
                </button>
              </div>
            </div>

            {configNormalizada.tipoConexion === 'ip' ? (
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 sm:grid-cols-[minmax(0,1fr)_140px_auto] lg:col-span-2">
                <div className="space-y-2">
                  <label htmlFor="direccionIp" className="text-sm font-semibold text-gray-700">
                    Direccion IP
                  </label>
                  <input
                    id="direccionIp"
                    type="text"
                    inputMode="decimal"
                    value={configuracion.direccionIp}
                    onChange={(event) => actualizarCampo('direccionIp', event.target.value)}
                    placeholder="192.168.1.100"
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="puerto" className="text-sm font-semibold text-gray-700">
                    Puerto
                  </label>
                  <input
                    id="puerto"
                    type="number"
                    min="1"
                    max="65535"
                    value={configuracion.puerto}
                    onChange={(event) => actualizarCampo('puerto', event.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={probarConexion}
                  disabled={probandoConexion || !configNormalizada.direccionIp}
                  className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-indigo-300 bg-white px-4 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wifi size={17} />
                  {probandoConexion ? 'Probando...' : 'Probar'}
                </button>
                <p className="text-xs text-gray-500 sm:col-span-3">
                  El puerto habitual de impresoras termicas de red es 9100. La computadora y la impresora deben estar en la misma red.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Dispositivo</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => actualizarCampo('perfil', 'pc')}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    configNormalizada.perfil === 'pc'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Monitor size={20} />
                  <span className="text-sm font-semibold">PC</span>
                </button>

                <button
                  type="button"
                  onClick={() => actualizarCampo('perfil', 'celular')}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    configNormalizada.perfil === 'celular'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Smartphone size={20} />
                  <span className="text-sm font-semibold">Celular</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="nombre" className="text-sm font-semibold text-gray-700">
                Nombre de referencia
              </label>
              <input
                id="nombre"
                type="text"
                value={configuracion.nombre}
                onChange={(event) => actualizarCampo('nombre', event.target.value)}
                placeholder="Ej. Caja principal, impresora 80 mm"
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Ancho del ticket</label>
              <div className="grid grid-cols-2 gap-3">
                {[58, 80].map((ancho) => (
                  <button
                    key={ancho}
                    type="button"
                    onClick={() => actualizarCampo('anchoMm', ancho)}
                    className={`h-11 rounded-lg border text-sm font-semibold transition ${
                      configNormalizada.anchoMm === ancho
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {ancho} mm
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="copias" className="text-sm font-semibold text-gray-700">
                Copias
              </label>
              <input
                id="copias"
                type="number"
                min="1"
                max="3"
                value={configuracion.copias}
                onChange={(event) => actualizarCampo('copias', event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="margen" className="text-sm font-semibold text-gray-700">
                Margen
              </label>
              <input
                id="margen"
                type="range"
                min="2"
                max="10"
                value={configuracion.margenMm}
                onChange={(event) => actualizarCampo('margenMm', event.target.value)}
                className="w-full accent-indigo-600"
              />
              <p className="text-xs text-gray-500">{configNormalizada.margenMm} mm</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
                <input
                  type="checkbox"
                  checked={configuracion.mostrarLogo}
                  onChange={(event) => actualizarCampo('mostrarLogo', event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Mostrar logo</span>
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
                <input
                  type="checkbox"
                  checked={configuracion.imprimirAutomaticamente}
                  onChange={(event) =>
                    actualizarCampo('imprimirAutomaticamente', event.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Abrir dialogo de impresion automaticamente
                </span>
              </label>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <label htmlFor="pieTicket" className="text-sm font-semibold text-gray-700">
                Mensaje final
              </label>
              <input
                id="pieTicket"
                type="text"
                value={configuracion.pieTicket}
                onChange={(event) => actualizarCampo('pieTicket', event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={restaurar}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RotateCcw size={17} />
              Restaurar
            </button>

            <button
              type="button"
              onClick={imprimirPrueba}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100"
            >
              <Printer size={17} />
              Imprimir prueba
            </button>

            <button
              type="button"
              onClick={guardar}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Guardar configuracion
            </button>
          </div>
        </section>

        <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900">Vista configurada</h3>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3 border-b border-gray-100 pb-2">
              <span className="text-gray-500">Conexion</span>
              <span className="font-semibold text-gray-900">
                {configNormalizada.tipoConexion === 'ip'
                  ? `${configNormalizada.direccionIp || 'Sin IP'}:${configNormalizada.puerto}`
                  : 'Sistema'}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-b border-gray-100 pb-2">
              <span className="text-gray-500">Perfil</span>
              <span className="font-semibold capitalize text-gray-900">
                {configNormalizada.perfil}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-b border-gray-100 pb-2">
              <span className="text-gray-500">Ancho</span>
              <span className="font-semibold text-gray-900">{configNormalizada.anchoMm} mm</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-gray-100 pb-2">
              <span className="text-gray-500">Copias</span>
              <span className="font-semibold text-gray-900">{configNormalizada.copias}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-gray-100 pb-2">
              <span className="text-gray-500">Logo</span>
              <span className="font-semibold text-gray-900">
                {configNormalizada.mostrarLogo ? 'Si' : 'No'}
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            La conexion directa por IP funciona en la aplicacion de escritorio. En celular o
            navegador se utiliza la impresora configurada en el sistema.
          </div>
        </aside>
      </div>
    </Layout>
  );
}
