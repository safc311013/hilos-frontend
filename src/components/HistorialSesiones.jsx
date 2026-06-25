import { useEffect, useMemo, useState } from 'react';
import { Download, History, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../config/api';

const MOTIVOS = {
  salida_voluntaria: { texto: 'Salida voluntaria', clase: 'border-sky-200 bg-sky-50 text-sky-700' },
  token_expirado: { texto: 'Sesión expirada', clase: 'border-amber-200 bg-amber-50 text-amber-700' },
  usuario_inactivo: { texto: 'Cuenta desactivada', clase: 'border-rose-200 bg-rose-50 text-rose-700' },
  error_autenticacion: { texto: 'Expulsado por error', clase: 'border-rose-200 bg-rose-50 text-rose-700' },
  activa: { texto: 'Sesión activa', clase: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

const formatearFecha = (fecha) =>
  fecha
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(fecha))
    : '—';

const minutosSesion = (inicio, fin) => {
  if (!inicio) return 0;
  const ms = Math.max(0, new Date(fin || Date.now()) - new Date(inicio));
  return Math.floor(ms / 60000);
};

const duracion = (inicio, fin) => {
  const minutos = minutosSesion(inicio, fin);
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas} h ${minutos % 60} min` : `${minutos} min`;
};

const fechaParaExcel = (fecha) => (fecha ? new Date(fecha).toLocaleString('es-MX') : '');

export default function HistorialSesiones({ usuarios }) {
  const [sesiones, setSesiones] = useState([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [motivo, setMotivo] = useState('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      setCargando(true);
      setError('');
      const { data } = await api.get('/usuarios/historial-sesiones', {
        params: {
          usuarioId: usuarioId || undefined,
          motivo,
          desde: desde || undefined,
          hasta: hasta || undefined,
          limite: 1000,
        },
      });
      setSesiones(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cargar el historial.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [usuarioId, motivo, desde, hasta]);

  const resumen = useMemo(() => ({
    accesos: sesiones.length,
    voluntarias: sesiones.filter((s) => s.motivoCierre === 'salida_voluntaria').length,
    expulsiones: sesiones.filter((s) => ['token_expirado', 'usuario_inactivo', 'error_autenticacion'].includes(s.motivoCierre)).length,
    minutos: sesiones.reduce((total, sesion) => total + minutosSesion(sesion.inicioAt, sesion.finAt), 0),
  }), [sesiones]);

  const totalHoras = Math.floor(resumen.minutos / 60);
  const totalMinutos = resumen.minutos % 60;

  const exportarExcel = () => {
    if (sesiones.length === 0) return;

    const filas = sesiones.map((sesion) => {
      const clave = sesion.estado === 'activa' ? 'activa' : sesion.motivoCierre;
      const estado = MOTIVOS[clave]?.texto || 'Cerrada';
      const minutos = minutosSesion(sesion.inicioAt, sesion.finAt);

      return {
        Usuario: sesion.nombreUsuario,
        Correo: sesion.emailUsuario,
        Rol: sesion.rolUsuario,
        Inicio: fechaParaExcel(sesion.inicioAt),
        Cierre: fechaParaExcel(sesion.finAt),
        Duración: duracion(sesion.inicioAt, sesion.finAt),
        Minutos: minutos,
        Horas: Number((minutos / 60).toFixed(2)),
        Resultado: estado,
        Plataforma: sesion.plataforma,
        IP: sesion.ip || 'No disponible',
        Detalle: sesion.detalleCierre || '',
      };
    });

    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [
      { wch: 24 },
      { wch: 30 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 20 },
      { wch: 14 },
      { wch: 18 },
      { wch: 50 },
    ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Historial sesiones');

    const usuario = usuarios.find((item) => item._id === usuarioId);
    const nombreUsuario = usuario ? usuario.nombre.replace(/[^\w-]+/g, '_') : 'todos';
    const rango = `${desde || 'inicio'}_${hasta || 'hoy'}`;
    XLSX.writeFile(libro, `historial_sesiones_${nombreUsuario}_${rango}.xlsx`);
  };

  return (
    <section className="overflow-hidden rounded-[30px] border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white"><History size={21} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500">Auditoría de acceso y horarios</p>
              <h3 className="text-xl font-bold text-gray-900 sm:text-2xl">Historial de sesiones</h3>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={exportarExcel} disabled={sesiones.length === 0} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
              <Download size={16} /> Exportar Excel
            </button>
            <button type="button" onClick={cargar} disabled={cargando} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
              <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 lg:col-span-2">
            <option value="">Todos los usuarios</option>
            {usuarios.map((item) => <option key={item._id} value={item._id}>{item.nombre}</option>)}
          </select>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 lg:col-span-2">
            <option value="todas">Todos los estados</option>
            <option value="activa">Sesiones activas</option>
            <option value="salida_voluntaria">Salidas voluntarias</option>
            <option value="token_expirado">Sesiones expiradas</option>
            <option value="usuario_inactivo">Cuentas desactivadas</option>
            <option value="error_autenticacion">Errores de autenticación</option>
          </select>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700" aria-label="Fecha desde" />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700" aria-label="Fecha hasta" />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <b className="block text-lg text-gray-900">{resumen.accesos}</b>
            sesiones encontradas
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <b className="block text-lg text-gray-900">{totalHoras} h {totalMinutos} min</b>
            tiempo total del filtro
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <b className="block text-lg text-gray-900">{resumen.voluntarias} / {resumen.expulsiones}</b>
            voluntarias / expulsiones
          </div>
        </div>
      </div>

      {error ? <div className="m-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {!error && sesiones.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">Aún no hay sesiones que coincidan con los filtros.</div> : null}
      {sesiones.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr><th className="px-6 py-4">Usuario</th><th className="px-6 py-4">Inicio</th><th className="px-6 py-4">Cierre / duración</th><th className="px-6 py-4">Resultado</th><th className="px-6 py-4">Origen</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {sesiones.map((sesion) => {
                const clave = sesion.estado === 'activa' ? 'activa' : sesion.motivoCierre;
                const estado = MOTIVOS[clave] || { texto: 'Cerrada', clase: 'border-gray-200 bg-gray-50 text-gray-700' };
                return (
                  <tr key={sesion._id} className="align-top">
                    <td className="px-6 py-4"><p className="font-semibold text-gray-900">{sesion.nombreUsuario}</p><p className="text-xs text-gray-500">{sesion.emailUsuario}</p></td>
                    <td className="whitespace-nowrap px-6 py-4 text-gray-700">{formatearFecha(sesion.inicioAt)}</td>
                    <td className="whitespace-nowrap px-6 py-4"><p className="text-gray-700">{formatearFecha(sesion.finAt)}</p><p className="text-xs text-gray-500">{duracion(sesion.inicioAt, sesion.finAt)}</p></td>
                    <td className="px-6 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estado.clase}`}>{estado.texto}</span>{sesion.detalleCierre ? <p className="mt-2 max-w-xs text-xs text-gray-500">{sesion.detalleCierre}</p> : null}</td>
                    <td className="px-6 py-4"><p className="capitalize text-gray-700">{sesion.plataforma}</p><p className="text-xs text-gray-500">IP: {sesion.ip || 'No disponible'}</p></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
