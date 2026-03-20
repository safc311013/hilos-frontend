export const PERMISOS = {
  VER_DASHBOARD: 'ver_dashboard',
  GESTIONAR_INVENTARIO: 'gestionar_inventario',
  VER_VENTAS: 'ver_ventas',
  REGISTRAR_VENTAS: 'registrar_ventas',
  VER_REPORTES: 'ver_reportes',
  GESTIONAR_USUARIOS: 'gestionar_usuarios',
  GESTIONAR_COTIZACIONES: 'gestionar_cotizaciones',
};

export const PERMISOS_POR_ROL = {
  admin: [
    PERMISOS.VER_DASHBOARD,
    PERMISOS.GESTIONAR_INVENTARIO,
    PERMISOS.VER_VENTAS,
    PERMISOS.REGISTRAR_VENTAS,
    PERMISOS.VER_REPORTES,
    PERMISOS.GESTIONAR_USUARIOS,
    PERMISOS.GESTIONAR_COTIZACIONES,
  ],
  supervisor: [
    PERMISOS.VER_DASHBOARD,
    PERMISOS.GESTIONAR_INVENTARIO,
    PERMISOS.VER_VENTAS,
    PERMISOS.REGISTRAR_VENTAS,
    PERMISOS.VER_REPORTES,
    PERMISOS.GESTIONAR_COTIZACIONES,
  ],
  cajero: [
    PERMISOS.REGISTRAR_VENTAS,
    PERMISOS.GESTIONAR_COTIZACIONES,
  ],
};

export const tienePermiso = (rol, permiso) => {
  if (!rol || !permiso) return false;
  return PERMISOS_POR_ROL[rol]?.includes(permiso) || false;
};