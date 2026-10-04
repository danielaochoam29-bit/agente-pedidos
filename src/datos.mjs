/**
 * Carga el catálogo (PRODUCTOS, CLIENTES, MUNICIPIOS).
 *
 * Fuente preferida: la API de AppSheet (acción Find), que no necesita
 * credenciales de Google. Si hay cuenta de servicio de Google, se usa la hoja,
 * que es más rápida. Se guarda en memoria 2 minutos para no releer en cada
 * respuesta del hilo.
 */

import { Catalogo } from './catalogo.mjs';
import { TABLAS } from './config.mjs';
import { credenciales, leerTablas } from './google.mjs';

const CACHE_MS = 2 * 60 * 1000;
let cache = { en: 0, catalogo: null };

const COLUMNAS = {
  PRODUCTOS: ['KEY', 'ITEM NRO', 'FOTO', 'DESCRIPCION', 'EMPAQUE', 'PRECIO CLIENTE FINAL', 'PRECIO CLIENTE FINAL MAYOR 100 UND', 'PRECIO DISTRIBUIDOR', 'PRECIO MUESTRAS', 'INVENTARIO ACTUAL', 'COSTO PROMEDIO PONDERADO ACTUAL', 'CANTIDAD POR PAQUETE'],
  CLIENTES: ['CLIENTE ID', 'NOMBRE', 'MARCA', 'NIT', 'CONTACTO', 'TIPO CLIENTE', 'DIRECCION', 'DEPARTAMENTO', 'MUNICIPIO', 'CLIENTE DE', 'CANAL'],
  MUNICIPIOS: ['KEY', 'DEPARTAMENTO', 'MUNICIPIO'],
};

/** Filas-objeto de la API → [cabecera, ...filas], que es lo que entiende Catalogo. */
export function aTabla(filas, columnas) {
  return [columnas, ...filas.map((f) => columnas.map((c) => f[c] ?? ''))];
}

export async function cargarCatalogo(api, { forzar = false } = {}) {
  if (!forzar && cache.catalogo && Date.now() - cache.en < CACHE_MS) return cache.catalogo;
  let tablas;
  if (credenciales()) {
    tablas = await leerTablas();
  } else {
    const filas = (r) => {
      if (Array.isArray(r)) return r;
      if (Array.isArray(r?.Rows)) return r.Rows;
      throw new Error(`Respuesta inesperada de AppSheet Find: ${JSON.stringify(r).slice(0, 200)}`);
    };
    const [p, c, m] = await Promise.all([
      api.buscar(TABLAS.PRODUCTOS),
      api.buscar(TABLAS.CLIENTES),
      api.buscar(TABLAS.MUNICIPIOS),
    ]);
    tablas = {
      PRODUCTOS: aTabla(filas(p), COLUMNAS.PRODUCTOS),
      CLIENTES: aTabla(filas(c), COLUMNAS.CLIENTES),
      MUNICIPIOS: aTabla(filas(m), COLUMNAS.MUNICIPIOS),
    };
  }
  const n = (t) => (tablas[t]?.length ?? 1) - 1;
  if (n('PRODUCTOS') < 5 || n('MUNICIPIOS') < 5) {
    throw new Error(`El catálogo llegó incompleto: ${n('PRODUCTOS')} productos, ${n('CLIENTES')} clientes, ${n('MUNICIPIOS')} municipios. Reintenta en un momento.`);
  }
  const catalogo = new Catalogo(tablas);
  cache = { en: Date.now(), catalogo };
  return catalogo;
}

export function olvidarCache() {
  cache = { en: 0, catalogo: null };
}
