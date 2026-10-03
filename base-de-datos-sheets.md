# La base de datos en Google Sheets: pestañas y columnas

Foto de la hoja **«BD APP BOLSAS AS COFFE»**
(`1WOcgH5acWfn-nonO_ixh_k6szE_3EH66OU-5gMwdbAU`) tomada el **2026-10-03**,
sólo leyendo, sin cambiar nada. Explica qué guarda cada pestaña, sus columnas
y **quién escribe en ella**: AppSheet (tu equipo), la página web, el portal de
clientes o los bots.

> **En una frase:** es una sola hoja de Google con más de 50 pestañas. AppSheet
> la usa como base de datos para todo el negocio (pedidos, inventario, pagos,
> contabilidad), y la página web y el portal de clientes leen y escriben en
> algunas de esas mismas pestañas.

Los números entre paréntesis son las filas con datos, aproximadas: las
pestañas con fórmulas arrastradas pueden salir infladas.

---

## 1. Cómo está organizada (mapa rápido)

| Área | Pestañas | ¿La toca la página web? |
|---|---|---|
| Catálogo e inventario | `PRODUCTOS`, `BODEGAS`, `MOV INVENTARIO`, `GARANTÍAS Y PÉRDIDAS` | **Lee** `PRODUCTOS` (precios, inventario) |
| Clientes | `CLIENTES`, `CLIENTES PAGINA`, `DEVOLUCIONES` | **Lee y escribe** `CLIENTES` |
| Pedidos | `PEDIDOS`, `DETALLES PEDIDO`, `PEDIDOS PAGINA WEB`, `DETALLES PEDIDOS PAGINA WEB`, `COTIZACIONES`, `DETALLE DE COTIZACIONES`, `RETEFUENTE` | **Escribe** las dos de «PAGINA WEB»; el portal **lee** también `PEDIDOS` y `DETALLES PEDIDO` |
| Alistamiento y despacho | `ESCANEOS`, `VERIFICACION ESCANEOS`, `SKYDROPX`, `GUÍAS BOT` | No |
| Pagos y cartera | `PAGOS`, `DETALLE PAGOS`, `PAGOS BOT`, `BOT BANCO`, `BALANCE CARTERA` | El portal **lee** `PAGOS`, `DETALLE PAGOS` y `PAGOS BOT` |
| Compras a proveedor | `OPS COMPRAS`, `COMPRAS` | El portal **lee** lo que viene en tránsito |
| Gastos y contabilidad | `GASTOS`, `GASTOS DE ENVÍOS`, `DIFERENCIAS ENVIOS`, `PUC`, `MOVIMIENTOS CONTABLES`, `TERCEROS`, `COMISIONES`, `CIERRE DE CUENTAS` | No |
| Geografía | `DEPARTAMENTOS`, `MUNICIPIOS` | **Lee** (listas del checkout) |
| Portal de clientes | `PORTAL_ACCESOS`, `PORTAL_ADMINS`, `PORTAL_AVISOS`, `PORTAL_RECORDATORIOS`, `PORTAL_CUPOS`, `PORTAL_RESERVAS`, `PORTAL_AUDITORIA` | **Lee y escribe** (son sólo del portal) |
| Mercado Libre y Meta | `ML_LOG`, `ML_AUDITORIA`, `ML_PRECIOS`, `ML_SYNC`, `ML_PEDIDOS`, `FEED META` | No |
| La app de AppSheet | `MENU`, `MENU ANTIGUO`, `USUARIOS`, `SESIONES`, `MES`, `AÑO`, `VENDEDORES`, `CAMPAÑAS` | No |

### Cómo se conectan las pestañas (la idea clave)

AppSheet trabaja con **cabecera + detalle**, unidos por una llave:

```
CLIENTES ──(NOMBRE)──► PEDIDOS ──(KEY)──► DETALLES PEDIDO ──(ITEM NRO)──► PRODUCTOS
                          ▲
PAGOS ──(KEY)──► DETALLE PAGOS ──(PE = KEY del pedido)
```

- **`KEY`** es el identificador único de cada fila (por ejemplo
  `PE51105b9b6f6`). **`PE`** es el número corto que ven las personas (`PE511`,
  o `PE057-W` si vino de la web).
