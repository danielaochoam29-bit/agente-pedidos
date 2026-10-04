/**
 * Endpoint que recibe los eventos de Slack (Events API) en Vercel.
 *
 * Slack exige responder en menos de 3 segundos; el trabajo real se hace
 * después con waitUntil. Slack reintenta si no respondemos a tiempo: esos
 * reintentos (cabecera x-slack-retry-num) se aceptan pero no se procesan,
 * para no crear nada dos veces.
 */

import { waitUntil } from '@vercel/functions';
import { firmaValida, Slack } from '../../src/slack.mjs';
import { AppSheet } from '../../src/appsheet.mjs';
import { Bot } from '../../src/bot.mjs';

export const config = { api: { bodyParser: false } };

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

let bot;
function elBot() {
  bot ??= new Bot({ slack: new Slack(), api: new AppSheet() });
  return bot;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Diagnóstico: /api/slack/events?diag=<primeros 8 caracteres del signing secret>
    const diag = new URL(req.url, 'http://x').searchParams.get('diag');
    if (diag && diag === (process.env.SLACK_SIGNING_SECRET ?? '').slice(0, 8)) {
      const api = new AppSheet({ ensayo: false });
      const out = { appId: (process.env.APPSHEET_APP_ID ?? '').slice(0, 8), keyLen: (process.env.APPSHEET_ACCESS_KEY ?? '').length, ensayo: process.env.MODO_ENSAYO, ia: Boolean(process.env.ANTHROPIC_API_KEY) };
      try {
        const url = `https://api.appsheet.com/api/v2/apps/${process.env.APPSHEET_APP_ID}/tables/MUNICIPIOS/Action`;
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ApplicationAccessKey: process.env.APPSHEET_ACCESS_KEY }, body: JSON.stringify({ Action: 'Find', Properties: { Locale: 'es-CO' }, Rows: [] }) });
        const texto = await r.text();
        out.find = { status: r.status, length: texto.length, inicio: texto.slice(0, 300) };
      } catch (e) {
        out.find = { error: e.message };
      }
      return res.status(200).json(out);
    }
    return res.status(200).send('agente-crea-pedidos ok');
  }
  if (req.method !== 'POST') return res.status(405).end();

  const cuerpo = await leerCuerpo(req);
  const ok = firmaValida({ cuerpo, timestamp: req.headers['x-slack-request-timestamp'], firma: req.headers['x-slack-signature'] });
  if (!ok) return res.status(401).send('firma inválida');

  let json;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    return res.status(400).send('json inválido');
  }
  if (json.type === 'url_verification') return res.status(200).json({ challenge: json.challenge });

  res.setHeader('X-Slack-No-Retry', '1');
  res.status(200).send('ok');

  if (req.headers['x-slack-retry-num']) return; // reintento: ya lo estamos procesando
  if (json.type === 'event_callback' && json.event) waitUntil(elBot().manejar(json.event));
}
