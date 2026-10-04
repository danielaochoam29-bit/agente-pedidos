/** Los textos que el bot escribe en el hilo de Slack (formato mrkdwn de Slack). */

import { cop } from './texto.mjs';

export function resumenPedido(p) {
  const c = p.cliente;
  const lineas = p.items.map((i) => `• *${i.ref}* — ${i.cantidad} und × ${cop(i.precio)} = ${cop(i.subtotal)}`);
  const quien = c.existente ? `ya existe · ID ${c.existente.id}` : `*nuevo* · ${c.tipo} · ${c.canal} · cliente de ${c.clienteDe}`;
  return [
    `*Cliente:* ${c.nombre} (${quien})`,
    `*NIT:* ${c.nit} · *Cel:* ${c.celular}`,
    `*Envío a:* ${c.direccion} · ${c.municipioNombre ?? c.municipio}, ${c.departamento}`,
    ...lineas,
    `*Subtotal:* ${cop(p.subtotal)}${p.descuento ? ` · descuento ${cop(p.descuento)}` : ''} · *${p.unidades} und*`,
    `*Envío:* ${p.valorEnvio ? cop(p.valorEnvio) : 'por confirmar'} · *Pago del envío:* ${p.pagoDelEnvio || '_(en blanco)_'} · *Mercancía contraentrega:* ${p.pagoContraentrega}`,
    `*Bodega:* ${p.bodega} · *Vendedor:* ${p.vendedor}`,
    p.notasDespacho && p.notasDespacho !== 'N/A' ? `*Notas despacho:* ${p.notasDespacho}` : null,
  ].filter(Boolean).join('\n');
}

export function mensajeConfirmar(v) {
  const avisos = v.avisos.length ? `\n\n⚠️ ${v.avisos.join('\n⚠️ ')}` : '';
  return `Esto es lo que voy a registrar:\n\n${resumenPedido(v.pedido)}${avisos}\n\n¿Lo creo? Reacciona con ✅ a este mensaje (o responde *no* para cancelar).`;
}

export function mensajeFaltan(v) {
  const lista = v.faltantes.map((f) => `• ${f}`).join('\n');
  const avisos = v.avisos.length ? `\n\n⚠️ ${v.avisos.join('\n⚠️ ')}` : '';
  return `⚠️ Me falta información para crear el pedido:\n${lista}\n\nRespóndeme *aquí en el hilo* con lo que falta (por ejemplo: \`Ciudad: Ibagué, Tolima\`).${avisos}`;
}

export function mensajeError(v) {
  const lista = v.errores.map((e) => `• ${e}`).join('\n');
  return `❌ No puedo crear el pedido:\n${lista}\n\nCorrige y vuelve a enviar el pedido en un mensaje nuevo.`;
}

export function mensajeCreado(p, { pe, key }) {
  const c = p.cliente;
  return `✅ Pedido *${pe ?? key}* creado\n` +
    `Cliente: ${c.nombre}${c.existente ? '' : ' (creado nuevo)'}\n` +
    `${p.items.length} referencia(s) · ${p.unidades} und · Subtotal ${cop(p.subtotal)} · Envío ${p.valorEnvio ? cop(p.valorEnvio) : 'por confirmar'}\n` +
    `Vendedor: ${p.vendedor} · Estado: EN CONSTRUCCIÓN · Pago: PENDIENTE\n⏳ Generando el PDF…`;
}

export function mensajeFallo(motivo, accion = 'crear') {
  return `❌ Intenté ${accion} el pedido pero algo falló:\n\`${motivo}\`\nRevisa en la app si quedó algo a medias (cliente o pedido sin detalles) antes de volver a enviarlo.`;
}

export function mensajePdfListo(pe) {
  return `📄 PDF del pedido *${pe}* generado.`;
}

export function mensajePdfNoListo(pe) {
  return `⚠️ El pedido *${pe}* quedó creado, pero AppSheet no terminó de generar el PDF. Ábrelo en la app y pulsa *Generar PDF*.`;
}

export function mensajeConfirmarCambio(v, pe) {
  const avisos = v.avisos.length ? `\n\n⚠️ ${v.avisos.join('\n⚠️ ')}` : '';
  return `Esto es lo que voy a actualizar en el pedido *${pe}*:\n\n${resumenPedido(v.pedido)}${avisos}\n\n¿Lo actualizo? Reacciona con ✅ a este mensaje (o responde *no*).`;
}

export function mensajeActualizado(p, { pe }) {
  return `✅ Pedido *${pe}* actualizado\n` +
    `${p.items.length} referencia(s) · ${p.unidades} und · Subtotal ${cop(p.subtotal)} · Envío ${p.valorEnvio ? cop(p.valorEnvio) : 'por confirmar'}`;
}

export function mensajePreguntaPdf(pe) {
  return `¿Genero el PDF de nuevo? Pedido *${pe}*. Reacciona con ✅ a este mensaje o responde *si*.`;
}