- En las pestañas de detalle, la columna **`PE` guarda la `KEY` completa**
  del pedido, no el número corto. Si se escribe el corto, AppSheet no
  encuentra el pedido.
- La columna **`CLIENTE`** de los pedidos guarda el **`NOMBRE`** tal cual está
  en `CLIENTES`. Si no coincide letra por letra, el pedido queda «huérfano».

**Ejemplo:** el pedido `PE057-W` de «Café La Montaña» es una fila en
`PEDIDOS PAGINA WEB` con `KEY = PE057-W1a2b3c4d`. Sus dos referencias son dos
filas en `DETALLES PEDIDOS PAGINA WEB` con `PE = PE057-W1a2b3c4d`. Cuando el
cliente paga, `PAGOS` tiene el pago y `DETALLE PAGOS` dice a qué pedido se
aplicó (`PE = PE057-W1a2b3c4d`).

---

## 2. Pestañas una por una

### Catálogo e inventario

**`PRODUCTOS`** (90) · catálogo, precios e inventario. **Es la fuente del
catálogo de la página** (se relee cada 2 minutos).
KEY · ITEM NRO · FOTO · DESCRIPCION · EMPAQUE · PRECIO CLIENTE FINAL ·
PRECIO CLIENTE FINAL MAYOR 100 UND · PRECIO DISTRIBUIDOR · PRECIO MUESTRAS ·
BODEGA · DOCUMENTO · ESTATUS · INVENTARIO ACTUAL · INVENTARIO SG ·
INVENTARIO BGA · COSTO PROMEDIO PONDERADO ACTUAL · CANTIDAD POR PAQUETE ·
STOCK FISICO BGA · STOCK FISICO SAN GIL
- La página usa: `ITEM NRO` (código, p. ej. `B01B`), `DESCRIPCION`,
  `EMPAQUE`, los tres precios, `INVENTARIO ACTUAL` y `CANTIDAD POR PAQUETE`.
- ESTATUS (casi siempre vacío): FINALIZADO, SIN DOC, EN PROCESO.

**`BODEGAS`** (3) · KEY · BODEGA. Valores: BGA, SAN GIL, AJUSTE.

**`MOV INVENTARIO`** (99) · traslados y ajustes entre bodegas.
KEY · FECHA · REF · BODEGA ORIGEN · BODEGA DESTINO · CANTIDAD ·
TIPO DE MOVIMIENTO · VALOR. Tipos: TRASLADO, AJUSTE, DESPACHO PARCIAL,
DEVOLUCIONES.

**`GARANTÍAS Y PÉRDIDAS`** (6) · KEY · FECHA · TIPO · NRO OPERACION ·
ITEM NRO · DESCRIPCION · CANTIDAD · OBSERVACIONES · PE ·
COSTO PROMEDIO PONDERADO UNITARIO · PRECIO DE VENTA CLIENTE FINAL ·
COSTO TOTAL · BODEGA · USUARIO. Tipos: MERCANCÍA DAÑADA, GARANTÍA.

### Clientes

**`CLIENTES`** (769) · todos los clientes, de cualquier canal.
CLIENTE ID · NOMBRE · MARCA · NIT · CONTACTO · TIPO CLIENTE · DIRECCION ·
DEPARTAMENTO · MUNICIPIO · CLIENTE DE · ESTATUS · DOCUMENTO · FECHA PDF ·
MES SELECCIONADO · AÑO SELECCIONADO · CANAL · CAMPAÑA
- TIPO CLIENTE: FINAL (759) o DISTRIBUIDOR (10). **En el portal decide qué
  ve el cliente y qué precio paga.**
- CANAL: WhatsApp, Venta Directa, Instagram, Página Web, Facebook, TikTok.
- La página **crea** aquí al cliente nuevo (buscado por `NIT`) con
  `TIPO CLIENTE = FINAL`, `CLIENTE DE = DANIELA` y `CANAL = Página Web`.
- No hay columna de correo.

**`CLIENTES PAGINA`** (15) · KEY · CLIENTE · NUMERO · CORREO · MENSAJE.
Contactos que llegan de la web.

