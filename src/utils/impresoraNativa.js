import { Capacitor, registerPlugin } from '@capacitor/core';

const NetworkPrinter = registerPlugin('NetworkPrinter');

export const esAplicacionMovilNativa = () => Capacitor.isNativePlatform();

export const probarImpresoraNativa = (configuracion) =>
  NetworkPrinter.test({
    ip: configuracion.direccionIp,
    puerto: configuracion.puerto,
  });

export const imprimirConImpresoraNativa = ({ configuracion, texto }) =>
  NetworkPrinter.print({
    ip: configuracion.direccionIp,
    puerto: configuracion.puerto,
    copias: configuracion.copias,
    texto,
  });
