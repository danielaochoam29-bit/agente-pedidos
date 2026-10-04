import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerMensaje } from '../src/parser.mjs';
import { validar, vendedorDe, precioDeLista } from '../src/validar.mjs';
import { catalogo, MENSAJE_LIBRE, MENSAJE_FORMATO } from './simulado.mjs';

const cat = catalogo();

test('mapa de asesores', () => {
  assert.equal(vendedorDe('JULIAN RODRIGUEZ'), 'JULIAN');
  assert.equal(vendedorDe('Arqui Sandoval'), 'ARQUI');
  assert.equal(vendedorDe('Daniela Ochoa'), 'DANIELA');
  assert.equal(vendedorDe('Alguien Desconocido'), null);
});

test('precio de lista según cantidad y tipo', () => {
  const p = cat.producto('B01T');
  assert.equal(precioDeLista(p, 25, 'FINAL').precio, 1090);
  assert.equal(precioDeLista(p, 100, 'FINAL').precio, 980);
  assert.equal(precioDeLista(p, 25, 'DISTRIBUIDOR').precio, 800);
});

test('mensaje libre de cliente nuevo: faltan ciudad, tipo, canal y cliente de', () => {
  const v = validar(leerMensaje(MENSAJE_LIBRE), cat, 'JULIAN RODRIGUEZ');
  assert.equal(v.estado, 'faltan');
  assert.deepEqual(v.errores, []);
  assert.ok(v.faltantes.some((f) => /Ciudad de envío/.test(f)));
  assert.ok(!v.faltantes.some((f) => /Tipo de cliente/.test(f))); // FINAL por defecto
  assert.equal(v.pedido.cliente.tipo, 'FINAL');
  assert.ok(v.faltantes.some((f) => /Canal/.test(f)));
  assert.ok(v.faltantes.some((f) => /Cliente de/.test(f)));
  assert.ok(v.faltantes.some((f) => /Pago del envío/.test(f)));
});

test('formato completo: ok, con los mismos totales que PE1979', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'ok', JSON.stringify(v));
  const p = v.pedido;
  assert.equal(p.vendedor, 'ARQUI');
  assert.equal(p.cliente.existente, null);
  assert.equal(p.cliente.nombre, 'MARIA PRUEBA GOMEZ');
  assert.equal(p.cliente.departamento, 'TOLIMA');
  assert.equal(p.cliente.municipio, '73001');
  assert.equal(p.cliente.tipo, 'FINAL');
  assert.equal(p.subtotal, 127000);
  assert.equal(p.total, 127000);
  assert.equal(p.valorEnvio, 0);
  assert.equal(p.valorFinal, 127000);
  assert.equal(p.unidades, 100);
  assert.equal(p.pagoDelEnvio, 'PAGO EN BODEGA CON COBRO AL CLIENTE');
  assert.equal(p.pagoContraentrega, 'NO');
  assert.equal(p.bodega, 'BGA');
  assert.equal(p.notasDespacho, 'Entregar en portería');
  assert.deepEqual(p.items.map((i) => [i.ref, i.cantidad, i.precio, i.subtotal]), [
    ['B01TG', 25, 1090, 27250], ['B01T', 25, 1090, 27250], ['B02T', 25, 1450, 36250], ['B02P', 25, 1450, 36250],
  ]);
  assert.equal(p.items[0].costo, 0);
  assert.equal(p.items[1].costo, 513.83);
  assert.equal(p.items[1].empaque, 'PAQUETE X 25 UNIDADES');
});

