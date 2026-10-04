import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiosPedido } from '../src/cambios.mjs';

const pedido = {
  vendedor: 'DANIELA', unidades: 225, subtotal: 290500, descuento: 0, total: 290500, valorEnvio: 18500, valorFinal: 309000,
  pagoDelEnvio: 'PAGO EN BODEGA CON COBRO AL CLIENTE', pagoContraentrega: 'NO', bodega: 'BGA', muestras: 'NO', notas: '----', notasDespacho: 'N/A',
  cliente: { nombre: 'PEPE PRUEBA', direccion: 'Carrera 108 #42-34', departamento: 'VALLE DEL CAUCA', municipio: '76001', municipioNombre: 'SANTIAGO DE CALI', celular: '3102858713' },
  items: [{ ref: 'B02T', cantidad: 200, precio: 1300, subtotal: 260000 }, { ref: 'B04N', cantidad: 25, precio: 1220, subtotal: 30500 }],
};
const fila = { CLIENTE: 'PEPE PRUEBA', 'DIRECCIÓN DE ENVÍO': 'Carrera 108 #42-34', DEPARTAMENTO: 'VALLE DEL CAUCA', MUNICIPIO: '76001', CELULAR: '3102858713', 'VALOR DEL ENVÍO': '0', 'PAGO DEL ENVÍO': 'CONTRAENTREGA', 'PAGO CONTRAENTREGA': 'NO', BODEGA: 'BGA', MUESTRAS: 'NO', DESCUENTO: '0', NOTAS: '----', 'NOTAS DESPACHO': 'N/A', 'SUBTOTAL PEDIDO': '290500' };
const detalles = [{ 'ITEM NRO': 'B02T', CANTIDAD: '200', 'PRECIO DE VENTA UND': '1300' }, { 'ITEM NRO': 'B04N', CANTIDAD: '25', 'PRECIO DE VENTA UND': '1220' }];

test('solo lista lo que cambia: envío y pago del envío', () => {
  assert.deepEqual(cambiosPedido(fila, detalles, pedido), [
    '*Envío:* $0 → $18.500',
    '*Pago del envío:* CONTRAENTREGA → PAGO EN BODEGA CON COBRO AL CLIENTE',
  ]);
});

test('sin cambios → lista vacía; cambio de cantidad en un ítem', () => {
  assert.deepEqual(cambiosPedido({ ...fila, 'VALOR DEL ENVÍO': '18500', 'PAGO DEL ENVÍO': 'PAGO EN BODEGA CON COBRO AL CLIENTE' }, detalles, pedido), []);
  const p2 = { ...pedido, items: [{ ref: 'B02T', cantidad: 150, precio: 1300, subtotal: 195000 }], subtotal: 195000, unidades: 150 };
  assert.deepEqual(cambiosPedido({ ...fila, 'VALOR DEL ENVÍO': '18500', 'PAGO DEL ENVÍO': 'PAGO EN BODEGA CON COBRO AL CLIENTE' }, detalles, p2), [
    '• *B02T* — 200 und × $1.300 → 150 und × $1.300 = $195.000',
    '• *B04N* — se quita',
    '*Subtotal:* $290.500 → $195.000 · *150 und*',
  ]);
});
