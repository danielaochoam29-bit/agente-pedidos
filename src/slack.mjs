/** Cliente mínimo de la Web API de Slack y verificación de firma de los eventos. */

import { createHmac, timingSafeEqual } from 'node:crypto';

export class Slack {
  constructor({ token = process.env.SLACK_BOT_TOKEN, fetchFn = fetch } = {}) {
    this.token = token;
    this.fetchFn = fetchFn;
    this.usuarios = new Map();
  }

  async llamar(metodo, params = {}) {
    // Formulario, no JSON: métodos de lectura como conversations.replies no aceptan cuerpo JSON.
    const body = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    const res = await this.fetchFn(`https://slack.com/api/${metodo}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`Slack ${metodo}: ${json.error}`);
    return json;
  }

  responder(channel, thread_ts, text) {
    return this.llamar('chat.postMessage', { channel, thread_ts, text, unfurl_links: false });
  }

  async reaccionar(channel, timestamp, name) {
    try {
      await this.llamar('reactions.add', { channel, timestamp, name });
    } catch (e) {
      if (!/already_reacted/.test(e.message)) throw e;
    }
  }

  async hilo(channel, ts) {
    const r = await this.llamar('conversations.replies', { channel, ts, limit: 200 });
    return r.messages ?? [];
  }

  /**
   * Sube un archivo al hilo (flujo externo de Slack: getUploadURLExternal → PUT → completeUploadExternal).
   * Necesita el permiso files:write; si falta, lanza "missing_scope".
   */
  async subirArchivo({ channel, thread_ts, nombre, buffer, titulo = nombre, comentario = '' }) {
    const u = await this.llamar('files.getUploadURLExternal', { filename: nombre, length: buffer.length });
    const put = await this.fetchFn(u.upload_url, { method: 'POST', body: buffer });
    if (!put.ok) throw new Error(`Slack subida del archivo → ${put.status}`);
    return this.llamar('files.completeUploadExternal', {
      files: JSON.stringify([{ id: u.file_id, title: titulo }]),
      channel_id: channel,
      thread_ts,
      initial_comment: comentario,
    });
  }

  /** Nombre real y correo de un usuario (con caché). */
  async usuario(id) {
    if (this.usuarios.has(id)) return this.usuarios.get(id);
    const r = await this.llamar('users.info', { user: id });
    const u = { id, nombre: r.user.real_name || r.user.name, correo: r.user.profile?.email ?? '' };
    this.usuarios.set(id, u);
    return u;
  }
}

/** Verifica la firma v0 de Slack. `cuerpo` es el body crudo (string). */
export function firmaValida({ cuerpo, timestamp, firma, secreto = process.env.SLACK_SIGNING_SECRET, ahora = Date.now() }) {
  if (!secreto || !timestamp || !firma) return false;
  if (Math.abs(ahora / 1000 - Number(timestamp)) > 60 * 5) return false;
  const esperada = 'v0=' + createHmac('sha256', secreto).update(`v0:${timestamp}:${cuerpo}`).digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(String(firma));
  return a.length === b.length && timingSafeEqual(a, b);
}