test('cliente existente por NIT: toma ciudad, tipo, canal y cliente de de su ficha', () => {
  const msg = 'Cliente: Cafe de Prueba\nNIT: 900.000.001\nCelular: 3009999999\nDirección: Calle nueva 5 # 6-7\nPago del envío: contraentrega\n* B04B — 25 und × $1.220';
  const v = validar(leerMensaje(msg), cat, 'daniela ochoa');
  assert.equal(v.estado, 'ok', JSON.stringify(v));
  assert.equal(v.pedido.cliente.existente.id, 'aa11bb22');
  assert.equal(v.pedido.cliente.nombre, 'CAFE DE PRUEBA SAS');
  assert.equal(v.pedido.cliente.direccion, 'Calle nueva 5 # 6-7'); // la del mensaje
  assert.equal(v.pedido.cliente.celular, '3009999999'); // la del mensaje
  assert.equal(v.pedido.cliente.municipio, '68001');
  assert.equal(v.pedido.cliente.departamento, 'SANTANDER');
  assert.equal(v.pedido.cliente.clienteDe, 'ARQUI');
  assert.ok(v.avisos.some((a) => /Ciudad tomada de la ficha/.test(a)));
});

test('distribuidor existente: el precio de lista es el de distribuidor', () => {
  const ok = validar(leerMensaje('NIT: 900000002\nDirección: x 1\nEnvío contraentrega\n* B01T — 25 und × $800'), cat, 'JULIAN RODRIGUEZ');
  assert.equal(ok.estado, 'ok', JSON.stringify(ok));
  const mal = validar(leerMensaje('NIT: 900000002\nDirección: x 1\nEnvío contraentrega\n* B01T — 25 und × $1.090'), cat, 'JULIAN RODRIGUEZ');
  assert.equal(mal.estado, 'error');
  assert.match(mal.errores[0], /distribuidor es \$800/);
});

test('precio fuera de lista: error, no se crea', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO.replace('B01T — 25 und × $1.090', 'B01T — 25 und × $1.000')), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'error');
  assert.match(v.errores[0], /B01T × 25: el mensaje dice \$1\.000 pero el precio de cliente final es \$1\.090/);
});

test('150 unidades deben ir a precio mayor a 100', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO.replace('B01T — 25 und × $1.090', 'B01T — 150 und × $1.090')), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'error');
  assert.match(v.errores[0], /100 und o más\) es \$980/);
});

test('referencia inexistente y subtotal que no cuadra', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO.replace('B02P', 'B02Z')), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'error');
  assert.match(v.errores[0], /B02Z\* no existe/);
  const s = validar(leerMensaje(MENSAJE_FORMATO + '\nSubtotal: $100.000'), cat, 'Arqui Sandoval');
  assert.equal(s.estado, 'ok');
  assert.match(s.avisos.join(' '), /subtotal del mensaje decía \$100\.000; .* \$127\.000/);
});

test('referencia sin precio de lista', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO + '\n  * B09X — 25 und'), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'error');
  assert.match(v.errores[0], /B09X no tiene precio/);
});

test('ciudad ambigua y ciudad desconocida', () => {
  const amb = validar(leerMensaje(MENSAJE_FORMATO.replace('Ibagué, Tolima', 'Armenia')), cat, 'Arqui Sandoval');
  assert.equal(amb.estado, 'faltan');
  assert.match(amb.faltantes[0], /Armenia.*ANTIOQUIA, QUINDÍO/);
  const q = validar(leerMensaje(MENSAJE_FORMATO.replace('Ibagué, Tolima', 'Armenia, Quindío')), cat, 'Arqui Sandoval');
  assert.equal(q.pedido.cliente.municipio, '63001');
  const no = validar(leerMensaje(MENSAJE_FORMATO.replace('Ibagué, Tolima', 'Narnia')), cat, 'Arqui Sandoval');
  assert.match(no.faltantes[0], /No encontré el municipio/);
});

test('celular repetido en dos clientes: pide el ID', () => {
  const v = validar(leerMensaje('Cliente: Pedro\nCelular: 3000000003\nDirección: Av 3 # 1-1\n* B01T — 25 und × $1.090'), cat, 'JULIAN RODRIGUEZ');
  assert.equal(v.estado, 'faltan');
  assert.match(v.faltantes[0], /varios clientes con ese celular.*ee55ff66.*ee55ff67/);
});

test('remitente desconocido: error', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO), cat, 'Visitante');
  assert.equal(v.estado, 'error');
  assert.match(v.errores[0], /No sé quién es/);
});

