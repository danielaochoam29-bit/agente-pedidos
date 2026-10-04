/**
 * El cerebro del bot: qué hacer con cada evento de Slack.
 *
 * No guarda estado en ningún sitio: el hilo de Slack ES el estado. Ante
 * cualquier respuesta o reacción, relee el hilo completo, junta el mensaje
 * original con todas las respuestas de los asesores y vuelve a extraer y
 * validar. Si en el hilo ya hay un "✅ Pedido … creado" del bot, no hace nada.
 */

import { extraer } from './extraer.mjs';
import { validar, vendedorDe } from './validar.mjs';
import { armar } from './armar.mjs';
import { registrarEnAppSheet, esperarPdf, descargarPdf } from './appsheet.mjs';
import { cargarCatalogo } from './datos.mjs';
import { mensajeConfirmar, mensajeFaltan, mensajeError, mensajeCreado, mensajeFallo, mensajePdfListo, mensajePdfNoListo } from './mensajes.mjs';

const MARCA_CONFIRMAR = 'Esto es lo que voy a registrar';
const MARCA_CREADO = '✅ Pedido';
const MARCA_CREANDO = '⏳ Creando el pedido';
const REACCION_OK = 'white_check_mark';

export class Bot {
  /** @param {{slack: import('./slack.mjs').Slack, api: import('./appsheet.mjs').AppSheet, ensayo?: boolean, log?: Function}} deps */
  constructor({ slack, api, ensayo = process.env.MODO_ENSAYO === '1', log = console.log, canalId = process.env.SLACK_CANAL_ID || null, esperarPdfFn = esperarPdf, descargarPdfFn = descargarPdf }) {
    this.slack = slack;
    this.api = api;
    this.esperarPdfFn = esperarPdfFn;
    this.descargarPdfFn = descargarPdfFn;
    this.ensayo = ensayo;
    this.log = log;
    this.canalId = canalId;
    this.botUserId = null;
  }

  async miId() {
    if (!this.botUserId) this.botUserId = (await this.slack.llamar('auth.test')).user_id;
    return this.botUserId;
  }

  /** Punto de entrada: el objeto `event` del Events API. */
  async manejar(event) {
    try {
      if (event.type === 'message') return await this.mensaje(event);
      if (event.type === 'reaction_added') return await this.reaccion(event);
    } catch (e) {
      this.log('ERROR manejando evento', event.type, e);
      const channel = event.channel ?? event.item?.channel;
      const ts = event.thread_ts ?? event.ts ?? event.item?.ts;
      if (channel && ts) await this.slack.responder(channel, ts, mensajeFallo(e.message)).catch(() => {});
    }
  }

  async mensaje(event) {
    if (event.subtype || event.bot_id) return; // ediciones, uniones, mensajes de bots
    if (this.canalId && event.channel !== this.canalId) return;
    if (event.user === (await this.miId())) return;
    const raiz = event.thread_ts ?? event.ts;
    const esRespuesta = Boolean(event.thread_ts && event.thread_ts !== event.ts);

    if (esRespuesta) {
      const texto = (event.text ?? '').trim().toLowerCase();
      if (/^(no|cancelar|cancela|cancelado)\b/.test(texto)) {
        return this.slack.responder(event.channel, raiz, '🚫 Cancelado. Si quieres registrarlo, envía el pedido en un mensaje nuevo.');
      }
      if (/^(si|sí|ok|dale|listo|confirmo|confirmar|confirmado|crealo|créalo|crear|hazlo|de una|va)[\s!.]*$/.test(texto)) {
        const hilo = await this.slack.hilo(event.channel, raiz);
        const yo = await this.miId();
        const ultima = [...hilo].reverse().find((m) => (m.bot_id || m.user === yo) && m.text?.startsWith(MARCA_CONFIRMAR));
        if (!ultima) return this.slack.responder(event.channel, raiz, 'Todavía no hay un resumen que confirmar; completa primero lo que falta.');
        return this.confirmar({ channel: event.channel, raiz, user: event.user, tsConfirmacion: ultima.ts, hilo });
      }
    } else {
      if (!pareceUnPedido(event.text)) return; // charla normal en el canal
      await this.slack.reaccionar(event.channel, event.ts, 'eyes');
    }
    const v = await this.evaluarHilo(event.channel, raiz);
    if (!v) return;
    const texto = v.estado === 'ok' ? mensajeConfirmar(v) : v.estado === 'faltan' ? mensajeFaltan(v) : mensajeError(v);
    await this.slack.responder(event.channel, raiz, texto);
  }

