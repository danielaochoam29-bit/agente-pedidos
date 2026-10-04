/**
 * Convierte el pedido validado en las filas que van a AppSheet, con los nombres
 * de columna exactos de la hoja (igual que quedó PE1979).
 *
 * Las fechas van en ISO (2026-10-02): la API de AppSheet las interpreta sin
 * ambigüedad y la hoja las muestra con su propio formato.
 *
 * KEY, PE y NUMERO CONSECUTIVO del pedido los pone `conLlaves()` justo antes de
 * escribir (ver appsheet.registrarEnAppSheet), con el formato de la app:
 * PE + consecutivo + 8 hex.
 */

import { DEFAULTS } from './config.mjs';
import { fechaIso, hex8 } from './texto.mjs';

export function filaCliente(pedido, ahora = new Date()) {
  const c = pedido.cliente;
  return {
    'CLIENTE ID': hex8(),
    NOMBRE: c.nombre,
    MARCA: c.marca ?? '',
    NIT: c.nit,
    CONTACTO: c.celular,
    'TIPO CLIENTE': c.tipo,
    DIRECCION: c.direccion,
    DEPARTAMENTO: c.departamento,
    MUNICIPIO: c.municipio,
    'CLIENTE DE': c.clienteDe,
    'FECHA PDF': fechaIso(true, ahora),
    CANAL: c.canal,
  };
}

export function filaPedido(pedido, ahora = new Date()) {
  const c = pedido.cliente;
  return {
    FECHA: fechaIso(false, ahora),
    CLIENTE: c.nombre,
    'DIRECCIÓN DE ENVÍO': c.direccion,
    DEPARTAMENTO: c.departamento,
    MUNICIPIO: c.municipio,
    CELULAR: c.celular,
    'SUBTOTAL PEDIDO': pedido.subtotal,
    DESCUENTO: pedido.descuento,
    'VALOR DEL ENVÍO': pedido.valorEnvio,
    'TOTAL COP': pedido.total,
    'PAGO DEL ENVÍO': pedido.pagoDelEnvio,
    'ESTADO PEDIDO': DEFAULTS.ESTADO_PEDIDO,
    NOTAS: pedido.notas,
    'NOTAS DESPACHO': pedido.notasDespacho,
    USUARIO: pedido.vendedor,
    VENDEDOR: pedido.vendedor,
    BODEGA: pedido.bodega,
    'VALOR FINAL ACTUAL': pedido.valorFinal,
    'ESTADO PAGO': DEFAULTS.ESTADO_PAGO,
    MUESTRAS: pedido.muestras,
    'TOTAL QTY': pedido.unidades,
    'RETENCIÓN EN LA FUENTE': DEFAULTS.RETENCION,
    'PAGO CONTRAENTREGA': pedido.pagoContraentrega,
  };
}

/** Una fila por referencia. `keyPedido` es la KEY completa del pedido (p. ej. PE1979a66b85b8). */
export function filasDetalle(pedido, keyPedido, ahora = new Date()) {
  const fecha = fechaIso(false, ahora);
  return pedido.items.map((i) => ({
    KEY: hex8(),
    FECHA: fecha,
    PE: keyPedido,
    CLIENTE: pedido.cliente.nombre,
    'ITEM NRO': i.ref,
    FOTO: i.foto,
    DESCRIPCION: i.descripcion,
    EMPAQUE: i.empaque,
    CANTIDAD: i.cantidad,
    'PRECIO DE VENTA UND': i.precio,
    SUBTOTAL: i.subtotal,
    'COSTO PROMEDIO PONDERADO UNITARIO': i.costo,
  }));
}

/** Llaves generadas aquí (plan B): PE + consecutivo + 8 hex. */
export function conLlaves(fila, consecutivo) {
  const pe = `PE${consecutivo}`;
  return { KEY: `${pe}${hex8()}`, PE: pe, 'NUMERO CONSECUTIVO': consecutivo, ...fila };
}

/** Todo junto, para el ensayo en seco y para escribir. */
export function armar(pedido, { consecutivo = null, ahora = new Date() } = {}) {
  const cliente = pedido.cliente.existente ? null : filaCliente(pedido, ahora);
  let cab = filaPedido(pedido, ahora);
  if (consecutivo != null) cab = conLlaves(cab, consecutivo);
  const detalles = filasDetalle(pedido, cab.KEY ?? '(KEY la asigna AppSheet)', ahora);
  return { cliente, pedido: cab, detalles };
}
