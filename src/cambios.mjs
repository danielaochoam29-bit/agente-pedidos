/**
 * Qué cambia entre el pedido que ya está en AppSheet (fila + detalles) y el
 * pedido nuevo armado desde el hilo. Devuelve líneas de texto listas para Slack.
 */

import { filaPedido } from './armar.mjs';
import { cop } from './texto.mjs';

const COLUMNAS = [
  ['CLIENTE', 'Cliente'],
  ['DIRECCIÓN DE ENVÍO', 'Envío a'],
  ['DEPARTAMENTO', 'Departamento'],
  ['MUNICIPIO', 'Municipio'],
  ['CELULAR', 'Cel'],
  ['DESCUENTO', 'Descuento', cop],
  ['VALOR DEL ENVÍO', 'Envío', cop],
  ['PAGO DEL ENVÍO', 'Pago del envío'],
  ['PAGO CONTRAENTREGA', 'Mercancía contraentrega'],
  ['BODEGA', 'Bodega'],
  ['MUESTRAS', 'Muestras'],
  ['NOTAS', 'Notas'],
  ['NOTAS DESPACHO', 'Notas despacho'],
];

const texto = (v) => String(v ?? '').trim();
const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
const vacio = (v) => (v === '' ? '_(vacío)_' : v);

export function cambiosPedido(filaActual, detallesActuales, pedido) {
  const nueva = filaPedido(pedido);
  const lineas = [];
  for (const [col, etiqueta, fmt] of COLUMNAS) {
    const antes = filaActual?.[col];
    const despues = nueva[col];
    const iguales = fmt ? num(antes) === num(despues) : texto(antes).toUpperCase() === texto(despues).toUpperCase();
    if (iguales) continue;
    let a = fmt ? fmt(num(antes)) : texto(antes);
    let d = fmt ? fmt(num(despues)) : texto(despues);
    if (col === 'MUNICIPIO') d = pedido.cliente.municipioNombre ?? d;
    lineas.push(`*${etiqueta}:* ${vacio(a)} → ${vacio(d)}`);
  }

  const viejos = new Map((detallesActuales ?? []).map((d) => [texto(d['ITEM NRO']).toUpperCase(), d]));
  const nuevos = new Map(pedido.items.map((i) => [i.ref.toUpperCase(), i]));
  for (const [ref, i] of nuevos) {
    const v = viejos.get(ref);
    if (!v) { lineas.push(`• *${ref}* — nuevo: ${i.cantidad} und × ${cop(i.precio)} = ${cop(i.subtotal)}`); continue; }
    const cant = num(v.CANTIDAD), precio = num(v['PRECIO DE VENTA UND']);
    if (cant !== i.cantidad || precio !== i.precio) {
      lineas.push(`• *${ref}* — ${cant} und × ${cop(precio)} → ${i.cantidad} und × ${cop(i.precio)} = ${cop(i.subtotal)}`);
    }
  }
  for (const ref of viejos.keys()) if (!nuevos.has(ref)) lineas.push(`• *${ref}* — se quita`);

  const subAntes = num(filaActual?.['SUBTOTAL PEDIDO']), subDespues = pedido.subtotal;
  if (subAntes !== subDespues) lineas.push(`*Subtotal:* ${cop(subAntes)} → ${cop(subDespues)} · *${pedido.unidades} und*`);
  return lineas;
}
