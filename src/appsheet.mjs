/**
 * Cliente mínimo de la API de AppSheet.
 * Docs: https://support.google.com/appsheet/answer/10105398
 *
 * Todas las escrituras pasan por aquí. Con MODO_ENSAYO=1 no se envía nada:
 * se registra lo que se habría enviado y se devuelven respuestas simuladas.
 */

import { TABLAS } from './config.mjs';
import { conLlaves } from './armar.mjs';

const PROPIEDADES = { Locale: 'es-CO', Timezone: 'SA Pacific Standard Time' };

export class AppSheet {
  constructor({ appId = process.env.APPSHEET_APP_ID, accessKey = process.env.APPSHEET_ACCESS_KEY, ensayo = process.env.MODO_ENSAYO === '1', fetchFn = fetch } = {}) {
    this.appId = appId;
    this.accessKey = accessKey;
    this.ensayo = ensayo;
    this.fetchFn = fetchFn;
    this.enviado = []; // en ensayo: lo que se habría mandado
  }

  async llamar(tabla, action, rows, props = {}) {
    const cuerpo = { Action: action, Properties: { ...PROPIEDADES, ...props }, Rows: rows };
    // En ensayo se bloquean solo las escrituras; las lecturas (Find) van a la API.
    if (this.ensayo && action !== 'Find') {
      this.enviado.push({ tabla, ...cuerpo });
      return { Rows: rows.map((r) => ({ ...r })) };
    }
    if (!this.appId || !this.accessKey) throw new Error('Faltan APPSHEET_APP_ID / APPSHEET_ACCESS_KEY.');
    const url = `https://api.appsheet.com/api/v2/apps/${this.appId}/tables/${encodeURIComponent(tabla)}/Action`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ApplicationAccessKey: this.accessKey },
      body: JSON.stringify(cuerpo),
    });
    const texto = await res.text();
    if (!res.ok) {
      let detalle = texto;
      try { detalle = JSON.parse(texto).detail ?? texto; } catch { /* texto plano */ }
      throw new Error(`AppSheet ${action} ${tabla} → ${res.status}: ${String(detalle).replace(/\s+/g, ' ').slice(0, 600)}`);
    }
    if (!texto) return {};
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(`AppSheet ${action} ${tabla} devolvió una respuesta que no es JSON (${texto.length} caracteres): ${texto.slice(0, 120)}`);
    }
  }

  agregar(tabla, filas) {
    return this.llamar(tabla, 'Add', filas);
  }

  buscar(tabla, selector = null) {
    return this.llamar(tabla, 'Find', [], selector ? { Selector: selector } : {});
  }

  /** Ejecuta una acción de la app (p. ej. "Generar PDF") sobre las filas dadas (por su llave). */
  accion(tabla, nombre, filas) {
    return this.llamar(tabla, nombre, filas);
  }
}

/** Último NUMERO CONSECUTIVO de PEDIDOS (lee una sola fila). */
export async function ultimoConsecutivo(api) {
  const r = await api.buscar(TABLAS.PEDIDOS, 'FILTER("PEDIDOS", [NUMERO CONSECUTIVO] = MAX(PEDIDOS[NUMERO CONSECUTIVO]))');
  const filas = Array.isArray(r) ? r : r?.Rows ?? [];
  const n = Number(filas[0]?.['NUMERO CONSECUTIVO']);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`No pude leer el último consecutivo de PEDIDOS (${JSON.stringify(filas[0] ?? null).slice(0, 120)}).`);
  return n;
}

/**
 * Crea cliente (si es nuevo), pedido y detalles, y dispara el PDF.
 * Las llaves (KEY, PE, NUMERO CONSECUTIVO) las genera el bot con el formato de la
 * app (PE + consecutivo + 8 hex), leyendo el último consecutivo justo antes de
 * escribir, igual que hace la página web en su pestaña.
 * Devuelve { key, pe, consecutivo, clienteId }.
 */
export async function registrarEnAppSheet(api, armado) {
  const consecutivo = (await ultimoConsecutivo(api)) + 1;
  const pedido = armado.pedido.KEY ? armado.pedido : conLlaves(armado.pedido, consecutivo);
  const key = pedido.KEY;
  const pe = pedido.PE;

  let clienteId = armado.cliente ? armado.cliente['CLIENTE ID'] : null;
  if (armado.cliente) await api.agregar(TABLAS.CLIENTES, [armado.cliente]);

  await api.agregar(TABLAS.PEDIDOS, [pedido]);

  const detalles = armado.detalles.map((d) => ({ ...d, PE: key }));
  await api.agregar(TABLAS.DETALLES, detalles);

  const estado = await dispararPdf(api, key);
  return { key, pe, consecutivo, clienteId, pdf: estado };
}

