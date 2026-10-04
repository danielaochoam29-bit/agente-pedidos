/**
 * Cliente mínimo de la API de AppSheet.
 * Docs: https://support.google.com/appsheet/answer/10105398
 *
 * Todas las escrituras pasan por aquí. Con MODO_ENSAYO=1 no se envía nada:
 * se registra lo que se habría enviado y se devuelven respuestas simuladas.
 */

import { ACCION_PDF, TABLAS } from './config.mjs';
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
    if (!res.ok) throw new Error(`AppSheet ${action} ${tabla} → ${res.status}: ${texto.slice(0, 300)}`);
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

  await api.accion(TABLAS.PEDIDOS, ACCION_PDF, [{ KEY: key }]);
  return { key, pe, consecutivo, clienteId };
}
