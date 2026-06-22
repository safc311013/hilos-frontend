export const IMPRESORA_TICKETS_STORAGE_KEY = 'configuracionImpresoraTickets';

export const CONFIG_IMPRESORA_DEFAULT = {
  perfil: 'pc',
  tipoConexion: 'sistema',
  direccionIp: '',
  puerto: 9100,
  nombre: '',
  anchoMm: 80,
  margenMm: 6,
  copias: 1,
  mostrarLogo: true,
  imprimirAutomaticamente: true,
  pieTicket: 'Gracias por tu compra',
};

export const cargarConfiguracionImpresora = () => {
  try {
    const raw = localStorage.getItem(IMPRESORA_TICKETS_STORAGE_KEY);
    if (!raw) return CONFIG_IMPRESORA_DEFAULT;

    const config = JSON.parse(raw);
    return normalizarConfiguracionImpresora(config);
  } catch {
    return CONFIG_IMPRESORA_DEFAULT;
  }
};

export const guardarConfiguracionImpresora = (configuracion) => {
  const config = normalizarConfiguracionImpresora(configuracion);
  localStorage.setItem(IMPRESORA_TICKETS_STORAGE_KEY, JSON.stringify(config));
  return config;
};

export const normalizarConfiguracionImpresora = (configuracion = {}) => {
  const anchoMm = Number(configuracion.anchoMm || CONFIG_IMPRESORA_DEFAULT.anchoMm);
  const margenMm = Number(configuracion.margenMm ?? CONFIG_IMPRESORA_DEFAULT.margenMm);
  const copias = Number(configuracion.copias || CONFIG_IMPRESORA_DEFAULT.copias);
  const puerto = Number(configuracion.puerto || CONFIG_IMPRESORA_DEFAULT.puerto);

  return {
    ...CONFIG_IMPRESORA_DEFAULT,
    ...configuracion,
    anchoMm: [58, 80].includes(anchoMm) ? anchoMm : CONFIG_IMPRESORA_DEFAULT.anchoMm,
    margenMm: Math.min(Math.max(margenMm, 2), 10),
    copias: Math.min(Math.max(copias, 1), 3),
    tipoConexion: configuracion.tipoConexion === 'ip' ? 'ip' : 'sistema',
    direccionIp: String(configuracion.direccionIp || '').trim(),
    puerto: Number.isInteger(puerto) && puerto >= 1 && puerto <= 65535 ? puerto : 9100,
    mostrarLogo: Boolean(configuracion.mostrarLogo ?? CONFIG_IMPRESORA_DEFAULT.mostrarLogo),
    imprimirAutomaticamente: Boolean(
      configuracion.imprimirAutomaticamente ??
        CONFIG_IMPRESORA_DEFAULT.imprimirAutomaticamente
    ),
    pieTicket: String(configuracion.pieTicket || CONFIG_IMPRESORA_DEFAULT.pieTicket).trim(),
  };
};

const textoSeguroImpresora = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '');

const ajustarLinea = (izquierda, derecha, columnas) => {
  const izq = textoSeguroImpresora(izquierda);
  const der = textoSeguroImpresora(derecha);
  const espacio = Math.max(columnas - izq.length - der.length, 1);
  return `${izq.slice(0, columnas - der.length - 1)}${' '.repeat(espacio)}${der}`;
};

export const construirTextoTicket = ({ ticket, formatearMoneda, configuracion }) => {
  const config = normalizarConfiguracionImpresora(configuracion);
  const columnas = config.anchoMm === 58 ? 32 : 48;
  const separador = '-'.repeat(columnas);
  const lineas = [
    'HILOS EN NOGADA',
    'Ticket de venta',
    config.nombre,
    separador,
    ajustarLinea('Num. ticket', ticket.numeroTicket, columnas),
    ajustarLinea('Usuario', ticket.usuario, columnas),
    ajustarLinea('Fecha', ticket.fecha, columnas),
    ajustarLinea('Hora', ticket.hora, columnas),
    ajustarLinea('Pago', ticket.metodoPago, columnas),
    separador,
  ];

  (ticket.productos || []).forEach((item) => {
    lineas.push(textoSeguroImpresora(item.nombre).slice(0, columnas));
    lineas.push(
      ajustarLinea(
        `${item.cantidad} x ${formatearMoneda(item.precioUnitario)}`,
        formatearMoneda(item.subtotal),
        columnas
      )
    );
    if (Number(item.montoDescuento || 0) > 0) {
      lineas.push(
        ajustarLinea('Descuento', `- ${formatearMoneda(item.montoDescuento)}`, columnas)
      );
    }
  });

  lineas.push(
    separador,
    ajustarLinea('TOTAL', formatearMoneda(ticket.total), columnas),
    separador,
    config.pieTicket,
    '',
    ''
  );
  return textoSeguroImpresora(lineas.filter((linea) => linea !== undefined).join('\n'));
};

