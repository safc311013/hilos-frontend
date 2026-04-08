import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import Loader from '../components/Loader';
import { api } from '../config/api';
import { useRealtime } from '../context/RealtimeContext';
import usePermisos from '../hooks/usePermisos';
import { PERMISOS } from '../utils/permisos';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Search,
  ShoppingCart,
  Trash2,
  Percent,
  Plus,
  Minus,
  CreditCard,
  Printer,
  FileText,
  X,
  Receipt,
  Image as ImageIcon,
} from 'lucide-react';

const PRODUCTOS_POR_PAGINA = 12;

const MODOS_PANTALLA = {
  VENTA: 'venta',
  COTIZACION: 'cotizacion',
};

const BARCODE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'codabar',
];

const normalizarCodigoEscaneado = (value = '') =>
  String(value).replace(/\s+/g, '').trim().toUpperCase();

const obtenerFechaHoyISO = () => {
  const hoy = new Date();
  const offset = hoy.getTimezoneOffset();
  return new Date(hoy.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const formatearMoneda = (valor) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(Number(valor || 0));
};

const formatearMetodoPago = (metodo) => {
  const metodos = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
  };

  return metodos[metodo] || metodo || 'No especificado';
};

const obtenerNombreUsuario = (usuario) => {
  return (
    usuario?.nombreCompleto ||
    usuario?.nombre ||
    usuario?.usuario ||
    usuario?.email ||
    'Usuario del sistema'
  );
};

const escapeHtml = (texto) => {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const extraerNumeroTicket = (venta) => {
  const numero =
    venta?.numeroTicket ||
    venta?.ticketNumber ||
    venta?.folio ||
    venta?.folioVenta ||
    venta?.numero ||
    venta?._id;

  if (!numero) {
    return `T-${Date.now()}`;
  }

  return String(numero);
};

const construirTicketDesdeVenta = ({
  venta,
  detalle,
  metodoPago,
  usuario,
}) => {
  const fechaBase = venta?.createdAt ? new Date(venta.createdAt) : new Date();

  return {
    numeroTicket: extraerNumeroTicket(venta),
    usuario: obtenerNombreUsuario(usuario),
    metodoPago: formatearMetodoPago(venta?.metodoPago || metodoPago),
    fecha: fechaBase.toLocaleDateString('es-MX'),
    hora: fechaBase.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    total: detalle.reduce((acc, item) => acc + Number(item.subtotalFinal || 0), 0),
    productos: detalle.map((item) => ({
      nombre: item.nombre,
      cantidad: Number(item.cantidadNumero || 0),
      precioUnitario: Number(item.precio || 0),
      subtotal: Number(item.subtotalFinal || 0),
      descuento: Number(item.descuentoNumero || 0),
      montoDescuento: Number(item.montoDescuento || 0),
      subtotalBruto: Number(item.subtotalBruto || 0),
      imagenUrl: item.imagenUrl || '',
    })),
  };
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

const construirCarritoDesdeCotizacion = (cotizacionVenta) => {
  return (cotizacionVenta?.productos || []).map((item) => ({
    producto: item.producto,
    codigo: item.codigo || '',
    nombre: item.nombre || '',
    categoria: item.categoria || '',
    precio: Number(item.precio || 0),
    stockDisponible: Number(item.stockDisponible || 0),
    cantidad: String(Number(item.cantidad || 0)),
    descuento: String(Number(item.descuento || 0)),
    pieza: item.pieza || '',
    imagenUrl: item.imagenUrl || '',
  }));
};

const prepararCarritoParaCotizacion = (items = []) => {
  return items.map((item) => ({
    ...item,
    descuento: '',
  }));
};

const FOLIO_PROVISIONAL = 'Se asignará al guardar';
const QrScanner = lazy(() =>
  import('@yudiel/react-qr-scanner').then((module) => ({
    default: module.Scanner,
  }))
);

export default function POS() {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, puede } = usePermisos();
  const { lastEvent } = useRealtime();

  const inputBusquedaRef = useRef(null);
  const focoInicialAplicadoRef = useRef(false);
  const carritoRef = useRef([]);
  const ultimoCodigoEscaneadoRef = useRef('');

  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [ticketVenta, setTicketVenta] = useState(null);
  const [procesandoVenta, setProcesandoVenta] = useState(false);
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);
  const [cotizacionActiva, setCotizacionActiva] = useState(null);
  const [modoPantalla, setModoPantalla] = useState(MODOS_PANTALLA.VENTA);

  const [nombreClienteCotizacion, setNombreClienteCotizacion] = useState('');
  const [fechaCotizacion, setFechaCotizacion] = useState(obtenerFechaHoyISO());
  const [vigenciaCotizacion, setVigenciaCotizacion] = useState('');
  const [folioCotizacion, setFolioCotizacion] = useState(FOLIO_PROVISIONAL);

  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [productoConsultado, setProductoConsultado] = useState(null);
  const [consultandoCodigo, setConsultandoCodigo] = useState(false);
  const [errorScanner, setErrorScanner] = useState('');

  const esModoCotizacion = modoPantalla === MODOS_PANTALLA.COTIZACION;

  useEffect(() => {
    carritoRef.current = carrito;
  }, [carrito]);

  useEffect(() => {
    if (!mensajeExito) return;

    const timeout = setTimeout(() => {
      setMensajeExito('');
    }, 4000);

    return () => clearTimeout(timeout);
  }, [mensajeExito]);

  useEffect(() => {
    if (ticketVenta || mostrarScanner || productoConsultado) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [ticketVenta, mostrarScanner, productoConsultado]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && ticketVenta) {
        setTicketVenta(null);
        enfocarBusqueda();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ticketVenta]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (!mostrarScanner || consultandoCodigo) return;
      cerrarScanner();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mostrarScanner, consultandoCodigo]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (!productoConsultado) return;
      cerrarModalConsulta();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [productoConsultado]);

  const enfocarBusqueda = () => {
    setTimeout(() => {
      inputBusquedaRef.current?.focus();
    }, 0);
  };

  const enfocarYSeleccionarBusqueda = () => {
    setTimeout(() => {
      inputBusquedaRef.current?.focus();
      inputBusquedaRef.current?.select?.();
    }, 0);
  };

  const abrirScanner = () => {
    setError('');
    setMensajeExito('');
    setErrorScanner('');
    setProductoConsultado(null);
    ultimoCodigoEscaneadoRef.current = '';
    setMostrarScanner(true);
  };

  const cerrarScanner = () => {
    if (consultandoCodigo) return;
    setMostrarScanner(false);
    setErrorScanner('');
    ultimoCodigoEscaneadoRef.current = '';
  };

  const cerrarModalConsulta = () => {
  setProductoConsultado(null);
  enfocarBusqueda();
};

