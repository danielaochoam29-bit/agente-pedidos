/** Utilidades de texto, números y fechas. Sin dependencias. */

/** Quita tildes, pasa a minúsculas y colapsa espacios: "Ibagué " → "ibague". */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Solo dígitos: "93'287.888" → "93287888"; "+57 300 756 7875" → "573007567875". */
export function digitos(s) {
  return String(s ?? '').replace(/\D/g, '');
}

/** Celular colombiano normalizado a 10 dígitos (quita el 57 del indicativo). */
export function celular(s) {
  let d = digitos(s);
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return d;
}

/** "$1.090" / "1,090" / "1090" → 1090. Devuelve null si no hay número. */
export function numero(s) {
  if (typeof s === 'number') return s;
  const limpio = String(s ?? '').replace(/[^\d.,-]/g, '');
  if (!limpio) return null;
  // En Colombia el punto es separador de miles; la coma, decimal. "1.090" → 1090; "1.090,50" → 1090.5
  const sinMiles = limpio.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(sinMiles);
  return Number.isFinite(n) ? n : null;
}

/** 127000 → "$127.000" */
export function cop(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

/** Nombre de cliente como lo guarda AppSheet: MAYÚSCULAS, sin dobles espacios, con tildes. */
export function nombreCliente(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Fecha de Colombia: "03/10/2026" o "03/10/2026 14:16:09". */
export function fechaColombia(conHora = false, ahora = new Date()) {
  const f = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } : {}),
  }).format(ahora);
  return f.replace(',', '');
}

/** Fecha en formato ISO, que la API de AppSheet entiende sin ambigüedad: "2026-10-02" o "2026-10-02 14:16:09". */
export function fechaIso(conHora = false, ahora = new Date()) {
  const [d, m, resto] = fechaColombia(conHora, ahora).split('/');
  const [a, hora] = resto.split(' ');
  return `${a}-${m}-${d}${conHora && hora ? ' ' + hora : ''}`;
}

/** 8 caracteres hexadecimales al azar, como los KEY de AppSheet. */
export function hex8() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Devuelve el valor de una lista que coincide con el texto (sin tildes/mayúsculas), o null. */
export function elegir(texto, lista) {
  const t = normalizar(texto);
  if (!t) return null;
  return lista.find((v) => normalizar(v) === t) ?? null;
}

/**
 * Canal de venta escrito de cualquier forma: "wpp", "whatsapp", "wa", "ig", "insta",
 * "pw", "página web", "web" → WhatsApp | Instagram | Página Web (o null).
 */
export function canalDe(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  if (/^(wpp|wsp|wp|wa|whats|whatsapp|whatsap|what?s ?app)$/.test(t) || /whats/.test(t)) return 'WhatsApp';
  if (/^(ig|insta|instagram)$/.test(t) || /insta/.test(t)) return 'Instagram';
  if (/^(pw|web|pagina web|pag web|pagina)$/.test(t) || /web/.test(t)) return 'Página Web';
  return null;
}
