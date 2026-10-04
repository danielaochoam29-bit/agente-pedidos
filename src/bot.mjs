/**
 * El cerebro del bot: qué hacer con cada evento de Slack.
 *
 * No guarda estado en ningún sitio: el hilo de Slack ES el estado. Ante
 * cualquier respuesta o reacción, relee el hilo completo, junta el mensaje
 * original con todas las respuestas de los asesores y vuelve a extraer y
 * validar.
 *
 * Un hilo = un pedido. Antes de crearlo, el ✅ sobre el resumen lo crea.
 * Después de creado, cualquier respuesta propone ACTUALIZAR ese mismo pedido;
 * el ✅ lo actualiza en AppSheet y el bot pregunta si genera el PDF de nuevo.
 *
 * Ojo: Slack guarda los emojis como texto (":white_check_mark:"), así que las
 * marcas se reconocen por su texto, no por el símbolo.
 */

import { extraer } from './extraer.mjs';
import { validar, vendedorDe } from './validar.mjs';
import { armar } from './armar.mjs';
import { registrarEnAppSheet, actualizarEnAppSheet, pedidoPorPe, dispararPdf, esperarPdf, descargarPdf } from './appsheet.mjs';
import { cargarCatalogo } from './datos.mjs';
import { fechaIso } from './texto.mjs';
import {
  mensajeConfirmar, mensajeConfirmarCambio, mensajeFaltan, mensajeError, mensajeCreado, mensajeActualizado,
  mensajeFallo, mensajePdfListo, mensajePdfNoListo, mensajePreguntaPdf,
} from './mensajes.mjs';

export const MARCAS = {
  CONFIRMAR: 'Esto es lo que voy a registrar',
  ACTUALIZAR: 'Esto es lo que voy a actualizar',
  PREGUNTA_PDF: '¿Genero el PDF de nuevo?',
  CREANDO: 'Creando el pedido',
  ACTUALIZANDO: 'Actualizando el pedido',
};
const REACCION_OK = 'white_check_mark';

/** Quita el emoji inicial (símbolo o :shortcode:) para comparar marcas. */
export function sinEmoji(texto = '') {
  return String(texto).replace(/^\s*(?::[a-z0-9_+-]+:|[^\w¿*])+\s*/iu, '').trim();
}
const empieza = (m, marca) => sinEmoji(m?.text).startsWith(marca);
/** "✅ Pedido *PE2011* creado" / "… actualizado" → "PE2011". */
export function peDeMensaje(texto) {
  const m = /^Pedido \*?([A-Z0-9-]+)\*? (creado|actualizado)/.exec(sinEmoji(texto));
  return m ? m[1] : null;
}

export class Bot {
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