const agregarProductoDesdeModalScanner = () => {
  if (!productoConsultado) return;

  setError('');
  setMensajeExito('');

  const stockDisponible = Number(
    productoConsultado.stock ?? productoConsultado.stockDisponible ?? 0
  );

  if (stockDisponible <= 0) {
    setError(`El producto ${productoConsultado.nombre} ya no tiene stock disponible.`);
    return;
  }

  const itemEnCarrito = carritoRef.current.find(
    (item) => item.producto === productoConsultado._id
  );

  if (itemEnCarrito && Number(itemEnCarrito.cantidad || 0) >= stockDisponible) {
    setError(
      `No puedes agregar más de ${stockDisponible} unidades de ${productoConsultado.nombre}.`
    );
    return;
  }

  agregarProducto(productoConsultado);
  setProductoConsultado(null);
  ultimoCodigoEscaneadoRef.current = '';
  setMensajeExito(
    'Producto agregado al carrito. Ahora captura la cantidad y el descuento como venta normal.'
  );
  enfocarBusqueda();
};

  const consultarProductoEscaneado = async (rawValue) => {
    const codigo = normalizarCodigoEscaneado(rawValue);

    if (!codigo || consultandoCodigo) return;
    if (ultimoCodigoEscaneadoRef.current === codigo) return;

    ultimoCodigoEscaneadoRef.current = codigo;
    setConsultandoCodigo(true);
    setErrorScanner('');
    setError('');

    try {
      const { data } = await api.get(`/productos/codigo/${encodeURIComponent(codigo)}`);

      if (!data) {
        setErrorScanner(`No se encontró un producto con el código ${codigo}`);
        ultimoCodigoEscaneadoRef.current = '';
        return;
      }

      setMostrarScanner(false);
      setProductoConsultado(data);
    } catch (errorConsulta) {
      if (errorConsulta?.response?.status === 404) {
        setErrorScanner(`No se encontró un producto con el código ${codigo}`);
      } else {
        setErrorScanner(
          errorConsulta.response?.data?.mensaje ||
            'No se pudo consultar el producto escaneado'
        );
      }
      ultimoCodigoEscaneadoRef.current = '';
    } finally {
      setConsultandoCodigo(false);
    }
  };

  const renderImagenProducto = (
    imagenUrl,
    nombre,
    className = 'h-12 w-12',
    iconSize = 18
  ) => {
    if (imagenUrl) {
      return (
        <img
          src={imagenUrl}
          alt={nombre || 'Producto'}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className={`${className} rounded-2xl border border-gray-200 bg-white object-cover`}
        />
      );
    }

    return (
      <div
        className={`${className} flex items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-gray-400`}
      >
        <ImageIcon size={iconSize} />
      </div>
    );
  };

  const cargarProductos = async ({
    page = paginaActual,
    q = busquedaAplicada,
  } = {}) => {
    try {
      setCargandoCatalogo(true);
      setErrorCarga('');

      const { data } = await api.get('/productos/catalogo', {
        params: {
          page,
          limit: PRODUCTOS_POR_PAGINA,
          q,
        },
      });

      setProductos(data.items || []);
      setPaginaActual(data.page || 1);
      setTotalPaginas(data.totalPages || 1);
      setTotalProductos(data.total || 0);
    } catch (errorCargaCatalogo) {
      setProductos([]);
      setTotalPaginas(1);
      setTotalProductos(0);
      setErrorCarga(
        errorCargaCatalogo.response?.data?.mensaje || 'No se pudo cargar el catálogo'
      );
    } finally {
      setCargandoCatalogo(false);
    }
  };

  const sincronizarCarritoConStockActual = async () => {
    const carritoActual = carritoRef.current;

    if (!Array.isArray(carritoActual) || carritoActual.length === 0) return;

    try {
      const { data } = await api.get('/productos');
      const inventarioActual = Array.isArray(data) ? data : [];
      const mapaPorCodigo = new Map();
      const mapaPorId = new Map();

      inventarioActual.forEach((producto) => {
        const codigo = String(producto.codigo || '').trim().toUpperCase();
        const id = String(producto._id || '').trim();

        if (codigo) {
          mapaPorCodigo.set(codigo, producto);
        }

        if (id) {
          mapaPorId.set(id, producto);
        }
      });

      let mensajeAjuste = '';

      const carritoActualizado = carritoActual.reduce((acc, item) => {
        const codigo = String(item.codigo || '').trim().toUpperCase();
        const productoActual =
          mapaPorCodigo.get(codigo) || mapaPorId.get(String(item.producto || '').trim());

        if (
          !productoActual ||
          productoActual.activo === false ||
          Number(productoActual.stock ?? 0) <= 0
        ) {
          if (!mensajeAjuste) {
            mensajeAjuste = `${item.nombre} ya no tiene stock disponible y se eliminó del carrito.`;
          }
          return acc;
        }

        const nuevoStock = Number(productoActual.stock ?? 0);
        const cantidadActual = Number(item.cantidad || 0);
        let nuevaCantidad = item.cantidad;

        if (cantidadActual > nuevoStock) {
          nuevaCantidad = nuevoStock > 0 ? String(nuevoStock) : '';

          if (!mensajeAjuste) {
            mensajeAjuste = `La cantidad de ${item.nombre} se ajustó a ${nuevoStock} por cambios en inventario.`;
          }
        }

        acc.push({
          ...item,
          codigo: productoActual.codigo || item.codigo,
          nombre: productoActual.nombre || item.nombre,
          categoria: productoActual.categoria || item.categoria,
          precio: Number(productoActual.precio ?? item.precio ?? 0),
          stockDisponible: nuevoStock,
          cantidad: nuevaCantidad,
          imagenUrl: productoActual.imagenUrl || item.imagenUrl || '',
        });

        return acc;
      }, []);

      setCarrito(carritoActualizado);

      if (mensajeAjuste) {
        setError(mensajeAjuste);
      }
    } catch (errorSync) {
      console.error('No se pudo sincronizar el carrito con el inventario actual:', errorSync);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPaginaActual(1);
      setBusquedaAplicada(busqueda.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [busqueda]);

  useEffect(() => {
    if (!puede(PERMISOS.REGISTRAR_VENTAS)) return;
    cargarProductos({ page: paginaActual, q: busquedaAplicada });
  }, [usuario, paginaActual, busquedaAplicada]);

  useEffect(() => {
    if (lastEvent?.tipo !== 'productos' || !puede(PERMISOS.REGISTRAR_VENTAS)) {
      return;
    }

    const refrescarPOS = async () => {
      try {
        await Promise.all([
          cargarProductos({ page: paginaActual, q: busquedaAplicada }),
          sincronizarCarritoConStockActual(),
        ]);
      } catch (errorRealtime) {
        console.error('No se pudo actualizar el POS en tiempo real:', errorRealtime);
      }
    };

    refrescarPOS();
  }, [lastEvent, usuario, paginaActual, busquedaAplicada]);

  useEffect(() => {
    if (focoInicialAplicadoRef.current) return;
    if (!puede(PERMISOS.REGISTRAR_VENTAS)) return;

    focoInicialAplicadoRef.current = true;
    enfocarBusqueda();
  }, [puede]);

  useEffect(() => {
    const desdeState = location.state?.cotizacionVenta;

    let desdeStorage = null;
    if (!desdeState) {
      try {
        const raw = sessionStorage.getItem('cotizacionVentaParaPOS');
        if (raw) {
          desdeStorage = JSON.parse(raw);
        }
      } catch {
        desdeStorage = null;
      }
    }

    const cotizacionVenta = desdeState || desdeStorage;

    if (!cotizacionVenta?.productos?.length) return;

    const carritoInicial = construirCarritoDesdeCotizacion(cotizacionVenta);
    setCarrito(carritoInicial);
    carritoRef.current = carritoInicial;

    setCotizacionActiva({
      origen: cotizacionVenta.origen || 'cotizacion',
      formato: cotizacionVenta.formato || 'ventas',
      cliente: cotizacionVenta.cliente || '',
      fechaCotizacion: cotizacionVenta.fechaCotizacion || '',
      vigencia: cotizacionVenta.vigencia || '',
      notas: cotizacionVenta.notas || '',
      total: Number(cotizacionVenta.total || 0),
    });
    setMetodoPago('efectivo');
    setBusqueda('');
    setBusquedaAplicada('');
    setPaginaActual(1);
    setError('');
    setMensajeExito('');
    setModoPantalla(MODOS_PANTALLA.VENTA);

    try {
      sessionStorage.removeItem('cotizacionVentaParaPOS');
    } catch (errorStorage) {
      console.error('No se pudo limpiar la cotización temporal:', errorStorage);
    }

    if (desdeState) {
      navigate('/pos', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const abrirModoCotizacion = () => {
    const fechaHoy = obtenerFechaHoyISO();

    setError('');
    setMensajeExito('');
    setCotizacionActiva(null);
    setNombreClienteCotizacion('');
    setFechaCotizacion(fechaHoy);
    setVigenciaCotizacion('');
    setFolioCotizacion(FOLIO_PROVISIONAL);
    setModoPantalla(MODOS_PANTALLA.COTIZACION);
    setCarrito((prev) => prepararCarritoParaCotizacion(prev));
  };

  const nuevaCotizacion = () => {
    const fechaHoy = obtenerFechaHoyISO();

    setError('');
    setMensajeExito('');
    setTicketVenta(null);
    setCotizacionActiva(null);
    setCarrito([]);
    carritoRef.current = [];
    setMetodoPago('efectivo');
    setNombreClienteCotizacion('');
    setFechaCotizacion(fechaHoy);
    setVigenciaCotizacion('');
    setFolioCotizacion(FOLIO_PROVISIONAL);
    setBusqueda('');
    setBusquedaAplicada('');
    setPaginaActual(1);
    setModoPantalla(MODOS_PANTALLA.COTIZACION);

    try {
      sessionStorage.removeItem('cotizacionVentaParaPOS');
    } catch (errorStorage) {
      console.error('No se pudo limpiar la cotización temporal:', errorStorage);
    }

    enfocarBusqueda();
  };

  const volverAModoVenta = () => {
    setError('');
    setMensajeExito('');
    setModoPantalla(MODOS_PANTALLA.VENTA);
    enfocarBusqueda();
  };

  const agregarProducto = (producto) => {
    setError('');
    setMensajeExito('');

    if (Number(producto.stock || producto.stockDisponible || 0) <= 0) {
      setError(`El producto ${producto.nombre} ya no tiene stock disponible.`);
      return;
    }

    setCarrito((prev) => {
      const existe = prev.find((item) => item.producto === producto._id);

      if (existe) {
        if (
          Number(existe.cantidad || 0) >=
          Number(producto.stock || producto.stockDisponible || 0)
        ) {
          setError(
            `No puedes agregar más de ${
              producto.stock || producto.stockDisponible
            } unidades de ${producto.nombre}.`
          );
          return prev;
        }

        return prev.map((item) =>
          item.producto === producto._id
            ? { ...item, cantidad: String(Number(item.cantidad || 0) + 1) }
            : item
        );
      }

      return [
        ...prev,
        {
          producto: producto._id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          categoria: producto.categoria,
          precio: Number(producto.precio),
          stockDisponible: Number(producto.stock ?? producto.stockDisponible ?? 0),
          cantidad: '',
          descuento: '',
          pieza: '',
          imagenUrl: producto.imagenUrl || '',
        },
      ];
    });
  };

  const buscarYAgregarRapido = async () => {
    const termino = String(busqueda || '').trim();

    if (!termino) return;

    try {
      setError('');
      setMensajeExito('');

      const textoNormalizado = termino.toUpperCase();
      const esCodigoCompleto = /^HEN[A-Z0-9]{4}$/i.test(textoNormalizado);

      if (esCodigoCompleto) {
        try {
          const { data } = await api.get(
            `/productos/codigo/${encodeURIComponent(textoNormalizado)}`
          );

          agregarProducto(data);
          setBusqueda('');
          setBusquedaAplicada('');
          setPaginaActual(1);
          await cargarProductos({ page: 1, q: '' });
          enfocarBusqueda();
          return;
        } catch (errorCodigo) {
          if (errorCodigo?.response?.status === 404) {
            setError('No se encontró un producto con ese código.');
            enfocarBusqueda();
            return;
          }

          throw errorCodigo;
        }
      }

      const { data } = await api.get('/productos/catalogo', {
        params: {
          page: 1,
          limit: 5,
          q: termino,
        },
      });

      const resultados = data.items || [];

      const coincidenciaExactaPorNombre = resultados.find((producto) => {
        const nombre = String(producto.nombre || '').trim().toLowerCase();
        return nombre === termino.toLowerCase();
      });

      if (coincidenciaExactaPorNombre) {
        agregarProducto(coincidenciaExactaPorNombre);
        setBusqueda('');
        setBusquedaAplicada('');
        setPaginaActual(1);
        await cargarProductos({ page: 1, q: '' });
        enfocarBusqueda();
        return;
      }

      if (resultados.length === 1) {
        agregarProducto(resultados[0]);
        setBusqueda('');
        setBusquedaAplicada('');
        setPaginaActual(1);
        await cargarProductos({ page: 1, q: '' });
        enfocarBusqueda();
        return;
      }

      if (resultados.length > 1) {
        setBusqueda(termino);
        setBusquedaAplicada(termino);
        setPaginaActual(1);
        await cargarProductos({ page: 1, q: termino });
        setError('Hay varias coincidencias. Selecciona el producto en el catálogo.');
        enfocarYSeleccionarBusqueda();
        return;
      }

      setError('No se encontró un producto con ese código o nombre.');
      enfocarBusqueda();
    } catch (errorBusqueda) {
      setError(
        errorBusqueda.response?.data?.mensaje || 'No se pudo buscar el producto'
      );
      enfocarBusqueda();
    }
  };

  const handleBusquedaKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    await buscarYAgregarRapido();
  };

  const cambiarCantidad = (id, valor) => {
    setError('');

    setCarrito((prev) =>
      prev.map((item) => {
        if (item.producto !== id) return item;

        if (valor === '') {
          return { ...item, cantidad: '' };
        }

        const numero = Number(valor);

        if (Number.isNaN(numero)) return item;
        if (numero < 0) return item;

        if (numero > item.stockDisponible) {
          setError(`La cantidad máxima para ${item.nombre} es ${item.stockDisponible}.`);
          return { ...item, cantidad: String(item.stockDisponible) };
        }

        return { ...item, cantidad: String(numero) };
      })
    );
  };

  const incrementarCantidad = (id) => {
    setError('');

    setCarrito((prev) =>
      prev.map((item) => {
        if (item.producto !== id) return item;

        const actual = Number(item.cantidad || 0);
        if (actual >= item.stockDisponible) {
          setError(`La cantidad máxima para ${item.nombre} es ${item.stockDisponible}.`);
          return item;
        }

        return { ...item, cantidad: String(actual + 1) };
      })
    );
  };

  const disminuirCantidad = (id) => {
    setError('');

    setCarrito((prev) =>
      prev.map((item) => {
        if (item.producto !== id) return item;

        const actual = Number(item.cantidad || 0);
        if (actual <= 0) return { ...item, cantidad: '' };
        if (actual === 1) return { ...item, cantidad: '' };

        return { ...item, cantidad: String(actual - 1) };
      })
    );
  };

  const cambiarDescuento = (id, valor) => {
    setError('');

    setCarrito((prev) =>
      prev.map((item) => {
        if (item.producto !== id) return item;

        if (valor === '') {
          return { ...item, descuento: '' };
        }

        const numero = Number(valor);

        if (Number.isNaN(numero)) return item;
        if (numero < 0) return { ...item, descuento: '0' };
        if (numero > 100) return { ...item, descuento: '100' };

        return { ...item, descuento: String(numero) };
      })
    );
  };

  const quitarProducto = (id) => {
    setCarrito((prev) => prev.filter((item) => item.producto !== id));
  };

  const resumenCarrito = useMemo(() => {
    const detalle = carrito.map((item) => {
      const cantidad = Number(item.cantidad || 0);
      const descuento = esModoCotizacion ? 0 : Number(item.descuento || 0);
      const subtotalBruto = item.precio * cantidad;
      const montoDescuento = subtotalBruto * (descuento / 100);
      const subtotalFinal = subtotalBruto - montoDescuento;

      return {
        ...item,
        cantidadNumero: cantidad,
        descuentoNumero: descuento,
        subtotalBruto,
        montoDescuento,
        subtotalFinal,
      };
    });

    const total = detalle.reduce((acc, item) => acc + item.subtotalFinal, 0);
    const descuentoAcumulado = detalle.reduce((acc, item) => acc + item.montoDescuento, 0);

    return { detalle, total, descuentoAcumulado };
  }, [carrito, esModoCotizacion]);

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
    if (!ticketVenta) return;

    const ventana = window.open('', '_blank', 'width=420,height=720');

    if (!ventana) {
      setError('No se pudo abrir la ventana de impresión. Revisa el bloqueador de ventanas.');
      return;
    }

    ventana.document.open();
    ventana.document.write(construirHtmlTicket80mm(ticketVenta));
    ventana.document.close();
  };

  const descargarTicketPDF = async () => {
    if (!ticketVenta) return;

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

      ticketVenta.productos.forEach((item) => {
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

    imprimirDato('Ticket', ticketVenta.numeroTicket);
    imprimirDato('Usuario', ticketVenta.usuario);
    imprimirDato('Fecha', ticketVenta.fecha);
    imprimirDato('Hora', ticketVenta.hora);
    imprimirDato('Pago', ticketVenta.metodoPago);

    y += 1;
    doc.line(6, y, pageWidth - 6, y);
    y += 5;

    ticketVenta.productos.forEach((item) => {
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
    doc.text(formatearMoneda(ticketVenta.total), pageWidth - 6, y, { align: 'right' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Gracias por tu compra', pageWidth / 2, y, { align: 'center' });

    doc.save(`ticket_${ticketVenta.numeroTicket}.pdf`);
  };

  const exportarCotizacionPDF = async () => {
    setError('');
    setMensajeExito('');

    if (resumenCarrito.detalle.length === 0) {
      setError('Agrega al menos un producto para generar la cotización.');
      return;
    }

    const itemsInvalidos = resumenCarrito.detalle.filter(
      (item) => item.cantidadNumero <= 0
    );

    if (itemsInvalidos.length > 0) {
      setError('Todos los productos de la cotización deben tener una cantidad mayor a 0.');
      return;
    }

    let logoDataUrl = null;

    try {
      logoDataUrl = await cargarImagenComoDataURL('/logo.png');
    } catch {
      logoDataUrl = null;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const fechaActual = new Date();

    const tituloPdf = nombreClienteCotizacion.trim()
      ? `Cotización para ${nombreClienteCotizacion.trim()}`
      : 'Cotización';

    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 38, 'F');

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 14, 8, 28, 18);
    }

    const lineasTitulo = doc.splitTextToSize(tituloPdf, pageWidth - 56 - 14);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(lineasTitulo, 48, 15);

    const ySubtexto = 15 + lineasTitulo.length * 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Hilos en Nogada', 48, ySubtexto + 1);
    doc.text(`Generada: ${fechaActual.toLocaleString('es-MX')}`, 48, ySubtexto + 7);

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Datos de la cotización', 14, 50);

    const datos = [
      ['Folio', folioCotizacion],
      ['Cliente', nombreClienteCotizacion.trim() || 'Cotización POS'],
      ['Fecha', fechaCotizacion || obtenerFechaHoyISO()],
      ['Vigencia', vigenciaCotizacion.trim() || 'Sin especificar'],
    ];

    autoTable(doc, {
      startY: 54,
      body: datos,
      theme: 'grid',
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 10,
        cellPadding: 3,
        textColor: [31, 41, 55],
      },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [245, 243, 255], cellWidth: 38 },
        1: { cellWidth: 'auto' },
      },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Cantidad', 'Código', 'Producto', 'Precio unitario', 'Subtotal']],
      body: resumenCarrito.detalle.map((item) => [
        Number(item.cantidadNumero || 0),
        item.codigo || '—',
        item.nombre || '—',
        formatearMoneda(item.precio || 0),
        formatearMoneda(item.subtotalBruto || 0),
      ]),
      theme: 'grid',
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [91, 33, 182],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
    });

    const yFinal = doc.lastAutoTable.finalY + 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(31, 41, 55);
    doc.text(`Total cotización: ${formatearMoneda(resumenCarrito.total)}`, 14, yFinal);

    doc.save(`${folioCotizacion}.pdf`);
  };

  const guardarCotizacionEnHistorial = async () => {
    setError('');
    setMensajeExito('');

    if (!esModoCotizacion) return;

    if (resumenCarrito.detalle.length === 0) {
      setError('Agrega al menos un producto para guardar la cotización.');
      return;
    }

    const itemsInvalidos = resumenCarrito.detalle.filter(
      (item) => item.cantidadNumero <= 0
    );

    if (itemsInvalidos.length > 0) {
      setError('Todos los productos de la cotización deben tener una cantidad mayor a 0.');
      return;
    }

    try {
      setGuardandoCotizacion(true);

      const payload = {
        origen: 'pos_cotizacion_simple',
        prefijoFolio: 'CV',
        formato: 'ventas',
        tipo: 'COMPRA',
        cliente: nombreClienteCotizacion.trim() || 'Cotización POS',
        telefono: '',
        fechaCotizacion: fechaCotizacion || obtenerFechaHoyISO(),
        vigencia: vigenciaCotizacion.trim(),
        notas: 'Cotización generada desde POS con datos reales del inventario.',
        items: resumenCarrito.detalle.map((item) => ({
          productoId: item.producto,
          nombreProducto: item.nombre || '',
          codigo: item.codigo || '',
          categoria: item.categoria || '',
          imagenUrl: item.imagenUrl || '',
          stock: Number(item.stockDisponible || 0),
          cantidad: Number(item.cantidadNumero || 0),
          precioUnitario: Number(item.precio || 0),
          descuento: 0,
        })),
      };

      const { data } = await api.post('/cotizaciones', payload);
      const folioGenerado = data?.folio || folioCotizacion;

      setFolioCotizacion(folioGenerado);
      setMensajeExito(`Cotización ${folioGenerado} guardada en historial.`);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.mensaje ||
          'No se pudo guardar la cotización en historial.'
      );
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  const mandarCotizacionAVentas = () => {
    setError('');
    setMensajeExito('Cotización preparada para venta.');

    setCotizacionActiva({
      origen: 'pos_cotizacion_simple',
      formato: 'ventas',
      cliente: nombreClienteCotizacion.trim() || 'Cotización POS',
      fechaCotizacion: fechaCotizacion || obtenerFechaHoyISO(),
      vigencia: vigenciaCotizacion.trim(),
      notas: 'Cotización generada desde POS',
      total: Number(resumenCarrito.total || 0),
    });

    setModoPantalla(MODOS_PANTALLA.VENTA);
    enfocarBusqueda();
  };

  const finalizarVenta = async () => {
    setError('');
    setMensajeExito('');

    if (carrito.length === 0) {
      setError('Agrega al menos un producto al carrito.');
      return;
    }

    const itemsInvalidos = resumenCarrito.detalle.filter((item) => item.cantidadNumero <= 0);

    if (itemsInvalidos.length > 0) {
      setError('Todos los productos del carrito deben tener una cantidad mayor a 0.');
      return;
    }

    try {
      setProcesandoVenta(true);

      const payload = {
        productos: resumenCarrito.detalle.map((item) => ({
          producto: item.producto,
          cantidad: item.cantidadNumero,
          descuentoPorcentaje: item.descuentoNumero,
          precioUnitario: Number(item.precio || 0),
          nombreProducto: item.nombre || '',
          codigoProducto: item.codigo || '',
          categoriaProducto: item.categoria || '',
          subtotalBruto: Number(item.subtotalBruto || 0),
          montoDescuento: Number(item.montoDescuento || 0),
          subtotalFinal: Number(item.subtotalFinal || 0),
          pieza: item.pieza || '',
        })),
        metodoPago,
        origenCotizacion: Boolean(cotizacionActiva),
        cotizacion: cotizacionActiva
          ? {
              cliente: cotizacionActiva.cliente || '',
              fechaCotizacion: cotizacionActiva.fechaCotizacion || '',
              vigencia: cotizacionActiva.vigencia || '',
              notas: cotizacionActiva.notas || '',
              totalCotizacion: Number(cotizacionActiva.total || resumenCarrito.total || 0),
            }
          : null,
      };

      const { data } = await api.post('/ventas', payload);
      const ventaCreada = data?.venta || data || {};

      const ticket = construirTicketDesdeVenta({
        venta: ventaCreada,
        detalle: resumenCarrito.detalle,
        metodoPago,
        usuario,
      });

      setTicketVenta(ticket);
      setCarrito([]);
      carritoRef.current = [];
      setCotizacionActiva(null);
      setMetodoPago('efectivo');
      setBusqueda('');
      setBusquedaAplicada('');
      setPaginaActual(1);
      setModoPantalla(MODOS_PANTALLA.VENTA);
      setNombreClienteCotizacion('');
      setFechaCotizacion(obtenerFechaHoyISO());
      setVigenciaCotizacion('');
      setFolioCotizacion(FOLIO_PROVISIONAL);

      try {
        sessionStorage.removeItem('cotizacionVentaParaPOS');
      } catch (errorStorage) {
        console.error('No se pudo limpiar la cotización temporal:', errorStorage);
      }

      await cargarProductos({ page: 1, q: '' });
      enfocarBusqueda();
    } catch (err) {
      setError(
        err?.response?.data?.mensaje ||
          err?.response?.data?.message ||
          'No se pudo registrar la venta. Intenta nuevamente.'
      );
    } finally {
      setProcesandoVenta(false);
    }
  };

  if (!puede(PERMISOS.REGISTRAR_VENTAS)) {
    return (
      <Layout>
        <Header title="Punto de Venta" />
        <div className="card p-5">No tienes permiso para registrar ventas.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Header title="Punto de Venta" />

      <div className="space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
                  {esModoCotizacion ? 'Cotización' : 'Caja de venta'}
                </h3>

                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    esModoCotizacion
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}
                >
                  {esModoCotizacion ? 'Modo cotización' : 'Modo ventas'}
                </span>
              </div>

              <p className="mt-1 text-sm text-gray-500">
                {esModoCotizacion
                  ? 'Cotización con precios y stock reales del inventario. Solo se modifica la cantidad.'
                  : 'Busca productos, aplica descuentos y registra ventas'}
              </p>
            </div>

            <div className="w-full xl:w-[380px]">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  ref={inputBusquedaRef}
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  placeholder="Escribe código HEN0000 o nombre"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={handleBusquedaKeyDown}
                />
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Escribe el código completo con formato HEN0000 o el nombre del producto y
                presiona Enter. Si hay varias coincidencias, selecciónalo del catálogo.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {!esModoCotizacion ? (
              <button
                type="button"
                onClick={abrirScanner}
                className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                Escanear código
              </button>
            ) : null}

            {esModoCotizacion ? (
              <>
                <button
                  type="button"
                  onClick={volverAModoVenta}
                  className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Volver a ventas
                </button>

                <button
                  type="button"
                  onClick={nuevaCotizacion}
                  className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                >
                  Nueva cotización
                </button>

                <button
                  type="button"
                  onClick={guardarCotizacionEnHistorial}
                  disabled={guardandoCotizacion}
                  className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                >
                  {guardandoCotizacion ? 'Guardando...' : 'Guardar en historial'}
                </button>

                <button
                  type="button"
                  onClick={exportarCotizacionPDF}
                  className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                >
                  Exportar cotización PDF
                </button>

                <button
                  type="button"
                  onClick={mandarCotizacionAVentas}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  Mandar cotización a ventas
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={abrirModoCotizacion}
                className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-800"
              >
                Realizar cotización
              </button>
            )}
          </div>

          {mensajeExito ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {mensajeExito}
            </div>
          ) : null}

          {esModoCotizacion ? (
            <>
              <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                <div className="grid grid-cols-1 gap-2 text-sm text-violet-700 md:grid-cols-3">
                  <p>
                    <strong>Folio:</strong> {folioCotizacion}
                  </p>
                  <p>
                    <strong>Usuario:</strong> {obtenerNombreUsuario(usuario)}
                  </p>
                  <p>
                    <strong>Regla:</strong> Solo se puede modificar la cantidad
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5">
                <div className="mb-4">
                  <h4 className="text-base font-bold text-gray-900 sm:text-lg">
                    Datos de la cotización
                  </h4>
                  <p className="mt-1 text-sm text-gray-500">
                    Estos datos se guardarán en historial y aparecerán en el PDF.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Cliente
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      placeholder="Nombre del cliente"
                      value={nombreClienteCotizacion}
                      onChange={(e) => setNombreClienteCotizacion(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Fecha
                    </label>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      value={fechaCotizacion}
                      onChange={(e) => setFechaCotizacion(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Vigencia
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      placeholder="Ej. 7 días"
                      value={vigenciaCotizacion}
                      onChange={(e) => setVigenciaCotizacion(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {cotizacionActiva && !esModoCotizacion ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-sm font-semibold text-emerald-800">
                Cotización cargada en punto de venta
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-emerald-700 md:grid-cols-3">
                <p>
                  <strong>Cliente:</strong> {cotizacionActiva.cliente || 'Sin especificar'}
                </p>
                <p>
                  <strong>Fecha:</strong> {cotizacionActiva.fechaCotizacion || 'Sin especificar'}
                </p>
                <p>
                  <strong>Vigencia:</strong> {cotizacionActiva.vigencia || 'Sin especificar'}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.02fr_1.18fr] xl:items-start">
          <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 xl:sticky xl:top-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    esModoCotizacion
                      ? 'bg-violet-50 text-violet-700'
                      : 'bg-indigo-50 text-indigo-700'
                  }`}
                >
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 sm:text-xl">
                    {esModoCotizacion ? 'Cotización' : 'Carrito'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {resumenCarrito.detalle.length} producto(s)
                  </p>
                </div>
              </div>
            </div>

            {error ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="max-h-[360px] space-y-3 overflow-auto pr-1 sm:max-h-[430px]">
              {resumenCarrito.detalle.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 py-12 text-center">
                  <p className="text-base font-medium text-gray-700">
                    {esModoCotizacion ? 'La cotización está vacía' : 'El carrito está vacío'}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {esModoCotizacion
                      ? 'Agrega productos para comenzar la cotización'
                      : 'Agrega productos para comenzar'}
                  </p>
                </div>
              ) : (
                resumenCarrito.detalle.map((item) => (
                  <div
                    key={item.producto}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      {renderImagenProducto(
                        item.imagenUrl,
                        item.nombre,
                        'h-14 w-14 shrink-0',
                        16
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800">
                              {item.nombre}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.codigo || '—'} · {item.categoria || 'General'}
                            </p>
                          </div>

                          <button
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 transition hover:bg-red-100"
                            onClick={() => quitarProducto(item.producto)}
                            type="button"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {item.pieza ? (
                          <p className="mt-2 text-xs text-gray-500">Pieza: {item.pieza}</p>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className={`mt-4 grid grid-cols-1 gap-3 ${
                        esModoCotizacion ? 'sm:grid-cols-1' : 'sm:grid-cols-2'
                      }`}
                    >
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Cantidad
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
                            onClick={() => disminuirCantidad(item.producto)}
                          >
                            <Minus size={15} />
                          </button>

                          <input
                            className="input h-11 text-center"
                            type="number"
                            min="1"
                            max={item.stockDisponible}
                            placeholder="0"
                            value={item.cantidad}
                            onChange={(e) => cambiarCantidad(item.producto, e.target.value)}
                          />

                          <button
                            type="button"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
                            onClick={() => incrementarCantidad(item.producto)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>

                      {!esModoCotizacion ? (
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Descuento %
                          </label>
                          <div className="relative">
                            <Percent
                              size={16}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                              className="input h-11 pr-9"
                              type="number"
                              min="0"
                              max="100"
                              placeholder="0"
                              value={item.descuento}
                              onChange={(e) => cambiarDescuento(item.producto, e.target.value)}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div
                      className={`mt-4 grid gap-2 text-sm ${
                        esModoCotizacion ? 'grid-cols-3' : 'grid-cols-2'
                      }`}
                    >
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-gray-500">Unitario</p>
                        <p className="mt-1 font-semibold text-gray-800">
                          ${item.precio.toFixed(2)}
                        </p>
                      </div>

                      {esModoCotizacion ? (
                        <div className="rounded-xl bg-white px-3 py-3">
                          <p className="text-gray-500">Stock actual</p>
                          <p className="mt-1 font-semibold text-gray-800">
                            {item.stockDisponible}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-white px-3 py-3">
                          <p className="text-gray-500">Subtotal</p>
                          <p className="mt-1 font-semibold text-gray-800">
                            ${item.subtotalBruto.toFixed(2)}
                          </p>
                        </div>
                      )}

                      {!esModoCotizacion ? (
                        <div className="rounded-xl bg-white px-3 py-3">
                          <p className="text-amber-700">Descuento</p>
                          <p className="mt-1 font-semibold text-amber-700">
                            - ${item.montoDescuento.toFixed(2)}
                          </p>
                        </div>
                      ) : null}

                      <div
                        className={`rounded-xl px-3 py-3 ${
                          esModoCotizacion
                            ? 'bg-violet-700 text-white'
                            : 'bg-slate-900 text-white'
                        }`}
                      >
                        <p className={esModoCotizacion ? 'text-violet-200' : 'text-slate-300'}>
                          {esModoCotizacion ? 'Subtotal cotización' : 'Total'}
                        </p>
                        <p className="mt-1 font-semibold">
                          $
                          {(
                            esModoCotizacion ? item.subtotalBruto : item.subtotalFinal
                          ).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {!esModoCotizacion ? (
              <>
                <div className="mt-5">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Método de pago
                  </label>
                  <div className="relative">
                    <CreditCard
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <select
                      className="input h-11 appearance-none"
                      style={{ paddingLeft: '3rem', paddingRight: '2.75rem' }}
                      value={metodoPago}
                      onChange={(e) => setMetodoPago(e.target.value)}
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
                  <p className="text-sm text-gray-500">Total de la venta</p>
                  <h4 className="mt-2 break-words text-3xl font-bold text-gray-900 sm:text-4xl">
                    ${resumenCarrito.total.toFixed(2)}
                  </h4>

                  <button
                    className="mt-4 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={finalizarVenta}
                    disabled={procesandoVenta}
                  >
                    {procesandoVenta ? 'Procesando venta...' : 'Finalizar venta'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <p className="text-sm text-violet-700">Total de la cotización</p>
                <h4 className="mt-2 break-words text-3xl font-bold text-violet-900 sm:text-4xl">
                  ${resumenCarrito.total.toFixed(2)}
                </h4>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={nuevaCotizacion}
                    className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                  >
                    Nueva
                  </button>

                  <button
                    type="button"
                    onClick={guardarCotizacionEnHistorial}
                    disabled={guardandoCotizacion}
                    className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                  >
                    {guardandoCotizacion ? 'Guardando...' : 'Guardar historial'}
                  </button>

                  <button
                    type="button"
                    onClick={exportarCotizacionPDF}
                    className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                  >
                    Exportar PDF
                  </button>

                  <button
                    type="button"
                    onClick={mandarCotizacionAVentas}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95"
                  >
                    Mandar a ventas
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800 sm:text-xl">
                  {esModoCotizacion ? 'Catálogo para cotización' : 'Catálogo'}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {esModoCotizacion
                    ? 'Selecciona productos del inventario actual para agregarlos a la cotización'
                    : 'Haz clic en un producto para agregarlo al carrito'}
                </p>
              </div>

              {totalProductos > 0 ? (
                <p className="text-sm text-gray-500">
                  Mostrando{' '}
                  <span className="font-semibold text-gray-700">
                    {(paginaActual - 1) * PRODUCTOS_POR_PAGINA + 1}
                  </span>
                  {' - '}
                  <span className="font-semibold text-gray-700">
                    {Math.min(paginaActual * PRODUCTOS_POR_PAGINA, totalProductos)}
                  </span>{' '}
                  de <span className="font-semibold text-gray-700">{totalProductos}</span>{' '}
                  productos
                </p>
              ) : null}
            </div>

            {errorCarga ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorCarga}
              </div>
            ) : null}

            {cargandoCatalogo ? (
              <Loader />
            ) : productos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center">
                <p className="text-lg font-semibold text-gray-700">No hay productos disponibles</p>
                <p className="mt-2 text-sm text-gray-500">
                  Intenta con otra búsqueda o revisa el inventario
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {productos.map((producto) => (
                    <button
                      key={producto._id}
                      type="button"
                      onClick={() => agregarProducto(producto)}
                      className="rounded-3xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {renderImagenProducto(
                          producto.imagenUrl,
                          producto.nombre,
                          'h-14 w-14 shrink-0 sm:h-16 sm:w-16',
                          20
                        )}

                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm">
                          {producto.categoria || 'General'}
                        </span>
                      </div>

                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">
                          Código: {producto.codigo || '—'}
                        </p>

                        <h4 className="mt-1 text-base font-semibold leading-snug text-gray-800 sm:text-lg">
                          {producto.nombre}
                        </h4>

                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-xs text-gray-500">Precio</p>
                            <p className="text-xl font-bold text-indigo-600 sm:text-2xl">
                              ${Number(producto.precio).toFixed(2)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-xs text-gray-500">Stock</p>
                            <p className="text-sm font-semibold text-gray-700">
                              {producto.stock}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setPaginaActual((prev) => Math.max(prev - 1, 1))}
                    disabled={paginaActual === 1 || cargandoCatalogo}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <div className="flex items-center justify-center">
                    <span className="text-sm text-gray-600">
                      Página <span className="font-semibold text-gray-800">{paginaActual}</span> de{' '}
                      <span className="font-semibold text-gray-800">{totalPaginas}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPaginaActual((prev) => Math.min(prev + 1, totalPaginas))}
                    disabled={paginaActual === totalPaginas || cargandoCatalogo}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {ticketVenta ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-2 backdrop-blur-sm sm:p-4">
          <div className="mx-auto flex h-full max-w-6xl items-center justify-center">
            <div className="max-h-full w-full overflow-y-auto rounded-[28px] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 sm:h-11 sm:w-11">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 sm:text-xl">Ticket generado</h3>
                    <p className="text-sm text-gray-500">
                      La venta se registró correctamente
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTicketVenta(null);
                    enfocarBusqueda();
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
                <div className="border-b border-gray-100 bg-gray-50 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                  <div className="mx-auto w-full max-w-[300px] rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
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
                          {ticketVenta.numeroTicket}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Usuario</span>
                        <span className="text-right font-semibold text-gray-900">
                          {ticketVenta.usuario}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Fecha</span>
                        <span className="font-semibold text-gray-900">{ticketVenta.fecha}</span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Hora</span>
                        <span className="font-semibold text-gray-900">{ticketVenta.hora}</span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Pago</span>
                        <span className="font-semibold text-gray-900">
                          {ticketVenta.metodoPago}
                        </span>
                      </div>
                    </div>

                    <div className="my-4 border-t border-dashed border-gray-300" />

                    <div className="space-y-3">
                      {ticketVenta.productos.map((item, index) => (
                        <div key={`${item.nombre}-${index}`} className="border-b border-dashed border-gray-200 pb-3 last:border-b-0 last:pb-0">
                          <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
                            <span>
                              {item.cantidad} x {formatearMoneda(item.precioUnitario)}
                            </span>
                            <span className="font-semibold text-gray-800">
                              {formatearMoneda(item.subtotal)}
                            </span>
                          </div>
                          {Number(item.montoDescuento || 0) > 0 ? (
                            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-amber-700">
                              <span>Descuento {Number(item.descuento || 0).toFixed(2)}%</span>
                              <span>- {formatearMoneda(item.montoDescuento)}</span>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="my-4 border-t border-dashed border-gray-300" />

                    <div className="flex items-center justify-between gap-3 text-base font-bold text-gray-900">
                      <span>Total</span>
                      <span>{formatearMoneda(ticketVenta.total)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6 lg:p-8">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={imprimirTicket80mm}
                      className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-left transition hover:bg-indigo-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                          <Printer size={18} />
                        </div>
                        <div>
                          <p className="font-semibold text-indigo-900">Imprimir ticket 80mm</p>
                          <p className="text-sm text-indigo-700">
                            Abrir ticket listo para impresora térmica
                          </p>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={descargarTicketPDF}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-left transition hover:bg-emerald-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="font-semibold text-emerald-900">Descargar PDF</p>
                          <p className="text-sm text-emerald-700">
                            Guardar una copia del ticket en PDF
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
                    <p className="text-sm font-medium text-gray-700">Resumen rápido</p>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white px-4 py-4">
                        <p className="text-xs text-gray-500">Productos vendidos</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {ticketVenta.productos.reduce(
                            (acc, item) => acc + Number(item.cantidad || 0),
                            0
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-4">
                        <p className="text-xs text-gray-500">Descuento aplicado</p>
                        <p className="mt-1 text-2xl font-bold text-amber-700">
                          {formatearMoneda(
                            ticketVenta.productos.reduce(
                              (acc, item) => acc + Number(item.montoDescuento || 0),
                              0
                            )
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-900 px-4 py-4 text-white">
                        <p className="text-xs text-slate-300">Total cobrado</p>
                        <p className="mt-1 text-2xl font-bold">{formatearMoneda(ticketVenta.total)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setTicketVenta(null);
                        enfocarBusqueda();
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Cerrar
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTicketVenta(null);
                        enfocarBusqueda();
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Seguir vendiendo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mostrarScanner ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="absolute inset-0" onClick={cerrarScanner} />

          <div className="relative w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  Escanear código de barras
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Apunta la cámara trasera al código para consultar el producto.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition hover:bg-gray-200"
                onClick={cerrarScanner}
              >
                <X size={18} />
              </button>
            </div>

            {errorScanner ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorScanner}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-black">
              <Suspense fallback={<div className="p-6 text-center text-sm text-white">Cargando escáner…</div>}>
                <QrScanner
                  onScan={(detectedCodes) => {
                    const code = detectedCodes?.[0]?.rawValue;
                    if (code) {
                      void consultarProductoEscaneado(code);
                    }
                  }}
                  onError={(scannerError) => {
                    setErrorScanner(
                      scannerError?.message || 'No se pudo acceder a la cámara'
                    );
                  }}
                  formats={BARCODE_FORMATS}
                  constraints={{
                    facingMode: 'environment',
                  }}
                  components={{
                    finder: true,
                    torch: true,
                    zoom: true,
                  }}
                  paused={consultandoCodigo}
                  scanDelay={1000}
                  allowMultiple={false}
                  styles={{
                    container: { width: '100%' },
                    video: {
                      width: '100%',
                      height: 'auto',
                      objectFit: 'cover',
                    },
                  }}
                />
              </Suspense>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {consultandoCodigo
                  ? 'Consultando producto...'
                  : 'Al detectar un código válido se abrirá la consulta del producto.'}
              </p>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                onClick={cerrarScanner}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productoConsultado ? (
  <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-3 sm:p-4">
    <div className="absolute inset-0" onClick={cerrarModalConsulta} />

    <div className="relative w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6 md:p-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
            Consulta de producto
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Puedes solo consultar o añadirlo al carrito para capturar cantidad y descuento como venta normal
          </p>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition hover:bg-gray-200"
          onClick={cerrarModalConsulta}
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div className="flex justify-center sm:justify-start">
          {renderImagenProducto(
            productoConsultado.imagenUrl,
            productoConsultado.nombre,
            'h-28 w-28',
            22
          )}
        </div>

        <div className="space-y-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              {productoConsultado.codigo || 'Sin código'}
            </span>

            <h4 className="mt-3 text-2xl font-bold text-gray-900">
              {productoConsultado.nombre}
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              {productoConsultado.categoria || 'General'}
            </span>

            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                Number(productoConsultado.stock || 0) > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {Number(productoConsultado.stock || 0) > 0
                ? `Stock: ${productoConsultado.stock}`
                : 'Sin stock'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">Precio de venta</p>
              <p className="mt-1 text-lg font-bold text-indigo-700">
                {formatearMoneda(productoConsultado.precio || 0)}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">Stock disponible</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {Number(productoConsultado.stock || productoConsultado.stockDisponible || 0)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
            Si lo añades al carrito, aparecerá en el formulario de venta normal para que captures la cantidad y el descuento.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={agregarProductoDesdeModalScanner}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <ShoppingCart size={18} />
              Añadir al carrito
            </button>

            <button
              type="button"
              onClick={cerrarModalConsulta}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Solo consultar
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
