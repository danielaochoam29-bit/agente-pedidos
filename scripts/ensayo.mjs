#!/usr/bin/env node
/**
 * Ensayo en seco: lee un mensaje, lo valida y muestra las filas que se crearían.
 * NUNCA escribe en AppSheet ni en la hoja.
 *
 *   npm run ensayo -- mensaje.txt "JULIAN RODRIGUEZ"            # catálogo simulado
 *   npm run ensayo -- mensaje.txt "JULIAN RODRIGUEZ" --hoja     # lee PRODUCTOS/CLIENTES/MUNICIPIOS reales
 *   npm run ensayo -- mensaje.txt "JULIAN RODRIGUEZ" --ia       # además usa Claude si faltan datos
 *
 * Variables (.env): HOJA_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, ANTHROPIC_API_KEY.
 */

import { readFileSync, existsSync } from 'node:fs';
import { extraer } from '../src/extraer.mjs';
import { validar } from '../src/validar.mjs';
import { armar } from '../src/armar.mjs';
import { Catalogo } from '../src/catalogo.mjs';
import { mensajeConfirmar, mensajeFaltan, mensajeError } from '../src/mensajes.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [archivo, remitente = 'JULIAN RODRIGUEZ'] = args.filter((a) => !a.startsWith('--'));
if (!archivo) {
  console.error('Uso: npm run ensayo -- <mensaje.txt> "<nombre en Slack>" [--hoja] [--ia]');
  process.exit(1);
}
const texto = readFileSync(archivo, 'utf8');

let catalogo;
if (flags.has('--hoja')) {
  const { leerTablas } = await import('../src/google.mjs');
  const tablas = await leerTablas();
  catalogo = new Catalogo(tablas);
  console.log(`Catálogo real: ${catalogo.productos.size} productos, ${catalogo.clientes.length} clientes, ${catalogo.municipios.length} municipios\n`);
} else {
  const sim = await import('../test/simulado.mjs');
  catalogo = sim.catalogo();
  console.log('Catálogo SIMULADO (usa --hoja para el real)\n');
}

const { pedido: extraido, fuente } = await extraer(texto, { usarIA: flags.has('--ia') });
console.log(`— Extraído (${fuente}):`);
console.log(JSON.stringify(extraido, null, 2));

const v = validar(extraido, catalogo, remitente);
console.log(`\n— Estado: ${v.estado.toUpperCase()}`);
if (v.estado === 'faltan') console.log('\n' + mensajeFaltan(v));
if (v.estado === 'error') console.log('\n' + mensajeError(v));
if (v.estado === 'ok') {
  console.log('\n— Mensaje de confirmación en Slack:\n' + mensajeConfirmar(v));
  const a = armar(v.pedido);
  console.log('\n— Filas que se enviarían a AppSheet:');
  console.log(JSON.stringify(a, null, 2));
}
