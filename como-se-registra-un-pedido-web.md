# Cómo se registra en la hoja un pedido que llega por la página

Esta guía explica qué pasa en tu base de datos (la hoja de Google que usa
AppSheet) desde que un cliente pulsa «Enviar pedido» en
`www.ascoffeebags.com` hasta que el pedido queda listo para que tu equipo lo
trabaje. Está escrita para leerse sin saber programar.

> **En una frase:** la página escribe sola el pedido en tres pestañas de la
> hoja (`CLIENTES`, `PEDIDOS PAGINA WEB` y `DETALLES PEDIDOS PAGINA WEB`), lo
> deja en **EN CONSTRUCCIÓN** con pago **PENDIENTE**, avisa por Slack, y de
> ahí en adelante **lo mueve una persona desde AppSheet**.

---

## Resumen: quién hace qué

| Paso | Lo hace | Dónde |
|---|---|---|
| 1. El cliente llena el carrito y sus datos | El cliente | `/carrito` y `/finalizar-pedido` |
| 2. Revisar precios, inventario y datos | La página, sola | Relee la pestaña `PRODUCTOS` |
| 3. Crear el cliente si es nuevo | La página, sola | Pestaña `CLIENTES` |
| 4. Escribir la cabecera del pedido | La página, sola | Pestaña `PEDIDOS PAGINA WEB` |
| 5. Escribir una fila por referencia | La página, sola | Pestaña `DETALLES PEDIDOS PAGINA WEB` |
| 6. Si eligió pago en línea, llevarlo a pagar | La página, sola | Página de pago de Wix |
| 7. Avisar del pedido nuevo y contar la venta | La página, sola | Canal `#pedidos-pagina-web` de Slack y Google Analytics |
| 8. Marcar el pago como `PAGADO` | La página, cuando Wix confirma el cobro | Columna `ESTADO PAGO` |
| 9. Revisar, alistar y despachar | **Tú o tu equipo** | AppSheet, columna `ESTADO PEDIDO` |

Los pasos 2 a 7 tardan unos segundos y ocurren todos con el mismo clic del
cliente.

---

## Paso a paso, con un ejemplo

Para que se entienda, sigamos un pedido de ejemplo:

> **Café La Montaña** (NIT 900123456, celular 3001234567, Bucaramanga,
> Santander) pide **2 paquetes de B01B** (bolsa blanca con válvula y zipper de
> 250 g, paquete de 25 unidades) = **50 unidades** a **$1.090** cada una.
> Elige **pago contraentrega** y escribe en notas: «Entregar después de las
> 2 pm».

### Paso 1 · El cliente envía el pedido

En `/finalizar-pedido` el cliente escribe nombre, NIT o cédula, celular,
departamento, municipio, dirección y, si quiere, notas. Elige
**contraentrega** o **pago en línea** y pulsa enviar.

La página exige: nombre, NIT, un celular de 7 a 15 dígitos, departamento,
municipio, dirección y al menos una referencia en el carrito. Si falta algo,
el cliente ve el mensaje y no se escribe nada en la hoja.

### Paso 2 · La página revisa precios e inventario en `PRODUCTOS`

El navegador del cliente sólo manda **qué referencias y cuántas unidades**.
Los precios **nunca** se toman del navegador: la página vuelve a leer la
pestaña `PRODUCTOS` en ese momento. Así nadie puede pedirse el catálogo a un
peso.

Por cada referencia revisa:

- **Que exista.** Si la borraron de `PRODUCTOS`, el cliente ve «La referencia
  … ya no existe».
- **Que haya inventario suficiente.** De `INVENTARIO ACTUAL` se apartan
  **300 unidades** (3 para la selladora `PFS300-P`) para cubrir pedidos que ya
  van en camino. Sólo se vende lo que sobra, en paquetes completos.
  - Ejemplo: B01B con 22.871 unidades → se pueden vender hasta
    22.571 (22.871 − 300). Los 50 del ejemplo pasan sin problema.
  - Si el inventario está en 300 o menos, la referencia sale agotada y el
    pedido se rechaza.