**`DEVOLUCIONES`** (4) · KEY · FECHA · NRO DEVOLUCION · PE · CLIENTE ·
CELULAR · TIPO DE CLIENTE · VALOR DEL PEDIDO · MOTIVO · VALOR · VENDEDOR ·
USUARIO · CLIENTE DE

### Pedidos

**`PEDIDOS`** (1.486) y **`PEDIDOS PAGINA WEB`** (14) · la cabecera de cada
pedido. **Tienen exactamente las mismas 36 columnas (A a AJ):**
KEY · PE · FECHA · CLIENTE · DIRECCIÓN DE ENVÍO · DEPARTAMENTO · MUNICIPIO ·
CELULAR · ESTATUS · DOCUMENTO · SUBTOTAL PEDIDO · DESCUENTO · VALOR DEL ENVÍO ·
VALOR REAL DEL ENVÍO · TOTAL COP · PAGO DEL ENVÍO · ESTADO PEDIDO · FOTO GUÍA ·
NOTAS · NÚMERO DE CAJAS DESPACHADAS · EMPRESA TRANSPORTE · PAGADO POR ·
NOTAS DESPACHO · USUARIO · VENDEDOR · BODEGA · DATOS DE ENVIO · NRO DE GUIA ·
VALOR FINAL ACTUAL · ESTADO PAGO · MUESTRAS · NUMERO CONSECUTIVO · TOTAL QTY ·
RETENCIÓN EN LA FUENTE · PAGO CONTRAENTREGA · ESTATUS DOC ENVIO
- `PEDIDOS` los registra tu equipo en AppSheet; `PEDIDOS PAGINA WEB` los
  escribe la página. Paso a paso en
  [`como-se-registra-un-pedido.md`](como-se-registra-un-pedido.md).
- ESTADO PEDIDO: EN CONSTRUCCIÓN → PENDIENTE POR ALISTAR → PENDIENTE POR
  DESPACHAR → DESPACHADO.
- ESTADO PAGO: PENDIENTE, ABONO, PAGADO, PAGADO MÁS ABONO, OK, CONTRAENTREGA.
- EMPRESA TRANSPORTE: INTERRAPIDISIMO, SKYDROPX, ENVIA, COTRASANGIL,
  SERVIENTREGA, COORDINADORA. BODEGA: BGA o SAN GIL.

**`DETALLES PEDIDO`** (3.480) y **`DETALLES PEDIDOS PAGINA WEB`** (26) · una
fila por referencia de cada pedido. **Mismas 12 columnas:**
KEY · FECHA · PE · CLIENTE · ITEM NRO · FOTO · DESCRIPCION · EMPAQUE ·
CANTIDAD · PRECIO DE VENTA UND · SUBTOTAL · COSTO PROMEDIO PONDERADO UNITARIO

**`COTIZACIONES`** (28) · KEY · CO · FECHA · CLIENTE · DIRECCIÓN DE ENVÍO ·
DEPARTAMENTO · MUNICIPIO · CELULAR · ESTATUS · STATUS DOC · DOCUMENTO ·
SUBTOTAL PEDIDO · DESCUENTO · VALOR DEL ENVÍO · TOTAL COP · PAGO DEL ENVÍO ·
NOTAS · USUARIO · VENDEDOR · BODEGA · DATOS DE ENVIO · PE · MUESTRAS.
ESTATUS: COTIZACIÓN u ÓRDEN DE PEDIDO (cuando se convierte en pedido).

**`DETALLE DE COTIZACIONES`** (88) · KEY · FECHA · CO · CLIENTE · ITEM NRO ·
FOTO · DESCRIPCION · EMPAQUE · CANTIDAD · PRECIO DE VENTA UND · SUBTOTAL ·
COSTO PROMEDIO PONDERADO UNITARIO · PE · PE Key

**`RETEFUENTE`** (15) · KEY · FECHA · PE · CLIENTE · SUBTOTAL PEDIDO ·
DESCUENTO · ENVIO · BASE PARA RETEFUENTE · VALOR TOTAL PEDIDO ·
PORCENTAJE RF · VALOR RETEFUENTE

### Alistamiento y despacho

