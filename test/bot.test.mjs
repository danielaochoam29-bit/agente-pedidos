import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bot, pareceUnPedido, sinEmoji, peDeMensaje, nombreArchivoPdf } from '../src/bot.mjs';
import { AppSheet } from '../src/appsheet.mjs';
import { firmaValida } from '../src/slack.mjs';
import { MENSAJE_FORMATO, MENSAJE_LIBRE, PRODUCTOS, CLIENTES, MUNICIPIOS } from './simulado.mjs';
import { olvidarCache } from '../src/datos.mjs';
import { createHmac } from 'node:crypto';

const BOT = 'UBOT';
const JULIAN = 'UJULIAN';

/** Slack simulado: guarda hilos en memoria. */
class SlackFalso {
  constructor() { this.hilos = new Map(); this.reacciones = []; this.n = 0; this.usuarios = new Map(); }
  async llamar(m) { if (m === 'auth.test') return { user_id: BOT }; throw new Error('no simulado: ' + m); }
  async responder(channel, thread_ts, text) {
    const ts = `${thread_ts}.${++this.n}`;
    // Slack guarda los emojis como :shortcodes:
    const guardado = text.replace('✅', ':white_check_mark:').replace('⏳', ':hourglass_flowing_sand:').replace('📄', ':page_facing_up:').replace('⚠️', ':warning:').replace('❌', ':x:');
    this.hilos.get(thread_ts).push({ ts, thread_ts, text: guardado, user: BOT, bot_id: 'B1' });
    return { ts };
  }
  async reaccionar(channel, ts, name) { this.reacciones.push([ts, name]); }
  async subirArchivo({ channel, thread_ts, nombre, buffer, comentario }) {
    this.archivos = this.archivos ?? [];
    this.archivos.push({ nombre, bytes: buffer.length });
    await this.responder(channel, thread_ts, `${comentario} [archivo ${nombre}]`);
  }
  /** Como Slack: con el ts de la raíz devuelve el hilo; con el ts de una respuesta, solo esa respuesta. */
  async hilo(channel, ts) {
    if (this.hilos.has(ts)) return this.hilos.get(ts);
    for (const msgs of this.hilos.values()) { const m = msgs.find((x) => x.ts === ts); if (m) return [m]; }
    return [];
  }
  async usuario(id) { return id === JULIAN ? { id, nombre: 'JULIAN RODRIGUEZ', correo: 'x@y.z' } : { id, nombre: 'Visitante', correo: '' }; }
  raiz(text, user = JULIAN) { const ts = `1000.${++this.n}`; this.hilos.set(ts, [{ ts, text, user }]); return ts; }
  respuesta(raiz, text, user = JULIAN) { const ts = `${raiz}.${++this.n}`; this.hilos.get(raiz).push({ ts, thread_ts: raiz, text, user }); return ts; }
  textosBot(raiz) { return this.hilos.get(raiz).filter((m) => m.user === BOT).map((m) => m.text); }
}

/** AppSheet simulado: Find devuelve el catálogo simulado; Add devuelve KEY/PE como lo haría la app. */
function appsheetFalso() {
  const api = new AppSheet({ ensayo: false });
  const objetos = (t) => t.slice(1).map((f) => Object.fromEntries(t[0].map((c, i) => [c, f[i]])));
  api.llamar = async function (tabla, action, rows, props) {
    this.enviado.push({ tabla, Action: action, Rows: rows });
    if (action === 'Find' && tabla === 'PEDIDOS' && /\[PE\] = "PE2010"/.test(props?.Selector ?? '')) return { Rows: [{ KEY: 'PE2010abcdef01', PE: 'PE2010', CLIENTE: 'MARIA PRUEBA GOMEZ', NOTAS: '----' }] };
    if (action === 'Find' && tabla === 'PEDIDOS') return { Rows: [{ KEY: 'PE2009863a4589', PE: 'PE2009', 'NUMERO CONSECUTIVO': '2009' }] };
    if (action === 'Find' && tabla === 'DETALLES PEDIDO') return { Rows: [{ KEY: 'd1' }, { KEY: 'd2' }] };
    if (action === 'Find') return { Rows: objetos({ PRODUCTOS, CLIENTES, MUNICIPIOS }[tabla]) };
    return { Rows: rows };
  };
  return api;
}