test('contraentrega, San Gil, descuento y mercancía contraentrega', () => {
  const msg = MENSAJE_FORMATO.replace('Pago del envío: Pago en bodega con cobro al cliente', 'Pago del envío: contraentrega')
    + '\nBodega: San Gil\nDescuento: 7000\nPago contraentrega: SI';
  const v = validar(leerMensaje(msg), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'ok', JSON.stringify(v));
  assert.equal(v.pedido.pagoDelEnvio, 'CONTRAENTREGA');
  assert.equal(v.pedido.bodega, 'SAN GIL');
  assert.equal(v.pedido.descuento, 7000);
  assert.equal(v.pedido.total, 120000);
  assert.equal(v.pedido.pagoContraentrega, 'SI');
});

test('cantidad que no es múltiplo del paquete: pregunta, y la corrección en el hilo manda', () => {
  const msg = MENSAJE_FORMATO.replace('B01T — 25 und × $1.090', 'B01T — 20 und × $1.090');
  const v = validar(leerMensaje(msg), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'faltan');
  assert.match(v.faltantes[0], /B01T se vende en paquetes de 25 y pediste 20.*"B01T 25 und"/);
  assert.equal(v.pedido.items.length, 4); // el ítem sigue contando (subtotal) mientras se corrige
  const v2 = validar(leerMensaje(msg + '\nb01t 25 unidades'), cat, 'Arqui Sandoval');
  assert.equal(v2.estado, 'ok', JSON.stringify(v2));
  assert.equal(v2.pedido.items.find((i) => i.ref === 'B01T').cantidad, 25);
  assert.equal(v2.pedido.items.length, 4);
});

test('cliente nuevo sin tipo es FINAL; "distribuidor" en el texto lo cambia', () => {
  const sinTipo = MENSAJE_FORMATO.replace('* Tipo de cliente: FINAL\n', '');
  const a = validar(leerMensaje(sinTipo), cat, 'Arqui Sandoval');
  assert.equal(a.estado, 'ok', JSON.stringify(a));
  assert.equal(a.pedido.cliente.tipo, 'FINAL');
  const b = validar(leerMensaje(sinTipo.replace('* Canal: WhatsApp', '* Tipo de cliente: es distribuidor\n* Canal: WhatsApp').replace(/× \$1\.090/g, '× $800').replace(/× \$1\.450/g, '× $1.070')), cat, 'Arqui Sandoval');
  assert.equal(b.estado, 'ok', JSON.stringify(b));
  assert.equal(b.pedido.cliente.tipo, 'DISTRIBUIDOR');
});

test('sin precio en el mensaje: usa el de lista sin avisos de precio', () => {
  const v = validar(leerMensaje(MENSAJE_FORMATO.replace(/ × \$[\d.]+/g, '')), cat, 'Arqui Sandoval');
  assert.equal(v.estado, 'ok', JSON.stringify(v));
  assert.equal(v.pedido.subtotal, 127000);
  assert.ok(!v.avisos.some((a) => /precio/.test(a)));
});

test('canal Página Web: cliente de es DANIELA aunque el asesor diga otra cosa', () => {
  const msg = MENSAJE_FORMATO.replace('* Canal: WhatsApp', '* Canal: pagina web');
  const v = validar(leerMensaje(msg), cat, 'Arqui Sandoval'); // dice "Cliente de: ARQUI"
  assert.equal(v.estado, 'ok', JSON.stringify(v));
  assert.equal(v.pedido.cliente.canal, 'Página Web');
  assert.equal(v.pedido.cliente.clienteDe, 'DANIELA');
  assert.ok(v.avisos.some((a) => /queda en DANIELA/.test(a)));
  const sin = validar(leerMensaje(msg.replace('* Cliente de: ARQUI\n', '')), cat, 'Arqui Sandoval');
  assert.equal(sin.estado, 'ok', JSON.stringify(sin));
  assert.equal(sin.pedido.cliente.clienteDe, 'DANIELA');
});