- **Qué precio aplica.**
  - Menos de 100 unidades de esa referencia → `PRECIO CLIENTE FINAL`
    (ejemplo: $1.090).
  - 100 unidades o más → `PRECIO CLIENTE FINAL MAYOR 100 UND`
    (ejemplo: $980).

En el ejemplo: 50 × $1.090 = **$54.500** de mercancía.

**Recargo de contraentrega (7 %).** Si el cliente paga al recibir, la
página calcula la comisión de la transportadora:
$54.500 × 7 % = **$3.815**, así que el mensajero recauda **$58.315**. Ese 7 %
no es dinero del negocio, por eso **no se suma a `TOTAL COP`**: queda
anotado en `NOTAS` (ver paso 4).

### Paso 3 · El cliente en `CLIENTES`

La página busca el **NIT** en la pestaña `CLIENTES`:

- **Si ya existe**, usa el nombre tal como está escrito en `CLIENTES` (es el
  que AppSheet usa para enlazar el pedido) y no crea nada.
- **Si es nuevo**, agrega una fila con:

| Columna | Valor en el ejemplo |
|---|---|
| CLIENTE ID | 8 caracteres al azar, p. ej. `3fa91c07` |
| NOMBRE | Café La Montaña |
| MARCA | la que haya escrito el cliente |
| NIT | 900123456 |
| CONTACTO | 3001234567 |
| TIPO CLIENTE | `FINAL` |
| DIRECCION / DEPARTAMENTO / MUNICIPIO | los que escribió |
| CLIENTE DE | `DANIELA` |
| FECHA PDF | fecha y hora de Colombia |
| CANAL | `Página Web` |

Se hace **antes** de escribir el pedido porque la columna `CLIENTE` del
pedido apunta a `CLIENTES`; al revés, AppSheet vería el pedido como inválido.

### Paso 4 · La cabecera en `PEDIDOS PAGINA WEB`

Se agrega **una fila** con el resumen del pedido:

| Columna | Qué se escribe | Ejemplo |
|---|---|---|
| KEY | número de pedido + 8 caracteres al azar | `PE057-W1a2b3c4d` |
| PE | número de pedido consecutivo terminado en `-W` (web) | `PE057-W` |
| FECHA | fecha de Colombia | 03/10/2026 |
| CLIENTE | nombre exacto de `CLIENTES` | Café La Montaña |
| DIRECCIÓN DE ENVÍO, DEPARTAMENTO, MUNICIPIO, CELULAR | lo que escribió el cliente | — |
| SUBTOTAL PEDIDO | mercancía | 54500 |
| VALOR DEL ENVÍO | siempre `0` | 0 |
| TOTAL COP | mercancía (sin el 7 %) | 54500 |
| PAGO DEL ENVÍO | `CONTRAENTREGA`; desde $1.000.000, `PAGO EN BODEGA SIN COBRO AL CLIENTE` (envío gratis) | CONTRAENTREGA |
| ESTADO PEDIDO | siempre `EN CONSTRUCCIÓN` | EN CONSTRUCCIÓN |
| ESTADO PAGO | siempre `PENDIENTE` al entrar | PENDIENTE |
| PAGO CONTRAENTREGA | `SI` si paga al recibir, `NO` si paga en línea | SI |
| NOTAS | uso interno: si es contraentrega, cuánto recauda la transportadora; si no, `----` | «Contraentrega: la transportadora recauda 58315 (mercancía 54500 + 7% de comisión 3815)» |
| NOTAS DESPACHO | lo que escribió el cliente (o `----`) | Entregar después de las 2 pm |
| VENDEDOR | `DANIELA` | DANIELA |
| BODEGA | `BGA` | BGA |
| VALOR FINAL ACTUAL | igual al subtotal | 54500 |
| MUESTRAS | `NO` | NO |
| TOTAL QTY | unidades totales | 50 |

Las demás columnas (`ESTATUS`, `FOTO GUÍA`, `NRO DE GUIA`, `EMPRESA
TRANSPORTE`, etc.) quedan **en blanco** para que tu equipo las llene al
despachar.

