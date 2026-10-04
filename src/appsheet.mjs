/**
 * Cliente mínimo de la API de AppSheet.
 * Docs: https://support.google.com/appsheet/answer/10105398
 *
 * Todas las escrituras pasan por aquí. Con MODO_ENSAYO=1 no se envía nada:
 * se registra lo que se habría enviado y se devuelven respuestas simuladas.
 */

import { ACCION_PDF, TABLAS } from './config.mjs';

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
    if (this.ensayo) {
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

/**
 * Crea cliente (si es nuevo), pedido y detalles, y dispara el PDF.
 * Devuelve { key, pe, clienteId }.
 */
export async function registrarEnAppSheet(api, armado) {
  let clienteId = armado.cliente ? armado.cliente['CLIENTE ID'] : null;
  if (armado.cliente) await api.agregar(TABLAS.CLIENTES, [armado.cliente]);

  const res = await api.agregar(TABLAS.PEDIDOS, [armado.pedido]);
  const fila = res?.Rows?.[0] ?? {};
  const key = fila.KEY ?? armado.pedido.KEY;
  const pe = fila.PE ?? armado.pedido.PE;
  if (!key) throw new Error('AppSheet no devolvió la KEY del pedido; hay que generar las llaves aquí (ver armar.conLlaves).');

  const detalles = armado.detalles.map((d) => ({ ...d, PE: key }));
  await api.agregar(TABLAS.DETALLES, detalles);

  await api.accion(TABLAS.PEDIDOS, ACCION_PDF, [{ KEY: key }]);
  return { key, pe, clienteId };
}