**`ESCANEOS`** (≈2.500) · ID ESCANEO · FECHA · KEY · PE · CLIENTE · ITEM NRO ·
DESCRIPCION · EMPAQUE · CANTIDAD · CANTIDAD ESCANEADA · RESULTADO · USUARIO ·
HORA. Alistamiento con escáner.

**`VERIFICACION ESCANEOS`** (≈3.200) · ID ESCANEO · FECHA · KEY · PE ·
CLIENTE · CÓDIGO DE BARRAS · ITEM NRO · CANTIDAD · CANTIDAD ESCANEADA ·
USUARIO · HORA

**`SKYDROPX`** (329) · envíos creados en Skydropx y su rastreo.
KEY · FECHA CREACION · PE · SHIPMENT ID · ESTADO · TRANSPORTADORA · SERVICIO ·
NRO DE GUIA · URL ETIQUETA · URL RASTREO · DESTINATARIO · CELULAR ·
DIRECCION DESTINO · CIUDAD DESTINO · DEPARTAMENTO DESTINO · PESO KG · LARGO ·
ANCHO · ALTO · VALOR DECLARADO · COSTO ENVIO · ULTIMO EVENTO ·
FECHA ULTIMO EVENTO · ACTUALIZADO EN · RAW JSON · HORA CREACION.
ESTADO (en inglés): created, picked_up, in_transit, last_mile,
delivery_attempt, delivered_to_branch, delivered, canceled.

**`GUÍAS BOT`** (102) · guías leídas por el bot.
FECHA · EMPRESA DE TRANSPORTE · NRO DE GUÍA · PE · REMITENTE ·
DIRECCIÓN REMITENTE · CIUDAD REMITENTE · DEPARTAMENTO REMITENTE ·
VALOR A COBRAR · DESTINATARIO · DIRECCIÓN DESTINATARIO · CIUDAD DESTINATARIO ·
DEPARTAMENTO DESTINATARIO

### Pagos y cartera

**`PAGOS`** (856) · cada pago recibido.
KEY · FECHA · MES · AÑO · CLIENTE · CONCEPTO · VALOR · METODO DE PAGO ·
USUARIO · REVISADO · NOTAS · PE · COMPROBANTE · TIPO DE PAGO.
METODO: BANCO o EFECTIVO. TIPO DE PAGO: UN SOLO PEDIDO o VARIOS PEDIDOS.

**`DETALLE PAGOS`** (841) · cómo se reparte cada pago entre pedidos.
KEY · FECHA · CLIENTE · PAGO (→ `KEY` de `PAGOS`) · PE (→ `KEY` del pedido) ·
VALOR · NOTAS · USUARIO.
Ejemplo: un pago de $500.000 que cubre dos pedidos es 1 fila en `PAGOS` y 2
en `DETALLE PAGOS`.

**`PAGOS BOT`** · comprobantes que llegan por el bot, por verificar.
KEY · FECHA · HORA · MES · AÑO · CLIENTE · CONCEPTO · VALOR · METODO DE PAGO ·
USUARIO · REVISADO · NOTAS · PE · COMPROBANTE · TIPO DE PAGO · PE KEY ·
ESTADO BANCO. Aquí `PE` es el número **corto**; `ESTADO BANCO = OK` cuando se
valida. Unas 600 filas son pagos reales; el resto parecen fórmulas
arrastradas. El portal los muestra aparte, como «por verificar».

**`BOT BANCO`** (434) · movimientos del banco leídos por el bot.
FECHA · HORA · NOMBRE · VALOR · TIPO (PAGO CON LLAVE, TRANSFERENCIA,
CONSIGNACION, PAGO).

**`BALANCE CARTERA`** (1) · ID · SUMA BALANCES · MES SELECCIONADO ·
AÑO SELECCIONADO · CLIENTE. Filtro del informe de cartera.

### Compras a proveedor (mercancía en tránsito)

**`OPS COMPRAS`** (21) · una fila por orden de compra.
KEY · FECHA · OP · ESTADO · ETA · BODEGA. ESTADO: Tránsito o Recibido.