**¿Cómo sale el número `PE057-W`?** Del número de fila donde quedó el pedido
en la hoja (fila 58 → pedido 57). Así, si dos clientes compran al mismo
segundo, cada uno recibe un número distinto. Por un instante la fila aparece
con `PENDIENTE-xxxxxx` en `KEY` y `PE`, y enseguida se reemplaza por el número
definitivo.

### Paso 5 · Las referencias en `DETALLES PEDIDOS PAGINA WEB`

Se agrega **una fila por cada referencia** del carrito:

| Columna | Ejemplo |
|---|---|
| KEY | 8 caracteres al azar |
| FECHA | 03/10/2026 |
| PE | **la KEY completa del pedido**: `PE057-W1a2b3c4d` (no el número corto) |
| CLIENTE | Café La Montaña |
| ITEM NRO | B01B |
| FOTO, DESCRIPCION, EMPAQUE | copiados de `PRODUCTOS` |
| CANTIDAD | 50 |
| PRECIO DE VENTA UND | 1090 |
| SUBTOTAL | 54500 |
| COSTO PROMEDIO PONDERADO UNITARIO | copiado de `PRODUCTOS` (para calcular tu margen) |

### Paso 6 · Si eligió pago en línea

Con el pedido ya guardado, la página lleva al cliente a la página de pago de
Wix (Mercado Pago). Si esa página fallara, **el pedido no se pierde**: ya
está en la hoja y se le dice al cliente que lo contactan.

En pago en línea no hay recargo del 7 % y `PAGO CONTRAENTREGA` queda en `NO`.

### Paso 7 · Aviso en Slack

Sale un mensaje en `#pedidos-pagina-web` con el número de pedido, cliente,
celular, ciudad, total, unidades, forma de pago, referencias y notas. Si
Slack falla, el pedido igual queda guardado. Detalle en
[`avisos-de-slack.md`](avisos-de-slack.md).

Además, si el pedido es **contraentrega**, la venta se cuenta en ese momento
en Google Analytics (por el valor que recauda el mensajero). Si es **pago en
línea**, se cuenta cuando Wix confirma el cobro (paso 8). Los pedidos del
portal de clientes no se cuentan ahí: Analytics mide sólo la tienda pública.
Esto no escribe nada en la hoja.

### Paso 8 · El pago pasa a `PAGADO` (sólo pago en línea)

Cuando Wix confirma el cobro, la página cambia **únicamente** la columna
`ESTADO PAGO` de `PENDIENTE` a `PAGADO`, avisa en Slack y cuenta la venta en
Google Analytics. Ojo: el mensaje de Slack dice «pasa a PENDIENTE POR
ALISTAR», pero en la hoja `ESTADO PEDIDO` sigue en `EN CONSTRUCCIÓN` hasta
que alguien lo mueva (paso 9).

⚠️ **Hueco conocido:** esa revisión sólo corre cuando el cliente vuelve a
`/pedido-confirmado` o cuando se llama a mano. Si un cliente paga y no
vuelve, la fila puede quedarse en `PENDIENTE` aunque el pago sí se vea en el
panel de Wix. Mientras se automatiza (README, «Pendientes»), si ves un pedido
en línea en `PENDIENTE`, revísalo en Wix antes de despacharlo.

Los pedidos **contraentrega** nunca pasan solos a `PAGADO`: los marca tu
equipo cuando la transportadora entrega el dinero.

### Paso 9 · Lo que te toca a ti (o a tu equipo) en AppSheet

La página **nunca mueve `ESTADO PEDIDO`**: a propósito, para que siempre una
persona revise el pedido antes de alistarlo. El flujo diario es:

1. Mira Slack o filtra `PEDIDOS PAGINA WEB` por `ESTADO PEDIDO = EN
   CONSTRUCCIÓN`.
2. Revisa el pedido: datos del cliente, dirección y `NOTAS DESPACHO`.
3. Si es **pago en línea**, confirma que `ESTADO PAGO` diga `PAGADO` (o
   revisa el cobro en Wix).
4. Si es **contraentrega**, mira en `NOTAS` cuánto debe recaudar la
   transportadora (mercancía + 7 %).
