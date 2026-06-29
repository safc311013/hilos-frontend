import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  History,
  Image,
  Package,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { api, API_URL } from '../config/api';

const obtenerMensajeError = async (error) => {
  const data = error.response?.data;

  if (data instanceof Blob) {
    try {
      const detalle = JSON.parse(await data.text());
      return detalle.error || detalle.mensaje;
    } catch {
      return '';
    }
  }

  return data?.error || data?.mensaje || error.message;
};

const obtenerNombreArchivo = (contentDisposition) => {
  const coincidencia = String(contentDisposition || '').match(/filename="?([^";]+)"?/i);
  return coincidencia?.[1] || `respaldo-inventario-${new Date().toISOString().slice(0, 10)}.json`;
};

export default function CopiasSeguridad() {
  const [resumen, setResumen] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [archivoRespaldo, setArchivoRespaldo] = useState(null);
  const [resumenArchivo, setResumenArchivo] = useState(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const cargarResumen = async () => {
    try {
      const { data } = await api.get('/backups/inventario/resumen');
      setResumen(data);
    } catch (errorCarga) {
      setError(errorCarga.response?.data?.mensaje || 'No se pudo consultar el inventario');
    } finally {
      setCargandoResumen(false);
    }
  };

  useEffect(() => {
    cargarResumen();
  }, []);

  const descargarRespaldo = async () => {
    setDescargando(true);
    setError('');
    setExito('');

    try {
      if (typeof window.showSaveFilePicker === 'function') {
        const nombreSugerido = `respaldo-inventario-${new Date()
          .toISOString()
          .replace(/[:.]/g, '-')}.json`;
        const destino = await window.showSaveFilePicker({
          suggestedName: nombreSugerido,
          types: [
            {
              description: 'Copia de seguridad de Hilos',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const token = localStorage.getItem('token');
        const respuesta = await fetch(`${API_URL}/backups/inventario/descargar`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!respuesta.ok) {
          const detalle = await respuesta.json().catch(() => ({}));
          throw new Error(detalle.error || detalle.mensaje || 'No se pudo crear la copia');
        }

        if (!respuesta.body) {
          throw new Error('El navegador no permite descargar el respaldo por partes');
        }

        const archivoDestino = await destino.createWritable();
        await respuesta.body.pipeTo(archivoDestino);
        setExito(`Copia creada correctamente: ${destino.name || nombreSugerido}`);
        return;
      }

      const respuesta = await api.get('/backups/inventario/descargar', {
        responseType: 'blob',
        timeout: 0,
      });
      const nombreArchivo = obtenerNombreArchivo(respuesta.headers['content-disposition']);
      const url = URL.createObjectURL(respuesta.data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
      setExito(`Copia creada correctamente: ${nombreArchivo}`);
    } catch (errorDescarga) {
      if (errorDescarga.name === 'AbortError') return;
      const detalle = await obtenerMensajeError(errorDescarga);
      setError(detalle || 'No se pudo crear la copia de seguridad');
    } finally {
      setDescargando(false);
    }
  };

  const seleccionarRespaldo = async (event) => {
    const archivo = event.target.files?.[0] || null;
    setArchivoRespaldo(null);
    setResumenArchivo(null);
    setConfirmacion('');
    setError('');
    setExito('');

    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith('.json')) {
      setError('Selecciona un archivo de copia de seguridad con extensión .json');
      return;
    }
    try {
      // El resumen está al inicio del respaldo. Leer solo este fragmento evita
      // cargar archivos de cientos de MB completos en la memoria del navegador.
      const encabezado = await archivo.slice(0, 1024 * 1024).text();
      if (
        !encabezado.includes('"formato":"hilos-inventario-backup"') ||
        !encabezado.includes('"version":1')
      ) {
        throw new Error('El archivo no es una copia de seguridad compatible');
      }

      const obtenerNumeroResumen = (campo) => {
        const coincidencia = encabezado.match(new RegExp(`"${campo}":(\\d+)`));
        return coincidencia ? Number(coincidencia[1]) : 0;
      };
      const fechaEncontrada = encabezado.match(/"creadoEn":"([^"]+)"/);

      setArchivoRespaldo(archivo);
      setResumenArchivo({
        nombre: archivo.name,
        creadoEn: fechaEncontrada?.[1] || '',
        productos: obtenerNumeroResumen('productos'),
        fotos: obtenerNumeroResumen('fotosIncluidas'),
        historial: obtenerNumeroResumen('registrosHistorial'),
      });
    } catch (errorArchivo) {
      setError(errorArchivo.message || 'No se pudo leer el archivo seleccionado');
      event.target.value = '';
    }
  };

  const restaurarRespaldo = async () => {
    if (!archivoRespaldo || confirmacion !== 'RESTAURAR') return;

    setRestaurando(true);
    setError('');
    setExito('');

    try {
      const { data } = await api.post('/backups/inventario/restaurar', archivoRespaldo, {
        timeout: 0,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Respaldo-Productos': String(resumenArchivo.productos),
          'X-Respaldo-Historial': String(resumenArchivo.historial),
        },
      });

      setExito(
        `${data.mensaje}: ${data.resumen.productos} productos y ${data.resumen.fotosRestauradas} fotos.`
      );
      setArchivoRespaldo(null);
      setResumenArchivo(null);
      setConfirmacion('');
      setCargandoResumen(true);
      await cargarResumen();
    } catch (errorRestauracion) {
      const detalle = await obtenerMensajeError(errorRestauracion);
      setError(detalle || 'No se pudo restaurar la copia de seguridad');
    } finally {
      setRestaurando(false);
    }
  };

  const tarjetas = [
    { label: 'Productos', valor: resumen?.productos, icon: Package },
    { label: 'Fotos incluidas', valor: resumen?.productosConFoto, icon: Image },
    { label: 'Cambios históricos', valor: resumen?.registrosHistorial, icon: History },
  ];

  return (
    <Layout>
      <Header title="Copias de seguridad" />

      <div className="mx-auto max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
          <div className="bg-slate-900 px-5 py-6 text-white sm:px-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Archive size={25} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">
                  Solo administradores
                </p>
                <h2 className="mt-1 text-xl font-bold sm:text-2xl">Respaldo completo del inventario</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Descarga productos, existencias, costos, precios, historial y el contenido original de cada foto en un único archivo.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-7">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {tarjetas.map(({ label, valor, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Icon size={18} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <p className="mt-2 text-xl font-bold text-gray-900">
                    {cargandoResumen ? '…' : Number(valor || 0).toLocaleString('es-MX')}
                  </p>
                </div>
              ))}
            </div>

            {error ? (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error}
              </div>
            ) : null}

            {exito ? (
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                <CheckCircle2 size={18} className="shrink-0" />
                {exito}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-4 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 shrink-0 text-indigo-600" size={22} />
                <div>
                  <p className="font-semibold text-gray-900">Copia autónoma y verificable</p>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    Si alguna foto no puede recuperarse, no se generará una copia incompleta. Guárdala en una ubicación segura.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={descargarRespaldo}
                disabled={descargando || cargandoResumen}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Download size={18} />
                {descargando ? 'Creando respaldo…' : 'Descargar copia'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <RotateCcw size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Restaurar una copia</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                Selecciona un respaldo local para reemplazar el inventario, sus fotos y su historial. El archivo se procesa como un flujo y no se almacena en el servidor.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 text-center">
            <Upload className="mx-auto text-gray-400" size={30} />
            <label className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100">
              Seleccionar copia JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={seleccionarRespaldo}
                disabled={restaurando}
                className="sr-only"
              />
            </label>
            <p className="mt-2 text-xs text-gray-500">
              Sin límite fijo; requiere espacio temporal suficiente en el equipo o servidor.
            </p>
          </div>

          {resumenArchivo ? (
            <div className="mt-5 space-y-5">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="break-all text-sm font-semibold text-gray-900">{resumenArchivo.nombre}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Creada: {resumenArchivo.creadoEn ? new Date(resumenArchivo.creadoEn).toLocaleString('es-MX') : 'Sin fecha'}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-lg font-bold text-gray-900">{resumenArchivo.productos}</p>
                    <p className="text-xs text-gray-500">Productos</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-lg font-bold text-gray-900">{resumenArchivo.fotos}</p>
                    <p className="text-xs text-gray-500">Fotos</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-lg font-bold text-gray-900">{resumenArchivo.historial}</p>
                    <p className="text-xs text-gray-500">Cambios</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3 text-amber-900">
                  <AlertTriangle className="mt-0.5 shrink-0" size={21} />
                  <div>
                    <p className="font-bold">Esta acción reemplazará el inventario actual</p>
                    <p className="mt-1 text-sm leading-5">
                      Escribe <strong>RESTAURAR</strong> para confirmar que revisaste el archivo.
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  value={confirmacion}
                  onChange={(event) => setConfirmacion(event.target.value.toUpperCase())}
                  placeholder="RESTAURAR"
                  disabled={restaurando}
                  className="mt-4 h-11 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold uppercase outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                />
              </div>

              <button
                type="button"
                onClick={restaurarRespaldo}
                disabled={restaurando || confirmacion !== 'RESTAURAR'}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300 sm:w-auto"
              >
                <RotateCcw size={18} className={restaurando ? 'animate-spin' : ''} />
                {restaurando ? 'Restaurando inventario…' : 'Restaurar copia de seguridad'}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </Layout>
  );
}