**`COMPRAS`** (295) · las referencias de cada orden.
KEY · FECHA · OP · PO · MARKET · ITEM NRO · CANTIDAD · COSTO · COSTO TOTAL ·
ESTADO · ETA · PO_CONSECUTIVO · BODEGA. ESTADO: Tránsito (57) o Recibido (238).
El portal usa lo que está en Tránsito para «Próximas llegadas» y reservas.

### Gastos y contabilidad

**`GASTOS`** (458) · KEY · FECHA · MES · AÑO · PE · TIPO DE GASTO · PAGADO A ·
VALOR · USUARIO · TIPO DE ENVÍO · DESCRIPCION · NRO FACTURA · MÉTODO DE PAGO ·
COMPROBANTE. Tipos: envío, nómina, publicidad, papelería, importación, fletes,
viáticos, servicios públicos, legales, etc.

**`GASTOS DE ENVÍOS`** (641) · igual que `GASTOS` más `NRO DE GUIA`.
PAGADO A = la transportadora.

**`DIFERENCIAS ENVIOS`** (25) · lo cobrado al cliente vs. lo que costó.
KEY · FECHA · MES · AÑO · PE · TIPO DE GASTO · PAGADO A ·
VALOR ENVÍO COBRADO · VALOR ENVÍO REAL · VALOR · USUARIO · TIPO DE ENVÍO ·
DESCRIPCION · NRO FACTURA · MÉTODO DE PAGO · COMPROBANTE

**`PUC`** (48) · plan de cuentas: CUENTA · NOMBRE · TIPO · SUBTIPO.

**`MOVIMIENTOS CONTABLES`** (≈12.500) · el libro contable.
ID_Mov · Fecha · Cuenta · Nombre · Debe · Haber · Referencia · Tipo_Evento ·
Tercero. Tipo_Evento: VENTA, GASTO, PAGO. Ojo: «Referencia » y
«Tipo_Evento » tienen un espacio al final del nombre.

**`TERCEROS`** (46) · KEY TERCERO · NOMBRE · TIPO DE TERCERO · TELEFONO · NIT.
Tipos: PROVEEDOR, TRANSPORTISTA, EMPLEADO.

**`COMISIONES`** (≈1.200) · KEY · FECHA · MES · AÑO · VENDEDOR · PE · CLIENTE ·
CLIENTE DE · SUBTOTAL PEDIDO · DESCUENTO · ENVÍO · TOTAL PEDIDO ·
BASE COMISION · PORCENTAJE · COMISION

**`CIERRE DE CUENTAS`** (6) · KEY · MES · AÑO · VENDEDOR · COMISIONES ·
EFECTIVO RECIBIDO · GASTOS PAGADOS · TOTAL A PAGAR

### Geografía

**`DEPARTAMENTOS`** (33) · DEPARTAMENTO.
**`MUNICIPIOS`** (1.122) · KEY · DEPARTAMENTO · MUNICIPIO. El `MUNICIPIO` de
los pedidos guarda el **código DANE** (p. ej. `20001`), no el nombre. La
página lee estas dos pestañas para las listas del checkout.

### Portal de clientes (pestañas propias, las crea y llena el portal)

| Pestaña | Filas | Columnas | Para qué |
|---|---|---|---|
| `PORTAL_ACCESOS` | 4 | ACCESO ID · CLIENTE ID · USUARIO · CORREO · ROL · ESTADO · CONTRASENA · INVITACION · INVITADO EN · VENCE EN · ACTIVADO EN · ULTIMO ACCESO EN · REVOCADO EN · MOTIVO · VERSION SESION · CREADO POR | Usuarios de los clientes. La contraseña va **cifrada**. ESTADO: invitado, activo, revocado |
| `PORTAL_ADMINS` | 3 | USUARIO · NOMBRE · CONTRASENA · ESTADO · CREADO EN · ULTIMO ACCESO EN · ROL | Tu equipo. ROL vacío = administración total; `asistente` = limitado |
| `PORTAL_AVISOS` | 0 | ID · CLIENTE ID · LEIDO EN | Avisos que el cliente ya leyó |
| `PORTAL_RECORDATORIOS` | 0 | ID · CLIENTE ID · TITULO · ITEM NRO · CANTIDAD · CADA · UNIDAD · PROXIMA EN · HORA · ZONA · CANALES · ESTADO · CREADO EN | Recordatorios de recompra |
| `PORTAL_CUPOS` | 50 | LINEA KEY · OP · ITEM NRO · HABILITADO · PAUSADO · VERSION · HABILITADO POR · HABILITADO EN | Cuántas unidades en tránsito se pueden reservar |
| `PORTAL_RESERVAS` | 2 | ID · CLIENTE ID · CLIENTE · ESTADO · REVISION · VERSION · CREADA EN · ACTUALIZADA EN · UNIDADES · LINEAS · PEDIDOS · DATOS | Reservas de los clientes |
| `PORTAL_AUDITORIA` | 9 | ID · EN · ACTOR · ACCION · ENTIDAD · DETALLE · MOTIVO | Quién hizo qué y cuándo |

