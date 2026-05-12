import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import Loader from '../components/Loader';
import { api } from '../config/api';
import { useRealtime } from '../context/RealtimeContext';
import usePermisos from '../hooks/usePermisos';
import { PERMISOS } from '../utils/permisos';


import {
  Search,
  Pencil,
  Trash2,
  X,
  Plus,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Image as ImageIcon,
  FileUp,
  FileSpreadsheet,
  Eye,
  CheckCircle2,
  RefreshCcw,
} from 'lucide-react';

const QrScanner = lazy(() =>
  import('@yudiel/react-qr-scanner').then((module) => ({
    default: module.Scanner,
  }))
);

let pdfLibPromise;
const getPdfLib = async () => {
  if (!pdfLibPromise) {
    pdfLibPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjsLib, worker]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjsLib;
    });
  }

  return pdfLibPromise;
};

const PRODUCTOS_POR_PAGINA = 40;
const PDF_MAX_BYTES = 10 * 1024 * 1024;
const INVENTARIOS = {
  TAXCO: 'taxco',
  TIENDA: 'tienda',
};
const INVENTARIO_LABELS = {
  [INVENTARIOS.TAXCO]: 'Taxco',
  [INVENTARIOS.TIENDA]: 'Tienda',
};

const initialForm = {
  codigo: '',
  categoria: '',
  nombre: '',
  costoArtesano: '',
  precio: '',
  stock: '',
  stockTaxco: '',
  stockTienda: '',
  inventario: INVENTARIOS.TIENDA,
  imagenUrl: '',
  imagenPublicId: '',
};

const initialResumenImportacion = {
  archivo: '',
  totalDetectados: 0,
  nuevos: 0,
  actualizar: 0,
  errores: 0,
  detalles: [],
};

const sortOptions = [
  { value: 'codigo', label: 'Código' },
  { value: 'categoria', label: 'Categoría' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'costoArtesano', label: 'Costo artesano' },
  { value: 'precio', label: 'Precio venta' },
  { value: 'stock', label: 'Stock' },
  { value: 'stockTaxco', label: 'Stock Taxco' },
  { value: 'stockTienda', label: 'Stock Tienda' },
];

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

const normalizarTexto = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizarEspacios = (value = '') =>
  String(value).replace(/\s+/g, ' ').trim();

const escapeRegExp = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizarNumero = (value) => {
  const raw = String(value ?? '')
    .replace(/[^\d,.\-]/g, '')
    .trim();

  if (!raw) return NaN;

  if (raw.includes(',') && raw.includes('.')) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      return Number(raw.replace(/\./g, '').replace(',', '.'));
    }
    return Number(raw.replace(/,/g, ''));
  }

  if (raw.includes(',') && !raw.includes('.')) {
    return Number(raw.replace(',', '.'));
  }

  return Number(raw);
};

const normalizarInventario = (valor) => {
  const inventario = String(valor || '').trim().toLowerCase();
  return inventario === INVENTARIOS.TAXCO ? INVENTARIOS.TAXCO : INVENTARIOS.TIENDA;
};

const obtenerStockTaxco = (producto = {}) => Number(producto.stockTaxco || 0);
const obtenerStockTienda = (producto = {}) => {
  const stockTienda = Number(producto.stockTienda || 0);
  const stockTaxco = Number(producto.stockTaxco || 0);
  if (stockTienda > 0 || stockTaxco > 0) return stockTienda;
  return Number(producto.stock || 0);
};

const obtenerStockTotal = (producto = {}) =>
  obtenerStockTaxco(producto) + obtenerStockTienda(producto);

const consolidarProductosPorCodigo = (productos = []) => {
  const mapa = new Map();

  productos.forEach((producto) => {
    const codigo = String(producto.codigo || '').trim().toUpperCase();
    if (!codigo) return;

    if (!mapa.has(codigo)) {
      mapa.set(codigo, {
        ...producto,
        codigo,
        stock: Number(producto.stock || 0),
      });
      return;
    }

    const actual = mapa.get(codigo);

    mapa.set(codigo, {
      ...actual,
      stock: Number(actual.stock || 0) + Number(producto.stock || 0),
    });
  });

  return Array.from(mapa.values());
};

const esEncabezadoInventario = (text = '') => {
  const t = normalizarTexto(text);
  return (
    t.includes('codigo') &&
    t.includes('categoria') &&
    t.includes('nombre') &&
    t.includes('costo') &&
    t.includes('precio') &&
    t.includes('stock')
  );
};

const limpiarTextoCelda = (value = '') =>
  String(value)
    .replace(/\s+/g, ' ')
    .replace(/^[|:;,\-]+|[|:;,\-]+$/g, '')
    .trim();

const TOLERANCIA_Y_PDF = 3;

const agruparItemsPorLinea = (items = [], toleranciaY = TOLERANCIA_Y_PDF) => {
  const lineas = [];

  const itemsLimpios = items
    .map((item) => ({
      str: String(item?.str ?? '').trim(),
      x: Number(item?.transform?.[4] ?? 0),
      y: Number(item?.transform?.[5] ?? 0),
    }))
    .filter((item) => item.str)
    .sort((a, b) => {
      if (Math.abs(b.y - a.y) > toleranciaY) return b.y - a.y;
      return a.x - b.x;
    });

  itemsLimpios.forEach((item) => {
    const lineaExistente = lineas.find(
      (linea) => Math.abs(linea.baseY - item.y) <= toleranciaY
    );

    if (lineaExistente) {
      lineaExistente.items.push({ str: item.str, x: item.x });
      return;
    }

    lineas.push({
      baseY: item.y,
      items: [{ str: item.str, x: item.x }],
    });
  });

  return lineas
    .sort((a, b) => b.baseY - a.baseY)
    .map((linea) => {
      const itemsOrdenados = [...linea.items].sort((a, b) => a.x - b.x);

      return {
        y: linea.baseY,
        items: itemsOrdenados,
        text: normalizarEspacios(itemsOrdenados.map((item) => item.str).join(' ')),
      };
    })
    .filter((linea) => linea.text);
};

const obtenerXColumna = (items, aliases) => {
  const aliasNormalizados = aliases.map((a) => normalizarTexto(a));

  const encontrado = items.find((item) => {
    const texto = normalizarTexto(item.str);
    return aliasNormalizados.some(
      (alias) => texto === alias || texto.includes(alias)
    );
  });

  return encontrado ? encontrado.x : null;
};

const construirLayoutDesdeEncabezado = (lineaEncabezado) => {
  if (!lineaEncabezado?.items?.length) return null;

  const columnas = [
    { key: 'codigo', x: obtenerXColumna(lineaEncabezado.items, ['codigo']) },
    { key: 'categoria', x: obtenerXColumna(lineaEncabezado.items, ['categoria']) },
    { key: 'nombre', x: obtenerXColumna(lineaEncabezado.items, ['nombre']) },
    {
      key: 'costoArtesano',
      x: obtenerXColumna(lineaEncabezado.items, ['costo', 'artesano']),
    },
    {
      key: 'precio',
      x: obtenerXColumna(lineaEncabezado.items, ['precio', 'venta']),
    },
    { key: 'stock', x: obtenerXColumna(lineaEncabezado.items, ['stock']) },
  ];

  const requeridas = [
    'codigo',
    'categoria',
    'nombre',
    'costoArtesano',
    'precio',
    'stock',
  ];

  const faltantes = requeridas.some(
    (key) => columnas.find((col) => col.key === key)?.x == null
  );

  if (faltantes) return null;

  const visibles = columnas.sort((a, b) => a.x - b.x);

  return visibles.map((columna, index) => {
    const prev = visibles[index - 1];
    const next = visibles[index + 1];

    return {
      key: columna.key,
      minX: prev ? (prev.x + columna.x) / 2 : -Infinity,
      maxX: next ? (columna.x + next.x) / 2 : Infinity,
    };
  });
};

const resolverCategoriaYNombre = (resto, categoriasConocidas = []) => {
  const texto = limpiarTextoCelda(resto);
  if (!texto) return null;

  const categoriasOrdenadas = [...new Set(categoriasConocidas)]
    .filter(Boolean)
    .map((categoria) => String(categoria).trim())
    .sort((a, b) => normalizarTexto(b).length - normalizarTexto(a).length);

  const textoNormalizado = normalizarTexto(texto);

  for (const categoria of categoriasOrdenadas) {
    const categoriaNormalizada = normalizarTexto(categoria);

    if (!textoNormalizado.startsWith(categoriaNormalizada)) continue;

    let nombre = texto.slice(categoria.length).trim();

    if (!nombre) {
      const regex = new RegExp(`^${escapeRegExp(categoria)}\\s*`, 'i');
      nombre = texto.replace(regex, '').trim();
    }

    if (!nombre && textoNormalizado !== categoriaNormalizada) continue;

    return {
      categoria,
      nombre: nombre || '',
    };
  }

  const partes = texto.split(/\s+/).filter(Boolean);

  if (partes.length >= 2) {
    return {
      categoria: partes[0],
      nombre: partes.slice(1).join(' '),
    };
  }

  return {
    categoria: 'General',
    nombre: texto,
  };
};

