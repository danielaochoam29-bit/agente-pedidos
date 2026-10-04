/**
 * Lector por reglas del mensaje del asesor. No usa IA.
 *
 * Entiende dos cosas con total certeza:
 *  1. Las líneas de producto, tal como salen de la cotización:
 *       * B01TG — Bolsa con válvula … · gris translucido
 *         25 und × $1.090 = $27.250
 *     o en una sola línea:  * B01T — 25 und × $1.090
 *  2. Los campos etiquetados del formato recomendado (PLAN.md §11.4):
 *       Cliente: … / NIT: … / Celular: … / Ciudad: … / Pago del envío: … etc.
 *
 * Y, con heurísticas, el bloque libre del cliente (nombre, cédula, dirección,
 * celular en líneas sueltas). Lo que no logre leer queda en null y lo completa
 * la IA (src/extraer.mjs) o lo pregunta el bot en el hilo.
 *
 * Devuelve siempre la misma forma (ver `vacio()`), con `null` en lo desconocido.
 */

import { digitos, celular, numero, normalizar } from './texto.mjs';

export function vacio() {
  return {
    cliente: {
      nombre: null,
      marca: null,
      nit: null,
      celular: null,
      direccion: null,
      ciudad: null, // texto tal como lo escribió el asesor ("Ibagué, Tolima")
      tipo: null, // FINAL | DISTRIBUIDOR
      canal: null, // WhatsApp | Instagram | Página Web
      clienteDe: null, // ARQUI | DANIELA | JULIAN
    },
    items: [], // [{ ref, cantidad, precio }]
    subtotalDeclarado: null,
    pagoDelEnvio: null, // texto; se normaliza en validar.mjs
    valorEnvio: null, // número o null ("por confirmar")
    pagoContraentrega: null, // 'SI' | 'NO' | null
    bodega: null,
    descuento: null,
    muestras: null,
    notasDespacho: null,
    notas: null,
  };
}

// --- Campos etiquetados --------------------------------------------------

const ETIQUETAS = [
  [/^(cliente|nombre)$/, (r, v) => (r.cliente.nombre = v)],
  [/^marca$/, (r, v) => (r.cliente.marca = v)],
  [/^(nit|cc|cedula|c\.c\.|nit\/cc|nit o cc|documento|identificacion)$/, (r, v) => (r.cliente.nit = digitos(v) || null)],
  [/^(celular|telefono|cel|tel|whatsapp|contacto)$/, (r, v) => (r.cliente.celular = celular(v) || null)],
  [/^(direccion|direccion de envio|dir)$/, (r, v) => (r.cliente.direccion = v)],
  [/^(ciudad|municipio|destino|ciudad de envio)$/, (r, v) => (r.cliente.ciudad = v)],
  [/^(tipo de cliente|tipo cliente|tipo)$/, (r, v) => (r.cliente.tipo = v)],
  [/^canal$/, (r, v) => (r.cliente.canal = v)],
  [/^(cliente de|vendedor del cliente|asesor del cliente)$/, (r, v) => (r.cliente.clienteDe = v)],
  [/^(pago del envio|pago envio|envio pago|forma de pago del envio)$/, (r, v) => (r.pagoDelEnvio = v)],
  [/^(valor del envio|valor envio|envio|flete)$/, (r, v) => (r.valorEnvio = numero(v))],
  [/^(pago contraentrega|contraentrega|mercancia contraentrega)$/, (r, v) => (r.pagoContraentrega = siNo(v))],
  [/^bodega$/, (r, v) => (r.bodega = v)],
  [/^descuento$/, (r, v) => (r.descuento = numero(v))],
  [/^muestras$/, (r, v) => (r.muestras = siNo(v))],
  [/^(notas despacho|notas de despacho|nota despacho|observaciones)$/, (r, v) => (r.notasDespacho = v)],
  [/^(notas|nota)$/, (r, v) => (r.notas = v)],
  [/^(subtotal|total)$/, (r, v) => (r.subtotalDeclarado = numero(v))],
];

function siNo(v) {
  const t = normalizar(v);
  if (/^(si|sí|yes|s)$/.test(t)) return 'SI';
  if (/^(no|n)$/.test(t)) return 'NO';
  return null;
}

// --- Líneas de producto --------------------------------------------------

/** Referencias como B01TG, B02P, PFS300-P, FD01: letras y números, 3 a 10 caracteres. */
const REF = /[A-Z]{1,4}\d{1,4}[A-Z0-9-]{0,5}/;
const LINEA_REF = new RegExp(`^\\s*[*•·\\-]?\\s*(${REF.source})\\s*(?:[—–-]|:|·|\\|)?\\s*(.*)$`);
const CANT_PRECIO = /(\d[\d.,]*)\s*(?:und|unds|unidades|u\.?|uds?)\b[^\d$]*\$?\s*([\d.,]+)/i;
const SOLO_CANT = /(\d[\d.,]*)\s*(?:und|unds|unidades|u\.?|uds?)\b/i;

