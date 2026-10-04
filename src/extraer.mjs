/**
 * Convierte el mensaje del asesor en el JSON del pedido.
 *
 * Primero las reglas (src/parser.mjs): gratis, instantáneas y exactas para
 * los productos y los campos etiquetados. Si tras las reglas falta algo
 * importante y hay clave de Claude, se le pide a Claude que lea el mensaje
 * completo con un esquema JSON estricto, y se combinan: los productos que
 * leyeron las reglas mandan (nunca dejamos que la IA invente cantidades o
 * precios); para lo demás, la IA sólo rellena lo que las reglas dejaron en null.
 */

import Anthropic from '@anthropic-ai/sdk';
import { leerMensaje, vacio } from './parser.mjs';
import { digitos, celular, numero } from './texto.mjs';

const MODELO = 'claude-opus-5-5';

/**
 * Esquema sin uniones de tipos (la API limita los campos "nullable"): todo es
 * texto, y "" significa "no aparece en el mensaje". Los números se escriben
 * como texto sin puntos ("1090") y se convierten después.
 */
const S = (description) => (description ? { type: 'string', description } : { type: 'string' });
const E = (valores, description) => ({ type: 'string', enum: ['', ...valores], description });
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cliente', 'items', 'subtotalDeclarado', 'pagoDelEnvio', 'valorEnvio', 'pagoContraentrega', 'bodega', 'descuento', 'muestras', 'notasDespacho'],
  properties: {
    cliente: {
      type: 'object',
      additionalProperties: false,
      required: ['nombre', 'marca', 'nit', 'celular', 'direccion', 'ciudad', 'tipo', 'canal', 'clienteDe'],
      properties: {
        nombre: S('Nombre completo de la persona o empresa que compra'),
        marca: S('Marca o negocio del cliente, si la menciona'),
        nit: S('NIT o cédula, solo dígitos'),
        celular: S('Celular, solo dígitos'),
        direccion: S('Dirección de envío completa, tal como está escrita'),
        ciudad: S('Ciudad o municipio de envío y, si aparece, el departamento. Ej: "Ibagué, Tolima"'),
        tipo: E(['FINAL', 'DISTRIBUIDOR']),
        canal: E(['WhatsApp', 'Instagram', 'Página Web']),
        clienteDe: E(['ARQUI', 'DANIELA', 'JULIAN']),
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'cantidad', 'precio'],
        properties: {
          ref: S('Código de la referencia, ej. B01TG'),
          cantidad: S('Unidades (no paquetes), solo dígitos'),
          precio: S('Precio unitario en pesos sin puntos, ej. "1090"; "" si no aparece'),
        },
      },
    },
    subtotalDeclarado: S('Subtotal que dice el mensaje, solo dígitos'),
    pagoDelEnvio: E(['CONTRAENTREGA', 'PAGO EN BODEGA CON COBRO AL CLIENTE', 'PAGO EN BODEGA SIN COBRO AL CLIENTE'], 'Quién paga el envío y cómo. "" si el asesor no lo dice.'),
    valorEnvio: S('Valor del envío en pesos sin puntos; "" si está por confirmar'),
    pagoContraentrega: E(['SI', 'NO'], 'SI solo si la MERCANCÍA se paga al recibir'),
    bodega: E(['BGA', 'SAN GIL']),
    descuento: S('Descuento en pesos, solo dígitos'),
    muestras: E(['SI', 'NO']),
    notasDespacho: S('Indicaciones para la entrega (horario, quién recibe, piso)'),
  },
};

