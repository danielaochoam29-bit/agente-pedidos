/**
 * Todas las reglas de negocio (PLAN.md §11). Sin IA: aquí no se adivina nada.
 *
 * Entrada: el JSON extraído, el catálogo y quién envía el mensaje.
 * Salida:  { estado, faltantes, errores, avisos, pedido }
 *   estado   'ok'      → se puede crear (tras confirmación del asesor)
 *            'faltan'  → hay que preguntar en el hilo lo que está en `faltantes`
 *            'error'   → no se puede crear; `errores` explica por qué
 *   pedido   el pedido ya normalizado y completo (cuando estado = 'ok')
 */

import { VALORES, DEFAULTS, VOLUMEN_DESDE, VENDEDORES } from './config.mjs';
import { elegir, normalizar, nombreCliente, cop } from './texto.mjs';

/** Persona de Slack (nombre o correo) → VENDEDOR. null si no está en el mapa. */
export function vendedorDe(remitente) {
  const t = normalizar(remitente);
  if (!t) return null;
  for (const [clave, v] of Object.entries(VENDEDORES)) {
    if (t === clave || t.includes(clave) || clave.includes(t)) return v;
  }
  const directo = elegir(remitente, VALORES.CLIENTE_DE);
  return directo;
}

/** Precio de lista que corresponde a esa referencia, cantidad y tipo de cliente. */
export function precioDeLista(producto, cantidad, tipoCliente) {
  const n = (k) => Number(producto[k]) || 0;
  if (tipoCliente === 'DISTRIBUIDOR') return { precio: n('PRECIO DISTRIBUIDOR'), lista: 'distribuidor' };
  if (cantidad >= VOLUMEN_DESDE) return { precio: n('PRECIO CLIENTE FINAL MAYOR 100 UND'), lista: 'cliente final (100 und o más)' };
  return { precio: n('PRECIO CLIENTE FINAL'), lista: 'cliente final' };
}

