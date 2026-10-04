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
  if (req.method === 'GET') return res.status(200).send('agente-crea-pedidos ok');
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