const extraerUltimosCamposNumericos = (linea = '') => {
  const texto = normalizarEspacios(linea);

  const match = texto.match(
    /^(.*?)\s+([$€]?\s*-?\d[\d.,]*)\s+([$€]?\s*-?\d[\d.,]*)\s+(-?\d+)\s*$/
  );

  if (!match) return null;

  const [, resto, costoRaw, precioRaw, stockRaw] = match;

  const costoArtesano = normalizarNumero(costoRaw);
  const precio = normalizarNumero(precioRaw);
  const stock = Number.parseInt(String(stockRaw).replace(/[^\d-]/g, ''), 10);

  if (
    Number.isNaN(costoArtesano) ||
    Number.isNaN(precio) ||
    Number.isNaN(stock)
  ) {
    return null;
  }

  return {
    resto: limpiarTextoCelda(resto),
    costoArtesano,
    precio,
    stock,
  };
};

const normalizarProductoDesdeColumnas = (columnas, categoriasConocidas = []) => {
  const codigo = String(columnas.codigo || '').trim().toUpperCase();

  let categoria = limpiarTextoCelda(columnas.categoria || '');
  let nombre = limpiarTextoCelda(columnas.nombre || '');

  if ((!categoria || !nombre) && (columnas.categoria || columnas.nombre)) {
    const combinado = limpiarTextoCelda(
      `${columnas.categoria || ''} ${columnas.nombre || ''}`
    );

    const resuelto = resolverCategoriaYNombre(combinado, categoriasConocidas);

    if (resuelto) {
      categoria = categoria || resuelto.categoria;
      nombre = nombre || resuelto.nombre;
    }
  }

  const costoArtesano = normalizarNumero(columnas.costoArtesano);
  const precio = normalizarNumero(columnas.precio);
  const stock = Number.parseInt(
    String(columnas.stock || '').replace(/[^\d-]/g, ''),
    10
  );

  if (
    !codigo ||
    !categoria ||
    !nombre ||
    Number.isNaN(costoArtesano) ||
    Number.isNaN(precio) ||
    Number.isNaN(stock)
  ) {
    return null;
  }

  return {
    codigo,
    categoria,
    nombre,
    costoArtesano,
    precio,
    stock,
    imagenUrl: '',
    imagenPublicId: '',
  };
};

const parsearLineaPorLayout = (linea, layout, categoriasConocidas = []) => {
  if (!layout?.length || !linea?.items?.length) return null;
  if (esEncabezadoInventario(linea.text)) return null;

  const columnas = {};

  linea.items.forEach((item) => {
    const columna = layout.find(
      (col) => item.x >= col.minX && item.x < col.maxX
    );

    if (!columna) return;

    columnas[columna.key] = `${columnas[columna.key] || ''} ${item.str}`.trim();
  });

  return normalizarProductoDesdeColumnas(columnas, categoriasConocidas);
};

const parsearLineaPorTexto = (text, categoriasConocidas = []) => {
  const linea = normalizarEspacios(text);
  if (!linea || esEncabezadoInventario(linea)) return null;

  const datos = extraerUltimosCamposNumericos(linea);
  if (!datos) return null;

  const primerEspacio = datos.resto.indexOf(' ');
  const codigoRaw =
    primerEspacio === -1 ? datos.resto : datos.resto.slice(0, primerEspacio);
  const restoDescripcion =
    primerEspacio === -1 ? '' : datos.resto.slice(primerEspacio + 1);

  if (!codigoRaw || !restoDescripcion) return null;

  const categoriaYNombre = resolverCategoriaYNombre(
    restoDescripcion,
    categoriasConocidas
  );

  if (!categoriaYNombre || !categoriaYNombre.nombre) return null;

  return {
    codigo: String(codigoRaw || '').trim().toUpperCase(),
    categoria: categoriaYNombre.categoria,
    nombre: categoriaYNombre.nombre,
    costoArtesano: datos.costoArtesano,
    precio: datos.precio,
    stock: datos.stock,
    imagenUrl: '',
    imagenPublicId: '',
  };
};

const extraerProductosDesdePdf = async (file, categoriasConocidas = []) => {
  const pdfjsLib = await getPdfLib();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let layout = null;
  const productos = [];
  const invalidas = [];

  for (let pagina = 1; pagina <= pdf.numPages; pagina += 1) {
    const page = await pdf.getPage(pagina);
    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
    const lineas = agruparItemsPorLinea(textContent.items || []);

    if (!layout) {
      const encabezado = lineas.find((linea) => esEncabezadoInventario(linea.text));
      if (encabezado) {
        layout = construirLayoutDesdeEncabezado(encabezado);
      }
    }

    lineas.forEach((linea) => {
      let producto = null;

      if (layout) {
        producto = parsearLineaPorLayout(linea, layout, categoriasConocidas);
      }

      if (!producto) {
        producto = parsearLineaPorTexto(linea.text, categoriasConocidas);
      }

      if (producto) {
        productos.push(producto);
        return;
      }

      if (!esEncabezadoInventario(linea.text) && /\d/.test(linea.text)) {
        invalidas.push(`Pág. ${pagina}: ${linea.text}`);
      }
    });
  }

  return {
    productos: consolidarProductosPorCodigo(productos),
    invalidas,
  };
};