const SISTEMA = `Eres el asistente que registra pedidos de AS Coffee Bags, una empresa colombiana que vende bolsas para café.
Un asesor comercial pega en Slack los datos del cliente y la cotización. Tu única tarea es leer ese texto y devolver el JSON con el esquema dado.
Reglas:
- Copia los datos tal como están; no inventes nada. Lo que no esté en el texto va como "" (texto vacío).
- NIT/cédula y celular: solo dígitos. Un celular colombiano tiene 10 dígitos y empieza por 3.
- Las referencias son códigos como B01TG, B02P, B04MA. La cantidad es en unidades. "25 und × $1.090" = cantidad 25, precio 1090.
- Si habla de paquetes sin decir cuántas unidades son, deja cantidad "" (el bot preguntará).
- tipo: "DISTRIBUIDOR" solo si el texto lo dice; si no lo menciona, "" (el bot asume FINAL).
- "Valor del envío: por confirmar" → valorEnvio "".
- pagoContraentrega es SI únicamente si dice que la mercancía (no el envío) se paga al recibir.
- Si menciona "contraentrega" refiriéndose al envío, pagoDelEnvio = CONTRAENTREGA.`;

/** Si tras las reglas falta alguno de estos campos, vale la pena pedirle a la IA que lea el texto. */
const IMPORTANTES = ['nombre', 'nit', 'celular', 'direccion', 'ciudad', 'tipo', 'canal', 'clienteDe'];

function faltaAlgo(r) {
  return !r.items.length || IMPORTANTES.some((k) => !r.cliente[k]) || !r.pagoDelEnvio;
}

/**
 * @param {string} texto  mensaje del asesor
 * @param {object} [opts]  { usarIA: boolean, cliente: Anthropic }  (para pruebas)
 * @returns {Promise<{ pedido: object, fuente: 'reglas'|'reglas+ia', ia: object|null }>}
 */
export async function extraer(texto, opts = {}) {
  const reglas = leerMensaje(texto);
  const usarIA = opts.usarIA ?? Boolean(process.env.ANTHROPIC_API_KEY);
  if (!usarIA || !faltaAlgo(reglas)) return { pedido: reglas, fuente: 'reglas', ia: null };

  const ia = await extraerConIA(texto, opts.cliente);
  return { pedido: combinar(reglas, ia), fuente: 'reglas+ia', ia };
}

/** Cliente de Claude. Una clave de usuario (sk-ant-usr-…) exige el ID del workspace; una de workspace (sk-ant-api…) no. */
export function clienteClaude(env = process.env) {
  const ws = env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(ws ? { defaultHeaders: { 'anthropic-workspace-id': ws } } : {});
}

export async function extraerConIA(texto, cliente = clienteClaude()) {
  const res = await cliente.messages.create({
    model: MODELO,
    max_tokens: 4096,
    system: SISTEMA,
    messages: [{ role: 'user', content: `Mensaje del asesor:\n\n${texto}` }],
    output_config: { format: { type: 'json_schema', schema: ESQUEMA }, effort: 'low' },
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude no procesó el mensaje (refusal).');
  const bloque = res.content.find((b) => b.type === 'text');
  if (!bloque) throw new Error('Claude no devolvió texto.');
  return JSON.parse(bloque.text);
}

/** Reglas mandan en productos; la IA rellena los null del resto. */
export function combinar(reglas, ia) {
  const r = structuredClone(reglas);
  const val = (v) => (v == null || String(v).trim() === '' ? null : v);
  if (!r.items.length && Array.isArray(ia?.items)) {
    r.items = ia.items
      .filter((i) => val(i?.ref))
      .map((i) => ({ ref: String(i.ref).toUpperCase().trim(), cantidad: numero(i.cantidad), precio: val(i.precio) == null ? null : numero(i.precio) }));
  }
  for (const k of Object.keys(vacio().cliente)) {
    if (r.cliente[k] == null && val(ia?.cliente?.[k]) != null) r.cliente[k] = String(ia.cliente[k]).trim();
  }
  r.cliente.nit = r.cliente.nit ? digitos(r.cliente.nit) : null;
  r.cliente.celular = r.cliente.celular ? celular(r.cliente.celular) : null;
  const numericos = new Set(['subtotalDeclarado', 'valorEnvio', 'descuento']);
  for (const k of ['subtotalDeclarado', 'pagoDelEnvio', 'valorEnvio', 'pagoContraentrega', 'bodega', 'descuento', 'muestras', 'notasDespacho']) {
    if (r[k] == null && val(ia?.[k]) != null) r[k] = numericos.has(k) ? numero(ia[k]) : String(ia[k]).trim();
  }
  return r;
}
