import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { api } from '../config/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Image as ImageIcon } from 'lucide-react';

const FORMATOS = {
  VENTA: 'ventas',
  CONSIGNACION: 'consignaciones',
};

const PREFIJOS_FOLIO = {
  [FORMATOS.VENTA]: 'CM',
  [FORMATOS.CONSIGNACION]: 'CG',
};

const obtenerFechaHoyISO = () => {
  const hoy = new Date();
  const offset = hoy.getTimezoneOffset();
  return new Date(hoy.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const normalizarFechaInput = (valor) => {
  if (!valor) return obtenerFechaHoyISO();

  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    return valor.slice(0, 10);
  }

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return obtenerFechaHoyISO();

  const offset = fecha.getTimezoneOffset();
  return new Date(fecha.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const escapeRegExp = (texto = '') => {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const obtenerTipoCotizacion = (formato) =>
  formato === FORMATOS.VENTA ? 'COMPRA' : 'CONSIGNACION';

const generarBaseFolio = (formato, fecha) => {
  const prefijo = PREFIJOS_FOLIO[formato] || 'CT';
  const fechaBase = fecha || obtenerFechaHoyISO();
  return `${prefijo}-${fechaBase}`;
};

const obtenerItemsDeCotizacion = (cotizacion) => {
  if (Array.isArray(cotizacion?.items)) return cotizacion.items;
  if (Array.isArray(cotizacion?.productos)) return cotizacion.productos;
  return [];
};

const initialItemForm = {
  productoId: '',
  nombreProducto: '',
  cantidad: '',
  precioUnitario: '',
  descuento: '',
  stock: '',
  incrementoPorcentaje: '',
  comisionClientePorcentaje: '',
  imagenUrl: '',
};

const initialNotasPorFormato = {
  [FORMATOS.VENTA]: '',
  [FORMATOS.CONSIGNACION]: '',
};

const initialDatosCotizacionPorFormato = {
  [FORMATOS.VENTA]: {
    nombreCliente: '',
    fechaCotizacion: obtenerFechaHoyISO(),
    vigencia: '',
  },
  [FORMATOS.CONSIGNACION]: {
    nombreCliente: '',
    fechaCotizacion: obtenerFechaHoyISO(),
    vigencia: '',
  },
};

export default function Cotizaciones() {
  const navigate = useNavigate();
  const autocompleteDesktopRef = useRef(null);
  const autocompleteModalRef = useRef(null);

  const [productos, setProductos] = useState([]);
  const [itemsPorFormato, setItemsPorFormato] = useState({
    [FORMATOS.VENTA]: [],
    [FORMATOS.CONSIGNACION]: [],
  });
  const [notasPorFormato, setNotasPorFormato] = useState(initialNotasPorFormato);
  const [datosCotizacionPorFormato, setDatosCotizacionPorFormato] = useState(
    initialDatosCotizacionPorFormato
  );
  const [formatoActivo, setFormatoActivo] = useState(FORMATOS.VENTA);
  const [itemForm, setItemForm] = useState(initialItemForm);
  const [editandoIndex, setEditandoIndex] = useState(null);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [indiceSugerenciaActiva, setIndiceSugerenciaActiva] = useState(-1);
  const [modalFormulario, setModalFormulario] = useState(false);
  const [modalHistorial, setModalHistorial] = useState(false);

  const [historialCotizaciones, setHistorialCotizaciones] = useState([]);
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [filtroHistorial, setFiltroHistorial] = useState('TODAS');
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);
  const [eliminandoId, setEliminandoId] = useState('');
  const [mensajeEstado, setMensajeEstado] = useState(null);

  const esFormatoVenta = formatoActivo === FORMATOS.VENTA;

  const items = useMemo(() => {
    return itemsPorFormato[formatoActivo] || [];
  }, [itemsPorFormato, formatoActivo]);

  const notas = useMemo(() => {
    return notasPorFormato[formatoActivo] || '';
  }, [notasPorFormato, formatoActivo]);

  const datosCotizacion = useMemo(() => {
    return (
      datosCotizacionPorFormato[formatoActivo] || {
        nombreCliente: '',
        fechaCotizacion: obtenerFechaHoyISO(),
        vigencia: '',
      }
    );
  }, [datosCotizacionPorFormato, formatoActivo]);

  const mostrarMensaje = useCallback((tipo, texto) => {
    setMensajeEstado({ tipo, texto });
  }, []);

  useEffect(() => {
    if (!mensajeEstado) return;

    const timeout = setTimeout(() => {
      setMensajeEstado(null);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [mensajeEstado]);

  useEffect(() => {
    const cargarProductos = async () => {
      try {
        const { data } = await api.get('/productos');
        setProductos(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error al cargar productos:', error);
        setProductos([]);
        mostrarMensaje('error', 'No se pudieron cargar los productos.');
      }
    };

    cargarProductos();
  }, [mostrarMensaje]);

  const cargarHistorial = useCallback(async () => {
    try {
      setCargandoHistorial(true);

      const params = {};

      if (String(busquedaHistorial || '').trim()) {
        params.q = String(busquedaHistorial || '').trim();
      }

      if (filtroHistorial !== 'TODAS') {
        params.formato = filtroHistorial;
      }

      const { data } = await api.get('/cotizaciones', { params });
      setHistorialCotizaciones(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar historial de cotizaciones:', error);
      setHistorialCotizaciones([]);
      mostrarMensaje(
        'error',
        error?.response?.data?.mensaje || 'No se pudo cargar el historial.'
      );
    } finally {
      setCargandoHistorial(false);
    }
  }, [busquedaHistorial, filtroHistorial, mostrarMensaje]);

  useEffect(() => {
    if (!modalHistorial) return;

    const timeout = setTimeout(() => {
      cargarHistorial();
    }, 300);

    return () => clearTimeout(timeout);
  }, [cargarHistorial, modalHistorial]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickDentroDesktop =
        autocompleteDesktopRef.current &&
        autocompleteDesktopRef.current.contains(event.target);

      const clickDentroModal =
        autocompleteModalRef.current &&
        autocompleteModalRef.current.contains(event.target);

      if (!clickDentroDesktop && !clickDentroModal) {
        setMostrarSugerencias(false);
        setIndiceSugerenciaActiva(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const cerrarModalFormulario = useCallback(() => {
    setModalFormulario(false);
    setItemForm(initialItemForm);
    setEditandoIndex(null);
    setMostrarSugerencias(false);
    setIndiceSugerenciaActiva(-1);
  }, []);

  const cerrarModalHistorial = useCallback(() => {
    setModalHistorial(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;

      if (modalHistorial) {
        cerrarModalHistorial();
        return;
      }

      if (modalFormulario) {
        cerrarModalFormulario();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalFormulario, modalHistorial, cerrarModalFormulario, cerrarModalHistorial]);

  useEffect(() => {
    if (modalFormulario || modalHistorial) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [modalFormulario, modalHistorial]);

  const formatearFecha = (fecha) => {
    if (!fecha) return 'Sin especificar';

    const fechaNormalizada = normalizarFechaInput(fecha);
    const [year, month, day] = fechaNormalizada.split('-');

    if (!year || !month || !day) return String(fecha);
    return `${day}/${month}/${year}`;
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

  const resetItemForm = () => {
    setItemForm(initialItemForm);
    setEditandoIndex(null);
    setMostrarSugerencias(false);
    setIndiceSugerenciaActiva(-1);
  };

  const abrirModalNuevoProducto = () => {
    resetItemForm();
    setModalFormulario(true);
  };

  const abrirModalHistorial = () => {
    setModalHistorial(true);
  };

  const cambiarFormato = () => {
    setFormatoActivo((prev) =>
      prev === FORMATOS.VENTA ? FORMATOS.CONSIGNACION : FORMATOS.VENTA
    );
    resetItemForm();
    setModalFormulario(false);
  };

  const actualizarItemsDelFormato = (callback) => {
    setItemsPorFormato((prev) => ({
      ...prev,
      [formatoActivo]: callback(prev[formatoActivo] || []),
    }));
  };

  const actualizarNotas = (value) => {
    setNotasPorFormato((prev) => ({
      ...prev,
      [formatoActivo]: value,
    }));
  };

  const actualizarDatoCotizacion = (field, value) => {
    setDatosCotizacionPorFormato((prev) => ({
      ...prev,
      [formatoActivo]: {
        ...prev[formatoActivo],
        [field]: value,
      },
    }));
  };

  const actualizarCampoForm = (field, value) => {
    setItemForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const textoBusquedaProducto = useMemo(() => {
    return String(itemForm.nombreProducto || '').trim();
  }, [itemForm.nombreProducto]);

  const productosFiltrados = useMemo(() => {
    const texto = textoBusquedaProducto.toLowerCase();

    if (!texto) return [];

    return productos
      .map((producto) => {
        const nombre = String(producto.nombre || '').toLowerCase();
        const codigo = String(producto.codigo || '').toLowerCase();
        const categoria = String(producto.categoria || '').toLowerCase();

        let prioridad = 999;

        if (nombre.startsWith(texto)) prioridad = 0;
        else if (nombre.includes(texto)) prioridad = 1;
        else if (codigo.includes(texto)) prioridad = 2;
        else if (categoria.includes(texto)) prioridad = 3;

        return {
          ...producto,
          prioridad,
        };
      })
      .filter((producto) => producto.prioridad !== 999)
      .sort((a, b) => {
        if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
          sensitivity: 'base',
        });
      })
      .slice(0, 8);
  }, [productos, textoBusquedaProducto]);

  useEffect(() => {
    setIndiceSugerenciaActiva((prev) => {
      if (!mostrarSugerencias || !productosFiltrados.length) return -1;
      if (prev >= productosFiltrados.length) return 0;
      return prev;
    });
  }, [productosFiltrados, mostrarSugerencias]);

  const actualizarProducto = (value) => {
    const texto = String(value || '').toLowerCase().trim();

    const productoEncontrado = productos.find(
      (producto) => String(producto.nombre || '').toLowerCase().trim() === texto
    );

    setItemForm((prev) => ({
      ...prev,
      productoId: productoEncontrado?._id || '',
      nombreProducto: value,
      stock: productoEncontrado?.stock ?? '',
      imagenUrl: productoEncontrado?.imagenUrl || '',
    }));

    setMostrarSugerencias(Boolean(texto));
    setIndiceSugerenciaActiva(-1);
  };

  const seleccionarProducto = (producto) => {
    setItemForm((prev) => ({
      ...prev,
      productoId: producto._id || '',
      nombreProducto: producto.nombre || '',
      stock: producto.stock ?? '',
      imagenUrl: producto.imagenUrl || '',
    }));
    setMostrarSugerencias(false);
    setIndiceSugerenciaActiva(-1);
  };

  const manejarTeclasProducto = (e) => {
    if (!mostrarSugerencias || !productosFiltrados.length) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMostrarSugerencias(false);
        setIndiceSugerenciaActiva(-1);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSugerenciaActiva((prev) =>
        prev < productosFiltrados.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSugerenciaActiva((prev) =>
        prev > 0 ? prev - 1 : productosFiltrados.length - 1
      );
      return;
    }

    if (e.key === 'Enter' && indiceSugerenciaActiva >= 0) {
      e.preventDefault();
      seleccionarProducto(productosFiltrados[indiceSugerenciaActiva]);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setMostrarSugerencias(false);
      setIndiceSugerenciaActiva(-1);
    }
  };

  const resaltarCoincidencia = (texto, termino) => {
    const textoBase = String(texto || '');
    const terminoBase = String(termino || '').trim();

    if (!terminoBase) return textoBase;

    const regex = new RegExp(`(${escapeRegExp(terminoBase)})`, 'ig');
    const partes = textoBase.split(regex);

    return partes.map((parte, index) => {
      const esMatch = parte && parte.toLowerCase() === terminoBase.toLowerCase();

      if (esMatch) {
        return (
          <mark
            key={`${parte}-${index}`}
            className="rounded bg-amber-100 px-0.5 text-inherit"
          >
            {parte}
          </mark>
        );
      }

      return <span key={`${parte}-${index}`}>{parte}</span>;
    });
  };

  const productoValido = useMemo(() => {
    return !!itemForm.productoId;
  }, [itemForm.productoId]);

  const calcularLineaVenta = (item) => {
    const cantidad = Number(item.cantidad) || 0;
    const precioUnitario = Number(item.precioUnitario) || 0;
    const descuentoPorcentaje = Number(item.descuento) || 0;

    const subtotal = cantidad * precioUnitario;
    const descuentoMonto = subtotal * (descuentoPorcentaje / 100);
    const totalLinea = Math.max(subtotal - descuentoMonto, 0);

    return {
      subtotal,
      descuentoMonto,
      totalLinea,
    };
  };

  const calcularLineaConsignacion = (item) => {
    const cantidad = Number(item.cantidad) || 0;
    const precioUnitario = Number(item.precioUnitario) || 0;
    const incrementoPorcentaje = Number(item.incrementoPorcentaje) || 0;
    const comisionClientePorcentaje =
      Number(item.comisionClientePorcentaje) || 0;

    const incrementoValor = precioUnitario * (incrementoPorcentaje / 100);
    const nuevoPrecio = precioUnitario + incrementoValor;
    const precioRedondeado = Math.ceil(nuevoPrecio);
    const valorComisionCliente =
      precioRedondeado * (comisionClientePorcentaje / 100);
    const gananciaHilos = Math.max(precioRedondeado - valorComisionCliente, 0);

    const totalCotizacionLinea = cantidad * precioRedondeado;
    const totalGananciaCliente = cantidad * valorComisionCliente;
    const totalGananciaHilos = cantidad * gananciaHilos;

    return {
      incrementoValor,
      nuevoPrecio,
      precioRedondeado,
      valorComisionCliente,
      comisionClientePorcentaje,
      gananciaHilos,
      totalCotizacionLinea,
      totalGananciaCliente,
      totalGananciaHilos,
    };
  };

  const subtotalForm = useMemo(() => {
    const cantidad = Number(itemForm.cantidad) || 0;
    const precioUnitario = Number(itemForm.precioUnitario) || 0;
    return cantidad * precioUnitario;
  }, [itemForm.cantidad, itemForm.precioUnitario]);

  const descuentoMontoForm = useMemo(() => {
    const descuentoPorcentaje = Number(itemForm.descuento) || 0;
    return subtotalForm * (descuentoPorcentaje / 100);
  }, [subtotalForm, itemForm.descuento]);

  const totalLineaForm = useMemo(() => {
    return Math.max(subtotalForm - descuentoMontoForm, 0);
  }, [subtotalForm, descuentoMontoForm]);

  const resumenConsignacionForm = useMemo(() => {
    return calcularLineaConsignacion(itemForm);
  }, [
    itemForm.cantidad,
    itemForm.precioUnitario,
    itemForm.incrementoPorcentaje,
    itemForm.comisionClientePorcentaje,
  ]);

  const agregarProductoATabla = (e) => {
    e.preventDefault();

    if (!productoValido) return;

    const cantidad = Number(itemForm.cantidad);
    const precioUnitario = Number(itemForm.precioUnitario);

    if (cantidad <= 0 || precioUnitario < 0) return;

    const productoSeleccionado = productos.find(
      (producto) => producto._id === itemForm.productoId
    );

    const nuevoItem = {
      productoId: itemForm.productoId,
      nombreProducto: itemForm.nombreProducto,
      cantidad,
      precioUnitario,
      descuento: esFormatoVenta
        ? Math.min(Math.max(Number(itemForm.descuento || 0), 0), 100)
        : 0,
      incrementoPorcentaje: esFormatoVenta
        ? 0
        : Math.max(Number(itemForm.incrementoPorcentaje || 0), 0),
      comisionClientePorcentaje: esFormatoVenta
        ? 0
        : Math.min(
            Math.max(Number(itemForm.comisionClientePorcentaje || 0), 0),
            100
          ),
      stock: Number(itemForm.stock || 0),
      codigo: productoSeleccionado?.codigo || '',
      categoria: productoSeleccionado?.categoria || '',
      imagenUrl: itemForm.imagenUrl || productoSeleccionado?.imagenUrl || '',
    };

    actualizarItemsDelFormato((prevItems) => {
      const nuevosItems = [...prevItems];

      if (editandoIndex !== null) {
        nuevosItems[editandoIndex] = nuevoItem;
      } else {
        nuevosItems.push(nuevoItem);
      }

      return nuevosItems;
    });

    resetItemForm();
    setModalFormulario(false);
  };

  const cargarItemEnFormulario = (index) => {
    const item = items[index];
    if (!item) return;

    setItemForm({
      productoId: item.productoId || '',
      nombreProducto: item.nombreProducto || '',
      cantidad: item.cantidad ?? '',
      precioUnitario: item.precioUnitario ?? '',
      descuento: item.descuento ?? '',
      stock: item.stock ?? '',
      incrementoPorcentaje: item.incrementoPorcentaje ?? '',
      comisionClientePorcentaje: item.comisionClientePorcentaje ?? '',
      imagenUrl: item.imagenUrl || '',
    });

    setEditandoIndex(index);
    setMostrarSugerencias(false);
    setIndiceSugerenciaActiva(-1);
  };

  const editarItem = (index) => {
    cargarItemEnFormulario(index);
  };

  const editarItemEnModal = (index) => {
    cargarItemEnFormulario(index);
    setModalFormulario(true);
  };

  const eliminarItem = (index) => {
    actualizarItemsDelFormato((prevItems) =>
      prevItems.filter((_, i) => i !== index)
    );

    if (editandoIndex === index) {
      resetItemForm();
      setModalFormulario(false);
    }
  };

  const totalPiezas = useMemo(() => {
    return items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
  }, [items]);

  const total = useMemo(() => {
    if (esFormatoVenta) {
      return items.reduce((acc, item) => {
        const { totalLinea } = calcularLineaVenta(item);
        return acc + totalLinea;
      }, 0);
    }

    return items.reduce((acc, item) => {
      const { totalCotizacionLinea } = calcularLineaConsignacion(item);
      return acc + totalCotizacionLinea;
    }, 0);
  }, [items, esFormatoVenta]);

  const totalGananciaCliente = useMemo(() => {
    if (esFormatoVenta) return 0;

    return items.reduce((acc, item) => {
      const { totalGananciaCliente } = calcularLineaConsignacion(item);
      return acc + totalGananciaCliente;
    }, 0);
  }, [items, esFormatoVenta]);

  const totalGananciaHilos = useMemo(() => {
    if (esFormatoVenta) return 0;

    return items.reduce((acc, item) => {
      const { totalGananciaHilos } = calcularLineaConsignacion(item);
      return acc + totalGananciaHilos;
    }, 0);
  }, [items, esFormatoVenta]);

  const folioPreview = useMemo(() => {
    return generarBaseFolio(formatoActivo, datosCotizacion.fechaCotizacion);
  }, [formatoActivo, datosCotizacion.fechaCotizacion]);

  const construirPayloadCotizacion = () => {
    return {
      formato: formatoActivo,
      tipo: obtenerTipoCotizacion(formatoActivo),
      cliente: String(datosCotizacion.nombreCliente || '').trim(),
      telefono: '',
      fechaCotizacion: datosCotizacion.fechaCotizacion || obtenerFechaHoyISO(),
      vigencia: String(datosCotizacion.vigencia || '').trim(),
      notas: String(notas || '').trim(),
      items: items.map((item) => ({
        productoId: item.productoId || '',
        nombreProducto: item.nombreProducto || '',
        codigo: item.codigo || '',
        categoria: item.categoria || '',
        imagenUrl: item.imagenUrl || '',
        stock: Number(item.stock || 0),
        cantidad: Number(item.cantidad || 0),
        precioUnitario: Number(item.precioUnitario || 0),
        descuento: esFormatoVenta ? Number(item.descuento || 0) : 0,
        incrementoPorcentaje: esFormatoVenta
          ? 0
          : Number(item.incrementoPorcentaje || 0),
        comisionClientePorcentaje: esFormatoVenta
          ? 0
          : Number(item.comisionClientePorcentaje || 0),
      })),
    };
  };

  const guardarCotizacionEnHistorial = async () => {
    if (!items.length) {
      mostrarMensaje('error', 'Agrega al menos un producto a la cotización.');
      return;
    }

    if (!String(datosCotizacion.nombreCliente || '').trim()) {
      mostrarMensaje('error', 'El nombre del cliente es obligatorio para guardar.');
      return;
    }

    try {
      setGuardandoCotizacion(true);

      const payload = construirPayloadCotizacion();
      const { data } = await api.post('/cotizaciones', payload);

      if (modalHistorial) {
        await cargarHistorial();
      }

      mostrarMensaje(
        'success',
        `Cotización ${data?.folio || ''} guardada correctamente.`
      );
    } catch (error) {
      console.error('Error al guardar cotización:', error);
      mostrarMensaje(
        'error',
        error?.response?.data?.error ||
          error?.response?.data?.mensaje ||
          'No se pudo guardar la cotización.'
      );
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  const eliminarCotizacionHistorial = async (cotizacion) => {
    const id = cotizacion?._id;
    if (!id) return;

    const confirmado = window.confirm(
      `¿Eliminar la cotización ${cotizacion.folio || ''}?`
    );

    if (!confirmado) return;

    try {
      setEliminandoId(id);
      await api.delete(`/cotizaciones/${id}`);
      await cargarHistorial();
      mostrarMensaje('success', 'Cotización eliminada correctamente.');
    } catch (error) {
      console.error('Error al eliminar cotización:', error);
      mostrarMensaje(
        'error',
        error?.response?.data?.mensaje || 'No se pudo eliminar la cotización.'
      );
    } finally {
      setEliminandoId('');
    }
  };

  const cargarCotizacionDesdeHistorial = (cotizacion) => {
    if (!cotizacion) return;

    const formato = cotizacion.formato || FORMATOS.VENTA;
    const itemsHistorial = obtenerItemsDeCotizacion(cotizacion);

    setFormatoActivo(formato);

    setItemsPorFormato((prev) => ({
      ...prev,
      [formato]: itemsHistorial.map((item) => ({
        productoId:
          item.productoId?._id ||
          item.productoId ||
          item.producto ||
          '',
        nombreProducto: item.nombreProducto || '',
        cantidad: item.cantidad ?? '',
        precioUnitario: item.precioUnitario ?? '',
        descuento: item.descuento ?? '',
        stock: item.stock ?? '',
        incrementoPorcentaje: item.incrementoPorcentaje ?? '',
        comisionClientePorcentaje: item.comisionClientePorcentaje ?? '',
        imagenUrl: item.imagenUrl || '',
        codigo: item.codigo || '',
        categoria: item.categoria || '',
      })),
    }));

    setNotasPorFormato((prev) => ({
      ...prev,
      [formato]: cotizacion.notas || '',
    }));

    setDatosCotizacionPorFormato((prev) => ({
      ...prev,
      [formato]: {
        ...prev[formato],
        nombreCliente: cotizacion.cliente || '',
        fechaCotizacion: normalizarFechaInput(cotizacion.fechaCotizacion),
        vigencia: cotizacion.vigencia || '',
      },
    }));

    resetItemForm();
    setModalFormulario(false);
    setModalHistorial(false);
    mostrarMensaje(
      'success',
      `Cotización ${cotizacion.folio || ''} cargada en el formulario.`
    );
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

  const obtenerDimensionesImagen = async (dataUrl) => {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          width: img.width,
          height: img.height,
        });
      img.onerror = reject;
      img.src = dataUrl;
    });
  };

  const enviarAPuntoDeVenta = () => {
    if (!esFormatoVenta || !items.length) return;

    const cotizacionVenta = {
      origen: 'cotizacion',
      formato: FORMATOS.VENTA,
      tipo: 'COMPRA',
      folio: folioPreview,
      cliente: datosCotizacion.nombreCliente || '',
      fechaCotizacion: datosCotizacion.fechaCotizacion || '',
      vigencia: datosCotizacion.vigencia || '',
      notas: notasPorFormato[FORMATOS.VENTA] || '',
      total: Number(total || 0),
      productos: items.map((item) => {
        const productoInfo = productos.find(
          (producto) => producto._id === item.productoId
        );

        return {
          producto: item.productoId,
          codigo: item.codigo || productoInfo?.codigo || '',
          nombre: item.nombreProducto,
          categoria: item.categoria || productoInfo?.categoria || '',
          precio: Number(item.precioUnitario || 0),
          cantidad: Number(item.cantidad || 0),
          descuento: Number(item.descuento || 0),
          stockDisponible: Number(item.stock || productoInfo?.stock || 0),
          imagenUrl: item.imagenUrl || productoInfo?.imagenUrl || '',
        };
      }),
    };

    try {
      sessionStorage.setItem(
        'cotizacionVentaParaPOS',
        JSON.stringify(cotizacionVenta)
      );
    } catch (error) {
      console.error('No se pudo guardar la cotización para POS:', error);
    }

    navigate('/pos', {
      state: { cotizacionVenta },
    });
  };

  const exportarPDF = async () => {
    if (!items.length) return;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const fechaGeneracion = new Date().toLocaleString('es-MX');
    const tituloFormato = esFormatoVenta
      ? 'Cotización de compra'
      : 'Cotización de consignaciones';
    const notasActuales = (notasPorFormato[formatoActivo] || '').trim();
    const datosActuales = datosCotizacionPorFormato[formatoActivo] || {};
    const folioPDF = generarBaseFolio(formatoActivo, datosActuales.fechaCotizacion);

    let logoDataUrl = null;
    let piePaginaDataUrl = null;
    let piePaginaDimensiones = { width: 1200, height: 153 };

    try {
      logoDataUrl = await cargarImagenComoDataURL('/logo.png');
    } catch {
      logoDataUrl = null;
    }

    try {
      piePaginaDataUrl = await cargarImagenComoDataURL('/PiePagina.png');
      piePaginaDimensiones = await obtenerDimensionesImagen(piePaginaDataUrl);
    } catch {
      piePaginaDataUrl = null;
    }

    const imagenesItems = await Promise.all(
      items.map(async (item) => {
        if (!item.imagenUrl) return null;

        try {
          return await cargarImagenComoDataURL(item.imagenUrl);
        } catch {
          return null;
        }
      })
    );

    const footerAspectRatio =
      piePaginaDimensiones.width && piePaginaDimensiones.height
        ? piePaginaDimensiones.width / piePaginaDimensiones.height
        : 8;

    const footerWidth = pageWidth;
    const footerHeight = piePaginaDataUrl ? footerWidth / footerAspectRatio : 0;
    const footerY = piePaginaDataUrl ? pageHeight - footerHeight : pageHeight - 12;
    const limiteContenidoY = piePaginaDataUrl ? footerY - 6 : pageHeight - 20;

    const dibujarFooterEnTodasLasPaginas = () => {
      const totalPaginas = doc.internal.getNumberOfPages();

      for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
        doc.setPage(pagina);

        if (piePaginaDataUrl) {
          doc.addImage(
            piePaginaDataUrl,
            'PNG',
            0,
            footerY,
            footerWidth,
            footerHeight
          );
        } else {
          doc.setDrawColor(226, 232, 240);
          doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.text(`Hilos en Nogada · ${tituloFormato}`, 14, pageHeight - 6);
          doc.text(
            `Página ${pagina} de ${totalPaginas}`,
            pageWidth - 40,
            pageHeight - 6
          );
        }
      }
    };

    const calcularAlturaNotasPDF = (textoNotas) => {
      if (!textoNotas) return 0;

      const margenX = 14;
      const anchoTexto = pageWidth - margenX * 2;
      const lineas = doc.splitTextToSize(textoNotas, anchoTexto);

      return 8 + 7 + lineas.length * 5 + 4;
    };

    const dibujarNotasPDF = (textoNotas, yInicial) => {
      if (!textoNotas) return yInicial;

      let y = yInicial;
      const margenX = 14;
      const anchoTexto = pageWidth - margenX * 2;
      const lineas = doc.splitTextToSize(textoNotas, anchoTexto);

      doc.setDrawColor(226, 232, 240);
      doc.line(margenX, y, pageWidth - margenX, y);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.text('Notas', margenX, y);

      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);

      lineas.forEach((linea) => {
        if (y + 6 > limiteContenidoY) {
          doc.addPage();
          y = 20;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(31, 41, 55);
          doc.text('Notas', margenX, y);
          y += 7;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(75, 85, 99);
        }

        doc.text(linea, margenX, y);
        y += 5;
      });

      return y;
    };

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
    doc.text(tituloFormato, 54, 23);
    doc.text(`Generado: ${fechaGeneracion}`, 54, 29);

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Datos de la cotización', 14, 48);

    const datosY = 56;
    const datosGap = 6;
    const datosBoxH = 22;
    const datosBoxW = (pageWidth - 28 - datosGap * 3) / 4;

    const dibujarTarjetaDato = (x, y, titulo, valor, color = [248, 250, 252]) => {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x, y, datosBoxW, datosBoxH, 3, 3, 'F');
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(titulo, x + 4, y + 7);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);

      const texto = String(valor || 'Sin especificar');
      const textoRecortado =
        texto.length > 25 ? `${texto.slice(0, 22)}...` : texto;

      doc.text(textoRecortado, x + 4, y + 16);
    };

    dibujarTarjetaDato(14, datosY, 'Folio', folioPDF, [224, 242, 254]);
    dibujarTarjetaDato(
      14 + (datosBoxW + datosGap) * 1,
      datosY,
      'Cliente',
      datosActuales.nombreCliente || 'Sin especificar',
      [239, 246, 255]
    );
    dibujarTarjetaDato(
      14 + (datosBoxW + datosGap) * 2,
      datosY,
      'Fecha',
      formatearFecha(datosActuales.fechaCotizacion),
      [245, 243, 255]
    );
    dibujarTarjetaDato(
      14 + (datosBoxW + datosGap) * 3,
      datosY,
      'Vigencia',
      datosActuales.vigencia || 'Sin especificar',
      [254, 249, 195]
    );

    const head = esFormatoVenta
      ? [['Imagen de referencia', 'Cantidad', 'Producto', 'Precio', 'Desc. %', 'Total']]
      : [[
          'Imagen de referencia',
          'Cantidad',
          'Producto',
          'Precio',
          'Ganancia tienda',
          'Comisión %',
        ]];

    const body = esFormatoVenta
      ? items.map((item) => {
          const { totalLinea } = calcularLineaVenta(item);

          return [
            '',
            Number(item.cantidad || 0),
            item.nombreProducto || '—',
            `$${Number(item.precioUnitario || 0).toFixed(2)}`,
            `${Number(item.descuento || 0).toFixed(2)}%`,
            `$${totalLinea.toFixed(2)}`,
          ];
        })
      : items.map((item) => {
          const { precioRedondeado, valorComisionCliente } =
            calcularLineaConsignacion(item);

          return [
            '',
            Number(item.cantidad || 0),
            item.nombreProducto || '—',
            `$${precioRedondeado.toFixed(2)}`,
            `$${valorComisionCliente.toFixed(2)}`,
            `${Number(item.comisionClientePorcentaje || 0).toFixed(2)}%`,
          ];
        });

    autoTable(doc, {
      startY: 88,
      head,
      body,
      theme: 'grid',
      margin: {
        left: 14,
        right: 14,
        bottom: piePaginaDataUrl ? footerHeight + 8 : 14,
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: [31, 41, 55],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        minCellHeight: 18,
        valign: 'middle',
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
        0: { cellWidth: 28, halign: 'center' },
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 0) return;

        const imagenDataUrl = imagenesItems[data.row.index];

        if (imagenDataUrl) {
          const padding = 2;
          const size = Math.min(
            data.cell.width - padding * 2,
            data.cell.height - padding * 2
          );
          const x = data.cell.x + (data.cell.width - size) / 2;
          const y = data.cell.y + (data.cell.height - size) / 2;

          try {
            doc.addImage(imagenDataUrl, 'JPEG', x, y, size, size);
          } catch {
            try {
              doc.addImage(imagenDataUrl, 'PNG', x, y, size, size);
            } catch {
              doc.setDrawColor(203, 213, 225);
              doc.roundedRect(
                data.cell.x + 5,
                data.cell.y + 4,
                data.cell.width - 10,
                data.cell.height - 8,
                2,
                2
              );
            }
          }
        } else {
          doc.setDrawColor(203, 213, 225);
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(
            data.cell.x + 5,
            data.cell.y + 4,
            data.cell.width - 10,
            data.cell.height - 8,
            2,
            2,
            'FD'
          );
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            'Sin imagen',
            data.cell.x + data.cell.width / 2,
            data.cell.y + data.cell.height / 2 + 1,
            { align: 'center' }
          );
          doc.setTextColor(31, 41, 55);
        }
      },
    });

    let finalY = doc.lastAutoTable?.finalY || 120;
    let yBloqueFinal = finalY + 10;

    if (notasActuales) {
      const alturaNotas = calcularAlturaNotasPDF(notasActuales);

      if (yBloqueFinal + alturaNotas > limiteContenidoY) {
        doc.addPage();
        yBloqueFinal = 20;
      }

      yBloqueFinal = dibujarNotasPDF(notasActuales, yBloqueFinal);
    }

    yBloqueFinal += 8;

    if (esFormatoVenta) {
      const alturaTotales = 18;

      if (yBloqueFinal + alturaTotales > limiteContenidoY) {
        doc.addPage();
        yBloqueFinal = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(75, 85, 99);

      const totalDescuento = items.reduce((acc, item) => {
        const { descuentoMonto } = calcularLineaVenta(item);
        return acc + descuentoMonto;
      }, 0);

      doc.setFontSize(11);
      doc.text(`Descuento total: $${totalDescuento.toFixed(2)}`, 14, yBloqueFinal);

      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text(`Total general: $${total.toFixed(2)}`, 14, yBloqueFinal + 8);
    }

    dibujarFooterEnTodasLasPaginas();
    doc.save(`${folioPDF}.pdf`);
  };

  const textoFormatoActual = esFormatoVenta
    ? 'Formato de compra'
    : 'Formato de consignaciones';

  const textoCambioFormato = esFormatoVenta
    ? 'Cambiar a formato de consignaciones'
    : 'Cambiar a formato de compra';

  const renderFormularioProducto = (autocompleteRef, esModal = false) => (
    <div>
      <div className="mb-4 sm:mb-6">
        <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-600 sm:text-xs">
          {editandoIndex !== null
            ? `Editando producto · ${textoFormatoActual}`
            : `Nueva cotización · ${textoFormatoActual}`}
        </span>

        <h3 className="mt-3 text-lg font-bold text-gray-900 sm:mt-4 sm:text-2xl">
          {editandoIndex !== null ? 'Editar producto' : 'Agregar producto'}
        </h3>

        <p className="mt-1 text-sm text-gray-500 sm:mt-2">
          {esFormatoVenta
            ? 'Captura un producto para el formato de compra.'
            : 'Captura un producto para el formato de consignaciones.'}
        </p>
      </div>

      <form onSubmit={agregarProductoATabla} className="space-y-3 sm:space-y-4">
        <div ref={autocompleteRef} className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Producto
          </label>

          <input
            className={`w-full rounded-2xl border bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
              itemForm.nombreProducto && !productoValido
                ? 'border-red-300'
                : 'border-gray-200'
            }`}
            placeholder="Busca un producto del inventario"
            value={itemForm.nombreProducto}
            onChange={(e) => actualizarProducto(e.target.value)}
            onFocus={() => {
              if (textoBusquedaProducto) {
                setMostrarSugerencias(true);
              }
            }}
            onKeyDown={manejarTeclasProducto}
            autoComplete="off"
            required
          />

          {mostrarSugerencias && textoBusquedaProducto ? (
            <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-gray-200 bg-white shadow-xl">
              {productosFiltrados.length > 0 ? (
                productosFiltrados.map((producto, index) => (
                  <button
                    key={producto._id}
                    type="button"
                    className={`block w-full border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 ${
                      index === indiceSugerenciaActiva
                        ? 'bg-slate-100'
                        : 'hover:bg-slate-50'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      seleccionarProducto(producto);
                    }}
                    onMouseEnter={() => setIndiceSugerenciaActiva(index)}
                  >
                    <div className="flex items-start gap-3">
                      {renderImagenProducto(
                        producto.imagenUrl,
                        producto.nombre,
                        'h-12 w-12 shrink-0',
                        16
                      )}

                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {resaltarCoincidencia(producto.nombre, textoBusquedaProducto)}
                          </p>

                          <p className="mt-1 truncate text-xs text-gray-500">
                            {producto.codigo ? (
                              <>
                                Código:{' '}
                                {resaltarCoincidencia(
                                  producto.codigo,
                                  textoBusquedaProducto
                                )}
                              </>
                            ) : (
                              'Sin código'
                            )}

                            {producto.categoria ? (
                              <>
                                {' · '}
                                {resaltarCoincidencia(
                                  producto.categoria,
                                  textoBusquedaProducto
                                )}
                              </>
                            ) : null}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                          Stock: {Number(producto.stock || 0)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500">
                  No se encontraron productos con esa búsqueda.
                </div>
              )}
            </div>
          ) : null}

          {itemForm.nombreProducto && !productoValido ? (
            <p className="mt-2 text-xs text-red-600">
              Selecciona un producto válido del inventario.
            </p>
          ) : null}
        </div>

        {itemForm.imagenUrl ? (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-3">
              {renderImagenProducto(
                itemForm.imagenUrl,
                itemForm.nombreProducto,
                'h-14 w-14 shrink-0',
                18
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {itemForm.nombreProducto || 'Producto seleccionado'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Vista previa del producto seleccionado
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Stock disponible
          </label>
          <input
            className="w-full rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-500 outline-none"
            value={itemForm.stock}
            placeholder="Se mostrará al elegir un producto"
            readOnly
            disabled
          />
        </div>

        {esFormatoVenta ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Cantidad
                </label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  type="number"
                  min="1"
                  placeholder="Cantidad"
                  value={itemForm.cantidad}
                  onChange={(e) => actualizarCampoForm('cantidad', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Precio
                </label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={itemForm.precioUnitario}
                  onChange={(e) =>
                    actualizarCampoForm('precioUnitario', e.target.value)
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Descuento (%)
                </label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={itemForm.descuento}
                  onChange={(e) => actualizarCampoForm('descuento', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">Subtotal</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  ${subtotalForm.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-700">Descuento aplicado</p>
                <p className="mt-1 text-sm font-semibold text-amber-700">
                  ${descuentoMontoForm.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs text-emerald-700">Total del producto</p>
                <p className="mt-1 text-sm font-semibold text-emerald-700">
                  ${totalLineaForm.toFixed(2)}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Cantidad
                </label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  type="number"
                  min="1"
                  placeholder="Cantidad"
                  value={itemForm.cantidad}
                  onChange={(e) => actualizarCampoForm('cantidad', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Precio
                </label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={itemForm.precioUnitario}
                  onChange={(e) =>
                    actualizarCampoForm('precioUnitario', e.target.value)
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Incremento (%)
                </label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={itemForm.incrementoPorcentaje}
                  onChange={(e) =>
                    actualizarCampoForm('incrementoPorcentaje', e.target.value)
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Comisión cliente (%)
                </label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={itemForm.comisionClientePorcentaje}
                  onChange={(e) =>
                    actualizarCampoForm(
                      'comisionClientePorcentaje',
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                <p className="text-xs text-sky-700">Valor del incremento</p>
                <p className="mt-1 text-sm font-semibold text-sky-700">
                  ${resumenConsignacionForm.incrementoValor.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <p className="text-xs text-indigo-700">Nuevo precio</p>
                <p className="mt-1 text-sm font-semibold text-indigo-700">
                  ${resumenConsignacionForm.nuevoPrecio.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-700">Precio redondeado</p>
                <p className="mt-1 text-sm font-semibold text-amber-700">
                  ${resumenConsignacionForm.precioRedondeado.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                <p className="text-xs text-cyan-700">Valor comisión cliente</p>
                <p className="mt-1 text-sm font-semibold text-cyan-700">
                  ${resumenConsignacionForm.valorComisionCliente.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-xs text-rose-700">Ganancia Hilos</p>
                <p className="mt-1 text-sm font-semibold text-rose-700">
                  ${resumenConsignacionForm.gananciaHilos.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs text-emerald-700">
                  Total línea de consignación
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-700">
                  ${resumenConsignacionForm.totalCotizacionLinea.toFixed(2)}
                </p>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <button
            className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={!productoValido}
          >
            {editandoIndex !== null ? 'Actualizar producto' : 'Agregar producto'}
          </button>

          <button
            type="button"
            className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            onClick={() => {
              if (esModal) {
                cerrarModalFormulario();
              } else {
                resetItemForm();
              }
            }}
          >
            {esModal ? 'Cancelar' : 'Limpiar'}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <Layout>
      <Header title="Cotizaciones" />

      <div className="space-y-5 sm:space-y-6">
        {mensajeEstado ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              mensajeEstado.tipo === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {mensajeEstado.texto}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Productos en cotización</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{items.length}</p>
            <p className="mt-2 text-sm text-gray-500">{totalPiezas} pieza(s) en total</p>
          </div>

          <button
            type="button"
            onClick={cambiarFormato}
            className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-sm text-sky-700">Formato activo</p>
            <p className="mt-2 text-xl font-bold text-sky-900 sm:text-2xl">
              {textoFormatoActual}
            </p>
            <p className="mt-3 text-sm font-semibold text-sky-600">
              {textoCambioFormato}
            </p>
          </button>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
            <p className="text-sm text-gray-500">Total actual</p>
            <p className="mt-2 break-words text-3xl font-bold text-emerald-600">
              ${total.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="lg:hidden">
          <button
            type="button"
            onClick={abrirModalNuevoProducto}
            className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Agregar producto
          </button>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
          <div className="hidden lg:block xl:col-span-4">
            <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6">
              {renderFormularioProducto(autocompleteDesktopRef, false)}
            </div>
          </div>

          <div className="xl:col-span-8">
            <div className="overflow-hidden rounded-[30px] border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Detalle actual</p>
                      <h3 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
                        {esFormatoVenta
                          ? 'Productos de la cotización de compra'
                          : 'Productos de la cotización de consignaciones'}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
                        {items.length} productos
                      </div>

                      <button
                        type="button"
                        onClick={abrirModalNuevoProducto}
                        className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 lg:hidden"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>

                  <div
                    className={`grid grid-cols-1 gap-3 ${
                      esFormatoVenta ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                    }`}
                  >
                    {esFormatoVenta ? (
                      <button
                        type="button"
                        onClick={enviarAPuntoDeVenta}
                        className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        disabled={!items.length}
                      >
                        Enviar a punto de venta
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={guardarCotizacionEnHistorial}
                      className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                      disabled={!items.length || guardandoCotizacion}
                    >
                      {guardandoCotizacion ? 'Guardando...' : 'Guardar en historial'}
                    </button>

                    <button
                      type="button"
                      onClick={abrirModalHistorial}
                      className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white px-5 py-3 text-sm font-semibold text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
                    >
                        Consultar historial
                    </button>

                    <button
                      type="button"
                      onClick={exportarPDF}
                      className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                      disabled={!items.length}
                    >
                      Exportar PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-5 sm:px-6 sm:py-6">
                <div className="rounded-3xl border border-gray-200 bg-white p-4 sm:p-5">
                  <div className="mb-4">
                    <h4 className="text-base font-bold text-gray-900 sm:text-lg">
                      Datos de la cotización
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Estos datos se mostrarán arriba de la cotización en el PDF.
                    </p>
                  </div>

                  <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                    <p className="text-xs font-semibold text-sky-700">Folio sugerido</p>
                    <p className="mt-1 text-lg font-bold text-sky-900">{folioPreview}</p>
                    <p className="mt-1 text-xs text-sky-700">
                      CM = compra · CG = consignación
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Nombre del cliente
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        placeholder="Nombre del cliente"
                        value={datosCotizacion.nombreCliente}
                        onChange={(e) =>
                          actualizarDatoCotizacion('nombreCliente', e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Fecha
                      </label>
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        value={datosCotizacion.fechaCotizacion}
                        onChange={(e) =>
                          actualizarDatoCotizacion('fechaCotizacion', e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Vigencia
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        placeholder="Ej. 15 días"
                        value={datosCotizacion.vigencia}
                        onChange={(e) =>
                          actualizarDatoCotizacion('vigencia', e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    Estos datos se guardan por separado para cada formato.
                  </p>
                </div>
              </div>

              {items.length > 0 ? (
                <>
                  <div className="space-y-4 p-4 lg:hidden">
                    {items.map((item, index) => {
                      const venta = calcularLineaVenta(item);
                      const consignacion = calcularLineaConsignacion(item);

                      return (
                        <div
                          key={`${formatoActivo}-${item.productoId}-${index}`}
                          className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start gap-4">
                            {renderImagenProducto(
                              item.imagenUrl,
                              item.nombreProducto,
                              'h-12 w-12 shrink-0',
                              16
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900">
                                {item.nombreProducto}
                              </p>
                              <p className="mt-1 break-all text-sm text-gray-500">
                                ID: {item.productoId}
                              </p>

                              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="rounded-2xl bg-gray-50 px-3 py-2">
                                  <p className="text-xs text-gray-500">Cantidad</p>
                                  <p className="mt-1 text-sm font-semibold text-gray-900">
                                    {Number(item.cantidad || 0)}
                                  </p>
                                </div>

                                <div className="rounded-2xl bg-gray-50 px-3 py-2">
                                  <p className="text-xs text-gray-500">Precio</p>
                                  <p className="mt-1 text-sm font-semibold text-gray-900">
                                    ${Number(item.precioUnitario || 0).toFixed(2)}
                                  </p>
                                </div>

                                {esFormatoVenta ? (
                                  <>
                                    <div className="rounded-2xl bg-amber-50 px-3 py-2">
                                      <p className="text-xs text-amber-700">Descuento</p>
                                      <p className="mt-1 text-sm font-semibold text-amber-700">
                                        {Number(item.descuento || 0).toFixed(2)}%
                                      </p>
                                    </div>

                                    <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                                      <p className="text-xs text-emerald-700">Total</p>
                                      <p className="mt-1 text-sm font-semibold text-emerald-700">
                                        ${venta.totalLinea.toFixed(2)}
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="rounded-2xl bg-sky-50 px-3 py-2">
                                      <p className="text-xs text-sky-700">Inc. %</p>
                                      <p className="mt-1 text-sm font-semibold text-sky-700">
                                        {Number(item.incrementoPorcentaje || 0).toFixed(2)}%
                                      </p>
                                    </div>

                                    <div className="rounded-2xl bg-indigo-50 px-3 py-2">
                                      <p className="text-xs text-indigo-700">Nuevo precio</p>
                                      <p className="mt-1 text-sm font-semibold text-indigo-700">
                                        ${consignacion.nuevoPrecio.toFixed(2)}
                                      </p>
                                    </div>

                                    <div className="rounded-2xl bg-amber-50 px-3 py-2">
                                      <p className="text-xs text-amber-700">Redondeado</p>
                                      <p className="mt-1 text-sm font-semibold text-amber-700">
                                        ${consignacion.precioRedondeado.toFixed(2)}
                                      </p>
                                    </div>

                                    <div className="rounded-2xl bg-cyan-50 px-3 py-2">
                                      <p className="text-xs text-cyan-700">Comisión</p>
                                      <p className="mt-1 text-sm font-semibold text-cyan-700">
                                        ${consignacion.valorComisionCliente.toFixed(2)}
                                      </p>
                                    </div>

                                    <div className="rounded-2xl bg-rose-50 px-3 py-2">
                                      <p className="text-xs text-rose-700">Ganancia Hilos</p>
                                      <p className="mt-1 text-sm font-semibold text-rose-700">
                                        ${consignacion.gananciaHilos.toFixed(2)}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                              onClick={() => editarItemEnModal(index)}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                              onClick={() => eliminarItem(index)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden max-h-[70vh] overflow-auto lg:block">
                    <table className="min-w-full">
                      <thead className="sticky top-0 bg-gray-50/95 backdrop-blur">
                        {esFormatoVenta ? (
                          <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                            <th className="px-6 py-4">Imagen</th>
                            <th className="px-6 py-4">Cantidad</th>
                            <th className="px-6 py-4">Nombre del producto</th>
                            <th className="px-6 py-4">Precio</th>
                            <th className="px-6 py-4">Descuento</th>
                            <th className="px-6 py-4 text-right">Total</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                          </tr>
                        ) : (
                          <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                            <th className="px-6 py-4">Imagen</th>
                            <th className="px-6 py-4">Cantidad</th>
                            <th className="px-6 py-4">Nombre del producto</th>
                            <th className="px-6 py-4">Precio</th>
                            <th className="px-6 py-4">Inc. %</th>
                            <th className="px-6 py-4">Valor inc.</th>
                            <th className="px-6 py-4">Nuevo precio</th>
                            <th className="px-6 py-4">Redondeado</th>
                            <th className="px-6 py-4">Comisión %</th>
                            <th className="px-6 py-4">Valor comisión</th>
                            <th className="px-6 py-4">Ganancia Hilos</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                          </tr>
                        )}
                      </thead>

                      <tbody className="divide-y divide-gray-100">
                        {items.map((item, index) => {
                          const venta = calcularLineaVenta(item);
                          const consignacion = calcularLineaConsignacion(item);

                          return esFormatoVenta ? (
                            <tr
                              key={`${formatoActivo}-${item.productoId}-${index}`}
                              className="transition hover:bg-slate-50/70"
                            >
                              <td className="px-6 py-5">
                                {renderImagenProducto(
                                  item.imagenUrl,
                                  item.nombreProducto,
                                  'h-12 w-12',
                                  16
                                )}
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                {Number(item.cantidad || 0)}
                              </td>

                              <td className="px-6 py-5">
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    {item.nombreProducto}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    ID: {item.productoId}
                                  </p>
                                </div>
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                ${Number(item.precioUnitario || 0).toFixed(2)}
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                {Number(item.descuento || 0).toFixed(2)}%
                              </td>

                              <td className="px-6 py-5 text-right text-sm font-semibold text-gray-900">
                                ${venta.totalLinea.toFixed(2)}
                              </td>

                              <td className="px-6 py-5">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                                    onClick={() => editarItem(index)}
                                  >
                                    Editar
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                                    onClick={() => eliminarItem(index)}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr
                              key={`${formatoActivo}-${item.productoId}-${index}`}
                              className="transition hover:bg-slate-50/70"
                            >
                              <td className="px-6 py-5">
                                {renderImagenProducto(
                                  item.imagenUrl,
                                  item.nombreProducto,
                                  'h-12 w-12',
                                  16
                                )}
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                {Number(item.cantidad || 0)}
                              </td>

                              <td className="px-6 py-5">
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    {item.nombreProducto}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    ID: {item.productoId}
                                  </p>
                                </div>
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                ${Number(item.precioUnitario || 0).toFixed(2)}
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                {Number(item.incrementoPorcentaje || 0).toFixed(2)}%
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                ${consignacion.incrementoValor.toFixed(2)}
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                ${consignacion.nuevoPrecio.toFixed(2)}
                              </td>

                              <td className="px-6 py-5 text-sm font-semibold text-amber-700">
                                ${consignacion.precioRedondeado.toFixed(2)}
                              </td>

                              <td className="px-6 py-5 text-sm text-gray-700">
                                {Number(item.comisionClientePorcentaje || 0).toFixed(2)}%
                              </td>

                              <td className="px-6 py-5 text-sm font-semibold text-cyan-700">
                                ${consignacion.valorComisionCliente.toFixed(2)}
                              </td>

                              <td className="px-6 py-5 text-sm font-semibold text-emerald-700">
                                ${consignacion.gananciaHilos.toFixed(2)}
                              </td>

                              <td className="px-6 py-5">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                                    onClick={() => editarItem(index)}
                                  >
                                    Editar
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                                    onClick={() => eliminarItem(index)}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto max-w-md">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-100 to-slate-100 text-3xl">
                      🧾
                    </div>
                    <h4 className="mt-5 text-xl font-bold text-gray-900">
                      Aún no hay productos en la cotización
                    </h4>
                    <p className="mt-2 text-sm text-gray-500">
                      Agrega productos desde el formulario y aparecerán aquí.
                    </p>

                    <button
                      type="button"
                      onClick={abrirModalNuevoProducto}
                      className="mt-6 inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 lg:hidden"
                    >
                      Agregar producto
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-100 bg-white px-4 py-4 sm:px-6">
                {esFormatoVenta ? (
                  <div className="flex justify-end">
                    <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-right sm:w-auto">
                      <p className="text-sm text-emerald-700">
                        Total actual de la cotización
                      </p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700">
                        ${total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-right">
                      <p className="text-sm text-sky-700">Ganancia total cliente</p>
                      <p className="mt-1 text-2xl font-bold text-sky-700">
                        ${totalGananciaCliente.toFixed(2)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-right">
                      <p className="text-sm text-rose-700">Ganancia total Hilos</p>
                      <p className="mt-1 text-2xl font-bold text-rose-700">
                        ${totalGananciaHilos.toFixed(2)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-right">
                      <p className="text-sm text-emerald-700">
                        Total actual de la cotización
                      </p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700">
                        ${total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-5 sm:px-6 sm:py-6">
                <div className="rounded-3xl border border-gray-200 bg-white p-4 sm:p-5">
                  <div className="mb-3">
                    <h4 className="text-base font-bold text-gray-900 sm:text-lg">
                      Notas de la cotización
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Estas notas se incluirán en la parte inferior del PDF, debajo de la tabla.
                    </p>
                  </div>

                  <textarea
                    rows={5}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder={
                      esFormatoVenta
                        ? 'Ejemplo: precios sujetos a cambio, tiempos de entrega, condiciones de pago...'
                        : 'Ejemplo: condiciones de consignación, porcentaje acordado, fechas de revisión, observaciones...'
                    }
                    value={notas}
                    onChange={(e) => actualizarNotas(e.target.value)}
                  />

                  <p className="mt-2 text-xs text-gray-500">
                    Las notas se guardan por separado para cada formato.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalHistorial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={cerrarModalHistorial}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 sm:text-2xl">
                    Historial de cotizaciones
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Consulta, filtra, carga o elimina cotizaciones guardadas.
                  </p>
                </div>

                <button
                  type="button"
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  onClick={cerrarModalHistorial}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-5 sm:px-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Buscador
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="Buscar por folio, cliente, fecha o producto"
                    value={busquedaHistorial}
                    onChange={(e) => setBusquedaHistorial(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Filtro
                  </label>
                  <select
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    value={filtroHistorial}
                    onChange={(e) => setFiltroHistorial(e.target.value)}
                  >
                    <option value="TODAS">Todas</option>
                    <option value={FORMATOS.VENTA}>Compra</option>
                    <option value={FORMATOS.CONSIGNACION}>Consignación</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {cargandoHistorial ? (
                <div className="px-6 py-14 text-center text-sm text-gray-500">
                  Cargando historial...
                </div>
              ) : historialCotizaciones.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {historialCotizaciones.map((cotizacion) => {
                    const itemsHistorial = obtenerItemsDeCotizacion(cotizacion);

                    return (
                      <div key={cotizacion._id || cotizacion.folio} className="p-4 sm:p-6">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                                {cotizacion.folio}
                              </span>

                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                                  cotizacion.formato === FORMATOS.VENTA
                                    ? 'bg-sky-50 text-sky-700 ring-sky-200'
                                    : 'bg-amber-50 text-amber-700 ring-amber-200'
                                }`}
                              >
                                {cotizacion.tipo}
                              </span>
                            </div>

                            <h4 className="mt-3 text-lg font-bold text-gray-900">
                              {cotizacion.cliente || 'Sin cliente'}
                            </h4>

                            <p className="mt-1 text-sm text-gray-500">
                              Fecha: {formatearFecha(cotizacion.fechaCotizacion)} · Vigencia:{' '}
                              {cotizacion.vigencia || 'Sin especificar'} · Productos:{' '}
                              {itemsHistorial.length || 0}
                            </p>

                            {cotizacion.notas ? (
                              <p className="mt-3 text-sm text-gray-600">{cotizacion.notas}</p>
                            ) : null}

                            {itemsHistorial.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {itemsHistorial.slice(0, 4).map((item, index) => (
                                  <span
                                    key={`${cotizacion._id || cotizacion.folio}-${item.productoId || item.nombreProducto}-${index}`}
                                    className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                                  >
                                    {item.nombreProducto}
                                  </span>
                                ))}

                                {itemsHistorial.length > 4 ? (
                                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                                    +{itemsHistorial.length - 4} más
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          <div className="w-full xl:w-auto">
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-right">
                              <p className="text-sm text-emerald-700">Total</p>
                              <p className="mt-1 text-2xl font-bold text-emerald-700">
                                ${Number(cotizacion.total || 0).toFixed(2)}
                              </p>
                            </div>

                            {cotizacion.formato === FORMATOS.CONSIGNACION ? (
                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-right">
                                  <p className="text-xs text-sky-700">Ganancia cliente</p>
                                  <p className="mt-1 text-base font-bold text-sky-700">
                                    ${Number(cotizacion.totalGananciaCliente || 0).toFixed(2)}
                                  </p>
                                </div>

                                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-right">
                                  <p className="text-xs text-rose-700">Ganancia Hilos</p>
                                  <p className="mt-1 text-base font-bold text-rose-700">
                                    ${Number(cotizacion.totalGananciaHilos || 0).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                            onClick={() => cargarCotizacionDesdeHistorial(cotizacion)}
                          >
                            Cargar cotización
                          </button>

                          <button
                            type="button"
                            className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-60"
                            onClick={() => eliminarCotizacionHistorial(cotizacion)}
                            disabled={eliminandoId === cotizacion._id}
                          >
                            {eliminandoId === cotizacion._id
                              ? 'Eliminando...'
                              : 'Eliminar del historial'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-6 py-14 text-center">
                  <div className="mx-auto max-w-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gray-100 text-2xl">
                      📚
                    </div>
                    <h4 className="mt-4 text-lg font-bold text-gray-900">
                      No hay cotizaciones en el historial
                    </h4>
                    <p className="mt-2 text-sm text-gray-500">
                      Guarda una cotización para empezar a verla aquí.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalFormulario && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:hidden"
          onClick={cerrarModalFormulario}
        >
          <div
            className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-gray-200 bg-white shadow-2xl sm:my-4 sm:max-h-[90vh] sm:max-w-lg sm:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center border-b border-gray-100 px-4 py-3 sm:hidden">
              <div className="h-1.5 w-14 rounded-full bg-gray-300" />
            </div>

            <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              {renderFormularioProducto(autocompleteModalRef, true)}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}