export default function Inventario() {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, puede } = usePermisos();
  const { lastEvent } = useRealtime();

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editandoId, setEditandoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [errorCarga, setErrorCarga] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [mensajeAccion, setMensajeAccion] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [sortConfig, setSortConfig] = useState({
    key: 'codigo',
    direction: 'asc',
  });
  const [productoAEliminar, setProductoAEliminar] = useState(null);
  const [eliminandoProducto, setEliminandoProducto] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const [imagenArchivo, setImagenArchivo] = useState(null);
  const [previewImagen, setPreviewImagen] = useState('');
  const [importandoPdf, setImportandoPdf] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [mostrarPreviewImportacion, setMostrarPreviewImportacion] = useState(false);
  const [resumenImportacion, setResumenImportacion] = useState(
    initialResumenImportacion
  );
  const [productosPendientesImportacion, setProductosPendientesImportacion] = useState(
    []
  );
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [productoConsultado, setProductoConsultado] = useState(null);
  const [consultandoCodigo, setConsultandoCodigo] = useState(false);
  const [errorScanner, setErrorScanner] = useState('');
  const [modoEdicionScanner, setModoEdicionScanner] = useState(false);
  const [formScanner, setFormScanner] = useState(initialForm);
  const [guardandoCambiosScanner, setGuardandoCambiosScanner] = useState(false);
  const [mostrarConfirmacionScanner, setMostrarConfirmacionScanner] =
    useState(false);
  const [errorEdicionScanner, setErrorEdicionScanner] = useState('');

  const pdfInputRef = useRef(null);
  const ultimoCodigoEscaneadoRef = useRef('');

  const cargarCategorias = async () => {
    try {
      const { data } = await api.get('/productos/categorias');
      setCategorias(Array.isArray(data) ? data : []);
    } catch (error) {
      setCategorias([]);
      throw error;
    }
  };

  const cargarProductos = async ({
    page = paginaActual,
    q = busquedaAplicada,
    categoria = categoriaFiltro,
    stockBajo = soloStockBajo,
    sortKey = sortConfig.key,
    direction = sortConfig.direction,
  } = {}) => {
    const { data } = await api.get('/productos/inventario', {
      params: {
        page,
        limit: PRODUCTOS_POR_PAGINA,
        q,
        categoria: categoria === 'todas' ? '' : categoria,
        stockBajo,
        sortKey,
        direction,
      },
    });

    setProductos(data.items || []);
    setPaginaActual(data.page || 1);
    setTotalPaginas(data.totalPages || 1);
    setTotalProductos(data.total || 0);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const stockQuery = params.get('stock');
    setSoloStockBajo(stockQuery === 'bajo');
    setPaginaActual(1);
  }, [location.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPaginaActual(1);
      setBusquedaAplicada(busqueda.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [busqueda]);

  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaFiltro, soloStockBajo, sortConfig]);

  useEffect(() => {
    if (!puede(PERMISOS.GESTIONAR_INVENTARIO)) return;

    const init = async () => {
      try {
        setLoading(true);
        setErrorCarga('');
        await Promise.all([
          cargarProductos({
            page: paginaActual,
            q: busquedaAplicada,
            categoria: categoriaFiltro,
            stockBajo: soloStockBajo,
            sortKey: sortConfig.key,
            direction: sortConfig.direction,
          }),
          cargarCategorias(),
        ]);
      } catch (error) {
        setErrorCarga(
          error.response?.data?.mensaje || 'No se pudo cargar el inventario'
        );
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [
    usuario,
    paginaActual,
    busquedaAplicada,
    categoriaFiltro,
    soloStockBajo,
    sortConfig,
  ]);

  useEffect(() => {
    if (!puede(PERMISOS.GESTIONAR_INVENTARIO)) return;
    if (lastEvent?.tipo !== 'productos') return;

    const refrescar = async () => {
      try {
        setErrorCarga('');
        await Promise.all([
          cargarProductos({
            page: paginaActual,
            q: busquedaAplicada,
            categoria: categoriaFiltro,
            stockBajo: soloStockBajo,
            sortKey: sortConfig.key,
            direction: sortConfig.direction,
          }),
          cargarCategorias(),
        ]);
      } catch (error) {
        setErrorCarga(
          error.response?.data?.mensaje || 'No se pudo actualizar el inventario'
        );
      }
    };

    refrescar();
  }, [
    lastEvent,
    usuario,
    paginaActual,
    busquedaAplicada,
    categoriaFiltro,
    soloStockBajo,
    sortConfig,
  ]);

  useEffect(() => {
    if (!soloStockBajo) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSoloStockBajo(false);
        navigate('/inventario', { replace: true });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [soloStockBajo, navigate]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && productoAEliminar && !eliminandoProducto) {
        setProductoAEliminar(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [productoAEliminar, eliminandoProducto]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (!mostrarFormulario || importandoPdf) return;
      cerrarFormulario();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mostrarFormulario, importandoPdf]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (!mostrarPreviewImportacion || importandoPdf) return;
      cerrarPreviewImportacion();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mostrarPreviewImportacion, importandoPdf]);

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
      if (mostrarConfirmacionScanner) {
        cerrarConfirmacionScanner();
        return;
      }
      if (!productoConsultado) return;
      cerrarModalConsulta();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    productoConsultado,
    mostrarConfirmacionScanner,
    guardandoCambiosScanner,
    modoEdicionScanner,
  ]);

  useEffect(() => {
    return () => {
      if (previewImagen?.startsWith('blob:')) {
        URL.revokeObjectURL(previewImagen);
      }
    };
  }, [previewImagen]);

  const categoriasDisponibles = useMemo(() => {
    const base =
      categorias.length > 0
        ? categorias
        : [...new Set(productos.map((p) => p.categoria).filter(Boolean))];

    return [...base].sort((a, b) => a.localeCompare(b));
  }, [categorias, productos]);

  const paginasVisibles = useMemo(() => {
    if (totalPaginas <= 5) {
      return Array.from({ length: totalPaginas }, (_, i) => i + 1);
    }

    let inicio = Math.max(1, paginaActual - 2);
    let fin = Math.min(totalPaginas, inicio + 4);

    if (fin - inicio < 4) {
      inicio = Math.max(1, fin - 4);
    }

    return Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);
  }, [paginaActual, totalPaginas]);

  const productosNuevosImportacion = useMemo(
    () => resumenImportacion.detalles.filter((detalle) => detalle.tipo === 'crear'),
    [resumenImportacion.detalles]
  );

  const productosActualizarStockImportacion = useMemo(
    () =>
      resumenImportacion.detalles.filter((detalle) => detalle.tipo === 'actualizar'),
    [resumenImportacion.detalles]
  );

  const productosErrorImportacion = useMemo(
    () => resumenImportacion.detalles.filter((detalle) => detalle.tipo === 'error'),
    [resumenImportacion.detalles]
  );

  if (!puede(PERMISOS.GESTIONAR_INVENTARIO)) {
    return (
      <Layout>
        <Header title="Inventario" />
        <div className="card p-5">No tienes permiso para gestionar inventario.</div>
      </Layout>
    );
  }

  const formatearMoneda = (valor) => `$${Number(valor || 0).toFixed(2)}`;

  const buscarProductoExistentePorCodigo = async (codigo) => {
    const codigoNormalizado = String(codigo || '').trim().toUpperCase();
    if (!codigoNormalizado) return null;

    const { data } = await api.get('/productos/inventario', {
      params: {
        page: 1,
        limit: 50,
        q: codigoNormalizado,
        categoria: '',
        stockBajo: false,
        sortKey: 'codigo',
        direction: 'asc',
      },
    });

    const items = Array.isArray(data?.items) ? data.items : [];

    return (
      items.find(
        (item) =>
          String(item.codigo || '').trim().toUpperCase() === codigoNormalizado
      ) || null
    );
  };

  const analizarProductosImportacion = async (productosAnalizar = []) => {
    const mapaExistentes = new Map();
    try {
      let inventarioActual = [];

      try {
        const { data } = await api.get('/productos');
        inventarioActual = Array.isArray(data) ? data : [];
      } catch {
        inventarioActual = [];
      }

      if (!inventarioActual.length) {
        let page = 1;
        let totalPages = 1;

        do {
          const { data } = await api.get('/productos/inventario', {
            params: {
              page,
              limit: 500,
              q: '',
              categoria: '',
              stockBajo: false,
              sortKey: 'codigo',
              direction: 'asc',
            },
          });

          const items = Array.isArray(data?.items) ? data.items : [];
          inventarioActual = inventarioActual.concat(items);
          totalPages = Number(data?.totalPages || 1);
          page += 1;
        } while (page <= totalPages);
      }

      inventarioActual.forEach((item) => {
        const codigo = String(item.codigo || '').trim().toUpperCase();
        if (codigo) {
          mapaExistentes.set(codigo, item);
        }

       });
    } catch (errorCargaExistentes) {
      return {
        totalDetectados: productosAnalizar.length,
        nuevos: 0,
        actualizar: 0,
        errores: productosAnalizar.length,
        detalles: productosAnalizar.map((producto) => ({
          tipo: 'error',
          codigo: producto.codigo,
          producto,
          mensaje:
            errorCargaExistentes.response?.data?.mensaje ||
            'No se pudo validar el inventario existente para la importación',
        })),
      };
    }

    const detalles = productosAnalizar.map((producto) => {
      const codigo = String(producto.codigo || '').trim().toUpperCase();
      const existente = mapaExistentes.get(codigo);

      if (existente?._id) {
        const stockActual = Number(existente.stock || 0);
        const stockImportado = Number(producto.stock || 0);

        return {
          tipo: 'actualizar',
          codigo: producto.codigo,
          producto,
          existente,
          stockActual,
          stockImportado,
          stockFinal: stockActual + stockImportado,
        };
      }

      return {
        tipo: 'crear',
        codigo: producto.codigo,
        producto,
        stockImportado: Number(producto.stock || 0),
      };
    });
    

    const orden = {
      actualizar: 0,
      crear: 1,
      error: 2,
    };

    const detallesOrdenados = [...detalles].sort((a, b) => {
      if (orden[a.tipo] !== orden[b.tipo]) {
        return orden[a.tipo] - orden[b.tipo];
      }

      return String(a.codigo || '').localeCompare(String(b.codigo || ''));
    });

    return {
      totalDetectados: detallesOrdenados.length,
      nuevos: detallesOrdenados.filter((item) => item.tipo === 'crear').length,
      actualizar: detallesOrdenados.filter((item) => item.tipo === 'actualizar')
        .length,
      errores: detallesOrdenados.filter((item) => item.tipo === 'error').length,
      detalles: detallesOrdenados,
    };
  };

  const importarProductoDesdePdf = async (detalle) => {
    const producto = detalle?.producto;

    if (!producto?.codigo) {
      throw new Error('Producto inválido para importar');
    }

    if (detalle?.tipo === 'actualizar' && detalle?.existente?._id) {
      const stockActual = Number(detalle.existente.stock || 0);
      const stockImportado = Number(producto.stock || 0);
      const stockTiendaFinal = obtenerStockTienda(detalle.existente) + stockImportado;

      const payload = {
        codigo: String(detalle.existente.codigo || producto.codigo || '')
          .trim()
          .toUpperCase(),
        categoria: String(
          detalle.existente.categoria || producto.categoria || ''
        ).trim(),
        nombre: String(detalle.existente.nombre || producto.nombre || '').trim(),
        costoArtesano: Number(
          detalle.existente.costoArtesano ?? producto.costoArtesano ?? 0
        ),
        precio: Number(detalle.existente.precio ?? producto.precio ?? 0),
        stockTaxco: obtenerStockTaxco(detalle.existente),
        stockTienda: stockTiendaFinal,
        stock: stockActual + stockImportado,
        inventario: normalizarInventario(detalle.existente.inventario),
        imagenUrl: detalle.existente.imagenUrl || '',
        imagenPublicId: detalle.existente.imagenPublicId || '',
      };

      await api.put(`/productos/${detalle.existente._id}`, payload);

      return {
        tipo: 'actualizado',
        codigo: payload.codigo,
      };
    }

    await api.post('/productos', {
      ...producto,
      stockTienda: Number(producto.stock || 0),
      stockTaxco: 0,
      inventario: INVENTARIOS.TIENDA,
      imagenUrl: '',
      imagenPublicId: '',
    });

    return {
      tipo: 'creado',
      codigo: producto.codigo,
    };
  };

  const handleChange = (e) => {
    const value =
      e.target.name === 'codigo' ? e.target.value.toUpperCase() : e.target.value;

    setForm((prev) => ({
      ...prev,
      [e.target.name]: value,
    }));

    if (errorFormulario) setErrorFormulario('');
  };

  const handleImagenChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    const maxBytes = 3 * 1024 * 1024;

    if (!tiposPermitidos.includes(file.type)) {
      setErrorFormulario('Solo se permiten imágenes JPG, PNG o WEBP');
      return;
    }

    if (file.size > maxBytes) {
      setErrorFormulario('La imagen no debe superar los 3 MB');
      return;
    }

    if (previewImagen?.startsWith('blob:')) {
      URL.revokeObjectURL(previewImagen);
    }

    setImagenArchivo(file);
    setPreviewImagen(URL.createObjectURL(file));
    if (errorFormulario) setErrorFormulario('');
  };

  const limpiarImagenSeleccionada = () => {
    if (previewImagen?.startsWith('blob:')) {
      URL.revokeObjectURL(previewImagen);
    }

    setImagenArchivo(null);
    setPreviewImagen('');
    setForm((prev) => ({
      ...prev,
      imagenUrl: '',
      imagenPublicId: '',
    }));
  };

  const resetForm = () => {
    if (previewImagen?.startsWith('blob:')) {
      URL.revokeObjectURL(previewImagen);
    }

    setForm(initialForm);
    setEditandoId(null);
    setErrorFormulario('');
    setImagenArchivo(null);
    setPreviewImagen('');
  };

  const cerrarFormulario = () => {
    resetForm();
    setMostrarFormulario(false);
  };

  const limpiarPreviewImportacion = () => {
    setMostrarPreviewImportacion(false);
    setResumenImportacion(initialResumenImportacion);
    setProductosPendientesImportacion([]);
  };

  const cerrarPreviewImportacion = () => {
    if (importandoPdf) return;
    limpiarPreviewImportacion();
  };

  const abrirNuevoProducto = () => {
    resetForm();
    setErrorAccion('');
    setMensajeAccion('');
    setMostrarFormulario(true);
  };

  const mapProductoToForm = (producto) => ({
    codigo: producto?.codigo || '',
    categoria: producto?.categoria || '',
    nombre: producto?.nombre || '',
    costoArtesano: producto?.costoArtesano ?? '',
    precio: producto?.precio ?? '',
    stock: obtenerStockTotal(producto),
    stockTaxco: obtenerStockTaxco(producto),
    stockTienda: obtenerStockTienda(producto),
    inventario: normalizarInventario(producto?.inventario),
    imagenUrl: producto?.imagenUrl || '',
    imagenPublicId: producto?.imagenPublicId || '',
  });

  const resetScannerEdicion = () => {
    setModoEdicionScanner(false);
    setFormScanner(initialForm);
    setMostrarConfirmacionScanner(false);
    setErrorEdicionScanner('');
  };

  const handleChangeScanner = (e) => {
    const value =
      e.target.name === 'codigo' ? e.target.value.toUpperCase() : e.target.value;

    setFormScanner((prev) => ({
      ...prev,
      [e.target.name]: value,
    }));

    if (errorEdicionScanner) setErrorEdicionScanner('');
  };

  const validarEdicionScanner = () => {
    const codigo = String(formScanner.codigo || '').trim();
    const categoria = String(formScanner.categoria || '').trim();
    const nombre = String(formScanner.nombre || '').trim();
    const costoArtesano = Number(formScanner.costoArtesano);
    const precio = Number(formScanner.precio);
    const stockTaxco = Number(formScanner.stockTaxco);
    const stockTienda = Number(formScanner.stockTienda);

    if (!codigo || !categoria || !nombre) {
      return 'Código, categoría y nombre son obligatorios';
    }

    if (
      Number.isNaN(costoArtesano) ||
      Number.isNaN(precio) ||
      Number.isNaN(stockTaxco) ||
      Number.isNaN(stockTienda)
    ) {
      return 'Costo artesano, precio y stock deben ser valores válidos';
    }

    return '';
  };

  const construirPayloadScanner = () => ({
    codigo: String(formScanner.codigo || '').trim().toUpperCase(),
    categoria: String(formScanner.categoria || '').trim(),
    nombre: String(formScanner.nombre || '').trim(),
    costoArtesano: Number(formScanner.costoArtesano),
    precio: Number(formScanner.precio),
    stockTaxco: Number(formScanner.stockTaxco),
    stockTienda: Number(formScanner.stockTienda),
    stock: Number(formScanner.stockTaxco || 0) + Number(formScanner.stockTienda || 0),
    inventario: normalizarInventario(formScanner.inventario),
    imagenUrl: formScanner.imagenUrl ?? productoConsultado?.imagenUrl ?? '',
    imagenPublicId:
      formScanner.imagenPublicId ?? productoConsultado?.imagenPublicId ?? '',
  });

  const iniciarEdicionScanner = () => {
    if (!productoConsultado) return;
    setFormScanner(mapProductoToForm(productoConsultado));
    setModoEdicionScanner(true);
    setErrorEdicionScanner('');
  };

  const cancelarEdicionScanner = () => {
    if (!productoConsultado) return;
    setFormScanner(mapProductoToForm(productoConsultado));
    setModoEdicionScanner(false);
    setMostrarConfirmacionScanner(false);
    setErrorEdicionScanner('');
  };

  const solicitarConfirmacionScanner = () => {
    const errorValidacion = validarEdicionScanner();

    if (errorValidacion) {
      setErrorEdicionScanner(errorValidacion);
      return;
    }

    setMostrarConfirmacionScanner(true);
  };

  const cerrarConfirmacionScanner = () => {
    if (guardandoCambiosScanner) return;
    setMostrarConfirmacionScanner(false);
  };

  const confirmarCambiosScanner = async () => {
    if (!productoConsultado?._id) return;

    try {
      setGuardandoCambiosScanner(true);
      setErrorEdicionScanner('');
      setErrorAccion('');
      setMensajeAccion('');

      const payload = construirPayloadScanner();

      await api.put(`/productos/${productoConsultado._id}`, payload);

      const productoActualizado = {
        ...productoConsultado,
        ...payload,
      };

      setProductoConsultado(productoActualizado);
      setFormScanner(mapProductoToForm(productoActualizado));
      setModoEdicionScanner(false);
      setMostrarConfirmacionScanner(false);
      setMensajeAccion('Producto actualizado correctamente desde el lector');

      try {
        await Promise.all([
          cargarProductos({
            page: paginaActual,
            q: busquedaAplicada,
            categoria: categoriaFiltro,
            stockBajo: soloStockBajo,
            sortKey: sortConfig.key,
            direction: sortConfig.direction,
          }),
          cargarCategorias(),
        ]);
      } catch (error) {
        setErrorAccion(
          'El producto se actualizó, pero no se pudo refrescar la lista'
        );
      }
    } catch (error) {
      setErrorEdicionScanner(
        error.response?.data?.mensaje || 'No se pudo actualizar el producto'
      );
    } finally {
      setGuardandoCambiosScanner(false);
    }
  };

  const abrirScanner = () => {
    setErrorAccion('');
    setMensajeAccion('');
    setErrorScanner('');
    setProductoConsultado(null);
    ultimoCodigoEscaneadoRef.current = '';
    resetScannerEdicion();
    setMostrarScanner(true);
  };

  const cerrarScanner = () => {
    if (consultandoCodigo) return;
    setMostrarScanner(false);
    setErrorScanner('');
    ultimoCodigoEscaneadoRef.current = '';
  };

  const cerrarModalConsulta = () => {
    if (guardandoCambiosScanner) return;
    setProductoConsultado(null);
    resetScannerEdicion();
  };

  const consultarProductoEscaneado = async (rawValue) => {
    const codigo = normalizarCodigoEscaneado(rawValue);

    if (!codigo || consultandoCodigo) return;
    if (ultimoCodigoEscaneadoRef.current === codigo) return;

    ultimoCodigoEscaneadoRef.current = codigo;
    setConsultandoCodigo(true);
    setErrorScanner('');

    try {
      const producto = await buscarProductoExistentePorCodigo(codigo);

      if (!producto) {
        setErrorScanner(`No se encontró un producto con el código ${codigo}`);
        ultimoCodigoEscaneadoRef.current = '';
        return;
      }

      setMostrarScanner(false);
      setProductoConsultado(producto);
      setFormScanner(mapProductoToForm(producto));
      setModoEdicionScanner(false);
      setMostrarConfirmacionScanner(false);
      setErrorEdicionScanner('');
    } catch (error) {
      setErrorScanner(
        error.response?.data?.mensaje ||
          'No se pudo consultar el producto escaneado'
      );
      ultimoCodigoEscaneadoRef.current = '';
    } finally {
      setConsultandoCodigo(false);
    }
  };

  const subirImagenProducto = async () => {
    if (!imagenArchivo) return null;

    const formData = new FormData();
    formData.append('imagen', imagenArchivo);

    const { data } = await api.post('/upload/producto', formData);
    return data;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorFormulario('');
    setErrorAccion('');
    setMensajeAccion('');

    try {
      const imagenSubida = await subirImagenProducto();

      const payload = {
        codigo: String(form.codigo || '').trim().toUpperCase(),
        categoria: String(form.categoria || '').trim(),
        nombre: String(form.nombre || '').trim(),
        costoArtesano: Number(form.costoArtesano),
        precio: Number(form.precio),
        stockTaxco: Number(form.stockTaxco),
        stockTienda: Number(form.stockTienda),
        stock: Number(form.stockTaxco || 0) + Number(form.stockTienda || 0),
        inventario: normalizarInventario(form.inventario),
        imagenUrl: imagenSubida?.url ?? form.imagenUrl ?? '',
        imagenPublicId: imagenSubida?.publicId ?? form.imagenPublicId ?? '',
      };

      if (editandoId) {
        await api.put(`/productos/${editandoId}`, payload);
        setMensajeAccion('Producto actualizado correctamente');
      } else {
        await api.post('/productos', payload);
        setMensajeAccion('Producto creado correctamente');
      }

      resetForm();
      setMostrarFormulario(false);

      await Promise.all([
        cargarProductos({
          page: paginaActual,
          q: busquedaAplicada,
          categoria: categoriaFiltro,
          stockBajo: soloStockBajo,
          sortKey: sortConfig.key,
          direction: sortConfig.direction,
        }),
        cargarCategorias(),
      ]);
    } catch (error) {
      setErrorFormulario(
        error.response?.data?.mensaje || 'No se pudo guardar el producto'
      );
    }
  };

  const editar = (producto) => {
    if (previewImagen?.startsWith('blob:')) {
      URL.revokeObjectURL(previewImagen);
    }

    setEditandoId(producto._id);
    setForm(mapProductoToForm(producto));
    setPreviewImagen(producto.imagenUrl || '');
    setImagenArchivo(null);
    setErrorFormulario('');
    setErrorAccion('');
    setMensajeAccion('');
    setMostrarFormulario(true);
  };

  const abrirModalEliminar = (producto) => {
    setErrorAccion('');
    setMensajeAccion('');
    setProductoAEliminar(producto);
  };

  const cerrarModalEliminar = () => {
    if (eliminandoProducto) return;
    setProductoAEliminar(null);
  };

  const confirmarEliminar = async () => {
    if (!productoAEliminar?._id) return;

    try {
      setEliminandoProducto(true);
      setErrorAccion('');
      setMensajeAccion('');
      await api.delete(`/productos/${productoAEliminar._id}`);

      const paginaObjetivo =
        productos.length === 1 && paginaActual > 1 ? paginaActual - 1 : paginaActual;

      setProductoAEliminar(null);
      setMensajeAccion('Producto eliminado correctamente');

      await Promise.all([
        cargarProductos({
          page: paginaObjetivo,
          q: busquedaAplicada,
          categoria: categoriaFiltro,
          stockBajo: soloStockBajo,
          sortKey: sortConfig.key,
          direction: sortConfig.direction,
        }),
        cargarCategorias(),
      ]);
    } catch (error) {
      setErrorAccion(
        error.response?.data?.mensaje || 'No se pudo eliminar el producto'
      );
    } finally {
      setEliminandoProducto(false);
    }
  };

  const limpiarFiltroStockBajo = () => {
    setSoloStockBajo(false);
    navigate('/inventario', { replace: true });
  };

  const requestSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        key,
        direction: 'asc',
      };
    });
  };

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ChevronDown size={14} className="text-gray-300" />;
    }

    return sortConfig.direction === 'asc' ? (
      <ChevronUp size={14} className="text-indigo-600" />
    ) : (
      <ChevronDown size={14} className="text-indigo-600" />
    );
  };

  const getCategoriaStyle = (categoria) => {
    const nombre = (categoria || '').toLowerCase();
    if (nombre.includes('lana')) return 'bg-pink-100 text-pink-700';
    if (nombre.includes('hilo')) return 'bg-indigo-100 text-indigo-700';
    if (nombre.includes('accesorio')) return 'bg-emerald-100 text-emerald-700';
    return 'bg-slate-100 text-slate-700';
  };

  const getStockStyle = (stock) => {
    const valor = Number(stock);

    if (valor <= 1) {
      return 'bg-red-100 text-red-700';
    }

    if (valor <= 3) {
      return 'bg-amber-100 text-amber-700';
    }

    return 'bg-emerald-100 text-emerald-700';
  };

  const getStockLabel = (stock) => {
    const valor = Number(stock);

    if (valor <= 1) return 'Crítico';
    if (valor <= 3) return 'Bajo';
    return 'Disponible';
  };

  const getTipoImportacionStyle = (tipo) => {
    if (tipo === 'actualizar') return 'bg-amber-100 text-amber-700';
    if (tipo === 'crear') return 'bg-emerald-100 text-emerald-700';
    return 'bg-red-100 text-red-700';
  };

  const getTipoImportacionLabel = (tipo) => {
    if (tipo === 'actualizar') return 'Sumar stock';
    if (tipo === 'crear') return 'Nuevo';
    return 'Error';
  };

  const renderImagenProducto = (producto, className = 'h-14 w-14') => {
    if (producto?.imagenUrl) {
      return (
        <img
          src={producto.imagenUrl}
          alt={producto.nombre}
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
        <ImageIcon size={18} />
      </div>
    );
  };

  const abrirSelectorPdf = () => {
    setErrorAccion('');
    setMensajeAccion('');
    pdfInputRef.current?.click();
  };

  const handlePdfChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorAccion('');
    setMensajeAccion('');

    try {
      const esPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (!esPdf) {
        throw new Error('Solo se permiten archivos PDF');
      }

      if (file.size > PDF_MAX_BYTES) {
        throw new Error('El PDF no debe superar los 10 MB');
      }

      setImportandoPdf(true);

      const { productos: productosExtraidos, invalidas } =
        await extraerProductosDesdePdf(file, categoriasDisponibles);

      if (!productosExtraidos.length) {
        const detalle = invalidas.length
          ? ` Líneas detectadas pero no válidas: ${invalidas.slice(0, 3).join(' | ')}${
              invalidas.length > 3 ? ' | ...' : ''
            }`
          : '';

        throw new Error(
          'No se encontraron filas válidas en el PDF. Verifica que exista texto real en el archivo y que las columnas sean: Código, Categoría, Nombre, Costo artesano, Precio venta y Stock.' +
            detalle
        );
      }

      const analisis = await analizarProductosImportacion(productosExtraidos);

      const pendientes = analisis.detalles.filter(
        (detalle) => detalle.tipo === 'crear' || detalle.tipo === 'actualizar'
      );

      if (!pendientes.length) {
        throw new Error(
          'El PDF sí se leyó, pero no hubo productos nuevos ni stock por actualizar.'
        );
      }

      setProductosPendientesImportacion(pendientes);
      setResumenImportacion({
        archivo: file.name,
        ...analisis,
      });
      setMostrarPreviewImportacion(true);
    } catch (error) {
      setErrorAccion(
        error?.response?.data?.mensaje ||
          error?.message ||
          'No se pudo analizar el PDF'
      );
    } finally {
      setImportandoPdf(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const confirmarImportacionPdf = async () => {
    if (!productosPendientesImportacion.length) return;

    try {
      setImportandoPdf(true);
      setErrorAccion('');
      setMensajeAccion('');

      let creados = 0;
      let actualizados = 0;
      const errores = [];

      for (const detalle of productosPendientesImportacion) {
        try {
          const resultado = await importarProductoDesdePdf(detalle);

          if (resultado.tipo === 'creado') {
            creados += 1;
          } else if (resultado.tipo === 'actualizado') {
            actualizados += 1;
          }
        } catch (error) {
          errores.push(
            `${detalle.codigo}: ${
              error.response?.data?.mensaje || 'No se pudo importar'
            }`
          );
        }
      }

      if (creados > 0 || actualizados > 0) {
        await Promise.all([
          cargarProductos({
            page: paginaActual,
            q: busquedaAplicada,
            categoria: categoriaFiltro,
            stockBajo: soloStockBajo,
            sortKey: sortConfig.key,
            direction: sortConfig.direction,
          }),
          cargarCategorias(),
        ]);
      }

      limpiarPreviewImportacion();

      if (errores.length === 0) {
        setMensajeAccion(
          `Importación completada. Nuevos: ${creados}. Stock actualizado: ${actualizados}.`
        );
      } else if (creados > 0 || actualizados > 0) {
        setMensajeAccion(
          `Importación parcial. Nuevos: ${creados}. Stock actualizado: ${actualizados}. Errores: ${errores.length}.`
        );
        setErrorAccion(
          errores.slice(0, 3).join(' | ') + (errores.length > 3 ? ' | ...' : '')
        );
      } else {
        setErrorAccion(
          errores[0] || 'No se pudo importar ningún producto desde el PDF'
        );
      }
    } catch (error) {
      setErrorAccion(error.message || 'No se pudo completar la importación');
    } finally {
      setImportandoPdf(false);
    }
  };

  const obtenerTodosLosProductosParaExportar = async () => {
    const primerRespuesta = await api.get('/productos/inventario', {
      params: {
        page: 1,
        limit: 500,
        q: busquedaAplicada,
        categoria: categoriaFiltro === 'todas' ? '' : categoriaFiltro,
        stockBajo: soloStockBajo,
        sortKey: sortConfig.key,
        direction: sortConfig.direction,
      },
    });

    const primerData = primerRespuesta.data || {};
    let items = Array.isArray(primerData.items) ? [...primerData.items] : [];
    const totalPages = Number(primerData.totalPages || 1);

    if (totalPages <= 1) {
      return items;
    }

    for (let page = 2; page <= totalPages; page += 1) {
      const { data } = await api.get('/productos/inventario', {
        params: {
          page,
          limit: 500,
          q: busquedaAplicada,
          categoria: categoriaFiltro === 'todas' ? '' : categoriaFiltro,
          stockBajo: soloStockBajo,
          sortKey: sortConfig.key,
          direction: sortConfig.direction,
        },
      });

      if (Array.isArray(data?.items)) {
        items = items.concat(data.items);
      }
    }

    return items;
  };

  const exportarInventarioExcel = async () => {
    try {
      setExportandoExcel(true);
      setErrorAccion('');
      setMensajeAccion('');

      const items = await obtenerTodosLosProductosParaExportar();

      if (!items.length) {
        setErrorAccion('No hay productos para exportar');
        return;
      }
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Hilos en Nogada';
      workbook.created = new Date();
      workbook.modified = new Date();

      const worksheet = workbook.addWorksheet('Inventario', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.columns = [
        { header: 'Código', key: 'codigo', width: 16 },
        { header: 'Categoría', key: 'categoria', width: 22 },
        { header: 'Nombre', key: 'nombre', width: 38 },
        { header: 'Costo artesano', key: 'costoArtesano', width: 18 },
        { header: 'Precio venta', key: 'precio', width: 18 },
        { header: 'Stock total', key: 'stock', width: 12 },
        { header: 'Stock Tienda', key: 'stockTienda', width: 14 },
        { header: 'Stock Taxco', key: 'stockTaxco', width: 14 },
        { header: 'Estado', key: 'estado', width: 14 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.height = 22;

      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF111827' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });

      worksheet.autoFilter = {
        from: 'A1',
        to: 'I1',
      };

      items.forEach((producto) => {
        const stock = obtenerStockTotal(producto);
        const estado = getStockLabel(stock);

        const row = worksheet.addRow({
          codigo: producto.codigo || '',
          categoria: producto.categoria || '',
          nombre: producto.nombre || '',
          costoArtesano: Number(producto.costoArtesano || 0),
          precio: Number(producto.precio || 0),
          stock,
          stockTienda: obtenerStockTienda(producto),
          stockTaxco: obtenerStockTaxco(producto),
          estado,
        });

        row.height = 20;

        let fillColor = 'FFFFFFFF';
        let fontColor = 'FF111827';

        if (stock <= 1) {
          fillColor = 'FFFEE2E2';
          fontColor = 'FF991B1B';
        } else if (stock <= 3) {
          fillColor = 'FFFEF3C7';
          fontColor = 'FF92400E';
        } else {
          fillColor = 'FFDCFCE7';
          fontColor = 'FF166534';
        }

        row.eachCell((cell, colNumber) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal:
              colNumber === 4 ||
              colNumber === 5 ||
              colNumber === 6 ||
              colNumber === 7 ||
              colNumber === 8
                ? 'right'
                : colNumber === 9
                ? 'center'
                : 'left',
          };

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };

          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: fillColor },
          };

          cell.font = {
            color: { argb: fontColor },
          };
        });

        row.getCell(4).numFmt = '$#,##0.00';
        row.getCell(5).numFmt = '$#,##0.00';
      });

      const totalRow = worksheet.addRow({
        codigo: '',
        categoria: '',
        nombre: `Total de productos: ${items.length}`,
        costoArtesano: '',
        precio: '',
        stock: items.reduce((acc, item) => acc + Number(item.stock || 0), 0),
        estado: '',
      });

      totalRow.height = 22;

      totalRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF111827' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        cell.alignment = { vertical: 'middle' };
      });

      const fecha = new Date();
      const yyyy = fecha.getFullYear();
      const mm = String(fecha.getMonth() + 1).padStart(2, '0');
      const dd = String(fecha.getDate()).padStart(2, '0');

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventario_${yyyy}-${mm}-${dd}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMensajeAccion(`Se exportaron ${items.length} producto(s) a Excel`);
    } catch (error) {
      setErrorAccion(
        error.response?.data?.mensaje || 'No se pudo exportar el inventario'
      );
    } finally {
      setExportandoExcel(false);
    }
  };

  const SortableHeader = ({ label, sortKey, align = 'left' }) => (
    <th className={`py-3 pr-4 ${align === 'right' ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => requestSort(sortKey)}
        className={`inline-flex items-center gap-1 font-medium transition hover:text-gray-800 ${
          align === 'right' ? 'ml-auto' : ''
        }`}
      >
        <span>{label}</span>
        {renderSortIcon(sortKey)}
      </button>
    </th>
  );

  return (
    <Layout>
      <Header title="Inventario" />

      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handlePdfChange}
        />

        <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start xl:gap-6">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
              Lista de productos
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Código, categoría, nombre, costo artesano, precio venta y stock
            </p>
            <p className="mt-3 max-w-[220px] text-xs leading-5 text-gray-400">
              Puedes importar un PDF y exportar el inventario a Excel sin imágenes.
            </p>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-[260px] lg:w-[280px]">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  placeholder="Buscar por código, categoría o nombre"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>

              <div className="relative w-full sm:w-[240px] lg:w-[250px]">
                <select
                  className="h-11 w-full appearance-none rounded-2xl border border-gray-200 bg-white px-4 pr-10 text-sm text-gray-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  value={categoriaFiltro}
                  onChange={(e) => setCategoriaFiltro(e.target.value)}
                >
                  <option value="todas">Todas las categorías</option>
                  {categoriasDisponibles.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {categoria}
                    </option>
                  ))}
                </select>

                <ChevronDown
                  size={18}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>

              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={abrirSelectorPdf}
                disabled={importandoPdf || exportandoExcel}
              >
                <FileUp size={17} />
                {importandoPdf ? 'Analizando PDF...' : 'Importar PDF'}
              </button>

              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={exportarInventarioExcel}
                disabled={exportandoExcel || loading || importandoPdf}
              >
                <FileSpreadsheet size={17} />
                {exportandoExcel ? 'Exportando Excel...' : 'Exportar Excel'}
              </button>

              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={abrirScanner}
                disabled={loading || importandoPdf || exportandoExcel}
              >
                <Search size={17} />
                Escanear código
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-[250px] lg:w-[260px]">
                <select
                  className="h-11 w-full appearance-none rounded-2xl border border-gray-200 bg-white px-4 pr-10 text-sm text-gray-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  value={sortConfig.key}
                  onChange={(e) =>
                    setSortConfig((prev) => ({
                      ...prev,
                      key: e.target.value,
                    }))
                  }
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      Ordenar por: {option.label}
                    </option>
                  ))}
                </select>

                <ChevronDown
                  size={18}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  setSortConfig((prev) => ({
                    ...prev,
                    direction: prev.direction === 'asc' ? 'desc' : 'asc',
                  }))
                }
                className="inline-flex h-11 min-w-[200px] items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                {sortConfig.direction === 'asc' ? (
                  <>
                    <ChevronUp size={16} />
                    Ascendente
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    Descendente
                  </>
                )}
              </button>

              <div className="w-full md:ml-auto md:w-auto">
                <button
                  type="button"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 hover:shadow-md active:scale-[0.99] md:w-auto"
                  onClick={abrirNuevoProducto}
                >
                  <Plus size={17} />
                  Agregar producto
                </button>
              </div>
            </div>
          </div>
        </div>

        {soloStockBajo ? (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Filtro activo: stock bajo
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Mostrando solo productos con stock de 3 o menos. Presiona Esc para
                quitar el filtro.
              </p>
            </div>

            <button
              type="button"
              onClick={limpiarFiltroStockBajo}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-200 bg-white px-4 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
            >
              Quitar filtro
            </button>
          </div>
        ) : null}

        {errorCarga ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorCarga}
          </div>
        ) : null}

        {errorAccion ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorAccion}
          </div>
        ) : null}

        {mensajeAccion ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {mensajeAccion}
          </div>
        ) : null}

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-500">
            {totalProductos > 0 ? (
              <>
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
              </>
            ) : (
              'Sin resultados'
            )}
          </div>

          {totalPaginas > 1 ? (
            <div className="text-sm text-gray-500">
              Página <span className="font-semibold text-gray-700">{paginaActual}</span> de{' '}
              <span className="font-semibold text-gray-700">{totalPaginas}</span>
            </div>
          ) : null}
        </div>

        {loading ? (
          <Loader />
        ) : totalProductos === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-lg font-medium text-gray-700">
              No se encontraron productos
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Agrega un producto nuevo, importa un PDF o cambia la búsqueda
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 lg:hidden">
              {productos.map((producto) => {
                const stock = obtenerStockTotal(producto);

                return (
                  <div
                    key={producto._id}
                    className={`rounded-3xl border p-4 shadow-sm ${
                      stock <= 1
                        ? 'border-red-200 bg-red-50/70'
                        : stock <= 3
                        ? 'border-amber-200 bg-amber-50/70'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {renderImagenProducto(producto)}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-wide text-gray-400">
                              {producto.codigo}
                            </p>
                            <h4 className="mt-1 text-base font-bold text-gray-900">
                              {producto.nombre}
                            </h4>
                          </div>

                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStockStyle(
                              stock
                            )}`}
                          >
                            {getStockLabel(stock)}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getCategoriaStyle(
                              producto.categoria
                            )}`}
                          >
                            {producto.categoria || 'General'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-gray-50 px-3 py-3">
                        <p className="text-[11px] text-gray-500">Costo artesano</p>
                        <p className="mt-1 text-sm font-semibold text-gray-800">
                          {formatearMoneda(producto.costoArtesano)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 px-3 py-3">
                        <p className="text-[11px] text-gray-500">Precio venta</p>
                        <p className="mt-1 text-sm font-semibold text-gray-800">
                          {formatearMoneda(producto.precio)}
                        </p>
                      </div>

                      <div className="col-span-2 rounded-2xl bg-gray-50 px-3 py-3">
                        <p className="text-[11px] text-gray-500">Stock total</p>
                        <p className="mt-1 text-sm font-semibold text-gray-800">
                          {stock}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Tienda {obtenerStockTienda(producto)} · Taxco {obtenerStockTaxco(producto)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        onClick={() => editar(producto)}
                      >
                        <Pencil size={15} />
                        Editar
                      </button>

                      <button
                        type="button"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700"
                        onClick={() => abrirModalEliminar(producto)}
                      >
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden max-h-[70vh] overflow-auto rounded-2xl border border-gray-200 lg:block">
              <table className="min-w-[1120px] w-full text-left">
                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                  <tr className="border-b border-gray-200 text-sm text-gray-500">
                    <th className="py-3 pr-4">Imagen</th>
                    <SortableHeader label="Código" sortKey="codigo" />
                    <SortableHeader label="Categoría" sortKey="categoria" />
                    <SortableHeader label="Nombre" sortKey="nombre" />
                    <SortableHeader label="Costo artesano" sortKey="costoArtesano" />
                    <SortableHeader label="Precio venta" sortKey="precio" />
                    <SortableHeader label="Total" sortKey="stock" />
                    <SortableHeader label="Tienda" sortKey="stockTienda" />
                    <SortableHeader label="Taxco" sortKey="stockTaxco" />
                    <th className="py-3 pr-4">Estado</th>
                    <th className="py-3 pr-4 text-right">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {productos.map((producto) => {
                    const stock = obtenerStockTotal(producto);

                    return (
                      <tr
                        key={producto._id}
                        className={`border-b border-gray-100 transition hover:bg-gray-50 ${
                          stock <= 1 ? 'bg-red-50/70' : stock <= 3 ? 'bg-amber-50/60' : ''
                        }`}
                      >
                        <td className="py-4 pr-4">
                          {renderImagenProducto(producto, 'h-12 w-12')}
                        </td>

                        <td className="py-4 pr-4 font-medium text-gray-800">
                          {producto.codigo}
                        </td>

                        <td className="py-4 pr-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getCategoriaStyle(
                              producto.categoria
                            )}`}
                          >
                            {producto.categoria || 'General'}
                          </span>
                        </td>

                        <td className="py-4 pr-4 font-semibold text-gray-800">
                          {producto.nombre}
                        </td>

                        <td className="py-4 pr-4 text-gray-700">
                          {formatearMoneda(producto.costoArtesano)}
                        </td>

                        <td className="py-4 pr-4 font-medium text-gray-800">
                          {formatearMoneda(producto.precio)}
                        </td>

                        <td className="py-4 pr-4 font-medium">{stock}</td>
                        <td className="py-4 pr-4 font-medium text-gray-700">
                          {obtenerStockTienda(producto)}
                        </td>
                        <td className="py-4 pr-4 font-medium text-gray-700">
                          {obtenerStockTaxco(producto)}
                        </td>

                        <td className="py-4 pr-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStockStyle(
                              stock
                            )}`}
                          >
                            {getStockLabel(stock)}
                          </span>
                        </td>

                        <td className="py-4 pr-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                              onClick={() => editar(producto)}
                            >
                              <Pencil size={15} />
                              Editar
                            </button>

                            <button
                              type="button"
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-red-700"
                              onClick={() => abrirModalEliminar(producto)}
                            >
                              <Trash2 size={15} />
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

            {totalPaginas > 1 ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setPaginaActual((prev) => Math.max(prev - 1, 1))}
                  disabled={paginaActual === 1}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {paginasVisibles.map((pagina) => (
                    <button
                      key={pagina}
                      type="button"
                      onClick={() => setPaginaActual(pagina)}
                      className={`inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl px-3 text-sm font-semibold transition ${
                        pagina === paginaActual
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {pagina}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPaginaActual((prev) => Math.min(prev + 1, totalPaginas))
                  }
                  disabled={paginaActual === totalPaginas}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {mostrarFormulario ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="absolute inset-0" onClick={cerrarFormulario} />

          <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6 md:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
                  {editandoId ? 'Editar producto' : 'Nuevo producto'}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Captura la información del producto para inventario
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Presiona Esc para cerrar este modal.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition hover:bg-gray-200"
                onClick={cerrarFormulario}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {errorFormulario ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorFormulario}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Código
                  </label>
                  <input
                    className="input"
                    name="codigo"
                    placeholder="Escribe el código"
                    value={form.codigo}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Categoría
                  </label>
                  <input
                    className="input"
                    name="categoria"
                    placeholder="Escribe la categoría"
                    value={form.categoria}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Nombre
                  </label>
                  <input
                    className="input"
                    name="nombre"
                    placeholder="Escribe el nombre del producto"
                    value={form.nombre}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Costo artesano
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    name="costoArtesano"
                    placeholder="0.00"
                    value={form.costoArtesano}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Precio venta
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    name="precio"
                    placeholder="0.00"
                    value={form.precio}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Inventario principal
                  </label>
                  <select
                    className="input"
                    name="inventario"
                    value={form.inventario}
                    onChange={handleChange}
                  >
                    <option value={INVENTARIOS.TIENDA}>Inventario de Tienda</option>
                    <option value={INVENTARIOS.TAXCO}>Inventario de Taxco</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Stock Tienda
                  </label>
                  <input
                    className="input"
                    type="number"
                    name="stockTienda"
                    placeholder="0"
                    value={form.stockTienda}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Stock Taxco
                  </label>
                  <input
                    className="input"
                    type="number"
                    name="stockTaxco"
                    placeholder="0"
                    value={form.stockTaxco}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Imagen del producto
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImagenChange}
                    className="input"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Formatos permitidos: JPG, PNG o WEBP. Máximo 3 MB.
                  </p>
                </div>

                <div className="flex items-end">
                  {previewImagen || form.imagenUrl ? (
                    <button
                      type="button"
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      onClick={limpiarImagenSeleccionada}
                    >
                      Quitar imagen
                    </button>
                  ) : null}
                </div>
              </div>

              {previewImagen || form.imagenUrl ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-3 text-sm font-medium text-gray-700">Vista previa</p>
                  <img
                    src={previewImagen || form.imagenUrl}
                    alt="Vista previa del producto"
                    className="h-28 w-28 rounded-2xl border border-gray-200 bg-white object-cover"
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-3 pt-2 md:flex-row">
                <button className="btn-primary" type="submit">
                  {editandoId ? 'Actualizar producto' : 'Guardar producto'}
                </button>

                <button className="btn-secondary" type="button" onClick={resetForm}>
                  Limpiar
                </button>

                <button
                  className="btn-secondary"
                  type="button"
                  onClick={cerrarFormulario}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {mostrarPreviewImportacion ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="absolute inset-0" onClick={cerrarPreviewImportacion} />

          <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    <Eye size={14} />
                    Vista previa de importación
                  </div>

                  <h3 className="mt-3 text-xl font-bold text-gray-900 sm:text-2xl">
                    Revisa el PDF antes de importar
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Archivo: <span className="font-medium">{resumenImportacion.archivo}</span>
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Los productos existentes no se duplicarán: solo se sumará el stock.
                  </p>
                </div>

                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={cerrarPreviewImportacion}
                  disabled={importandoPdf}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Detectados
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-800">
                    {resumenImportacion.totalDetectados}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
                    Nuevos
                  </p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700">
                    {resumenImportacion.nuevos}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-600">
                    Actualizar stock
                  </p>
                  <p className="mt-2 text-2xl font-bold text-amber-700">
                    {resumenImportacion.actualizar}
                  </p>
                </div>

                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-red-600">
                    Errores
                  </p>
                  <p className="mt-2 text-2xl font-bold text-red-700">
                    {resumenImportacion.errores}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {productosNuevosImportacion.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/30">
                    <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
                      <h4 className="text-sm font-bold text-emerald-800">
                        Productos nuevos ({productosNuevosImportacion.length})
                      </h4>
                      <p className="mt-1 text-xs text-emerald-700">
                        Estos productos se crearán en el inventario.
                      </p>
                    </div>

                    <div className="max-h-[28vh] overflow-auto bg-white">
                      <table className="min-w-[820px] w-full text-left">
                        <thead className="sticky top-0 z-10 bg-white shadow-sm">
                          <tr className="border-b border-emerald-100 text-sm text-gray-500">
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3">Categoría</th>
                            <th className="px-4 py-3">Nombre</th>
                            <th className="px-4 py-3 text-right">Costo</th>
                            <th className="px-4 py-3 text-right">Precio</th>
                            <th className="px-4 py-3 text-right">Stock inicial</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productosNuevosImportacion.map((detalle) => {
                            const producto = detalle.producto || {};

                            return (
                              <tr
                                key={`crear-${detalle.codigo}`}
                                className="border-b border-gray-100 bg-emerald-50/20"
                              >
                                <td className="px-4 py-4 font-semibold text-gray-800">
                                  {detalle.codigo}
                                </td>
                                <td className="px-4 py-4 text-gray-700">
                                  {producto.categoria || '—'}
                                </td>
                                <td className="px-4 py-4 text-gray-800">
                                  {producto.nombre || '—'}
                                </td>
                                <td className="px-4 py-4 text-right text-gray-700">
                                  {formatearMoneda(producto.costoArtesano)}
                                </td>
                                <td className="px-4 py-4 text-right text-gray-700">
                                  {formatearMoneda(producto.precio)}
                                </td>
                                <td className="px-4 py-4 text-right font-semibold text-emerald-700">
                                  {Number(detalle.stockImportado || producto.stock || 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {productosActualizarStockImportacion.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/30">
                    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
                      <h4 className="text-sm font-bold text-amber-800">
                        Productos que solo aumentarán stock ({productosActualizarStockImportacion.length})
                      </h4>
                      <p className="mt-1 text-xs text-amber-700">
                        Se conservará la información actual del producto y solo se sumará el stock.
                      </p>
                    </div>

                    <div className="max-h-[28vh] overflow-auto bg-white">
                      <table className="min-w-[980px] w-full text-left">
                        <thead className="sticky top-0 z-10 bg-white shadow-sm">
                          <tr className="border-b border-amber-100 text-sm text-gray-500">
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3">Categoría actual</th>
                            <th className="px-4 py-3">Nombre actual</th>
                            <th className="px-4 py-3 text-right">Stock PDF</th>
                            <th className="px-4 py-3 text-right">Stock actual</th>
                            <th className="px-4 py-3 text-right">Stock final</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productosActualizarStockImportacion.map((detalle) => {
                            const existente = detalle.existente || {};

                            return (
                              <tr
                                key={`actualizar-${detalle.codigo}`}
                                className="border-b border-gray-100 bg-amber-50/20"
                              >
                                <td className="px-4 py-4 font-semibold text-gray-800">
                                  {detalle.codigo}
                                </td>
                                <td className="px-4 py-4 text-gray-700">
                                  {existente.categoria || detalle.producto?.categoria || '—'}
                                </td>
                                <td className="px-4 py-4 text-gray-800">
                                  {existente.nombre || detalle.producto?.nombre || '—'}
                                </td>
                                <td className="px-4 py-4 text-right font-medium text-gray-800">
                                  {Number(detalle.stockImportado || 0)}
                                </td>
                                <td className="px-4 py-4 text-right text-gray-700">
                                  {Number(detalle.stockActual || 0)}
                                </td>
                                <td className="px-4 py-4 text-right font-bold text-amber-700">
                                  {Number(detalle.stockFinal || 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {productosErrorImportacion.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50/30">
                    <div className="border-b border-red-200 bg-red-50 px-4 py-3">
                      <h4 className="text-sm font-bold text-red-800">
                        Registros con error ({productosErrorImportacion.length})
                      </h4>
                    </div>

                    <div className="divide-y divide-red-100 bg-white">
                      {productosErrorImportacion.map((detalle) => (
                        <div
                          key={`error-${detalle.codigo || detalle.mensaje}`}
                          className="px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-gray-800">
                            {detalle.codigo || 'Sin código'}
                          </p>
                          <p className="mt-1 text-sm text-red-600">
                            {detalle.mensaje || 'No se pudo analizar el producto'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                Se importarán <strong>{productosPendientesImportacion.length}</strong>{' '}
                producto(s): <strong>{productosNuevosImportacion.length}</strong> nuevos y{' '}
                <strong>{productosActualizarStockImportacion.length}</strong> con aumento de
                stock. Los códigos existentes conservarán su información actual y
                únicamente aumentarán su stock.
              </div>
            </div>

            <div className="border-t border-gray-200 px-5 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={cerrarPreviewImportacion}
                  disabled={importandoPdf}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmarImportacionPdf}
                  disabled={importandoPdf || !productosPendientesImportacion.length}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importandoPdf ? (
                    <>
                      <RefreshCcw size={16} className="animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Confirmar importación
                    </>
                  )}
                </button>
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
                  onError={(error) => {
                    setErrorScanner(error?.message || 'No se pudo acceder a la cámara');
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

          <div
  className={`relative w-full overflow-y-auto rounded-3xl border border-gray-200 bg-white shadow-2xl ${
    modoEdicionScanner
      ? 'max-h-[88vh] max-w-2xl p-4 sm:p-5'
      : 'max-h-[80vh] max-w-xl p-4 sm:p-5'
  }`}
>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
                    {modoEdicionScanner
                      ? 'Editar producto escaneado'
                      : 'Consulta de producto'}
                  </h3>

                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {productoConsultado.codigo}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  {modoEdicionScanner
                    ? 'Modifica los datos y confirma para aplicar los cambios.'
                    : 'Aquí puedes consultar el producto y editarlo sin salir del lector.'}
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition hover:bg-gray-200"
                onClick={cerrarModalConsulta}
                disabled={guardandoCambiosScanner}
              >
                <X size={18} />
              </button>
            </div>

            {errorEdicionScanner ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorEdicionScanner}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
              <div className="flex justify-center md:justify-start">
                {renderImagenProducto(
                  modoEdicionScanner ? formScanner : productoConsultado,
                  'h-24 w-24 sm:h-28 sm:w-28'
                )}
              </div>

              {!modoEdicionScanner ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Nombre
                    </p>
                    <h4 className="mt-1 text-2xl font-bold text-gray-900">
                      {productoConsultado.nombre}
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getCategoriaStyle(
                        productoConsultado.categoria
                      )}`}
                    >
                      {productoConsultado.categoria || 'General'}
                    </span>

                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStockStyle(
                        productoConsultado.stock
                      )}`}
                    >
                      {getStockLabel(productoConsultado.stock)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-gray-50 px-4 py-3">
                      <p className="text-[11px] text-gray-500">Costo artesano</p>
                      <p className="mt-1 text-sm font-semibold text-gray-800">
                        {formatearMoneda(productoConsultado.costoArtesano)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 px-4 py-3">
                      <p className="text-[11px] text-gray-500">Precio venta</p>
                      <p className="mt-1 text-sm font-semibold text-gray-800">
                        {formatearMoneda(productoConsultado.precio)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 px-4 py-3 sm:col-span-2">
                      <p className="text-[11px] text-gray-500">Stock total</p>
                      <p className="mt-1 text-sm font-semibold text-gray-800">
                        {obtenerStockTotal(productoConsultado)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Tienda {obtenerStockTienda(productoConsultado)} · Taxco{' '}
                        {obtenerStockTaxco(productoConsultado)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Código
                      </label>
                      <input
                        className="input"
                        name="codigo"
                        value={formScanner.codigo}
                        onChange={handleChangeScanner}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Categoría
                      </label>
                      <input
                        className="input"
                        name="categoria"
                        value={formScanner.categoria}
                        onChange={handleChangeScanner}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Nombre
                      </label>
                      <input
                        className="input"
                        name="nombre"
                        value={formScanner.nombre}
                        onChange={handleChangeScanner}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Costo artesano
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        name="costoArtesano"
                        value={formScanner.costoArtesano}
                        onChange={handleChangeScanner}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Precio venta
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        name="precio"
                        value={formScanner.precio}
                        onChange={handleChangeScanner}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Stock Tienda
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        name="stockTienda"
                        value={formScanner.stockTienda}
                        onChange={handleChangeScanner}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Stock Taxco
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        name="stockTaxco"
                        value={formScanner.stockTaxco}
                        onChange={handleChangeScanner}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              {!modoEdicionScanner ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    onClick={abrirScanner}
                  >
                    Volver a escanear
                  </button>

                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    onClick={iniciarEdicionScanner}
                  >
                    <Pencil size={16} />
                    Editar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    onClick={cancelarEdicionScanner}
                    disabled={guardandoCambiosScanner}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={solicitarConfirmacionScanner}
                    disabled={guardandoCambiosScanner}
                  >
                    <CheckCircle2 size={16} />
                    Guardar cambios
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {mostrarConfirmacionScanner ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-3 sm:p-4">
          <div className="absolute inset-0" onClick={cerrarConfirmacionScanner} />

          <div className="relative w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle size={20} />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-gray-800">
                  Confirmar cambios
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Vas a actualizar el producto escaneado. Revisa la información antes de aplicar los cambios.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Código</p>
                <p className="mt-1 font-semibold text-gray-800">{formScanner.codigo}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Categoría</p>
                <p className="mt-1 font-semibold text-gray-800">{formScanner.categoria}</p>
              </div>

              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500">Nombre</p>
                <p className="mt-1 font-semibold text-gray-800">{formScanner.nombre}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Costo artesano</p>
                <p className="mt-1 font-semibold text-gray-800">
                  {formatearMoneda(formScanner.costoArtesano)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Precio venta</p>
                <p className="mt-1 font-semibold text-gray-800">
                  {formatearMoneda(formScanner.precio)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Stock Tienda</p>
                <p className="mt-1 font-semibold text-gray-800">{formScanner.stockTienda}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Stock Taxco</p>
                <p className="mt-1 font-semibold text-gray-800">{formScanner.stockTaxco}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={cerrarConfirmacionScanner}
                disabled={guardandoCambiosScanner}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarCambiosScanner}
                disabled={guardandoCambiosScanner}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardandoCambiosScanner ? (
                  <>
                    <RefreshCcw size={16} className="animate-spin" />
                    Aplicando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Sí, aplicar cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productoAEliminar ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="absolute inset-0" onClick={cerrarModalEliminar} />

          <div className="relative w-full max-w-md rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                <AlertTriangle size={26} />
              </div>

              <div className="min-w-0">
                <h3 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Confirmar eliminación
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Esta acción eliminará el producto del inventario.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
              <p className="text-sm text-red-700">
                ¿Seguro que quieres eliminar <strong>{productoAEliminar.nombre}</strong>?
              </p>
              <p className="mt-2 text-xs text-red-600">
                Código: {productoAEliminar.codigo || 'Sin código'} · Categoría:{' '}
                {productoAEliminar.categoria || 'General'}
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cerrarModalEliminar}
                disabled={eliminandoProducto}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarEliminar}
                disabled={eliminandoProducto}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={16} />
                {eliminandoProducto ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
