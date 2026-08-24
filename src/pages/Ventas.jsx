import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import Layout from '../components/Layout';
import Header from '../components/Header';
import Loader from '../components/Loader';
import { api } from '../config/api';
import { useRealtime } from '../context/RealtimeContext';
import usePermisos from '../hooks/usePermisos';
import { imprimirTicketConfigurado } from '../utils/impresoraTickets';
import {
  Search,
  Receipt,
  Wallet,
  CreditCard,
  Landmark,
  CalendarDays,
  X,
  Package,
  BadgeDollarSign,
  FileText,
  Tag,
  Printer,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

const formatearMoneda = (valor) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(Number(valor || 0));
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

const obtenerSubtotalItem = (item) => {
  return Number(item.subtotalFinal ?? item.subtotal ?? 0);
};

const getInventarioLabel = (valor) =>
  String(valor || '').toLowerCase() === 'taxco' ? 'Taxco' : 'Tienda';

const construirTicketDesdeVenta = (venta) => {
  const metodo = getMetodoPagoInfo(venta?.metodoPago);

  return {
    numeroTicket: venta?.folio || venta?._id || 'Sin folio',
    usuario: venta?.usuario?.nombre || '—',
    metodoPago: metodo.label,
    fecha: new Date(venta?.createdAt).toLocaleDateString('es-MX'),
    hora: new Date(venta?.createdAt).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    total: Number(venta?.total || 0),
    productos: (venta?.productos || []).map((item) => ({
      nombre: item.nombreProducto || 'Producto',
      cantidad: Number(item.cantidad || 0),
      precioUnitario: Number(item.precioUnitario || 0),
      subtotal: obtenerSubtotalItem(item),
      descuento: Number(item.descuentoPorcentaje || 0),
      montoDescuento: Number(item.descuentoMonto || 0),
      inventarioOrigen: getInventarioLabel(item.inventarioOrigen),
    })),
  };
};

const escapeHtml = (texto) => {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const cargarImagenComoDataURL = async (ruta) => {
  const response = await fetch(ruta);
  const blob = await response.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function Ventas() {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario } = usePermisos();
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [ticketSeleccionado, setTicketSeleccionado] = useState(null);
  const [ventaAEliminar, setVentaAEliminar] = useState(null);
  const [passwordAdmin, setPasswordAdmin] = useState('');
  const [eliminandoVenta, setEliminandoVenta] = useState(false);
  const [errorEliminarVenta, setErrorEliminarVenta] = useState('');
  const [soloVentasHoy, setSoloVentasHoy] = useState(false);
  const { lastEvent } = useRealtime();
  const esAdmin = usuario?.rol === 'admin';

  const cargarVentas = async () => {
    const { data } = await api.get('/ventas');
    setVentas(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fechaQuery = params.get('fecha');
    setSoloVentasHoy(fechaQuery === 'hoy');
  }, [location.search]);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        await cargarVentas();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (lastEvent?.tipo !== 'ventas') return;

    const refrescar = async () => {
      try {
        await cargarVentas();
      } catch (error) {
        console.error('No se pudo actualizar la vista de ventas en tiempo real', error);
      }
    };

    refrescar();
  }, [lastEvent]);

  useEffect(() => {
    if (ventaSeleccionada || ticketSeleccionado || ventaAEliminar) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [ventaSeleccionada, ticketSeleccionado, ventaAEliminar]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;

      if (ticketSeleccionado) {
        setTicketSeleccionado(null);
        return;
      }

      if (ventaAEliminar) {
        cerrarModalEliminarVenta();
        return;
      }

      if (ventaSeleccionada) {
        setVentaSeleccionada(null);
        return;
      }

      if (soloVentasHoy) {
        setSoloVentasHoy(false);
        navigate('/ventas', { replace: true });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [soloVentasHoy, ventaSeleccionada, ticketSeleccionado, ventaAEliminar, navigate]);

  const limpiarFiltroVentasHoy = () => {
    setSoloVentasHoy(false);
    navigate('/ventas', { replace: true });
  };

  const abrirModalEliminarVenta = (venta) => {
    setVentaAEliminar(venta);
    setPasswordAdmin('');
    setErrorEliminarVenta('');
  };

  const cerrarModalEliminarVenta = () => {
    if (eliminandoVenta) return;
    setVentaAEliminar(null);
    setPasswordAdmin('');
    setErrorEliminarVenta('');
  };

  const confirmarEliminarVenta = async () => {
    if (!ventaAEliminar?._id || eliminandoVenta) return;

    try {
      setEliminandoVenta(true);
      setErrorEliminarVenta('');

      await api.delete(`/ventas/${ventaAEliminar._id}`, {
        data: { password: passwordAdmin },
      });

      setVentas((actuales) =>
        actuales.filter((venta) => venta._id !== ventaAEliminar._id)
      );

      if (ventaSeleccionada?._id === ventaAEliminar._id) {
        setVentaSeleccionada(null);
      }

      if (ticketSeleccionado?._id === ventaAEliminar._id) {
        setTicketSeleccionado(null);
      }

      setVentaAEliminar(null);
      setPasswordAdmin('');
    } catch (error) {
      setErrorEliminarVenta(
        error.response?.data?.mensaje || 'No se pudo eliminar la venta'
      );
    } finally {
      setEliminandoVenta(false);
    }
  };

  const ventasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    let resultado = [...ventas];

    if (soloVentasHoy) {
      const hoy = new Date();
      const yyyy = hoy.getFullYear();
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const dd = String(hoy.getDate()).padStart(2, '0');
      const hoyString = `${yyyy}-${mm}-${dd}`;

      resultado = resultado.filter((venta) => {
        const fechaVenta = new Date(venta.createdAt);
        const y = fechaVenta.getFullYear();
        const m = String(fechaVenta.getMonth() + 1).padStart(2, '0');
        const d = String(fechaVenta.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}` === hoyString;
      });
    }

    if (!texto) return resultado;

    return resultado.filter((venta) => {
      const folio = String(venta.folio || '').toLowerCase();
      const usuario = String(venta.usuario?.nombre || '').toLowerCase();
      const cliente = String(venta.cotizacion?.cliente || '').toLowerCase();

      return folio.includes(texto) || usuario.includes(texto) || cliente.includes(texto);
    });
  }, [ventas, busqueda, soloVentasHoy]);

  const ventasAgrupadas = useMemo(() => {
    const grupos = {};

    for (const venta of ventasFiltradas) {
      const fecha = new Date(venta.createdAt);
      const clave = fecha.toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(venta);
    }

    return Object.entries(grupos);
  }, [ventasFiltradas]);

  const ticketActual = ticketSeleccionado
    ? construirTicketDesdeVenta(ticketSeleccionado)
    : null;

  const construirHtmlTicket80mm = (ticket) => {
    const logoUrl = `${window.location.origin}/logo.png`;

    return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Ticket ${escapeHtml(ticket.numeroTicket)}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 6mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: #ffffff;
            }

            .ticket {
              width: 68mm;
              margin: 0 auto;
              font-size: 12px;
              line-height: 1.35;
            }

            .center {
              text-align: center;
            }

            .logo {
              display: block;
              margin: 0 auto 8px auto;
              max-width: 42mm;
              max-height: 22mm;
              object-fit: contain;
            }

            .title {
              font-size: 16px;
              font-weight: 700;
              margin-bottom: 2px;
            }

            .muted {
              color: #4b5563;
            }

            .divider {
              border-top: 1px dashed #9ca3af;
              margin: 8px 0;
            }

            .row {
              display: flex;
              justify-content: space-between;
              gap: 8px;
            }

            .item {
              padding: 6px 0;
              border-bottom: 1px dashed #e5e7eb;
            }

            .item-name {
              font-weight: 700;
              margin-bottom: 2px;
              word-break: break-word;
            }

            .item-meta {
              font-size: 11px;
              color: #4b5563;
              display: flex;
              justify-content: space-between;
              gap: 8px;
            }

            .item-discount {
              margin-top: 3px;
              font-size: 11px;
              color: #b45309;
              display: flex;
              justify-content: space-between;
              gap: 8px;
            }

            .total {
              font-size: 16px;
              font-weight: 700;
            }

            .small {
              font-size: 11px;
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="center">
              <img
                src="${logoUrl}"
                alt="Logo"
                class="logo"
                onerror="this.style.display='none'"
              />
              <div class="title">Hilos en Nogada</div>
              <div class="muted">Ticket de venta</div>
            </div>

            <div class="divider"></div>

            <div class="row"><span>Núm. ticket</span><strong>${escapeHtml(ticket.numeroTicket)}</strong></div>
            <div class="row"><span>Usuario</span><strong>${escapeHtml(ticket.usuario)}</strong></div>
            <div class="row"><span>Fecha</span><strong>${escapeHtml(ticket.fecha)}</strong></div>
            <div class="row"><span>Hora</span><strong>${escapeHtml(ticket.hora)}</strong></div>
            <div class="row"><span>Pago</span><strong>${escapeHtml(ticket.metodoPago)}</strong></div>

            <div class="divider"></div>

            ${ticket.productos
              .map(
                (item) => `
                  <div class="item">
                    <div class="item-name">${escapeHtml(item.nombre)}</div>
                    <div class="item-meta">
                      <span>${item.cantidad} x ${formatearMoneda(item.precioUnitario)}</span>
                      <strong>${formatearMoneda(item.subtotal)}</strong>
                    </div>
                    ${
                      Number(item.montoDescuento || 0) > 0
                        ? `
                          <div class="item-discount">
                            <span>Descuento ${Number(item.descuento || 0).toFixed(2)}%</span>
                            <strong>- ${formatearMoneda(item.montoDescuento)}</strong>
                          </div>
                        `
                        : ''
                    }
                  </div>
                `
              )
              .join('')}

            <div class="divider"></div>

            <div class="row total">
              <span>Total</span>
              <span>${formatearMoneda(ticket.total)}</span>
            </div>

            <div class="divider"></div>

            <div class="center small muted">
              Gracias por tu compra
            </div>
          </div>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `;
  };

  const imprimirTicket80mm = () => {
    if (!ticketActual) return;

    imprimirTicketConfigurado({
      ticket: ticketActual,
      formatearMoneda,
      onError: (mensaje) => window.alert(mensaje),
    });
  };

  const descargarTicketPDF = async () => {
    if (!ticketActual) return;

    let logoDataUrl = null;

    try {
      logoDataUrl = await cargarImagenComoDataURL('/logo.png');
    } catch {
      logoDataUrl = null;
    }

    const width = 80;
    let y = 8;

    const estimarAltura = () => {
      let altura = 78;

      ticketActual.productos.forEach((item) => {
        const nombreLineas = Math.max(1, Math.ceil(String(item.nombre || '').length / 24));
        altura += nombreLineas * 4.5 + 7;

        if (Number(item.montoDescuento || 0) > 0) {
          altura += 4.5;
        }
      });

      return Math.max(140, altura);
    };

    const doc = new jsPDF({
      unit: 'mm',
      format: [width, estimarAltura()],
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 20, y, 40, 16);
      y += 19;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Hilos en Nogada', pageWidth / 2, y, { align: 'center' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Ticket de venta', pageWidth / 2, y, { align: 'center' });
    y += 6;

    doc.setDrawColor(180, 180, 180);
    doc.line(6, y, pageWidth - 6, y);
    y += 5;

    const imprimirDato = (label, valor) => {
      doc.setFont('helvetica', 'normal');
      doc.text(label, 6, y);
      doc.setFont('helvetica', 'bold');
      doc.text(String(valor), pageWidth - 6, y, { align: 'right' });
      y += 5;
    };

    imprimirDato('Ticket', ticketActual.numeroTicket);
    imprimirDato('Usuario', ticketActual.usuario);
    imprimirDato('Fecha', ticketActual.fecha);
    imprimirDato('Hora', ticketActual.hora);
    imprimirDato('Pago', ticketActual.metodoPago);

    y += 1;
    doc.line(6, y, pageWidth - 6, y);
    y += 5;

    ticketActual.productos.forEach((item) => {
      const nombreLineas = doc.splitTextToSize(item.nombre, pageWidth - 12);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(nombreLineas, 6, y);
      y += nombreLineas.length * 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`${item.cantidad} x ${formatearMoneda(item.precioUnitario)}`, 6, y);

      doc.setFont('helvetica', 'bold');
      doc.text(formatearMoneda(item.subtotal), pageWidth - 6, y, { align: 'right' });
      y += 5;

      if (Number(item.montoDescuento || 0) > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 83, 9);
        doc.text(`Descuento ${Number(item.descuento || 0).toFixed(2)}%`, 6, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`- ${formatearMoneda(item.montoDescuento)}`, pageWidth - 6, y, {
          align: 'right',
        });
        doc.setTextColor(17, 24, 39);
        y += 4;
      }

      doc.setDrawColor(230, 230, 230);
      doc.line(6, y, pageWidth - 6, y);
      y += 4;
    });

    doc.setDrawColor(180, 180, 180);
    doc.line(6, y, pageWidth - 6, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL', 6, y);
    doc.text(formatearMoneda(ticketActual.total), pageWidth - 6, y, { align: 'right' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Gracias por tu compra', pageWidth / 2, y, { align: 'center' });

    doc.save(`ticket_${ticketActual.numeroTicket}.pdf`);
  };

  return (
    <Layout>
      <Header title="Ventas" />

      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">Historial de ventas</h3>
              <p className="mt-1 text-sm text-gray-500">
                Consulta todas las ventas registradas y busca por ticket
              </p>
            </div>

            <div className="relative w-full lg:w-[340px]">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                placeholder="Buscar por ticket, usuario o cliente"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>
        </div>

        {soloVentasHoy ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  Filtro activo: ventas de hoy
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Mostrando solo las ventas registradas hoy. Presiona Esc para quitar el filtro.
                </p>
              </div>

              <button
                type="button"
                onClick={limpiarFiltroVentasHoy}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                Quitar filtro
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
            <Loader />
          </div>
        ) : ventasAgrupadas.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-10">
            <p className="text-lg font-semibold text-gray-700">No se encontraron ventas</p>
            <p className="mt-2 text-sm text-gray-500">
              Intenta con otra búsqueda o registra nuevas ventas
            </p>
          </div>
        ) : (
          <div className="space-y-5 sm:space-y-6">
            {ventasAgrupadas.map(([fecha, items]) => (
              <div
                key={fecha}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
              >
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold capitalize text-gray-800 sm:text-2xl">
                      {fecha}
                    </h3>
                    <p className="text-sm text-gray-500">{items.length} venta(s)</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {items.map((venta) => {
                    const metodo = getMetodoPagoInfo(venta.metodoPago);
                    const MetodoIcon = metodo.icon;

                    return (
                      <div
                        key={venta._id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 "
                      >
                        <div
                          className="cursor-pointer"
                          onClick={() => setVentaSeleccionada(venta)}
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                                  {venta.folio}
                                </span>

                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${metodo.badge}`}
                                >
                                  <MetodoIcon size={14} />
                                  {metodo.label}
                                </span>

                                {venta.origenCotizacion ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                                    Desde cotización
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-3 text-sm text-gray-500">
                                {formatearFechaHora(venta.createdAt)}
                              </p>

                              <p className="mt-1 text-sm text-gray-700">
                                Usuario:{' '}
                                <span className="font-medium">
                                  {venta.usuario?.nombre || '—'}
                                </span>
                              </p>

                              {venta.cotizacion?.cliente ? (
                                <p className="mt-1 text-sm text-gray-700">
                                  Cliente:{' '}
                                  <span className="font-medium">
                                    {venta.cotizacion.cliente}
                                  </span>
                                </p>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:min-w-[420px]">
                              <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <p className="text-xs text-gray-500">Productos</p>
                                <p className="mt-1 font-semibold text-gray-800">
                                  {venta.productos?.length || 0}
                                </p>
                              </div>

                              <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <p className="text-xs text-gray-500">Piezas</p>
                                <p className="mt-1 font-semibold text-gray-800">
                                  {(venta.productos || []).reduce(
                                    (acc, item) => acc + Number(item.cantidad || 0),
                                    0
                                  )}
                                </p>
                              </div>

                              <div className="col-span-2 rounded-xl bg-indigo-50 px-3 py-2 md:col-span-1">
                                <p className="text-xs text-indigo-700">Total</p>
                                <p className="mt-1 font-bold text-indigo-700">
                                  ${Number(venta.total || 0).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                          {esAdmin ? (
                            <button
                              type="button"
                              onClick={() => abrirModalEliminarVenta(venta)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              <Trash2 size={16} />
                              Eliminar venta
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => setTicketSeleccionado(venta)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            <Receipt size={16} />
                            Ver ticket
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ventaSeleccionada ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45">
          <div className="flex min-h-full items-end justify-center sm:items-center">
            <div
              className="absolute inset-0"
              onClick={() => setVentaSeleccionada(null)}
            />

            <div className="relative flex max-h-[100dvh] w-full flex-col overflow-y-auto rounded-none border-0 bg-white shadow-md sm:h-[94vh] sm:max-w-7xl sm:overflow-hidden sm:rounded-xl sm:border sm:border-white/20">
              <div className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 py-4 sm:px-5 md:px-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
                      Detalle de venta
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-bold text-gray-900 sm:text-2xl">
                        {ventaSeleccionada.folio}
                      </h3>

                      {ventaSeleccionada.origenCotizacion ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Desde cotización
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm text-gray-500">
                      {formatearFechaHora(ventaSeleccionada.createdAt)}
                    </p>
                  </div>

                  <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                    {esAdmin ? (
                      <button
                        type="button"
                        onClick={() => abrirModalEliminarVenta(ventaSeleccionada)}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 md:flex-none"
                      >
                        <Trash2 size={16} />
                        Eliminar
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setTicketSeleccionado(ventaSeleccionada)}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 md:flex-none"
                    >
                      <Receipt size={16} />
                      Ver ticket
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
                          {(ventaSeleccionada.productos || []).reduce(
                            (acc, item) => acc + Number(item.cantidad || 0),
                            0
                          )}
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

              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-visible lg:grid-cols-[320px_1fr] lg:overflow-hidden xl:grid-cols-[360px_1fr]">
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

                    {ventaSeleccionada.origenCotizacion ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                            <FileText size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-900">
                              Cotización relacionada
                            </p>
                            <p className="text-xs text-emerald-700">
                              Datos originales usados en la venta
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                              Cliente
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {ventaSeleccionada.cotizacion?.cliente || 'Sin especificar'}
                            </p>
                          </div>

                          <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                              Fecha cotización
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {ventaSeleccionada.cotizacion?.fechaCotizacion || 'Sin especificar'}
                            </p>
                          </div>

                          <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                              Vigencia
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {ventaSeleccionada.cotizacion?.vigencia || 'Sin especificar'}
                            </p>
                          </div>

                          <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                              Total cotización
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {formatearMoneda(ventaSeleccionada.cotizacion?.totalCotizacion || 0)}
                            </p>
                          </div>

                          {ventaSeleccionada.cotizacion?.notas ? (
                            <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                                Notas
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                                {ventaSeleccionada.cotizacion.notas}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
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

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                                    <Tag size={12} />
                                    Código: {item.codigoProducto || '—'}
                                  </span>

                                  {item.categoriaProducto ? (
                                    <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                                      {item.categoriaProducto}
                                    </span>
                                  ) : null}

                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                                    Inventario: {getInventarioLabel(item.inventarioOrigen)}
                                  </span>

                                  {item.pieza ? (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                                      Pieza: {item.pieza}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="rounded-xl bg-slate-900 px-4 py-3 text-right">
                                <p className="text-xs text-slate-300">Total</p>
                                <p className="mt-1 text-sm font-bold text-white">
                                  ${obtenerSubtotalItem(item).toFixed(2)}
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
                                  ${Number(item.precioUnitario || 0).toFixed(2)}
                                </p>
                              </div>

                              <div className="rounded-xl bg-gray-50 px-4 py-3">
                                <p className="text-[11px] text-gray-500">Subtotal bruto</p>
                                <p className="mt-1 text-sm font-semibold text-gray-800">
                                  ${Number(item.subtotalBruto || 0).toFixed(2)}
                                </p>
                              </div>

                              <div className="rounded-xl bg-amber-50 px-4 py-3">
                                <p className="text-[11px] text-amber-700">Desc. %</p>
                                <p className="mt-1 text-sm font-semibold text-amber-700">
                                  {Number(item.descuentoPorcentaje || 0).toFixed(2)}%
                                </p>
                              </div>

                              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                                <p className="text-[11px] text-emerald-700">Descuento</p>
                                <p className="mt-1 text-sm font-semibold text-emerald-700">
                                  ${Number(item.descuentoMonto || 0).toFixed(2)}
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

      {ventaAEliminar ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/50 p-4">
          <div className="flex min-h-full items-center justify-center">
            <div
              className="absolute inset-0"
              onClick={cerrarModalEliminarVenta}
            />

            <form
              className="relative w-full max-w-md rounded-xl border border-red-100 bg-white p-5 shadow-xl sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                confirmarEliminarVenta();
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
                  <TriangleAlert size={22} />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Eliminar venta
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">
                    Se eliminará el ticket {ventaAEliminar.folio} y las piezas vendidas volverán al inventario correspondiente.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                Esta acción solo puede confirmarla un administrador con su contraseña.
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-semibold text-gray-800">
                  Contraseña del administrador
                </span>
                <input
                  type="password"
                  value={passwordAdmin}
                  onChange={(event) => setPasswordAdmin(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100 sm:text-sm"
                  autoComplete="current-password"
                  autoFocus
                />
              </label>

              {errorEliminarVenta ? (
                <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {errorEliminarVenta}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={cerrarModalEliminarVenta}
                  disabled={eliminandoVenta}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={eliminandoVenta || !passwordAdmin.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={16} />
                  {eliminandoVenta ? 'Eliminando...' : 'Eliminar y restaurar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {ticketSeleccionado && ticketActual ? (
        <div className="fixed inset-0 z-[60] bg-black/45 p-2 sm:px-4 sm:py-6">
          <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
            <div className="max-h-full w-full overflow-y-auto rounded-xl bg-white shadow-md">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 sm:h-11 sm:w-11">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 sm:text-2xl">
                      Ticket de la venta
                    </h3>
                    <p className="text-sm text-gray-500">{ticketActual.numeroTicket}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTicketSeleccionado(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
                <div className="border-b border-gray-100 bg-gray-50 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                  <div className="mx-auto w-full max-w-[300px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <img
                      src="/logo.png"
                      alt="Logo Hilos en Nogada"
                      className="mx-auto h-16 w-auto object-contain"
                    />

                    <div className="mt-4 text-center">
                      <h4 className="text-xl font-bold text-gray-900">Hilos en Nogada</h4>
                      <p className="text-sm text-gray-500">Ticket de venta</p>
                    </div>

                    <div className="my-4 border-t border-dashed border-gray-300" />

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Ticket</span>
                        <span className="font-semibold text-gray-900">
                          {ticketActual.numeroTicket}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Usuario</span>
                        <span className="text-right font-semibold text-gray-900">
                          {ticketActual.usuario}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Fecha</span>
                        <span className="font-semibold text-gray-900">
                          {ticketActual.fecha}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Hora</span>
                        <span className="font-semibold text-gray-900">
                          {ticketActual.hora}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Pago</span>
                        <span className="font-semibold text-gray-900">
                          {ticketActual.metodoPago}
                        </span>
                      </div>
                    </div>

                    <div className="my-4 border-t border-dashed border-gray-300" />

                    <div className="space-y-3">
                      {ticketActual.productos.map((item, index) => (
                        <div key={`${item.nombre}-${index}`} className="text-sm">
                          <p className="font-semibold text-gray-900">{item.nombre}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            Inventario: {item.inventarioOrigen}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-3 text-gray-600">
                            <span>
                              {item.cantidad} x {formatearMoneda(item.precioUnitario)}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {formatearMoneda(item.subtotal)}
                            </span>
                          </div>

                          {Number(item.montoDescuento || 0) > 0 ? (
                            <div className="mt-1 flex items-center justify-between gap-3 text-amber-700">
                              <span>
                                Descuento {Number(item.descuento || 0).toFixed(2)}%
                              </span>
                              <span className="font-semibold">
                                - {formatearMoneda(item.montoDescuento)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="my-4 border-t border-dashed border-gray-300" />

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-bold text-gray-900">TOTAL</span>
                      <span className="text-xl font-extrabold text-gray-900">
                        {formatearMoneda(ticketActual.total)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Acciones</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={imprimirTicket80mm}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
                      >
                        <Printer size={18} />
                        Imprimir 80mm
                      </button>

                      <button
                        type="button"
                        onClick={descargarTicketPDF}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        <FileText size={18} />
                        Descargar PDF
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-gray-200 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                      <span className="text-sm text-gray-500">Ticket</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {ticketActual.numeroTicket}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                      <span className="text-sm text-gray-500">Método de pago</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {ticketActual.metodoPago}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900">Total</span>
                      <span className="text-base font-bold text-gray-900">
                        {formatearMoneda(ticketActual.total)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTicketSeleccionado(null)}
                    className="mt-5 w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 sm:w-auto"
                  >
                    Cerrar ticket
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
