/**
 * Reglas de negocio fijas del agente. Vienen de PLAN.md §11.
 * Si una regla cambia, se cambia aquí y en ningún otro sitio.
 */

/** Persona en Slack → VENDEDOR / USUARIO. Se compara sin tildes ni mayúsculas. */
export const VENDEDORES = {
  'julian rodriguez': 'JULIAN',
  'arqui sandoval': 'ARQUI',
  'daniela ochoa': 'DANIELA',
};

export const VALORES = {
  TIPO_CLIENTE: ['FINAL', 'DISTRIBUIDOR'],
  CANAL: ['WhatsApp', 'Instagram', 'Página Web'],
  CLIENTE_DE: ['ARQUI', 'DANIELA', 'JULIAN'],
  PAGO_DEL_ENVIO: [
    'CONTRAENTREGA',
    'PAGO EN BODEGA CON COBRO AL CLIENTE',
    'PAGO EN BODEGA SIN COBRO AL CLIENTE',
  ],
  BODEGA: ['BGA', 'SAN GIL'],
};

export const DEFAULTS = {
  ESTADO_PEDIDO: 'EN CONSTRUCCIÓN',
  ESTADO_PAGO: 'PENDIENTE',
  BODEGA: 'BGA',
  MUESTRAS: 'NO',
  PAGO_CONTRAENTREGA: 'NO',
  DESCUENTO: 0,
  RETENCION: 0,
  VALOR_ENVIO: 0,
  NOTAS: '----',
  NOTAS_DESPACHO: 'N/A',
};

/** A partir de cuántas unidades de una referencia aplica el precio "mayor a 100". */
export const VOLUMEN_DESDE = 100;

/** Nombre exacto de la acción de AppSheet que genera el PDF (tabla PEDIDOS). */
export const ACCION_PDF = 'Generar PDF';

/** Nombres exactos de las tablas en AppSheet y pestañas en la hoja. */
export const TABLAS = {
  PRODUCTOS: 'PRODUCTOS',
  CLIENTES: 'CLIENTES',
  PEDIDOS: 'PEDIDOS',
  DETALLES: 'DETALLES PEDIDO',
  MUNICIPIOS: 'MUNICIPIOS',
};

/** Rangos que se leen de la hoja (igual que la página web: hasta la última columna conocida). */
export const RANGOS = {
  PRODUCTOS: 'PRODUCTOS!A1:S',
  CLIENTES: 'CLIENTES!A1:Q',
  MUNICIPIOS: 'MUNICIPIOS!A1:C',
};
