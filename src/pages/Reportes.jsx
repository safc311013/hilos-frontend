import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { api } from '../config/api';
import usePermisos from '../hooks/usePermisos';
import { PERMISOS } from '../utils/permisos';
import {
  Search,
  FileSpreadsheet,
  FileText,
  ReceiptText,
  BadgeDollarSign,
  X,
  Package,
  Wallet,
  CreditCard,
  Landmark,
  Receipt,
  Filter,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const formatearMoneda = (valor) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(Number(valor || 0));
};

const getInventarioLabel = (valor) =>
  String(valor || '').toLowerCase() === 'taxco' ? 'Taxco' : 'Tienda';

export default function Reportes() {
  const { puede } = usePermisos();
  const hoy = new Date().toISOString().slice(0, 10);

  const [inicio, setInicio] = useState(hoy);
  const [fin, setFin] = useState(hoy);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [usuarioFiltro, setUsuarioFiltro] = useState('');
  const [error, setError] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);

  const consultar = async () => {
    try {
      setError('');

      if (!inicio || !fin) {
        setError('Debes seleccionar fecha de inicio y fecha de fin.');
        return;
      }

      if (inicio > fin) {
        setError('La fecha de inicio no puede ser mayor que la fecha final.');
        return;
      }

      setLoading(true);
      const { data } = await api.get(`/reportes/por-fecha?inicio=${inicio}&fin=${fin}`);
      setResultado(data);
      setUsuarioFiltro('');
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo consultar el reporte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ventaSeleccionada) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [ventaSeleccionada]);

  const obtenerSubtotalItem = (item) => {
    return Number(item.subtotalFinal ?? item.subtotal ?? 0);
  };

  const usuariosDisponibles = useMemo(() => {
    if (!resultado?.ventas) return [];

    const mapa = new Map();

    resultado.ventas.forEach((venta) => {
      const id = venta.usuario?._id || venta.usuario?.id || venta.usuario?.nombre || '';
      const nombre = String(venta.usuario?.nombre || '').trim();

      if (id && nombre && !mapa.has(id)) {
        mapa.set(id, {
          id,
          nombre,
        });
      }
    });

    return Array.from(mapa.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [resultado]);

  const ventasFiltradas = useMemo(() => {
    if (!resultado?.ventas) return [];

    const texto = busqueda.trim().toLowerCase();

    return resultado.ventas.filter((venta) => {
      const folio = String(venta.folio || '').toLowerCase();
      const usuario = String(venta.usuario?.nombre || '').toLowerCase();
      const usuarioId = String(venta.usuario?._id || venta.usuario?.id || venta.usuario?.nombre || '');

      const coincideBusqueda = !texto || folio.includes(texto) || usuario.includes(texto);
      const coincideUsuario = !usuarioFiltro || usuarioId === usuarioFiltro;

      return coincideBusqueda && coincideUsuario;
    });
  }, [resultado, busqueda, usuarioFiltro]);

  const totalFiltrado = useMemo(() => {
    return ventasFiltradas.reduce((acc, venta) => acc + Number(venta.total || 0), 0);
  }, [ventasFiltradas]);

  const totalPiezasFiltradas = useMemo(() => {
    return ventasFiltradas.reduce(
      (acc, venta) =>
        acc +
        (venta.productos || []).reduce(
          (subAcc, item) => subAcc + Number(item.cantidad || 0),
          0
        ),
      0
    );
  }, [ventasFiltradas]);

  const exportarExcel = () => {
    if (!ventasFiltradas.length) return;

    const datos = ventasFiltradas.map((venta) => ({
      Folio: venta.folio,
      Fecha: new Date(venta.createdAt).toLocaleString('es-MX'),
      Usuario: venta.usuario?.nombre || '',
      MetodoPago: venta.metodoPago || '',
      Subtotal: Number(venta.subtotal || 0).toFixed(2),
      DescuentoTotal: Number(venta.descuentoTotal || 0).toFixed(2),
      Total: Number(venta.total || 0).toFixed(2),
      Piezas: (venta.productos || []).reduce(
        (acc, item) => acc + Number(item.cantidad || 0),
        0
      ),
      Inventarios: [
        ...new Set((venta.productos || []).map((item) => getInventarioLabel(item.inventarioOrigen))),
      ].join(', '),
    }));

    const hoja = XLSX.utils.json_to_sheet(datos);
    const libro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');

    const nombreUsuario =
      usuariosDisponibles.find((u) => u.id === usuarioFiltro)?.nombre
        ?.replace(/\s+/g, '_')
        ?.replace(/[^\w-]/g, '') || 'todos';

    const nombreArchivo = `reporte_${inicio}_a_${fin}_${nombreUsuario}.xlsx`;
    XLSX.writeFile(libro, nombreArchivo);
  };

  const cargarLogoComoDataURL = async () => {
    const response = await fetch('/logo.png');
    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const exportarPDF = async () => {
    if (!ventasFiltradas.length) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const fechaGeneracion = new Date().toLocaleString('es-MX');

    let logoDataUrl = null;
    try {
      logoDataUrl = await cargarLogoComoDataURL();
    } catch (e) {
      logoDataUrl = null;
    }

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 36, 'F');

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 14, 9, 34, 18);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Hilos en Nogada', 54, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Reporte de ventas', 54, 23);
    doc.text(`Generado: ${fechaGeneracion}`, 54, 29);

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Resumen del reporte', 14, 48);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(`Rango consultado: ${inicio} a ${fin}`, 14, 55);

    const resumenY = 64;
    const boxW = 58;
    const boxH = 24;
    const gap = 6;

    const dibujarTarjetaResumen = (x, y, titulo, valor, color = [248, 250, 252]) => {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x, y, boxW, boxH, 3, 3, 'F');
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(titulo, x + 4, y + 7);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(String(valor), x + 4, y + 17);
    };

    dibujarTarjetaResumen(14, resumenY, 'Cantidad de ventas', ventasFiltradas.length, [238, 242, 255]);
    dibujarTarjetaResumen(
      14 + boxW + gap,
      resumenY,
      'Total vendido',
      `$${totalFiltrado.toFixed(2)}`,
      [236, 253, 245]
    );
    dibujarTarjetaResumen(
      14 + (boxW + gap) * 2,
      resumenY,
      'Piezas vendidas',
      totalPiezasFiltradas,
      [255, 247, 237]
    );

    autoTable(doc, {
      startY: resumenY + boxH + 12,
      head: [['Folio', 'Fecha', 'Usuario', 'Método', 'Piezas', 'Descuento', 'Total']],
      body: ventasFiltradas.map((venta) => [
        venta.folio,
        new Date(venta.createdAt).toLocaleString('es-MX'),
        venta.usuario?.nombre || '—',
        venta.metodoPago || '—',
        (venta.productos || []).reduce(
          (acc, item) => acc + Number(item.cantidad || 0),
          0
        ),
        `$${Number(venta.descuentoTotal || 0).toFixed(2)}`,
        `$${Number(venta.total || 0).toFixed(2)}`,
      ]),
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: [31, 41, 55],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        5: { textColor: [217, 119, 6], fontStyle: 'bold' },
        6: { textColor: [17, 24, 39], fontStyle: 'bold' },
      },
      didDrawPage: () => {
        const pageCount = doc.internal.getNumberOfPages();
        const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setDrawColor(226, 232, 240);
        doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('Hilos en Nogada · Reporte de ventas', 14, pageHeight - 6);
        doc.text(`Página ${currentPage} de ${pageCount}`, pageWidth - 34, pageHeight - 6);
      },
    });

    doc.save(`reporte_${inicio}_a_${fin}.pdf`);
  };

  const getMetodoPagoInfo = (metodoPago) => {
    const metodo = String(metodoPago || '').toLowerCase();

    if (metodo === 'efectivo') {
      return {
        label: 'Efectivo',
        icon: Wallet,
        badge: 'bg-emerald-100 text-emerald-700',
      };
    }

    if (metodo === 'tarjeta') {
      return {
        label: 'Tarjeta',
        icon: CreditCard,
        badge: 'bg-indigo-100 text-indigo-700',
      };
    }

    if (metodo === 'transferencia') {
      return {
        label: 'Transferencia',
        icon: Landmark,
        badge: 'bg-amber-100 text-amber-700',
      };
    }

    return {
      label: metodoPago || 'Sin definir',
      icon: Receipt,
      badge: 'bg-slate-100 text-slate-700',
    };
  };

  const formatearFechaHora = (fechaValor) => {
    const fecha = new Date(fechaValor);

    return fecha.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!puede(PERMISOS.VER_REPORTES)) {
    return (
      <Layout>
        <Header title="Reportes" />
        <div className="card p-5">No tienes permiso para ver reportes.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Header title="Reportes" />

      <div className="space-y-5 sm:space-y-6">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="xl:min-w-[320px]">
              <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">Reporte de ventas</h3>
              <p className="mt-1 text-sm text-gray-500">
                Consulta ventas por rango de fechas y exporta la información
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end xl:w-auto">
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto">
                <div className="w-full sm:w-[185px]">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Fecha inicio
                  </label>
                  <input
                    type="date"
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  />
                </div>

                <div className="w-full sm:w-[185px]">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Fecha fin
                  </label>
                  <input
                    type="date"
                    value={fin}
                    onChange={(e) => setFin(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  />
                </div>
              </div>

              <div className="w-full lg:w-auto">
                <button
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 lg:w-auto"
                  onClick={consultar}
                  disabled={loading}
                >
                  {loading ? 'Consultando...' : 'Consultar reporte'}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        {resultado ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Cantidad de ventas</p>
                    <h3 className="mt-2 text-3xl font-bold text-gray-900">
                      {ventasFiltradas.length}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">Tickets del rango</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                    <ReceiptText size={20} />
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Total vendido</p>
                    <h3 className="mt-2 break-words text-3xl font-bold text-gray-900">
                      ${totalFiltrado.toFixed(2)}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">Monto acumulado</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <BadgeDollarSign size={20} />
                  </div>
                </div>
              </div>

              <div className="card p-5 md:col-span-2 xl:col-span-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={exportarPDF}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                    disabled={!ventasFiltradas.length}
                  >
                    <FileText size={18} />
                    Exportar PDF
                  </button>

                  <button
                    type="button"
                    onClick={exportarExcel}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    disabled={!ventasFiltradas.length}
                  >
                    <FileSpreadsheet size={18} />
                    Exportar Excel
                  </button>
                </div>
              </div>
            </div>

            <div className="card p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-800 sm:text-2xl">
                      Detalle del reporte
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Rango consultado: {resultado.rango?.inicio} a {resultado.rango?.fin}
                    </p>
                  </div>

                  <div className="relative w-full lg:w-[340px]">
                    <Search
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      placeholder="Buscar por folio o usuario"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[280px_auto]">
                  <div>
                    <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Filter size={16} />
                      Filtrar por usuario
                    </label>
                    <select
                      value={usuarioFiltro}
                      onChange={(e) => setUsuarioFiltro(e.target.value)}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    >
                      <option value="">Todos los usuarios</option>
                      {usuariosDisponibles.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    {(busqueda || usuarioFiltro) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBusqueda('');
                          setUsuarioFiltro('');
                        }}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Limpiar filtros
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {ventasFiltradas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
                  <p className="text-lg font-semibold text-gray-700">
                    No hay ventas para mostrar
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Ajusta el rango, la búsqueda o el filtro de usuario
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-4 lg:hidden">
                    {ventasFiltradas.map((venta) => {
                      const metodo = getMetodoPagoInfo(venta.metodoPago);
                      const MetodoIcon = metodo.icon;
                      const piezas = (venta.productos || []).reduce(
                        (acc, item) => acc + Number(item.cantidad || 0),
                        0
                      );

                      return (
                        <button
                          key={venta._id}
                          type="button"
                          onClick={() => setVentaSeleccionada(venta)}
                          className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 "
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                                  {venta.folio}
                                </span>

                                <p className="mt-3 text-sm text-gray-500">
                                  {new Date(venta.createdAt).toLocaleString('es-MX')}
                                </p>

                                <p className="mt-1 text-sm text-gray-700">
                                  Usuario:{' '}
                                  <span className="font-medium">
                                    {venta.usuario?.nombre || '—'}
                                  </span>
                                </p>
                              </div>

                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${metodo.badge}`}
                              >
                                <MetodoIcon size={14} />
                                {metodo.label}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div className="rounded-xl bg-gray-50 px-3 py-3">
                                <p className="text-[11px] text-gray-500">Piezas</p>
                                <p className="mt-1 text-sm font-semibold text-gray-800">
                                  {piezas}
                                </p>
                              </div>

                              <div className="rounded-xl bg-amber-50 px-3 py-3">
                                <p className="text-[11px] text-amber-700">Descuento</p>
                                <p className="mt-1 text-sm font-semibold text-amber-700">
                                  ${Number(venta.descuentoTotal || 0).toFixed(2)}
                                </p>
                              </div>

                              <div className="rounded-xl bg-indigo-50 px-3 py-3">
                                <p className="text-[11px] text-indigo-700">Total</p>
                                <p className="mt-1 text-sm font-bold text-indigo-700">
                                  ${Number(venta.total || 0).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-auto rounded-xl border border-gray-200 lg:block">
                    <table className="min-w-[900px] w-full text-left">
                      <thead className="sticky top-0 z-10 bg-white shadow-sm">
                        <tr className="border-b border-gray-200 text-sm text-gray-600">
                          <th className="px-4 py-3">Folio</th>
                          <th className="px-4">Fecha</th>
                          <th className="px-4">Usuario</th>
                          <th className="px-4">Método</th>
                          <th className="px-4">Piezas</th>
                          <th className="px-4">Descuento</th>
                          <th className="px-4">Total</th>
                        </tr>
                      </thead>

                      <tbody>
                        {ventasFiltradas.map((venta) => (
                          <tr
                            key={venta._id}
                            className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                            onClick={() => setVentaSeleccionada(venta)}
                          >
                            <td className="px-4 py-4 font-medium text-gray-800">{venta.folio}</td>
                            <td className="px-4 text-gray-700">
                              {new Date(venta.createdAt).toLocaleString('es-MX')}
                            </td>
                            <td className="px-4 text-gray-700">{venta.usuario?.nombre || '—'}</td>
                            <td className="px-4 capitalize text-gray-700">
                              {venta.metodoPago || '—'}
                            </td>
                            <td className="px-4 text-gray-700">
                              {(venta.productos || []).reduce(
                                (acc, item) => acc + Number(item.cantidad || 0),
                                0
                              )}
                            </td>
                            <td className="px-4 font-medium text-amber-700">
                              ${Number(venta.descuentoTotal || 0).toFixed(2)}
                            </td>
                            <td className="px-4 font-semibold text-gray-900">
                              ${Number(venta.total || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      {ventaSeleccionada ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45">
          <div className="flex min-h-full items-end justify-center sm:items-center">
            <div
              className="absolute inset-0"
              onClick={() => setVentaSeleccionada(null)}
            />

            <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border-0 bg-white shadow-md sm:h-[94vh] sm:max-w-6xl sm:rounded-xl sm:border sm:border-white/20">
              <div className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 py-4 sm:px-5 md:px-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
                      Detalle de venta
                    </p>
                    <h3 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">
                      {ventaSeleccionada.folio}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      {formatearFechaHora(ventaSeleccionada.createdAt)}
                    </p>
                  </div>

                  <div className="flex w-full items-center gap-2 md:w-auto">
                    <button
                      type="button"
                      onClick={() => setVentaSeleccionada(null)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 md:w-auto"
                    >
                      Cerrar
                    </button>

                    <button
                      type="button"
                      onClick={() => setVentaSeleccionada(null)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-b border-gray-100 bg-gray-50/90 px-4 py-4 sm:px-5 md:px-6">
                {(() => {
                  const metodo = getMetodoPagoInfo(ventaSeleccionada.metodoPago);
                  const MetodoIcon = metodo.icon;
                  const piezas = (ventaSeleccionada.productos || []).reduce(
                    (acc, item) => acc + Number(item.cantidad || 0),
                    0
                  );

                  return (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs text-gray-500">Método de pago</p>
                        <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
                          <MetodoIcon size={16} />
                          {metodo.label}
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs text-gray-500">Usuario</p>
                        <p className="mt-2 text-sm font-semibold text-gray-800">
                          {ventaSeleccionada.usuario?.nombre || '—'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs text-gray-500">Productos</p>
                        <p className="mt-2 text-sm font-semibold text-gray-800">
                          {(ventaSeleccionada.productos || []).length}
                        </p>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs text-gray-500">Piezas</p>
                        <p className="mt-2 text-sm font-semibold text-gray-800">
                          {piezas}
                        </p>
                      </div>

                      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
                        <p className="text-xs text-indigo-700">Total final</p>
                        <p className="mt-2 text-lg font-bold text-indigo-700">
                          {formatearMoneda(ventaSeleccionada.total || 0)}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[320px_1fr] lg:overflow-hidden xl:grid-cols-[360px_1fr]">
                <aside className="border-b border-gray-100 bg-white p-4 sm:p-5 lg:border-b-0 lg:border-r lg:overflow-y-auto">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white">
                          <BadgeDollarSign size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            Resumen de importes
                          </p>
                          <p className="text-xs text-slate-300">
                            Totales calculados de la venta
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                          <span className="text-sm text-slate-300">Subtotal</span>
                          <span className="text-base font-semibold text-white">
                            {formatearMoneda(ventaSeleccionada.subtotal || 0)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-amber-300/15 bg-amber-400/10 px-4 py-3">
                          <span className="text-sm text-amber-100">Descuento total</span>
                          <span className="text-base font-semibold text-amber-200">
                            {formatearMoneda(ventaSeleccionada.descuentoTotal || 0)}
                          </span>
                        </div>

                        <div className="rounded-xl bg-white px-4 py-4 text-slate-900 shadow-sm">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            Total cobrado
                          </p>
                          <p className="mt-2 text-xl font-extrabold">
                            {formatearMoneda(ventaSeleccionada.total || 0)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                          <ReceiptText size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            Información general
                          </p>
                          <p className="text-xs text-gray-500">
                            Datos rápidos de la operación
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Folio
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {ventaSeleccionada.folio}
                          </p>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Fecha y hora
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {formatearFechaHora(ventaSeleccionada.createdAt)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Usuario
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {ventaSeleccionada.usuario?.nombre || '—'}
                          </p>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Método de pago
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {getMetodoPagoInfo(ventaSeleccionada.metodoPago).label}
                          </p>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Piezas vendidas
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {(ventaSeleccionada.productos || []).reduce(
                              (acc, item) => acc + Number(item.cantidad || 0),
                              0
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>

                <section className="flex min-h-0 flex-col bg-gray-50/60 lg:overflow-hidden">
                  <div className="border-b border-gray-100 bg-white px-4 py-4 sm:px-5 md:px-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                        <Package size={18} />
                      </div>
                      <div>
                        <h4 className="text-base font-semibold text-gray-900">
                          Productos de la venta
                        </h4>
                        <p className="text-sm text-gray-500">
                          {(ventaSeleccionada.productos || []).length} registro(s)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-visible p-4 sm:p-5 md:p-6 lg:overflow-y-auto">
                    <div className="space-y-4">
                      {(ventaSeleccionada.productos || []).map((item, index) => (
                        <div
                          key={`${item.producto}-${index}`}
                          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="text-base font-semibold text-gray-900">
                                  {item.nombreProducto}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  Inventario: {getInventarioLabel(item.inventarioOrigen)}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                  Código: {item.codigoProducto || '—'}
                                </p>
                              </div>

                              <div className="rounded-xl bg-slate-900 px-4 py-3 text-right">
                                <p className="text-xs text-slate-300">Total</p>
                                <p className="mt-1 text-sm font-bold text-white">
                                  {formatearMoneda(obtenerSubtotalItem(item))}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                              <div className="rounded-xl bg-gray-50 px-4 py-3">
                                <p className="text-[11px] text-gray-500">Cantidad</p>
                                <p className="mt-1 text-sm font-semibold text-gray-800">
                                  {item.cantidad}
                                </p>
                              </div>

                              <div className="rounded-xl bg-gray-50 px-4 py-3">
                                <p className="text-[11px] text-gray-500">P. unitario</p>
                                <p className="mt-1 text-sm font-semibold text-gray-800">
                                  {formatearMoneda(item.precioUnitario || 0)}
                                </p>
                              </div>

                              <div className="rounded-xl bg-gray-50 px-4 py-3">
                                <p className="text-[11px] text-gray-500">Subtotal bruto</p>
                                <p className="mt-1 text-sm font-semibold text-gray-800">
                                  {formatearMoneda(item.subtotalBruto || 0)}
                                </p>
                              </div>

                              <div className="rounded-xl bg-amber-50 px-4 py-3">
                                <p className="text-[11px] text-amber-700">Desc. %</p>
                                <p className="mt-1 text-sm font-semibold text-amber-700">
                                  {Number(item.descuentoPorcentaje || 0).toFixed(2)}%
                                </p>
                              </div>

                              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                                <p className="text-[11px] text-emerald-700">Subtotal final</p>
                                <p className="mt-1 text-sm font-semibold text-emerald-700">
                                  {formatearMoneda(obtenerSubtotalItem(item))}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
