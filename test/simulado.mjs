/**
 * Catálogo simulado para las pruebas. Ninguna llamada real sale de aquí.
 * Los productos son filas reales del catálogo (es público en la página web).
 * Los clientes son FICTICIOS: este repositorio es público.
 */

import { Catalogo } from '../src/catalogo.mjs';

export const PRODUCTOS_CAB = ['KEY','ITEM NRO','FOTO','DESCRIPCION','EMPAQUE','PRECIO CLIENTE FINAL',
  'PRECIO CLIENTE FINAL MAYOR 100 UND','PRECIO DISTRIBUIDOR','PRECIO MUESTRAS','BODEGA','DOCUMENTO',
  'ESTATUS','INVENTARIO ACTUAL','INVENTARIO SG','INVENTARIO BGA','COSTO PROMEDIO PONDERADO ACTUAL',
  'CANTIDAD POR PAQUETE','STOCK FISICO BGA','STOCK FISICO SAN GIL'];

export const PRODUCTOS = [PRODUCTOS_CAB,
  ['ca4e32ac','B01T','PRODUCTOS_Images/B01T.FOTO.210615.png','BOLSA CON VALVULA Y ZIPPER\nMEDIDA: 15,5 X 16,5 + 8 CM 250 G\nCOLOR: TRANSPARENTE','PAQUETE X 25 UNIDADES',1090,980,800,3300,'','','FINALIZADO',18299,0,18299,513.83,25,20005,0],
  ['827bedee','B01TG','PRODUCTOS_Images/B01TG.FOTO.193130.png','BOLSA CON VALVULA Y ZIPPER MEDIDA: 15,5 X 16,5 + 8 CM 250 G COLOR:  GRIS TRANSLUCIDO','PAQUETE X 25 UNIDADES',1090,980,800,3300,'','','SIN DOC',16743,0,16743,0,'',17869,0],
  ['460cab8c','B02T','PRODUCTOS_Images/B02T.FOTO.210743.png','BOLSA CON VALVULA Y ZIPPER MEDIDA: 19,5 X 20,5 + 8 CM 500 G COLOR: TRANSPARENTE','PAQUETE X 25 UNIDADES',1450,1300,1070,4400,'','','FINALIZADO',7289,0,7371,678.31,25,7796,0],
  ['41af3600','B02P','PRODUCTOS_Images/B02P.FOTO.210649.png','BOLSA CON VALVULA Y ZIPPER\nMEDIDA: 19,5 X 20,5 + 8 CM 500 G\nCOLOR: PAPEL','PAQUETE X 25 UNIDADES',1450,1300,1070,4400,'','','FINALIZADO',1522,0,1595,738.21,25,2670,0],
  ['b1b8c777','B04B','PRODUCTOS_Images/B04B.FOTO.210915.png','BOLSA CON VALVULA Y ZIPPER\nMEDIDA: 13,5 X 26 + 7,5 CM 500 G\nCOLOR: BLANCO','PAQUETE X 25 UNIDADES',1220,1100,890,3700,'','','',79991,0,79991,575.04,25,80266,0],
  ['ce416bc7','PFS300-P','PRODUCTOS_Images/PFS300-P.FOTO.174258.png','SELLADORA MANUAL 30CM DE PLASTICO','UNIDAD',100000,100000,90000,100000,'','','SIN DOC',7,0,7,'','',9,0],
  ['00000001','B09X','','REFERENCIA SIN PRECIO','PAQUETE X 25 UNIDADES',0,0,0,0,'','','',10,0,10,'',25,10,0],
];

export const CLIENTES_CAB = ['CLIENTE ID','NOMBRE','MARCA','NIT','CONTACTO','TIPO CLIENTE','DIRECCION',
  'DEPARTAMENTO','MUNICIPIO','CLIENTE DE','ESTATUS','DOCUMENTO','FECHA PDF','MES SELECCIONADO',
  'AÑO SELECCIONADO','CANAL','CAMPAÑA'];

export const CLIENTES = [CLIENTES_CAB,
  ['aa11bb22','CAFE DE PRUEBA SAS','Prueba','900000001','3000000001','FINAL','Calle 1 # 2-3','SANTANDER','68001','ARQUI','','','01/09/2026 10:00:00','','','WhatsApp',''],
  ['cc33dd44','DISTRIBUIDORA FICTICIA','','900000002','3000000002','DISTRIBUIDOR','Cra 9 # 9-99','BOGOTÁ, D.C.','11001','DANIELA','','','01/09/2026 10:00:00','','','Venta Directa',''],
  // Dos clientes con el mismo celular, para probar la ambigüedad
  ['ee55ff66','PEDRO DUPLICADO','','1000000003','3000000003','FINAL','Av 3','ANTIOQUIA','5001','JULIAN','','','','','','WhatsApp',''],
  ['ee55ff67','PEDRO DUPLICADO DOS','','1000000004','3000000003','FINAL','Av 4','ANTIOQUIA','5001','JULIAN','','','','','','WhatsApp',''],
];

export const MUNICIPIOS = [['KEY','DEPARTAMENTO','MUNICIPIO'],
  ['73001','TOLIMA','IBAGUÉ'],
  ['68001','SANTANDER','BUCARAMANGA'],
  ['11001','BOGOTÁ, D.C.','BOGOTÁ, D.C.'],
  ['5001','ANTIOQUIA','MEDELLÍN'],
  ['76001','VALLE DEL CAUCA','SANTIAGO DE CALI'],
  ['5059','ANTIOQUIA','ARMENIA'],
  ['63001','QUINDÍO','ARMENIA'],
  ['68679','SANTANDER','SAN GIL'],
];

export function catalogo() {
  return new Catalogo({ PRODUCTOS, CLIENTES, MUNICIPIOS });
}

/** El mensaje de ejemplo del plan, con un cliente ficticio. Mismos 4 ítems que PE1979. */
export const MENSAJE_LIBRE = `Maria Prueba Gomez
1'234.567.890
Carrera 12 # 69-158 conjunto Balcones del Bosque torre 8 apartamento 201
3001234567, Con mucho gusto, esta es la cotización:

* B01TG — Bolsa con válvula y zipper · 250 g · 15,5 x 16,5 + 8 cm · gris translucido
  25 und × $1.090 = $27.250
* B01T — Bolsa con válvula y zipper · 250 g · 15,5 x 16,5 + 8 cm · transparente
  25 und × $1.090 = $27.250
* B02T — Bolsa con válvula y zipper · 500 g · 19,5 x 20,5 + 8 cm · transparente
  25 und × $1.450 = $36.250
* B02P — Bolsa con válvula y zipper · 500 g · 19,5 x 20,5 + 8 cm · papel
  25 und × $1.450 = $36.250

Subtotal: $127.000

Valor del envío: $__ (por confirmar)`;

/** El mismo pedido en el formato recomendado (PLAN.md §11.4). */
export const MENSAJE_FORMATO = `PEDIDO
* Cliente: Maria Prueba Gomez
* NIT/CC: 1234567890
* Celular: 300 123 4567
* Dirección: Carrera 12 # 69-158 conjunto Balcones del Bosque torre 8 apartamento 201
* Ciudad: Ibagué, Tolima
* Tipo de cliente: FINAL
* Canal: WhatsApp
* Cliente de: ARQUI
  Pago del envío: Pago en bodega con cobro al cliente
  Valor del envío: por confirmar
  Notas despacho: Entregar en portería
* Productos:
  * B01TG — 25 und × $1.090
  * B01T — 25 und × $1.090
  * B02T — 25 und × $1.450
  * B02P — 25 und × $1.450`;