/**
 * Extrae [{ref, cantidad, precio}] de todo el texto. Una referencia puede
 * traer cantidad y precio en la misma línea o en la siguiente.
 */
export function leerItems(texto) {
  const lineas = texto.split(/\r?\n/);
  const items = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = LINEA_REF.exec(lineas[i].trim().toUpperCase() === lineas[i].trim() ? lineas[i] : lineas[i]);
    if (!m) continue;
    const ref = m[1].toUpperCase();
    // Evita confundir "PE1979" o "CO123" (números de pedido) con referencias.
    if (/^(PE|CO|OP|PO)\d+$/.test(ref)) continue;
    const resto = m[2] ?? '';
    let cp = CANT_PRECIO.exec(resto);
    let fuente = resto;
    if (!cp && lineas[i + 1] && !LINEA_REF.test(lineas[i + 1])) {
      fuente = lineas[i + 1];
      cp = CANT_PRECIO.exec(fuente);
    }
    if (cp) {
      items.push({ ref, cantidad: numero(cp[1]), precio: numero(cp[2]) });
      continue;
    }
    const sc = SOLO_CANT.exec(resto) ?? (lineas[i + 1] && !LINEA_REF.test(lineas[i + 1]) ? SOLO_CANT.exec(lineas[i + 1]) : null);
    if (sc) items.push({ ref, cantidad: numero(sc[1]), precio: null });
  }
  return items;
}

// --- Bloque libre del cliente -------------------------------------------

const PISTAS_DIRECCION = /\b(calle|cll|cl|carrera|cra|cr|kr|kra|avenida|av|avda|diagonal|dg|transversal|tv|tr|manzana|mz|casa|apto|apartamento|torre|conjunto|barrio|bloque|oficina|local|km|vereda|finca)\b|#|n[°º]\.?\s*\d/i;

/**
 * Para mensajes sin etiquetas: adivina nombre, cédula, dirección y celular en
 * las líneas que no son de producto. Sólo rellena lo que esté en null.
 */
function adivinarCliente(r, lineas) {
  const candidatas = lineas
    .map((l) => l.trim())
    .filter((l) => l && !LINEA_REF.test(l) && !CANT_PRECIO.test(l) && !/^(subtotal|total|valor del env[ií]o)/i.test(l))
    .map((l) => l.replace(/,?\s*con mucho gusto.*$/i, '').trim())
    .filter(Boolean);

  for (const l of candidatas) {
    const d = digitos(l);
    const soloNumero = /^[\d\s.,'’+()-]+$/.test(l);
    if (soloNumero && !r.cliente.celular && /^(57)?3\d{9}$/.test(d)) {
      r.cliente.celular = celular(d);
    } else if (soloNumero && !r.cliente.nit && d.length >= 6 && d.length <= 12) {
      r.cliente.nit = d;
    } else if (!r.cliente.direccion && PISTAS_DIRECCION.test(l) && /\d/.test(l)) {
      r.cliente.direccion = l;
    } else if (!r.cliente.nombre && !/\d/.test(l) && l.split(' ').length >= 2 && l.length <= 60 && !/:/.test(l)) {
      r.cliente.nombre = l;
    }
  }
}

// --- Entrada principal ---------------------------------------------------

/** Lee el mensaje completo. Nunca lanza. */
export function leerMensaje(texto) {
  const r = vacio();
  const lineas = String(texto ?? '').split(/\r?\n/);
  const libres = [];

  for (const linea of lineas) {
    const m = /^\s*[*•\-]?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ/ .]{2,30}?)\s*:\s*(.*)$/.exec(linea);
    if (m && !LINEA_REF.test(linea)) {
      const clave = normalizar(m[1]).replace(/\./g, '');
      const valor = m[2].trim().replace(/\s*\(.*\)\s*$/, ''); // quita "(FINAL o DISTRIBUIDOR)"
      const regla = ETIQUETAS.find(([re]) => re.test(clave));
      if (regla) {
        if (valor && !/^(por confirmar|__+|pendiente|-+)$/i.test(valor)) regla[1](r, valor);
        continue;
      }
    }
    libres.push(linea);
  }

  r.items = leerItems(texto);

  const sub = /subtotal\s*:?\s*\$?\s*([\d.,]+)/i.exec(texto);
  if (sub && r.subtotalDeclarado == null) r.subtotalDeclarado = numero(sub[1]);

  if (/contraentrega/i.test(texto) && r.pagoContraentrega == null && r.pagoDelEnvio == null) {
    // "contraentrega" suelto en el texto: lo más probable es que hable del envío.
    r.pagoDelEnvio = 'CONTRAENTREGA';
  }

  adivinarCliente(r, libres);
  return r;
}