function nuevoBot(ensayo = false) {
  olvidarCache();
  const slack = new SlackFalso();
  const api = appsheetFalso();
  const bot = new Bot({
    slack, api, ensayo, log: () => {},
    esperarPdfFn: async () => ({ documento: '/x/PEDIDOS_PDFS/PE2010.pdf', url: 'https://ejemplo/PE2010' }),
    descargarPdfFn: async () => Buffer.from('%PDF-1.5 simulado'),
  });
  return { slack, api, bot };
}

test('pareceUnPedido', () => {
  assert.ok(pareceUnPedido(MENSAJE_LIBRE));
  assert.ok(pareceUnPedido('PEDIDO\nCliente: x'));
  assert.ok(!pareceUnPedido('buenos días equipo'));
});

test('flujo completo: pedido → faltan → respuesta en hilo → confirmar → ✅ → creado', async () => {
  const { slack, api, bot } = nuevoBot();
  const raiz = slack.raiz(MENSAJE_LIBRE);
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: MENSAJE_LIBRE });
  assert.deepEqual(slack.reacciones, [[raiz, 'eyes']]);
  assert.match(slack.textosBot(raiz)[0], /Me falta información.*Ciudad de envío/s);

  const r = slack.respuesta(raiz, 'Ciudad: Ibagué, Tolima\nTipo de cliente: FINAL\nCanal: WhatsApp\nCliente de: ARQUI\nEnvío contraentrega');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: r, thread_ts: raiz, text: slack.hilos.get(raiz).at(-1).text });
  const confirmacion = slack.hilos.get(raiz).at(-1);
  assert.match(confirmacion.text, /^Esto es lo que voy a registrar/);
  assert.match(confirmacion.text, /MARIA PRUEBA GOMEZ \(\*nuevo\* · FINAL · WhatsApp · cliente de ARQUI\)/);

  // Un desconocido no puede confirmar
  await bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: 'UOTRO', item: { channel: 'C1', ts: confirmacion.ts } });
  assert.match(slack.textosBot(raiz).at(-1), /Solo un asesor registrado/);
  assert.equal(api.enviado.filter((e) => e.Action === 'Add').length, 0);

  // Julián confirma
  await bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: JULIAN, item: { channel: 'C1', ts: confirmacion.ts } });
  const textos = slack.textosBot(raiz);
  assert.match(textos.at(-3), /Creando el pedido/);
  assert.match(textos.at(-2), /Pedido \*PE2010\* creado/);
  assert.match(textos.at(-1), /PDF del pedido \*PE2010\* generado.*\[archivo PE2010_MARIA PRUEBA GOMEZ_\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.pdf\]/);
  assert.equal(slack.archivos[0].bytes, 17);
  assert.deepEqual(api.enviado.filter((e) => e.Action !== 'Find').map((e) => [e.tabla, e.Action, e.Rows.length]), [
    ['CLIENTES', 'Add', 1], ['PEDIDOS', 'Add', 1], ['DETALLES PEDIDO', 'Add', 4], ['PEDIDOS', 'Edit', 1],
  ]);
  const ped = api.enviado.find((e) => e.tabla === 'PEDIDOS' && e.Action === 'Add').Rows[0];
  assert.equal(ped['TOTAL QTY'], 100);
  assert.equal(ped.PE, 'PE2010');
  assert.match(ped.KEY, /^PE2010[0-9a-f]{8}$/);
  assert.match(ped.FECHA, /^\d{4}-\d{2}-\d{2}$/);

  // Un segundo ✅ no crea nada más
  const antes = api.enviado.length;
  await bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: JULIAN, item: { channel: 'C1', ts: confirmacion.ts } });
  assert.equal(api.enviado.length, antes);

  // Una respuesta posterior en el hilo propone ACTUALIZAR el mismo pedido (nunca crea otro)
  const r2 = slack.respuesta(raiz, 'Dirección: Calle 9 # 9-99\nquita B02P');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: r2, thread_ts: raiz, text: 'Dirección: Calle 9 # 9-99\nquita B02P' });
  const cambio = slack.hilos.get(raiz).at(-1);
  assert.match(cambio.text, /^Esto es lo que voy a actualizar en el pedido \*PE2010\*/);
  assert.match(cambio.text, /Calle 9 # 9-99/);
  assert.ok(!/B02P/.test(cambio.text));
  const antesUpd = api.enviado.length;
  await bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: JULIAN, item: { channel: 'C1', ts: cambio.ts } });
  const acciones = api.enviado.slice(antesUpd).map((e) => [e.tabla, e.Action, e.Rows.length]);
  assert.deepEqual(acciones.filter((a) => a[1] !== 'Find'), [['PEDIDOS', 'Edit', 1], ['DETALLES PEDIDO', 'Delete', 2], ['DETALLES PEDIDO', 'Add', 3]]);
  const edit = api.enviado.slice(antesUpd).find((e) => e.tabla === 'PEDIDOS' && e.Action === 'Edit').Rows[0];
  for (const col of ['USUARIO', 'FECHA', 'ESTADO PEDIDO', 'ESTADO PAGO', 'PE', 'NUMERO CONSECUTIVO']) assert.ok(!(col in edit), `${col} no debe ir en el Edit`);
  assert.equal(edit['DIRECCIÓN DE ENVÍO'], 'Calle 9 # 9-99');
  assert.equal(api.enviado.filter((e) => e.tabla === 'PEDIDOS' && e.Action === 'Add').length, 1); // sigue habiendo UN solo pedido
  const t2 = slack.textosBot(raiz);
  assert.match(t2.at(-2), /Pedido \*PE2010\* actualizado/);
  assert.match(t2.at(-1), /^¿Genero el PDF de nuevo\? Pedido \*PE2010\*/);
  // "si" a la pregunta del PDF: lo regenera y lo sube
  const si2 = slack.respuesta(raiz, 'si');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: si2, thread_ts: raiz, text: 'si' });
  assert.match(slack.textosBot(raiz).at(-1), /PDF del pedido \*PE2010\* generado/);
  assert.equal(api.enviado.filter((e) => e.tabla === 'PEDIDOS' && e.Action === 'Add').length, 1);
});

