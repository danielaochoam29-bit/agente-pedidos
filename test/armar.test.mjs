import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerMensaje } from '../src/parser.mjs';
import { validar } from '../src/validar.mjs';
import { armar } from '../src/armar.mjs';
import { AppSheet, registrarEnAppSheet } from '../src/appsheet.mjs';
import { mensajeConfirmar, mensajeCreado } from '../src/mensajes.mjs';
import { catalogo, MENSAJE_FORMATO } from './simulado.mjs';

const cat = catalogo();
const ahora = new Date('2026-10-02T19:16:09Z'); // 14:16:09 en Colombia

test('las filas quedan como PE1979 (cliente nuevo + pedido + 4 detalles)', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO), cat, 'JULIAN RODRIGUEZ');
  const a = armar(v.pedido, { consecutivo: 1979, ahora });

  assert.equal(a.cliente.NOMBRE, 'MARIA PRUEBA GOMEZ');
  assert.equal(a.cliente.NIT, '1234567890');
  assert.equal(a.cliente['TIPO CLIENTE'], 'FINAL');
  assert.equal(a.cliente.DEPARTAMENTO, 'TOLIMA');
  assert.equal(a.cliente.MUNICIPIO, '73001');
  assert.equal(a.cliente['CLIENTE DE'], 'ARQUI');
  assert.equal(a.cliente.CANAL, 'WhatsApp');
  assert.equal(a.cliente['FECHA PDF'], '2026-10-02 14:16:09');
  assert.match(a.cliente['CLIENTE ID'], /^[0-9a-f]{8}$/);

  const p = a.pedido;
  assert.match(p.KEY, /^PE1979[0-9a-f]{8}$/);
  assert.equal(p.PE, 'PE1979');
  assert.equal(p['NUMERO CONSECUTIVO'], 1979);
  assert.equal(p.FECHA, '2026-10-02');
  assert.equal(p.CLIENTE, 'MARIA PRUEBA GOMEZ');
  assert.equal(p.DEPARTAMENTO, 'TOLIMA');
  assert.equal(p.MUNICIPIO, '73001');
  assert.equal(p.CELULAR, '3001234567');
  assert.equal(p['SUBTOTAL PEDIDO'], 127000);
  assert.equal(p.DESCUENTO, 0);
  assert.equal(p['VALOR DEL ENVÍO'], 0);
  assert.equal(p['TOTAL COP'], 127000);
  assert.equal(p['PAGO DEL ENVÍO'], 'PAGO EN BODEGA CON COBRO AL CLIENTE');
  assert.equal(p['ESTADO PEDIDO'], 'EN CONSTRUCCIÓN');
  assert.equal(p.NOTAS, '----');
  assert.equal(p.USUARIO, 'JULIAN');
  assert.equal(p.VENDEDOR, 'JULIAN');
  assert.equal(p.BODEGA, 'BGA');
  assert.equal(p['VALOR FINAL ACTUAL'], 127000);
  assert.equal(p['ESTADO PAGO'], 'PENDIENTE');
  assert.equal(p.MUESTRAS, 'NO');
  assert.equal(p['TOTAL QTY'], 100);
  assert.equal(p['RETENCIÓN EN LA FUENTE'], 0);
  assert.equal(p['PAGO CONTRAENTREGA'], 'NO');
  assert.equal('ESTATUS' in p, false); // lo maneja la acción Generar PDF

  assert.equal(a.detalles.length, 4);
  const d = a.detalles[0];
  assert.equal(d.PE, p.KEY);
  assert.equal(d.FECHA, '2026-10-02');
  assert.equal(d.CLIENTE, 'MARIA PRUEBA GOMEZ');
  assert.equal(d['ITEM NRO'], 'B01TG');
  assert.equal(d.FOTO, 'PRODUCTOS_Images/B01TG.FOTO.193130.png');
  assert.equal(d.EMPAQUE, 'PAQUETE X 25 UNIDADES');
  assert.equal(d.CANTIDAD, 25);
  assert.equal(d['PRECIO DE VENTA UND'], 1090);
  assert.equal(d.SUBTOTAL, 27250);
  assert.equal(a.detalles[1]['COSTO PROMEDIO PONDERADO UNITARIO'], 513.83);
  assert.equal(a.detalles.reduce((s, x) => s + x.SUBTOTAL, 0), p['SUBTOTAL PEDIDO']);
});

test('sin consecutivo: KEY, PE y consecutivo se dejan a AppSheet', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO), cat, 'JULIAN RODRIGUEZ');
  const a = armar(v.pedido, { ahora });
  assert.equal('KEY' in a.pedido, false);
  assert.equal('PE' in a.pedido, false);
});

test('cliente existente: no se crea fila de cliente', () => {
  const v = validar(leerMensaje('NIT: 900000001\nDirección: Calle 1 # 2-3\n* B01T — 25 und × $1.090'), cat, 'JULIAN RODRIGUEZ');
  const a = armar(v.pedido, { ahora });
  assert.equal(a.cliente, null);
  assert.equal(a.pedido.CLIENTE, 'CAFE DE PRUEBA SAS');
});