Todavía **no existen** `PORTAL_RECEPCIONES` ni `PORTAL_PRECIOS_LLEGADA`. No
es un error: el portal las crea solo, con su cabecera, la primera vez que la
administración registra una llegada o confirma un precio de llegada.

### Mercado Libre y Meta

- **`ML_SYNC`** (12) · ITEM NRO · FAMILIA · COLOR_ML · ML_ITEM_ID ·
  ML_VARIATION_ID · PUBLICAR · PRECIO_ML · UND_POR_PAQUETE_ML · FOTOS_ML ·
  STOCK_CALCULADO · ULTIMO_SYNC · ESTADO · FOTOS_HASH.
  ⚠️ **Las 12 filas dicen «ERROR: Falló la renovación del token. Hay que
  volver a autorizar»**: la conexión con Mercado Libre está caída.
- **`ML_AUDITORIA`** (21) · foto de las publicaciones en Mercado Libre.
- **`ML_LOG`** (≈2.400) · registro de llamadas a Mercado Libre.
- **`ML_PRECIOS`** y **`ML_PEDIDOS`** · vacías.
- **`FEED META`** (54) · catálogo para Facebook/Instagram: id · title ·
  description · availability · condition · price · link · image_link · brand ·
  item_group_id · color · size · product_type · google_product_category ·
  quantity_to_sell_on_facebook · sale_price · custom_label_0.

### La app de AppSheet

- **`MENU`** (44) y **`MENU ANTIGUO`** (41) · los botones del menú de la app y
  qué roles los ven (ADMIN, OPERACIONES, BODEGA).
- **`USUARIOS`** (5) · USUARIO · ROL · CONTRASEÑA. Usuarios de AppSheet (no
  del portal).
- **`SESIONES`** (6) · quién está conectado a la app.
- **`MES`**, **`AÑO`**, **`VENDEDORES`**, **`CAMPAÑAS`** · listas y filtros
  para los informes.

---

## 3. Lo que la página web lee y escribe (resumen)

| Pestaña | Lee | Escribe | Para qué |
|---|---|---|---|
| `PRODUCTOS` | ✅ | — | Catálogo, precios e inventario (cada 2 min) |
| `DEPARTAMENTOS`, `MUNICIPIOS` | ✅ | — | Listas del checkout |
| `CLIENTES` | ✅ | ✅ (cliente nuevo) | Buscar por NIT o crear |
| `PEDIDOS PAGINA WEB` | ✅ | ✅ | Cabecera del pedido; luego `ESTADO PAGO = PAGADO` |
| `DETALLES PEDIDOS PAGINA WEB` | — | ✅ | Líneas del pedido |
| `PEDIDOS`, `DETALLES PEDIDO`, `PAGOS`, `DETALLE PAGOS`, `PAGOS BOT`, `COMPRAS` | ✅ (portal) | — | Historial y llegadas que ve el cliente |
| `PORTAL_*` | ✅ | ✅ | Todo lo del portal |
| `TEXTOS WEB` (no existe aún) | ✅ si existe | — | Textos editables; mientras no exista, la página usa los suyos |

**Regla de oro:** la página busca las columnas **por su nombre**. Renombrar o
borrar una columna de las pestañas de arriba puede romper el catálogo o los
pedidos. Si hace falta, se pide antes para ajustar la página al mismo tiempo.
Las demás pestañas (contabilidad, gastos, escaneos…) las puedes cambiar desde
AppSheet sin afectar la página.