export function validar(extraido, catalogo, remitente) {
  const faltantes = [];
  const errores = [];
  const avisos = [];
  const c = extraido.cliente ?? {};

  // --- Quién vende -------------------------------------------------------
  const vendedor = vendedorDe(remitente);
  if (!vendedor) errores.push(`No sé quién es "${remitente}" en el mapa de asesores; no puedo asignar VENDEDOR.`);

  // --- Cliente: ¿existe? -------------------------------------------------
  let existente = null;
  const busqueda = catalogo.buscarCliente({ nit: c.nit, celular: c.celular });
  if (busqueda.candidatos) {
    const lista = busqueda.candidatos.map((x) => `${x.NOMBRE} (ID ${x['CLIENTE ID']}, NIT ${x.NIT})`).join(' · ');
    faltantes.push(`Hay varios clientes con ese ${busqueda.por}: ${lista}. ¿Cuál es? Responde con el ID.`);
  } else if (busqueda.cliente) {
    existente = busqueda.cliente;
    if (c.nombre && normalizar(c.nombre) !== existente._nombre) {
      avisos.push(`El cliente ya existe como *${existente.NOMBRE}* (encontrado por ${busqueda.por}); uso ese nombre.`);
    }
  }

  // --- Datos obligatorios del cliente -------------------------------------
  if (!existente && !c.nombre) faltantes.push('Nombre del cliente');
  if (!c.nit && !existente) faltantes.push('NIT o cédula');
  if (!c.celular && !existente) faltantes.push('Celular');
  if (c.celular && !/^3\d{9}$/.test(c.celular)) avisos.push(`El celular ${c.celular} no parece un celular colombiano de 10 dígitos.`);
  if (!c.direccion) faltantes.push('Dirección de envío');

  // --- Ciudad → código DANE ------------------------------------------------
  let destino = null;
  if (c.ciudad) {
    const m = catalogo.municipio(c.ciudad);
    if (!m) faltantes.push(`No encontré el municipio "${c.ciudad}" en MUNICIPIOS. Escríbelo como "Ciudad, Departamento".`);
    else if (m.candidatos) {
      faltantes.push(`"${c.ciudad}" existe en varios departamentos: ${m.candidatos.map((x) => x.departamento).join(', ')}. ¿Cuál?`);
    } else destino = m;
  } else if (existente && existente.MUNICIPIO && existente.DEPARTAMENTO) {
    destino = { codigo: String(existente.MUNICIPIO).trim(), departamento: existente.DEPARTAMENTO, municipio: null };
    const m = catalogo.municipio(destino.codigo);
    if (m && !m.candidatos) destino = m;
    avisos.push(`Ciudad tomada de la ficha del cliente: ${destino.municipio ?? destino.codigo}, ${destino.departamento}.`);
  } else {
    faltantes.push('Ciudad de envío (ej. "Ibagué, Tolima")');
  }

  // --- Tipo, canal, cliente de (solo cliente nuevo) -------------------------
  let tipo = existente ? String(existente['TIPO CLIENTE'] || 'FINAL').trim().toUpperCase() : elegir(c.tipo, VALORES.TIPO_CLIENTE);
  let canal = existente ? existente.CANAL : elegir(c.canal, VALORES.CANAL);
  let clienteDe = existente ? existente['CLIENTE DE'] : elegir(c.clienteDe, VALORES.CLIENTE_DE);
  if (!existente) {
    if (!tipo) faltantes.push(c.tipo ? `Tipo de cliente "${c.tipo}" no es válido. Opciones: FINAL o DISTRIBUIDOR` : 'Tipo de cliente (FINAL o DISTRIBUIDOR)');
    if (!canal) faltantes.push(c.canal ? `Canal "${c.canal}" no es válido. Opciones: WhatsApp, Instagram, Página Web` : 'Canal (WhatsApp, Instagram o Página Web)');
    if (!clienteDe) faltantes.push(c.clienteDe ? `"Cliente de" "${c.clienteDe}" no es válido. Opciones: ARQUI, DANIELA, JULIAN` : 'Cliente de (ARQUI, DANIELA o JULIAN)');
  }

  // --- Productos -----------------------------------------------------------
  const items = [];
  if (!extraido.items?.length) faltantes.push('Productos (referencia, cantidad y precio)');
  for (const it of extraido.items ?? []) {
    const p = catalogo.producto(it.ref);
    if (!p) {
      errores.push(`La referencia *${it.ref}* no existe en PRODUCTOS.`);
      continue;
    }
    const cantidad = Number(it.cantidad);
    if (it.cantidad == null) {
      faltantes.push(`Cantidad en unidades de ${p['ITEM NRO']} (ej. "${p['ITEM NRO']}: 25 und")`);
      continue;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      errores.push(`${it.ref}: cantidad inválida (${it.cantidad}).`);
      continue;
    }
    const paquete = Number(p['CANTIDAD POR PAQUETE']) || 0;
    if (paquete > 1 && cantidad % paquete !== 0) {
      const abajo = Math.floor(cantidad / paquete) * paquete;
      const arriba = abajo + paquete;
      faltantes.push(`${it.ref} se vende en paquetes de ${paquete} y pediste ${cantidad}. ¿Qué cantidad registro? Responde por ejemplo "${it.ref}: ${arriba} und"${abajo ? ` o "${it.ref}: ${abajo} und"` : ''}.`);
      continue;
    }
    const { precio: lista, lista: nombreLista } = precioDeLista(p, cantidad, tipo ?? 'FINAL');
    if (!lista) {
      errores.push(`${it.ref} no tiene precio de ${nombreLista} en PRODUCTOS.`);
      continue;
    }
    if (it.precio != null && Number(it.precio) !== lista) {
      errores.push(`${it.ref} × ${cantidad}: el mensaje dice ${cop(it.precio)} pero el precio de ${nombreLista} es ${cop(lista)}.`);
      continue;
    }
    if (it.precio == null) avisos.push(`${it.ref}: no venía precio; uso el de ${nombreLista}: ${cop(lista)}.`);
    const inventario = Number(p['INVENTARIO ACTUAL']) || 0;
    if (inventario < cantidad) avisos.push(`${it.ref}: inventario actual ${inventario}, el pedido lleva ${cantidad}.`);
    items.push({
      ref: p['ITEM NRO'],
      cantidad,
      precio: lista,
      subtotal: cantidad * lista,
      descripcion: String(p.DESCRIPCION ?? '').trim(),
      empaque: String(p.EMPAQUE ?? '').trim(),
      foto: String(p.FOTO ?? '').trim(),
      costo: p['COSTO PROMEDIO PONDERADO ACTUAL'] === '' ? '' : Number(p['COSTO PROMEDIO PONDERADO ACTUAL']) || 0,
    });
  }
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  if (extraido.subtotalDeclarado != null && items.length && !errores.length && Number(extraido.subtotalDeclarado) !== subtotal) {
    errores.push(`El subtotal del mensaje (${cop(extraido.subtotalDeclarado)}) no coincide con la suma de los ítems (${cop(subtotal)}).`);
  }

  // --- Envío, pago, bodega y demás -----------------------------------------
  let pagoDelEnvio = null;
  if (extraido.pagoDelEnvio) {
    pagoDelEnvio = elegir(extraido.pagoDelEnvio, VALORES.PAGO_DEL_ENVIO)
      ?? (/sin cobro/i.test(extraido.pagoDelEnvio) ? 'PAGO EN BODEGA SIN COBRO AL CLIENTE'
        : /con cobro|bodega/i.test(extraido.pagoDelEnvio) ? 'PAGO EN BODEGA CON COBRO AL CLIENTE'
        : /contra/i.test(extraido.pagoDelEnvio) ? 'CONTRAENTREGA' : null);
    if (!pagoDelEnvio) avisos.push(`No entendí el pago del envío "${extraido.pagoDelEnvio}"; queda en blanco.`);
  }
  if (!pagoDelEnvio) avisos.push('No aclaraste el *pago del envío*; queda en blanco.');

  const valorEnvio = extraido.valorEnvio == null ? DEFAULTS.VALOR_ENVIO : Number(extraido.valorEnvio);
  if (extraido.valorEnvio == null) avisos.push('Valor del envío por confirmar; queda en 0.');

  let bodega = DEFAULTS.BODEGA;
  if (extraido.bodega) {
    const b = elegir(extraido.bodega, VALORES.BODEGA) ?? (/gil/i.test(extraido.bodega) ? 'SAN GIL' : null);
    if (b) bodega = b;
    else avisos.push(`Bodega "${extraido.bodega}" no existe; uso ${DEFAULTS.BODEGA}.`);
  }

  const descuento = extraido.descuento == null ? DEFAULTS.DESCUENTO : Number(extraido.descuento);
  const total = subtotal - descuento;

  const pedido = {
    vendedor,
    cliente: {
      existente: existente ? { id: existente['CLIENTE ID'], nombre: existente.NOMBRE } : null,
      nombre: existente ? existente.NOMBRE : nombreCliente(c.nombre),
      marca: existente ? existente.MARCA : (c.marca ?? ''),
      nit: existente ? existente.NIT : c.nit,
      celular: c.celular || (existente ? existente.CONTACTO : null),
      direccion: c.direccion,
      departamento: destino?.departamento ?? null,
      municipio: destino?.codigo ?? null,
      municipioNombre: destino?.municipio ?? null,
      tipo: tipo ?? null,
      canal: canal ?? null,
      clienteDe: clienteDe ?? null,
    },
    items,
    subtotal,
    descuento,
    total,
    valorEnvio,
    valorFinal: total + valorEnvio,
    pagoDelEnvio: pagoDelEnvio ?? '',
    pagoContraentrega: extraido.pagoContraentrega === 'SI' ? 'SI' : DEFAULTS.PAGO_CONTRAENTREGA,
    bodega,
    muestras: extraido.muestras === 'SI' ? 'SI' : DEFAULTS.MUESTRAS,
    notas: extraido.notas || DEFAULTS.NOTAS,
    notasDespacho: extraido.notasDespacho || DEFAULTS.NOTAS_DESPACHO,
    unidades: items.reduce((s, i) => s + i.cantidad, 0),
  };

  const estado = errores.length ? 'error' : faltantes.length ? 'faltan' : 'ok';
  return { estado, faltantes, errores, avisos, pedido };
}
