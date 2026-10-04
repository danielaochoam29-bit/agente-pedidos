/**
 * El catálogo en memoria: PRODUCTOS, CLIENTES y MUNICIPIOS, leídos de la hoja
 * (o de un simulado en las pruebas). Las columnas se buscan por nombre.
 */

import { normalizar, digitos, celular } from './texto.mjs';

/** Convierte [cabecera, ...filas] en objetos {COLUMNA: valor}. */
export function aObjetos(tabla) {
  if (!tabla?.length) return [];
  const cab = tabla[0].map((c) => String(c ?? '').trim());
  return tabla.slice(1)
    .filter((f) => f.some((v) => String(v ?? '').trim()))
    .map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i] ?? ''])));
}

export class Catalogo {
  /**
   * @param {object} tablas  { PRODUCTOS: [[...]], CLIENTES: [[...]], MUNICIPIOS: [[...]] }
   */
  constructor(tablas) {
    this.productos = new Map();
    for (const p of aObjetos(tablas.PRODUCTOS)) {
      const code = String(p['ITEM NRO'] ?? '').trim().toUpperCase();
      if (code) this.productos.set(code, p);
    }
    this.clientes = aObjetos(tablas.CLIENTES).map((c) => ({
      ...c,
      _nit: digitos(c.NIT),
      _celular: celular(c.CONTACTO),
      _nombre: normalizar(c.NOMBRE),
    }));
    this.municipios = aObjetos(tablas.MUNICIPIOS)
      .filter((m) => m.KEY && m.MUNICIPIO)
      .map((m) => ({
        codigo: String(m.KEY).trim(),
        departamento: String(m.DEPARTAMENTO).trim(),
        municipio: String(m.MUNICIPIO).trim(),
        _m: normalizar(m.MUNICIPIO),
        _d: normalizar(m.DEPARTAMENTO),
      }));
  }

  producto(ref) {
    return this.productos.get(String(ref ?? '').trim().toUpperCase()) ?? null;
  }

  /** Busca por NIT; si no, por celular. Devuelve { cliente, por } o { candidatos } si hay varios. */
  buscarCliente({ nit, celular: cel }) {
    const n = digitos(nit);
    const c = celular(cel);
    const vacios = new Set(['', '0', '00', '000', '0000', '000000', '123456789']);
    if (n && !vacios.has(n)) {
      const porNit = this.clientes.filter((x) => x._nit === n);
      if (porNit.length === 1) return { cliente: porNit[0], por: 'NIT' };
      if (porNit.length > 1) return { candidatos: porNit, por: 'NIT' };
    }
    if (c && !vacios.has(c)) {
      const porCel = this.clientes.filter((x) => x._celular === c);
      if (porCel.length === 1) return { cliente: porCel[0], por: 'celular' };
      if (porCel.length > 1) return { candidatos: porCel, por: 'celular' };
    }
    return { cliente: null };
  }

  /**
   * "Ibagué" / "Ibagué, Tolima" / "73001" → { codigo, municipio, departamento }.
   * Si hay varios municipios con ese nombre y no se dijo el departamento, devuelve { candidatos }.
   */
  municipio(texto) {
    const t = normalizar(texto);
    if (!t) return null;
    if (/^\d{4,5}$/.test(t)) {
      const m = this.municipios.find((x) => x.codigo === t);
      return m ? { ...m } : null;
    }
    const partes = t.split(/\s*[,\-/]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const nombre = partes[0];
    let depto = partes.slice(1).join(' ') || null;
    let cands = this.municipios.filter((x) => x._m === nombre);
    if (!cands.length) {
      // "ibague tolima" sin coma: probar quitando palabras del final como departamento
      const palabras = t.split(' ');
      for (let k = palabras.length - 1; k >= 1 && !cands.length; k--) {
        const nom = palabras.slice(0, k).join(' ');
        const dep = palabras.slice(k).join(' ');
        cands = this.municipios.filter((x) => x._m === nom && (x._d === dep || x._d.includes(dep)));
        if (cands.length) depto = dep;
      }
    }
    if (!cands.length) {
      // Bogotá se escribe de muchas formas
      if (/^bogota/.test(t)) cands = this.municipios.filter((x) => x._m.startsWith('bogota'));
    }
    if (!cands.length) {
      // "Cali" → "SANTIAGO DE CALI"; "Cartagena" → "CARTAGENA DE INDIAS": el nombre como palabra completa
      const re = new RegExp(`(^| )${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
      cands = this.municipios.filter((x) => re.test(x._m));
    }
    if (depto) {
      const d = normalizar(depto);
      const filtradas = cands.filter((x) => x._d === d || x._d.includes(d) || d.includes(x._d));
      if (filtradas.length) cands = filtradas;
    }
    if (cands.length === 1) return { ...cands[0] };
    if (cands.length > 1) return { candidatos: cands.map((x) => ({ ...x })) };
    return null;
  }
}