5. Cambia `ESTADO PEDIDO` a `PENDIENTE POR ALISTAR`.
6. Al despachar, llena `EMPRESA TRANSPORTE`, `NRO DE GUIA`, `FOTO GUÍA`,
   `NÚMERO DE CAJAS DESPACHADAS`, `VALOR REAL DEL ENVÍO` y pasa el pedido a
   `DESPACHADO`.

---

## Cómo saber si el pedido entró bien

Un pedido sano tiene, en las tres pestañas:

- [ ] Una fila en `PEDIDOS PAGINA WEB` con `PE` tipo `PE057-W` (no
      `PENDIENTE-…`).
- [ ] En `DETALLES PEDIDOS PAGINA WEB`, tantas filas como referencias, con la
      **KEY completa** del pedido en la columna `PE`.
- [ ] La suma de `SUBTOTAL` de los detalles = `SUBTOTAL PEDIDO` de la
      cabecera.
- [ ] El cliente existe en `CLIENTES` con el mismo nombre que la columna
      `CLIENTE` del pedido.

Si ves una fila con `PENDIENTE-…` en `KEY` que no cambió, el pedido se cortó
a la mitad (por ejemplo, Google no respondió). El cliente en ese caso vio un
mensaje para escribir por WhatsApp; esa fila se puede borrar después de
confirmar con él.

---

## Cosas que **no** debes cambiar en la hoja sin avisar

La página encuentra las columnas **por su nombre**, pero sólo lee un rango
fijo de cada pestaña (`PRODUCTOS` hasta la columna S, `CLIENTES` hasta la Q,
`PEDIDOS PAGINA WEB` hasta la AJ, `DETALLES PEDIDOS PAGINA WEB` hasta la L).
Por eso:

- **Avisa antes** de agregar o mover columnas en estas pestañas: una columna
  que quede fuera de ese rango la página no la ve.
- **No renombres ni borres** estas columnas: en `PRODUCTOS`, `ITEM NRO`,
  `PRECIO CLIENTE FINAL`, `PRECIO CLIENTE FINAL MAYOR 100 UND`, `CANTIDAD POR
  PAQUETE` e `INVENTARIO ACTUAL`; en `CLIENTES`, `NIT` y `NOMBRE`; y los
  encabezados de `PEDIDOS PAGINA WEB` y `DETALLES PEDIDOS PAGINA WEB`. Si
  falta una de `PRODUCTOS`, la página deja de aceptar pedidos y el cliente ve
  «Escríbenos por WhatsApp».
- **No cambies el nombre de las pestañas** `CLIENTES`, `PEDIDOS PAGINA WEB` ni
  `DETALLES PEDIDOS PAGINA WEB`.

Si necesitas cambiar alguna de esas cosas, pídelo antes para ajustar la
página al mismo tiempo.

---

## ¿Y los pedidos del portal de clientes?

Usan **el mismo camino** y las mismas pestañas, con estas diferencias:

- El cliente ya inició sesión, así que no se busca por NIT sino por su
  `CLIENTE ID`, y nunca se crea un cliente nuevo.
- El precio depende de su `TIPO CLIENTE`: `DISTRIBUIDOR` paga `PRECIO
  DISTRIBUIDOR`; `FINAL`, el precio normal.
- `NOTAS` empieza con «Portal de clientes · cliente … · intento …», para que un
  doble clic no cree dos pedidos.
- Los pedidos que nacen de una **reserva en tránsito** usan el precio de
  llegada que fijó la administración y quedan «pago y envío por coordinar».

---

## Para quien mantenga el código

- Entrada: `POST /api/crear-pedido` → `src/pages/api/crear-pedido.ts`.
- Lógica completa: `src/lib/pedidos.server.mjs` (`registrarPedido`).
- Reserva de 300 unidades: `scripts/lib/reserva.mjs`.
- Paso a `PAGADO`: `src/lib/conciliar.server.mjs`, `POST /api/conciliar-pagos`.
- Venta en GA4 desde el servidor: `src/lib/ga4.server.mjs`.
- Columnas exactas de la hoja: [`hoja-appsheet.md`](hoja-appsheet.md).
- Pruebas sin tocar la hoja: `npm run probar`.
