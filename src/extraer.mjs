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
        nombre: { type: ['string', 'null'], description: 'Nombre completo de la persona o empresa que compra' },
        marca: { type: ['string', 'null'], description: 'Marca o negocio del cliente, si la menciona' },
        nit: { type: ['string', 'null'], description: 'NIT o cédula, solo dígitos' },
        celular: { type: ['string', 'null'], description: 'Celular, solo dígitos' },
        direccion: { type: ['string', 'null'], description: 'Dirección de envío completa, tal como está escrita' },
        ciudad: { type: ['string', 'null'], description: 'Ciudad o municipio de envío y, si aparece, el departamento. Ej: "Ibagué, Tolima". null si no se menciona' },
        tipo: { type: ['string', 'null'], enum: ['FINAL', 'DISTRIBUIDOR', null] },
        canal: { type: ['string', 'null'], enum: ['WhatsApp', 'Instagram', 'Página Web', null] },
        clienteDe: { type: ['string', 'null'], enum: ['ARQUI', 'DANIELA', 'JULIAN', null] },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'cantidad', 'precio'],
        properties: {
          ref: { type: 'string', description: 'Código de la referencia, ej. B01TG' },
          cantidad: { type: 'number', description: 'Unidades (no paquetes)' },
          precio: { type: ['number', 'null'], description: 'Precio unitario en pesos, sin puntos' },
        },
      },
    },
    subtotalDeclarado: { type: ['number', 'null'] },
    pagoDelEnvio: {
      type: ['string', 'null'],
      enum: ['CONTRAENTREGA', 'PAGO EN BODEGA CON COBRO AL CLIENTE', 'PAGO EN BODEGA SIN COBRO AL CLIENTE', null],
      description: 'Quién paga el envío y cómo. null si el asesor no lo dice.',
    },
    valorEnvio: { type: ['number', 'null'], description: 'Valor del envío en pesos; null si está por confirmar' },
    pagoContraentrega: { type: ['string', 'null'], enum: ['SI', 'NO', null], description: 'SI solo si la MERCANCÍA se paga al recibir' },
    bodega: { type: ['string', 'null'], enum: ['BGA', 'SAN GIL', null] },
    descuento: { type: ['number', 'null'] },
    muestras: { type: ['string', 'null'], enum: ['SI', 'NO', null] },
    notasDespacho: { type: ['string', 'null'], description: 'Indicaciones para la entrega (horario, quién recibe, piso)' },
  },
};

const SISTEMA = `Eres el asistente que registra pedidos de AS Coffee Bags, una empresa colombiana que vende bolsas para café.
Un asesor comercial pega en Slack los datos del cliente y la cotización. Tu única tarea es leer ese texto y devolver el JSON con el esquema dado.
Reglas:
- Copia los datos tal como están; no inventes nada. Lo que no esté en el texto va en null.
- NIT/cédula y celular: solo dígitos. Un celular colombiano tiene 10 dígitos y empieza por 3.
- Las referencias son códigos como B01TG, B02P, B04MA. La cantidad es en unidades. "25 und × $1.090" = cantidad 25, precio 1090.
- "Valor del envío: por confirmar" → valorEnvio null.
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
  if (!r.items.length && Array.isArray(ia?.items)) {
    r.items = ia.items
      .filter((i) => i?.ref)
      .map((i) => ({ ref: String(i.ref).toUpperCase(), cantidad: numero(i.cantidad), precio: numero(i.precio) }));
  }
  for (const k of Object.keys(vacio().cliente)) {
    if (r.cliente[k] == null && ia?.cliente?.[k] != null) r.cliente[k] = ia.cliente[k];
  }
  r.cliente.nit = r.cliente.nit ? digitos(r.cliente.nit) : null;
  r.cliente.celular = r.cliente.celular ? celular(r.cliente.celular) : null;
  for (const k of ['subtotalDeclarado', 'pagoDelEnvio', 'valorEnvio', 'pagoContraentrega', 'bodega', 'descuento', 'muestras', 'notasDespacho']) {
    if (r[k] == null && ia?.[k] != null) r[k] = ia[k];
  }
  return r;
}