  async reaccion(event) {
    if (event.reaction !== REACCION_OK) return;
    if (event.user === (await this.miId())) return;
    const { channel, ts } = event.item ?? {};
    if (!channel || !ts) return;
    if (this.canalId && channel !== this.canalId) return;

    // ¿La reacción es sobre el mensaje de confirmación del bot?
    const mensajes = await this.slack.hilo(channel, ts).catch(() => []);
    const objetivo = mensajes.find((m) => m.ts === ts);
    if (!objetivo || !objetivo.text?.startsWith(MARCA_CONFIRMAR)) return;
    const raiz = objetivo.thread_ts ?? ts;
    return this.confirmar({ channel, raiz, user: event.user, tsConfirmacion: ts });
  }

  /** Crea el pedido tras un ✅ (reacción o "si" en el hilo) sobre el último resumen. */
  async confirmar({ channel, raiz, user, tsConfirmacion, hilo = null }) {
    const ts = tsConfirmacion;
    const quien = await this.slack.usuario(user);
    if (!vendedorDe(quien.nombre) && !vendedorDe(quien.correo)) {
      return this.slack.responder(channel, raiz, `Solo un asesor registrado puede confirmar (reaccionó ${quien.nombre}).`);
    }

    hilo ??= await this.slack.hilo(channel, raiz);
    const mios = hilo.filter((m) => m.bot_id || m.user === this.botUserId);
    if (mios.some((m) => m.text?.startsWith(MARCA_CREADO) || m.text?.startsWith(MARCA_CREANDO))) return;
    // Solo vale el ✅ sobre la ÚLTIMA confirmación (si el asesor corrigió datos, hay una más nueva)
    const ultimaConfirmacion = [...mios].reverse().find((m) => m.text?.startsWith(MARCA_CONFIRMAR));
    if (ultimaConfirmacion && ultimaConfirmacion.ts !== ts) {
      return this.slack.responder(channel, raiz, 'Ese resumen ya no es el último. Reacciona ✅ al resumen más reciente.');
    }

    await this.slack.responder(channel, raiz, `${MARCA_CREANDO}…`);
    const v = await this.evaluarHilo(channel, raiz, hilo);
    if (!v || v.estado !== 'ok') {
      return this.slack.responder(channel, raiz, '❌ Al revisar de nuevo el pedido ya no está completo. ' + (v ? (v.errores.concat(v.faltantes).join(' · ')) : ''));
    }
    const armado = armar(v.pedido);
    if (this.ensayo) {
      this.api.enviado = [];
      const r = await registrarEnAppSheet(this.api, { ...armado, pedido: { ...armado.pedido } }).catch((e) => ({ error: e.message }));
      const resumen = this.api.enviado.map((e) => `• ${e.Action} en ${e.tabla}: ${e.Rows.length} fila(s)` + (e.tabla === 'PEDIDOS' && e.Action === 'Add' ? ` → ${e.Rows[0].PE} (KEY ${e.Rows[0].KEY})` : '')).join('\n');
      const filas = JSON.stringify(this.api.enviado.map((e) => ({ tabla: e.tabla, accion: e.Action, filas: e.Rows })), null, 1);
      return this.slack.responder(channel, raiz,
        `🧪 *MODO ENSAYO*: no escribí nada en AppSheet. Habría hecho:\n${resumen}` + (r?.error ? `\n❌ ${r.error}` : '') +
        `\n\`\`\`${filas.slice(0, 2500)}${filas.length > 2500 ? '\n…' : ''}\`\`\``);
    }
    let r;
    try {
      r = await registrarEnAppSheet(this.api, armado);
      await this.slack.responder(channel, raiz, mensajeCreado(v.pedido, r));
      await this.slack.reaccionar(channel, raiz, REACCION_OK);
    } catch (e) {
      this.log('ERROR registrando', e);
      return this.slack.responder(channel, raiz, mensajeFallo(e.message));
    }
    await this.publicarPdf(channel, raiz, r);
  }