test('mensaje completo: confirma de una; "no" cancela; ✅ sobre un resumen viejo no vale', async () => {
  const { slack, api, bot } = nuevoBot();
  const raiz = slack.raiz(MENSAJE_FORMATO);
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: MENSAJE_FORMATO });
  const c1 = slack.hilos.get(raiz).at(-1);
  assert.match(c1.text, /^Esto es lo que voy a registrar/);

  const r = slack.respuesta(raiz, 'Valor del envío: 18500');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: r, thread_ts: raiz, text: 'Valor del envío: 18500' });
  const c2 = slack.hilos.get(raiz).at(-1);
  assert.match(c2.text, /Envío:\* \$18\.500/);

  await bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: JULIAN, item: { channel: 'C1', ts: c1.ts } });
  assert.match(slack.textosBot(raiz).at(-1), /ya no es el último/);
  assert.equal(api.enviado.filter((e) => e.Action === 'Add').length, 0);

  const n = slack.respuesta(raiz, 'no');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: n, thread_ts: raiz, text: 'no' });
  assert.match(slack.textosBot(raiz).at(-1), /Cancelado/);
});

test('modo ensayo: no escribe, muestra lo que habría enviado', async () => {
  const { slack, api, bot } = nuevoBot(true);
  const raiz = slack.raiz(MENSAJE_FORMATO);
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: MENSAJE_FORMATO });
  const c = slack.hilos.get(raiz).at(-1);
  await bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: JULIAN, item: { channel: 'C1', ts: c.ts } });
  assert.match(slack.textosBot(raiz).at(-1), /MODO ENSAYO/);
});

test('precio malo: error y no hay resumen', async () => {
  const { slack, bot } = nuevoBot();
  const msg = MENSAJE_FORMATO.replace('B01T — 25 und × $1.090', 'B01T — 25 und × $1.000');
  const raiz = slack.raiz(msg);
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: msg });
  assert.match(slack.textosBot(raiz)[0], /No puedo crear el pedido/);
});

test('charla normal en el canal se ignora', async () => {
  const { slack, bot } = nuevoBot();
  const raiz = slack.raiz('hola equipo, buen día');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: 'hola equipo, buen día' });
  assert.equal(slack.textosBot(raiz).length, 0);
});

test('firma de Slack', () => {
  const secreto = 'abc';
  const cuerpo = '{"x":1}';
  const ts = String(Math.floor(Date.now() / 1000));
  const firma = 'v0=' + createHmac('sha256', secreto).update(`v0:${ts}:${cuerpo}`).digest('hex');
  assert.ok(firmaValida({ cuerpo, timestamp: ts, firma, secreto }));
  assert.ok(!firmaValida({ cuerpo: cuerpo + ' ', timestamp: ts, firma, secreto }));
  assert.ok(!firmaValida({ cuerpo, timestamp: String(Number(ts) - 1000), firma, secreto }));
});