  esMio(m) {
    return Boolean(m.bot_id) || m.user === this.botUserId;
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
      if (/^(no|cancelar|cancela|cancelado)[\s!.]*$/.test(texto)) {
        return this.slack.responder(event.channel, raiz, '🚫 Cancelado. Si quieres registrarlo, envía el pedido en un mensaje nuevo.');
      }
      if (/^(si|sí|ok|dale|listo|confirmo|confirmar|confirmado|crealo|créalo|crear|hazlo|de una|va|genera|generalo|genéralo)[\s!.]*$/.test(texto)) {
        const hilo = await this.slack.hilo(event.channel, raiz);
        const ultima = this.ultimaPregunta(hilo);
        if (!ultima) return this.slack.responder(event.channel, raiz, 'Todavía no hay nada que confirmar; completa primero lo que falta.');
        return this.confirmar({ channel: event.channel, raiz, user: event.user, tsConfirmacion: ultima.ts, hilo });
      }
    } else {
      if (!pareceUnPedido(event.text)) return; // charla normal en el canal
      await this.slack.reaccionar(event.channel, event.ts, 'eyes');
    }
    const { v, creado } = await this.evaluarHilo(event.channel, raiz);
    if (!v) return;
    let texto;
    if (v.estado === 'faltan') texto = mensajeFaltan(v);
    else if (v.estado === 'error') texto = mensajeError(v);
    else texto = creado ? mensajeConfirmarCambio(v, creado.pe) : mensajeConfirmar(v);
    await this.slack.responder(event.channel, raiz, texto);
  }

  /** El último mensaje del bot que espera un ✅ (resumen para crear, resumen para actualizar o pregunta del PDF). */
  ultimaPregunta(hilo) {
    return [...hilo].reverse().find((m) => this.esMio(m) && (empieza(m, MARCAS.CONFIRMAR) || empieza(m, MARCAS.ACTUALIZAR) || empieza(m, MARCAS.PREGUNTA_PDF)));
  }

  async reaccion(event) {
    if (event.reaction !== REACCION_OK) return;
    if (event.user === (await this.miId())) return;
    const { channel, ts } = event.item ?? {};
    if (!channel || !ts) return;
    if (this.canalId && channel !== this.canalId) return;

    const mensajes = await this.slack.hilo(channel, ts).catch(() => []);
    const objetivo = mensajes.find((m) => m.ts === ts);
    if (!objetivo) return;
    if (!(empieza(objetivo, MARCAS.CONFIRMAR) || empieza(objetivo, MARCAS.ACTUALIZAR) || empieza(objetivo, MARCAS.PREGUNTA_PDF))) return;
    const raiz = objetivo.thread_ts ?? ts;
    return this.confirmar({ channel, raiz, user: event.user, tsConfirmacion: ts });
  }

  /** Un ✅ (reacción o "si") sobre la última pregunta del bot: crear, actualizar o regenerar el PDF. */
  async confirmar({ channel, raiz, user, tsConfirmacion, hilo = null }) {
    const quien = await this.slack.usuario(user);
    if (!vendedorDe(quien.nombre) && !vendedorDe(quien.correo)) {
      return this.slack.responder(channel, raiz, `Solo un asesor registrado puede confirmar (reaccionó ${quien.nombre}).`);
    }
    await this.miId();
    hilo ??= await this.slack.hilo(channel, raiz);
    const ultima = this.ultimaPregunta(hilo);
    if (!ultima || ultima.ts !== tsConfirmacion) {
      return this.slack.responder(channel, raiz, 'Ese mensaje ya no es el último. Reacciona ✅ al resumen o pregunta más reciente.');
    }
    // ¿Ya hay algo en marcha después de esa pregunta? (doble ✅, reintento de Slack)
    const despues = hilo.filter((m) => this.esMio(m) && Number(m.ts) > Number(ultima.ts));
    if (despues.some((m) => empieza(m, MARCAS.CREANDO) || empieza(m, MARCAS.ACTUALIZANDO) || peDeMensaje(m.text) || empieza(m, 'PDF del pedido') || empieza(m, 'Generando el PDF'))) return;

    if (empieza(ultima, MARCAS.PREGUNTA_PDF)) {
      const pe = /\*([A-Z0-9-]+)\*/.exec(sinEmoji(ultima.text))?.[1];
      return this.regenerarPdf(channel, raiz, pe, hilo);
    }
    if (empieza(ultima, MARCAS.ACTUALIZAR)) return this.actualizar(channel, raiz, hilo);
    return this.crear(channel, raiz, hilo);
  }

  async crear(channel, raiz, hilo) {
    await this.slack.responder(channel, raiz, `⏳ ${MARCAS.CREANDO}…`);
    const { v, creado } = await this.evaluarHilo(channel, raiz, hilo);
    if (creado) return this.slack.responder(channel, raiz, `Este hilo ya tiene el pedido *${creado.pe}*. Para cambiarlo, responde aquí con el cambio.`);
    if (!v || v.estado !== 'ok') {
      return this.slack.responder(channel, raiz, '❌ Al revisar de nuevo el pedido ya no está completo. ' + (v ? v.errores.concat(v.faltantes).join(' · ') : ''));
    }
    const armado = armar(v.pedido);
    if (this.ensayo) return this.ensayar(channel, raiz, () => registrarEnAppSheet(this.api, { ...armado, pedido: { ...armado.pedido } }));
    let r;
    try {
      r = await registrarEnAppSheet(this.api, armado);
      await this.slack.responder(channel, raiz, mensajeCreado(v.pedido, r));
      await this.slack.reaccionar(channel, raiz, REACCION_OK);
    } catch (e) {
      this.log('ERROR registrando', e);
      return this.slack.responder(channel, raiz, mensajeFallo(e.message));
    }
    await this.publicarPdf(channel, raiz, { ...r, cliente: v.pedido.cliente.nombre });
  }

  async actualizar(channel, raiz, hilo) {
    await this.slack.responder(channel, raiz, `⏳ ${MARCAS.ACTUALIZANDO}…`);
    const { v, creado } = await this.evaluarHilo(channel, raiz, hilo);
    if (!creado) return this.slack.responder(channel, raiz, 'No encuentro en este hilo un pedido creado que actualizar.');
    if (!v || v.estado !== 'ok') {
      return this.slack.responder(channel, raiz, '❌ Al revisar de nuevo el pedido ya no está completo. ' + (v ? v.errores.concat(v.faltantes).join(' · ') : ''));
    }
    const armado = armar(v.pedido);
    if (this.ensayo) return this.ensayar(channel, raiz, () => actualizarEnAppSheet(this.api, creado.pe, armado));
    try {
      const r = await actualizarEnAppSheet(this.api, creado.pe, armado);
      await this.slack.responder(channel, raiz, mensajeActualizado(v.pedido, r));
      await this.slack.responder(channel, raiz, mensajePreguntaPdf(r.pe));
    } catch (e) {
      this.log('ERROR actualizando', e);
      await this.slack.responder(channel, raiz, mensajeFallo(e.message, 'actualizar'));
    }
  }

  async regenerarPdf(channel, raiz, pe, hilo) {
    if (!pe) return;
    await this.slack.responder(channel, raiz, `⏳ Generando el PDF de *${pe}*…`);
    const fila = await pedidoPorPe(this.api, pe);
    if (!fila) return this.slack.responder(channel, raiz, `No encontré el pedido ${pe} en la app.`);
    if (this.ensayo) return this.slack.responder(channel, raiz, `🧪 *MODO ENSAYO*: habría puesto ESTATUS = EN PROCESO en ${pe} para generar el PDF.`);
    let yaListo = null;
    try {
      yaListo = await dispararPdf(this.api, fila.KEY);
    } catch (e) {
      this.log('No se pudo disparar el PDF', e.message);
    }
    await this.publicarPdf(channel, raiz, { key: fila.KEY, pe, pdf: yaListo, cliente: fila.CLIENTE });
  }

  async ensayar(channel, raiz, fn) {
    this.api.enviado = [];
    const r = await fn().catch((e) => ({ error: e.message }));
    const resumen = this.api.enviado.map((e) => `• ${e.Action} en ${e.tabla}: ${e.Rows.length} fila(s)` + (e.tabla === 'PEDIDOS' && e.Action === 'Add' ? ` → ${e.Rows[0].PE} (KEY ${e.Rows[0].KEY})` : '')).join('\n');
    const filas = JSON.stringify(this.api.enviado.map((e) => ({ tabla: e.tabla, accion: e.Action, filas: e.Rows })), null, 1);
    return this.slack.responder(channel, raiz,
      `🧪 *MODO ENSAYO*: no escribí nada en AppSheet. Habría hecho:\n${resumen}` + (r?.error ? `\n❌ ${r.error}` : '') +
      `\n\`\`\`${filas.slice(0, 2500)}${filas.length > 2500 ? '\n…' : ''}\`\`\``);
  }

  /** Espera el PDF que genera AppSheet y lo sube al hilo (o publica el enlace si falta el permiso files:write). */
  async publicarPdf(channel, raiz, { key, pe, pdf: yaListo = null, cliente = '' }) {
    try {
      const pdf = await this.esperarPdfFn(this.api, key, { yaListo });
      if (!pdf) return this.slack.responder(channel, raiz, mensajePdfNoListo(pe));
      let buffer = null;
      try {
        buffer = await this.descargarPdfFn(pdf.url);
      } catch (e) {
        this.log('No se pudo descargar el PDF', e.message);
      }
      if (buffer) {
        try {
          const nombre = nombreArchivoPdf(pe, cliente);
          await this.slack.subirArchivo({ channel, thread_ts: raiz, nombre, buffer, titulo: nombre.replace(/\.pdf$/, ''), comentario: mensajePdfListo(pe) });
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

  /**
   * Relee el hilo, junta el texto de los asesores y devuelve { v, creado }:
   * v es la validación; creado es { pe } si en el hilo ya hay un pedido creado.
   */
  async evaluarHilo(channel, raiz, hilo = null) {
    hilo ??= await this.slack.hilo(channel, raiz);
    const yo = await this.miId();
    const mios = hilo.filter((m) => this.esMio(m));
    const pe = mios.map((m) => peDeMensaje(m.text)).filter(Boolean).at(-1) ?? null;
    const creado = pe ? { pe } : null;
    const humanos = hilo.filter((m) => !this.esMio(m) && !m.subtype);
    const original = humanos.find((m) => m.ts === raiz) ?? humanos[0];
    if (!original) return { v: null, creado };
    const texto = textoDelHilo(hilo, humanos, yo);
    const autor = await this.slack.usuario(original.user);
    const remitente = vendedorDe(autor.nombre) ? autor.nombre : autor.correo;

    const [catalogo, { pedido: extraido }] = await Promise.all([cargarCatalogo(this.api), extraer(texto)]);
    return { v: validar(extraido, catalogo, remitente), creado };
  }
}

/** PE2011_NOMBRE CLIENTE_2026-10-05 02-28-15.pdf */
export function nombreArchivoPdf(pe, cliente = '', ahora = new Date()) {
  const nombre = String(cliente ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const fecha = fechaIso(true, ahora).replace(/:/g, '-');
  return `${pe}${nombre ? '_' + nombre : ''}_${fecha}.pdf`;
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
 * Las respuestas que son solo "si"/"no" no aportan datos y se omiten.
 */
export function textoDelHilo(hilo, humanos, yo) {
  const partes = [];
  let pendiente = null;
  let n = 0;
  for (const m of hilo) {
    const esBot = Boolean(m.bot_id) || m.user === yo;
    if (esBot) {
      const refs = [...(m.text ?? '').matchAll(/•\s*\*?([A-Z0-9-]{3,10})\*?\s+se vende en paquetes de/g)].map((x) => x[1]);
      pendiente = /Me falta informaci/.test(m.text ?? '') && refs.length === 1 ? refs[0] : null;
      continue;
    }
    if (!humanos.includes(m)) continue;
    let t = m.text ?? '';
    if (n > 0 && /^(si|sí|ok|dale|listo|no|cancelar|confirmo|confirmar|genera|generalo|genéralo)[\s!.]*$/i.test(t.trim())) continue;
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