export const probarImpresoraIp = async (configuracion) => {
  const config = normalizarConfiguracionImpresora(configuracion);
  const respuesta = await fetch('/api/desktop/printer/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip: config.direccionIp, puerto: config.puerto }),
  });
  const resultado = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(resultado.mensaje || 'No se pudo conectar con la impresora.');
  return resultado;
};

const escapeHtml = (texto) => {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const construirHtmlTicket = ({
  ticket,
  formatearMoneda,
  configuracion = cargarConfiguracionImpresora(),
  autoPrint = true,
}) => {
  const config = normalizarConfiguracionImpresora(configuracion);
  const logoUrl = `${window.location.origin}/logo.png`;
  const anchoContenido = Math.max(config.anchoMm - config.margenMm * 2, 42);
  const copias = Array.from({ length: config.copias });

  const cuerpoTicket = (_, index) => `
    <div class="ticket ${index > 0 ? 'copia' : ''}">
      <div class="center">
        ${
          config.mostrarLogo
            ? `<img src="${logoUrl}" alt="Logo" class="logo" onerror="this.style.display='none'" />`
            : ''
        }
        <div class="title">Hilos en Nogada</div>
        <div class="muted">Ticket de venta</div>
        ${config.nombre ? `<div class="printer-name">${escapeHtml(config.nombre)}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="row"><span>Num. ticket</span><strong>${escapeHtml(ticket.numeroTicket)}</strong></div>
      <div class="row"><span>Usuario</span><strong>${escapeHtml(ticket.usuario)}</strong></div>
      <div class="row"><span>Fecha</span><strong>${escapeHtml(ticket.fecha)}</strong></div>
      <div class="row"><span>Hora</span><strong>${escapeHtml(ticket.hora)}</strong></div>
      <div class="row"><span>Pago</span><strong>${escapeHtml(ticket.metodoPago)}</strong></div>

      <div class="divider"></div>

      ${(ticket.productos || [])
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

      <div class="center small muted">${escapeHtml(config.pieTicket)}</div>
    </div>
  `;

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Ticket ${escapeHtml(ticket.numeroTicket)}</title>
        <style>
          @page {
            size: ${config.anchoMm}mm auto;
            margin: ${config.margenMm}mm;
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
            width: ${anchoContenido}mm;
            margin: 0 auto;
            font-size: ${config.anchoMm === 58 ? 10 : 12}px;
            line-height: 1.35;
          }

          .copia {
            page-break-before: always;
          }

          .center {
            text-align: center;
          }

          .logo {
            display: block;
            margin: 0 auto 8px auto;
            max-width: ${config.anchoMm === 58 ? 34 : 42}mm;
            max-height: 22mm;
            object-fit: contain;
          }

          .title {
            font-size: ${config.anchoMm === 58 ? 14 : 16}px;
            font-weight: 700;
            margin-bottom: 2px;
          }

          .printer-name {
            margin-top: 3px;
            font-size: 10px;
            color: #6b7280;
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

          .item-meta,
          .item-discount {
            font-size: ${config.anchoMm === 58 ? 9 : 11}px;
            display: flex;
            justify-content: space-between;
            gap: 8px;
          }

          .item-meta {
            color: #4b5563;
          }

          .item-discount {
            margin-top: 3px;
            color: #b45309;
          }

          .total {
            font-size: ${config.anchoMm === 58 ? 14 : 16}px;
            font-weight: 700;
          }

          .small {
            font-size: ${config.anchoMm === 58 ? 9 : 11}px;
          }
        </style>
      </head>
      <body>
        ${copias.map(cuerpoTicket).join('')}

        ${
          autoPrint && config.imprimirAutomaticamente
            ? `<script>window.onload = function () { window.print(); };</script>`
            : ''
        }
      </body>
    </html>
  `;
};

export const imprimirTicketConfigurado = ({
  ticket,
  formatearMoneda,
  onError,
  autoPrint = true,
}) => {
  if (!ticket) return;

  const config = cargarConfiguracionImpresora();
  if (config.tipoConexion === 'ip') {
    fetch('/api/desktop/printer/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: config.direccionIp,
        puerto: config.puerto,
        copias: config.copias,
        texto: construirTextoTicket({ ticket, formatearMoneda, configuracion: config }),
      }),
    })
      .then(async (respuesta) => {
        const resultado = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(resultado.mensaje || 'No se pudo imprimir por red.');
      })
      .catch((error) => onError?.(error.message));
    return;
  }

  const ventana = window.open('', '_blank', 'width=420,height=720');

  if (!ventana) {
    onError?.('No se pudo abrir la ventana de impresion. Revisa el bloqueador de ventanas.');
    return;
  }

  ventana.document.open();
  ventana.document.write(
    construirHtmlTicket({
      ticket,
      formatearMoneda,
      autoPrint,
    })
  );
  ventana.document.close();
};