test('asesor en apuros: número suelto tras la pregunta de cantidad, y "si" en el hilo confirma', async () => {
  const { slack, api, bot } = nuevoBot();
  const msg = MENSAJE_FORMATO.replace('B01T — 25 und × $1.090', 'B01T — 20 und × $1.090').replace('  Pago del envío: Pago en bodega con cobro al cliente\n', '');
  const raiz = slack.raiz(msg);
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: msg });
  assert.match(slack.textosBot(raiz).at(-1), /B01T se vende en paquetes de 25/);
  assert.match(slack.textosBot(raiz).at(-1), /Pago del envío/);

  const r = slack.respuesta(raiz, '25, pago del envío en bodega sin cobro al cliente');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: r, thread_ts: raiz, text: '25, pago del envío en bodega sin cobro al cliente' });
  const resumen = slack.textosBot(raiz).at(-1);
  assert.match(resumen, /^Esto es lo que voy a registrar/);
  assert.match(resumen, /B01T\* — 25 und/);
  assert.match(resumen, /PAGO EN BODEGA SIN COBRO AL CLIENTE/);

  const si = slack.respuesta(raiz, 'si');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: si, thread_ts: raiz, text: 'si' });
  assert.match(slack.textosBot(raiz).at(-2), /Pedido \*PE2010\* creado/);
  assert.equal(api.enviado.filter((e) => e.Action === 'Add').length, 3);
});

test('"si" sin resumen previo no crea nada', async () => {
  const { slack, api, bot } = nuevoBot();
  const raiz = slack.raiz(MENSAJE_LIBRE);
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: MENSAJE_LIBRE });
  const si = slack.respuesta(raiz, 'ok');
  await bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: si, thread_ts: raiz, text: 'ok' });
  assert.match(slack.textosBot(raiz).at(-1), /Todavía no hay nada que confirmar/);
  assert.equal(api.enviado.filter((e) => e.Action === 'Add').length, 0);
});

test('si el PDF no llega a tiempo, avisa; si falta files:write, publica el enlace', async () => {
  const sinPdf = nuevoBot();
  sinPdf.bot.esperarPdfFn = async () => null;
  let raiz = sinPdf.slack.raiz(MENSAJE_FORMATO);
  await sinPdf.bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: MENSAJE_FORMATO });
  let c = sinPdf.slack.hilos.get(raiz).at(-1);
  await sinPdf.bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: JULIAN, item: { channel: 'C1', ts: c.ts } });
  assert.match(sinPdf.slack.textosBot(raiz).at(-1), /no terminó de generar el PDF/);

  const sinScope = nuevoBot();
  sinScope.slack.subirArchivo = async () => { throw new Error('Slack files.getUploadURLExternal: missing_scope'); };
  raiz = sinScope.slack.raiz(MENSAJE_FORMATO);
  await sinScope.bot.manejar({ type: 'message', channel: 'C1', user: JULIAN, ts: raiz, text: MENSAJE_FORMATO });
  c = sinScope.slack.hilos.get(raiz).at(-1);
  await sinScope.bot.manejar({ type: 'reaction_added', reaction: 'white_check_mark', user: JULIAN, item: { channel: 'C1', ts: c.ts } });
  assert.match(sinScope.slack.textosBot(raiz).at(-1), /PDF del pedido \*PE2010\* generado\.\nhttps:\/\/ejemplo\/PE2010/);
});

test('marcas robustas: emojis como símbolo o como :shortcode:', () => {
  assert.equal(sinEmoji(':white_check_mark: Pedido *PE2011* creado'), 'Pedido *PE2011* creado');
  assert.equal(sinEmoji('✅ Pedido *PE2011* creado'), 'Pedido *PE2011* creado');
  assert.equal(peDeMensaje(':white_check_mark: Pedido *PE2011* creado\nCliente: X'), 'PE2011');
  assert.equal(peDeMensaje('✅ Pedido *PE2012* actualizado'), 'PE2012');
  assert.equal(peDeMensaje(':warning: El pedido *PE2011* quedó creado'), null);
  assert.match(nombreArchivoPdf('PE2011', 'MICHAEL STEVEN LOPEZ CORDOBA', new Date('2026-10-05T07:28:15Z')), /^PE2011_MICHAEL STEVEN LOPEZ CORDOBA_2026-10-05 02-28-15\.pdf$/);
});
