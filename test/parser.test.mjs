import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerMensaje, leerItems } from '../src/parser.mjs';
import { MENSAJE_LIBRE, MENSAJE_FORMATO } from './simulado.mjs';

test('lee los 4 ítems de la cotización (dos líneas por ítem)', () => {
  const items = leerItems(MENSAJE_LIBRE);
  assert.deepEqual(items, [
    { ref: 'B01TG', cantidad: 25, precio: 1090 },
    { ref: 'B01T', cantidad: 25, precio: 1090 },
    { ref: 'B02T', cantidad: 25, precio: 1450 },
    { ref: 'B02P', cantidad: 25, precio: 1450 },
  ]);
});

test('lee ítems en una sola línea y sin precio', () => {
  assert.deepEqual(leerItems('* B04B — 100 und × $1.100\n- PFS300-P: 1 und'), [
    { ref: 'B04B', cantidad: 100, precio: 1100 },
    { ref: 'PFS300-P', cantidad: 1, precio: null },
  ]);
});

test('no confunde números de pedido con referencias', () => {
  assert.deepEqual(leerItems('Como el PE1979 — 25 und × $1.090'), []);
});

test('bloque libre: nombre, cédula con apóstrofe y puntos, dirección, celular', () => {
  const r = leerMensaje(MENSAJE_LIBRE);
  assert.equal(r.cliente.nombre, 'Maria Prueba Gomez');
  assert.equal(r.cliente.nit, '1234567890');
  assert.equal(r.cliente.celular, '3001234567');
  assert.match(r.cliente.direccion, /^Carrera 12 # 69-158/);
  assert.equal(r.cliente.ciudad, null);
  assert.equal(r.subtotalDeclarado, 127000);
  assert.equal(r.valorEnvio, null);
  assert.equal(r.pagoDelEnvio, null);
});

test('formato recomendado: todos los campos etiquetados', () => {
  const r = leerMensaje(MENSAJE_FORMATO);
  assert.equal(r.cliente.nombre, 'Maria Prueba Gomez');
  assert.equal(r.cliente.nit, '1234567890');
  assert.equal(r.cliente.celular, '3001234567');
  assert.equal(r.cliente.ciudad, 'Ibagué, Tolima');
  assert.equal(r.cliente.tipo, 'FINAL');
  assert.equal(r.cliente.canal, 'WhatsApp');
  assert.equal(r.cliente.clienteDe, 'ARQUI');
  assert.equal(r.pagoDelEnvio, 'Pago en bodega con cobro al cliente');
  assert.equal(r.valorEnvio, null);
  assert.equal(r.notasDespacho, 'Entregar en portería');
  assert.equal(r.items.length, 4);
});

test('celular con +57 y valor de envío con puntos', () => {
  const r = leerMensaje('Celular: +57 300 123 4567\nValor del envío: $18.500\nContraentrega: SI');
  assert.equal(r.cliente.celular, '3001234567');
  assert.equal(r.valorEnvio, 18500);
  assert.equal(r.pagoContraentrega, 'SI');
});

test('respuestas libres del asesor: minúsculas, "unidades", negrita de Slack, "x"', () => {
  assert.deepEqual(leerItems('b01b 25 und'), [{ ref: 'B01B', cantidad: 25, precio: null }]);
  assert.deepEqual(leerItems('B01B 25 unidades'), [{ ref: 'B01B', cantidad: 25, precio: null }]);
  assert.deepEqual(leerItems('• *B04B* — Bolsa · blanco\n  100 und × $1.100 = $110.000'), [{ ref: 'B04B', cantidad: 100, precio: 1100 }]);
  assert.deepEqual(leerItems('b02p x 50 bolsas'), [{ ref: 'B02P', cantidad: 50, precio: null }]);
  assert.deepEqual(leerItems('Carrera 28 # 12-60\nC.C 1066349068\nN 3246213328'), []);
});

test('cédula y celular con etiqueta pegada (C.C, N)', () => {
  const r = leerMensaje('Luis Angel López Rincon\nC.C 1066349068\nN 3246213328\nCarrera 28 # 12-60 Agustín codazzi, Con mucho gusto:\n• *B04B* — 100 und × $1.100');
  assert.equal(r.cliente.nombre, 'Luis Angel López Rincon');
  assert.equal(r.cliente.nit, '1066349068');
  assert.equal(r.cliente.celular, '3246213328');
  assert.match(r.cliente.direccion, /^Carrera 28/);
});