/**
 * Dispara la generación del PDF igual que la acción "Generar PDF" de la app:
 * pone ESTATUS = EN PROCESO, que es la condición del bot CREAR PDF PEDIDOS.
 * (Invocar la acción por nombre a través de la API no la ejecuta.)
 * AppSheet suele responder ya con ESTATUS = COMPLETADO y la URL firmada del PDF.
 */
export async function dispararPdf(api, key) {
  const e = await api.llamar(TABLAS.PEDIDOS, 'Edit', [{ KEY: key, ESTATUS: 'EN PROCESO' }]);
  const fila = e?.Rows?.[0] ?? null;
  const documento = String(fila?.DOCUMENTO ?? '').trim();
  const estatus = String(fila?.ESTATUS ?? '').trim().toUpperCase();
  if (documento && estatus === 'COMPLETADO') return { documento, url: /^https?:\/\//.test(documento) ? documento : null };
  return null;
}

/** La fila del pedido por su KEY (una sola fila). */
export async function filaPedidoPorKey(api, key) {
  const r = await api.buscar(TABLAS.PEDIDOS, `FILTER("PEDIDOS", [KEY] = "${key}")`);
  const filas = Array.isArray(r) ? r : r?.Rows ?? [];
  return filas[0] ?? null;
}

/**
 * Espera a que el bot de AppSheet genere el PDF: la fila queda con DOCUMENTO
 * lleno y ESTATUS = COMPLETADO. Si a mitad de camino no ha pasado nada, vuelve
 * a invocar la acción una vez. Devuelve { url, documento } o null si se agotó el tiempo.
 */
export async function esperarPdf(api, key, { timeoutMs = 90_000, cadaMs = 8_000, reintentarA = 35_000, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), yaListo = null } = {}) {
  if (yaListo?.documento && yaListo.url) return yaListo;
  const inicio = Date.now();
  let reintentado = false;
  while (Date.now() - inicio < timeoutMs) {
    await dormir(cadaMs);
    let fila = null;
    try {
      fila = await filaPedidoPorKey(api, key);
    } catch {
      fila = null;
    }
    const documento = String(fila?.DOCUMENTO ?? '').trim();
    const estatus = String(fila?.ESTATUS ?? '').trim().toUpperCase();
    if (documento && estatus === 'COMPLETADO') {
      return { documento, url: await urlFirmada(api, key, fila) ?? urlArchivo(api, 'PEDIDOS', documento) };
    }
    if (!reintentado && Date.now() - inicio >= reintentarA) {
      reintentado = true;
      await dispararPdf(api, key).catch(() => {});
    }
  }
  return null;
}

/**
 * URL firmada del PDF. Find devuelve solo la ruta; las respuestas de Add/Edit/acciones
 * traen la URL completa con firma. Una edición sin cambios (NOTAS = NOTAS) la obtiene
 * sin disparar el bot del PDF, cuya condición es ESTATUS = "EN PROCESO".
 */
export async function urlFirmada(api, key, fila) {
  try {
    const e = await api.llamar(TABLAS.PEDIDOS, 'Edit', [{ KEY: key, NOTAS: fila?.NOTAS ?? '----' }]);
    const doc = String(e?.Rows?.[0]?.DOCUMENTO ?? '');
    return /^https?:\/\//.test(doc) ? doc : null;
  } catch {
    return null;
  }
}

/** URL de descarga de un archivo guardado por AppSheet (como la devuelve la propia API). */
export function urlArchivo(api, tabla, ruta) {
  if (/^https?:\/\//.test(ruta)) return ruta;
  const appName = api.appName ?? process.env.APPSHEET_APP_NAME ?? ruta.split('/').filter(Boolean)[0];
  const sinExt = ruta.replace(/\.pdf$/i, '');
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(tabla)}&fileName=${encodeURIComponent(sinExt)}`;
}

/** Descarga el PDF. Devuelve un Buffer o lanza si no es un PDF. */
export async function descargarPdf(url, fetchFn = fetch) {
  const r = await fetchFn(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`Descarga del PDF → ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.subarray(0, 4).toString('latin1') !== '%PDF') throw new Error('La descarga no es un PDF');
  return buf;
}
