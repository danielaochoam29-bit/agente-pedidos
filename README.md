# Agente de pedidos por Slack → AppSheet

Un asesor pega en Slack los datos del cliente y la cotización; el agente los lee, los
verifica contra la base de datos (PRODUCTOS, CLIENTES, MUNICIPIOS), pide en el hilo lo que
falte, y con la confirmación ✅ crea el cliente (si es nuevo), el pedido y sus detalles en
AppSheet y dispara la acción *Generar PDF*.

- Plan completo y decisiones: [`PLAN.md`](PLAN.md)
- Lo que debes configurar tú (AppSheet, Slack, Google): [`GUIA-CONFIGURACION.md`](GUIA-CONFIGURACION.md)
- Formato de mensaje para los asesores: `PLAN.md` §11.4

## Estado

| Fase | Estado |
|---|---|
| 1. Núcleo sin Slack: lector, validaciones, filas, pruebas | ✅ hecho (25 pruebas, `npm test`) |
| 2. Bot de Slack (hilos, confirmación ✅, escritura en AppSheet por API) | ✅ programado y probado en simulación (32 pruebas) |
| 3. Publicar en Vercel y primera prueba real | pendiente: `GUIA-CONFIGURACION.md` bloque 5 |

## Cómo está hecho

```
src/
├── config.mjs     reglas fijas: valores permitidos, defaults, mapa asesor → VENDEDOR, nombre de la acción PDF
├── texto.mjs      normalizar textos, números colombianos ($1.090), fechas de Colombia, llaves hex
├── parser.mjs     lector por REGLAS del mensaje (productos, campos etiquetados, bloque libre del cliente)
├── extraer.mjs    reglas + Claude (solo si falta algo); los productos de las reglas siempre mandan
├── catalogo.mjs   PRODUCTOS / CLIENTES / MUNICIPIOS en memoria; buscar cliente por NIT o celular; ciudad → código DANE
├── validar.mjs    TODAS las reglas de negocio → { estado: ok | faltan | error, faltantes, errores, avisos, pedido }
├── armar.mjs      el pedido validado → filas con los nombres de columna exactos (CLIENTES, PEDIDOS, DETALLES PEDIDO)
├── appsheet.mjs   cliente de la API de AppSheet: Add, Find, acciones; registrarEnAppSheet() hace la secuencia completa
├── google.mjs     lectura de la hoja con la cuenta de servicio (opcional; adaptado de la página web)
├── datos.mjs      carga el catálogo por la API de AppSheet (Find) o por Google si hay credenciales; caché 2 min
├── slack.mjs      Web API de Slack (responder en hilo, reacciones, leer hilo, usuario) y verificación de firma
├── bot.mjs        qué hacer con cada evento: mensaje nuevo, respuesta en hilo, reacción ✅; el hilo es el estado
└── mensajes.mjs   los textos que el bot escribe en Slack
api/slack/events.js función de Vercel que recibe los eventos de Slack (responde en <3 s y procesa después)
scripts/ensayo.mjs  ensayo en seco: nunca escribe
test/               pruebas con catálogo simulado (clientes ficticios; el repo es público)
```

Flujo de un mensaje:

1. `parser.leerMensaje` lee lo que se puede con reglas. Si falta algo importante y hay clave de
   Claude, `extraer` pide a Claude el JSON con un esquema estricto y rellena solo los huecos.
2. `validar` aplica las reglas de `PLAN.md` §11: cliente existente por NIT o celular, ciudad a
   código DANE, precio de lista según cantidad y tipo de cliente, subtotal que cuadre, defaults.
3. Según el estado: `faltan` → pregunta en el hilo; `error` → explica y no crea; `ok` → muestra
   el resumen y espera ✅.
4. Con ✅: `armar` + `registrarEnAppSheet` → CLIENTES (si nuevo) → PEDIDOS → DETALLES PEDIDO
   (con la KEY que devolvió AppSheet) → acción *Generar PDF*.

## Probar

```bash
npm install
npm test                                    # 25 pruebas, sin red
npm run ensayo -- mensaje.txt "JULIAN RODRIGUEZ"          # catálogo simulado
npm run ensayo -- mensaje.txt "JULIAN RODRIGUEZ" --hoja   # catálogo real (necesita .env con Google)
npm run ensayo -- mensaje.txt "JULIAN RODRIGUEZ" --ia     # además usa Claude si faltan datos
```

Variables: copia `.env.example` a `.env`. Nunca subas `.env`.

## Decisiones que se verifican en la primera prueba real

- **KEY / PE / NUMERO CONSECUTIVO** del pedido no se envían: se espera que AppSheet los asigne
  con los valores iniciales de la app y los devuelva en la respuesta del `Add`. Si no lo hace,
  `armar.conLlaves()` los genera con el mismo formato (`PE2010` + 8 hex) y habrá que leer el
  último consecutivo antes de escribir.
- La acción **Generar PDF** se invoca por la API con la KEY del pedido recién creado.
- Los bots de alerta de AppSheet deberían dispararse solos con los `Add` por API.