test('en ensayo, Find sí llama a la API y Add no', async () => {
  const llamadas = [];
  const api = new AppSheet({ ensayo: true, appId: 'app', accessKey: 'k', fetchFn: async (url, o) => { llamadas.push(JSON.parse(o.body).Action); return new Response(JSON.stringify([{ KEY: '1' }]), { status: 200 }); } });
  assert.deepEqual(await api.buscar('MUNICIPIOS'), [{ KEY: '1' }]);
  await api.agregar('PEDIDOS', [{ a: 1 }]);
  assert.deepEqual(llamadas, ['Find']);
  assert.equal(api.enviado.length, 1);
});

test('registro en AppSheet: lee el consecutivo, genera llaves, cliente, pedido, detalles y Generar PDF', async () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO), cat, 'JULIAN RODRIGUEZ');
  const a = armar(v.pedido, { ahora });
  const api = new AppSheet({ ensayo: true });
  api.llamar = async function (tabla, action, rows, props) {
    this.enviado.push({ tabla, Action: action, Rows: rows, props });
    if (action === 'Find') return { Rows: [{ KEY: 'PE2009863a4589', PE: 'PE2009', 'NUMERO CONSECUTIVO': '2009' }] };
    return { Rows: rows };
  };
  const r = await registrarEnAppSheet(api, a);
  assert.equal(r.pe, 'PE2010');
  assert.equal(r.consecutivo, 2010);
  assert.match(r.key, /^PE2010[0-9a-f]{8}$/);
  assert.deepEqual(api.enviado.map((e) => [e.tabla, e.Action, e.Rows.length]), [
    ['PEDIDOS', 'Find', 0],
    ['CLIENTES', 'Add', 1],
    ['PEDIDOS', 'Add', 1],
    ['DETALLES PEDIDO', 'Add', 4],
    ['PEDIDOS', 'Generar PDF', 1],
  ]);
  const ped = api.enviado[2].Rows[0];
  assert.equal(ped.KEY, r.key);
  assert.equal(ped.PE, 'PE2010');
  assert.equal(ped['NUMERO CONSECUTIVO'], 2010);
  assert.ok(api.enviado[3].Rows.every((d) => d.PE === r.key));
  assert.deepEqual(api.enviado[4].Rows, [{ KEY: r.key }]);

  const texto = mensajeCreado(v.pedido, r);
  assert.match(texto, /✅ Pedido \*PE2010\* creado/);
  assert.match(mensajeConfirmar(v), /Reacciona con ✅/);
});

test('si no puede leer el consecutivo, no escribe nada', async () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO), cat, 'JULIAN RODRIGUEZ');
  const a = armar(v.pedido, { ahora });
  const api = new AppSheet({ ensayo: true });
  api.llamar = async function (tabla, action, rows) { this.enviado.push({ tabla, Action: action }); return { Rows: [] }; };
  await assert.rejects(registrarEnAppSheet(api, a), /último consecutivo/);
  assert.equal(api.enviado.filter((e) => e.Action === 'Add').length, 0);
});

test('esperarPdf: espera hasta que DOCUMENTO y ESTATUS=COMPLETADO, reintentando la acción una vez', async () => {
  const { esperarPdf } = await import('../src/appsheet.mjs');
  const api = new AppSheet({ ensayo: true });
  let consultas = 0;
  api.llamar = async function (tabla, action) {
    this.enviado.push(action);
    if (action === 'Find') { consultas++; return { Rows: consultas >= 3 ? [{ KEY: 'K', ESTATUS: 'COMPLETADO', DOCUMENTO: '/APP-1/PEDIDOS_PDFS/PE2010_X.pdf', NOTAS: '----' }] : [{ KEY: 'K', ESTATUS: '', DOCUMENTO: '' }] }; }
    if (action === 'Edit') return { Rows: [{ KEY: 'K', DOCUMENTO: 'https://www.appsheet.com/template/gettablefileurl?appName=APP-1&tableName=PEDIDOS&fileName=%2FAPP-1%2FPEDIDOS_PDFS%2FPE2010_X.pdf&signature=abc' }] };
    return { Rows: [] };
  };
  let reloj = 0;
  const dormir = async (ms) => { reloj += ms; };
  const realNow = Date.now; Date.now = () => realNow() + reloj;
  try {
    const r = await esperarPdf(api, 'K', { timeoutMs: 90_000, cadaMs: 20_000, reintentarA: 35_000, dormir });
    assert.equal(r.documento, '/APP-1/PEDIDOS_PDFS/PE2010_X.pdf');
    assert.match(r.url, /signature=abc$/);
    assert.equal(api.enviado.filter((a) => a === 'Generar PDF').length, 1);
    assert.equal(api.enviado.filter((a) => a === 'Edit').length, 1);
  } finally { Date.now = realNow; }
});
