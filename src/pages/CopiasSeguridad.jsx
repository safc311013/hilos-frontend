import { useEffect, useState } from 'react';
import { Archive, CheckCircle2, Download, History, Image, Package, ShieldCheck } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { api } from '../config/api';

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
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  useEffect(() => {
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

    cargarResumen();
  }, []);

  const descargarRespaldo = async () => {
    setDescargando(true);
    setError('');
    setExito('');

    try {
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
      const detalle = await obtenerMensajeError(errorDescarga);
      setError(detalle || 'No se pudo crear la copia de seguridad');
    } finally {
      setDescargando(false);
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
          <div className="bg-gradient-to-r from-slate-950 to-indigo-950 px-5 py-6 text-white sm:px-7">
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
                  <p className="mt-2 text-2xl font-bold text-gray-900">
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
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                <Download size={18} />
                {descargando ? 'Creando respaldo…' : 'Descargar copia'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