  /** Espera el PDF que genera AppSheet y lo sube al hilo (o publica el enlace si falta el permiso files:write). */
  async publicarPdf(channel, raiz, { key, pe }) {
    try {
      const pdf = await this.esperarPdfFn(this.api, key);
      if (!pdf) return this.slack.responder(channel, raiz, mensajePdfNoListo(pe));
      let buffer = null;
      try {
        buffer = await this.descargarPdfFn(pdf.url);
      } catch (e) {
        this.log('No se pudo descargar el PDF', e.message);
      }
      if (buffer) {
        try {
          await this.slack.subirArchivo({ channel, thread_ts: raiz, nombre: `${pe}.pdf`, buffer, titulo: `Pedido ${pe}`, comentario: mensajePdfListo(pe) });
          return;
        } catch (e) {
          this.log('No se pudo subir el PDF a Slack', e.message);
          if (!/missing_scope/.test(e.message)) throw e;
        }
      }
      await this.slack.responder(channel, raiz, `${mensajePdfListo(pe)}\n${pdf.url}`);
    } catch (e) {
      this.log('ERROR publicando el PDF', e);
      await this.slack.responder(channel, raiz, `${mensajePdfListo(pe)} (no pude adjuntarlo: ${e.message})`).catch(() => {});
    }
  }

  /** Relee el hilo, junta el texto de los asesores y devuelve la validación (o null si ya se creó). */
  async evaluarHilo(channel, raiz, hilo = null) {
    hilo ??= await this.slack.hilo(channel, raiz);
    const yo = await this.miId();
    const mios = hilo.filter((m) => m.bot_id || m.user === yo);
    if (mios.some((m) => m.text?.startsWith(MARCA_CREADO))) {
      await this.slack.responder(channel, raiz, 'Este pedido ya fue creado. Para otro pedido, envía un mensaje nuevo.');
      return null;
    }
    const humanos = hilo.filter((m) => !m.bot_id && m.user !== yo && !m.subtype);
    const original = humanos.find((m) => m.ts === raiz) ?? humanos[0];
    if (!original) return null;
    const texto = textoDelHilo(hilo, humanos, yo);
    const autor = await this.slack.usuario(original.user);
    const remitente = vendedorDe(autor.nombre) ? autor.nombre : autor.correo;

    const [catalogo, { pedido: extraido }] = await Promise.all([cargarCatalogo(this.api), extraer(texto)]);
    return validar(extraido, catalogo, remitente);
  }
}

/** Un mensaje raíz se trata como pedido si trae una referencia con cantidad o la palabra PEDIDO. */
export function pareceUnPedido(texto = '') {
  return /\bpedido\b/i.test(texto) || /\b[A-Z]{1,4}\d{1,4}[A-Z0-9-]{0,5}\b[\s\S]{0,120}?\d+\s*(und|unidades|u\b)/i.test(texto);
}

/**
 * Junta el mensaje original y las respuestas del asesor, en orden, con separadores
 * (así la IA sabe que lo de después corrige lo de antes). Si el bot acababa de
 * preguntar la cantidad de UNA referencia y el asesor contesta con un número suelto
 * ("25" o "25, pago en bodega…"), ese número se convierte en "REF 25 und".
 */
export function textoDelHilo(hilo, humanos, yo) {
  const partes = [];
  let pendiente = null; // referencia cuya cantidad preguntó el bot en su último mensaje
  let n = 0;
  for (const m of hilo) {
    const esBot = m.bot_id || m.user === yo;
    if (esBot) {
      const refs = [...(m.text ?? '').matchAll(/•\s*\*?([A-Z0-9-]{3,10})\*?\s+se vende en paquetes de/g)].map((x) => x[1]);
      pendiente = m.text?.startsWith('⚠️') && refs.length === 1 ? refs[0] : null;
      continue;
    }
    if (!humanos.includes(m)) continue;
    let t = m.text ?? '';
    if (n > 0 && pendiente) {
      const num = /^\s*(\d{1,6})\s*(?:und|unds|unid|unidades|u\b)?\s*(?:[,.;]|$)/i.exec(t);
      if (num) t = `${pendiente} ${num[1]} und` + t.slice(num[0].length).replace(/^\s*[,.;]?/, ', ');
    }
    partes.push(n === 0 ? `=== Mensaje original ===\n${t}` : `=== Respuesta del asesor ${n} (corrige o completa lo anterior) ===\n${t}`);
    n++;
    pendiente = null;
  }
  return partes.join('\n\n');
}
