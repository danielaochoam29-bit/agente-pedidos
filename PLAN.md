# Plan: Agente de pedidos por Slack para la app AppSheet (AS Coffee Bags)

> Estado: **borrador para aprobación**. Nada de esto está construido todavía.
> Fecha: 2026-10-03

---

## 1. Resumen en una página

**Objetivo.** Que un asesor pegue en un canal de Slack los datos del cliente + la cotización (como el ejemplo de Angel María Gaitán) y un agente:

1. Entienda el mensaje (cliente, cédula/NIT, dirección, celular, referencias, cantidades, precios).
2. Verifique cada referencia contra la hoja `PRODUCTOS` (que exista, que el precio sea uno de los de la lista).
3. Busque el cliente en `CLIENTES` (por NIT o celular). Si no existe, lo cree.
4. Cree el pedido en `PEDIDOS` + una fila por ítem en `DETALLES PEDIDO`, exactamente como quedó PE1979.
5. Responda en el hilo de Slack: "✅ Pedido PE2010 creado…", "⚠️ Falta la ciudad…", o "❌ No pude crearlo porque…".

**Camino recomendado (el más barato y eficiente):**

| Pieza | Qué es | Costo |
|---|---|---|
| App de Slack propia (bot) | Escucha el canal y responde en hilos | $0 |
| Servicio pequeño en Node.js | Aquí vive la lógica. Alojado en Vercel (ya lo tienes conectado) | $0 en plan Hobby (ver nota en §7) |
| Google Sheets API con "cuenta de servicio" | Lee y escribe tu hoja `BD APP BOLSAS AS COFFE` directamente | $0 |
| Claude (IA) **solo para leer el mensaje** | Convierte el texto libre del asesor en JSON. No decide nada: todo se valida con código | ≈ $0.01 por pedido con Opus 5.5, ≈ $0.002 con Haiku 4.5 |

**Por qué híbrido (IA + código) y no una de las dos solas:**

- *Sin IA (solo reglas/regex):* la cotización sí tiene formato fijo (`* B01T — … 25 und × $1.090 = $27.250`) y se puede leer con reglas. Pero el bloque del cliente lo escribe cada asesor como quiera: cédula con apóstrofes (`93'287.888`), nombre antes o después, dirección en una o tres líneas, celular con o sin `+57`. Con reglas puras el bot se rompe cada vez que alguien cambia el orden.
- *Solo IA:* nunca dejaría que la IA invente un precio o una referencia. Por eso la IA solo **extrae** y el código **verifica** contra `PRODUCTOS` y `CLIENTES` antes de escribir una sola fila.
- *Make / Zapier:* posible, pero cobran por operación y esta lógica (buscar cliente, consecutivo, N filas de detalle, preguntar de vuelta en el hilo) se vuelve una maraña de escenarios. Más caro a mediano plazo y más difícil de mantener.

**Por qué escribir en la hoja y no por la API de AppSheet (por ahora):** la API de AppSheet exige plan *Core* o superior y activarla en la app. Escribir en la hoja es gratis y la app la lee igual. Lo dejo como opción en Fase 4 si descubrimos que tu app tiene *bots* (automatizaciones) que deben dispararse cuando entra un pedido (ver pregunta en §6).

---

## 2. Lo que encontré en tu base de datos (ya lo revisé)

Leí la hoja `BD APP BOLSAS AS COFFE`. Lo relevante para el agente:

### 2.1 Cómo quedó registrado PE1979 (el modelo a imitar)

**Hoja `PEDIDOS`** (una fila):

| Columna | Valor en PE1979 | De dónde sale |
|---|---|---|
| KEY | `PE1979a66b85b8` | `PE` + consecutivo + 8 caracteres hex aleatorios |
| PE | `PE1979` | `PE` + consecutivo |
| FECHA | `02/10/2026` | fecha del día (dd/mm/aaaa) |
| CLIENTE | `ANGEL MARIA GAITAN PULIDO` | nombre en MAYÚSCULAS, igual que en `CLIENTES` |
| DIRECCIÓN DE ENVÍO | `Carrera 12 # 69-158 conjunto…` | del mensaje |
| DEPARTAMENTO | `TOLIMA` | ⚠️ **no viene en el mensaje de Slack** |
| MUNICIPIO | `73001` | código DANE de Ibagué (hoja `MUNICIPIOS`) ⚠️ tampoco viene |
| CELULAR | `3007567875` | del mensaje |
| ESTATUS | `COMPLETADO` | valor fijo |
| SUBTOTAL PEDIDO | `127000` | suma de los ítems |
| DESCUENTO | `0` | fijo salvo que el asesor diga otra cosa |
| VALOR DEL ENVÍO | `18500` | el asesor lo puso después ("por confirmar" en el mensaje) |
| TOTAL COP | `127000` | subtotal − descuento |
| PAGO DEL ENVÍO | `PAGO EN BODEGA CON COBRO AL CLIENTE` | una de 3 opciones |
| ESTADO PEDIDO | `PENDIENTE POR DESPACHAR` | se decide por defecto (ver §6) |
| USUARIO / VENDEDOR | `JULIAN` | según quién escribe en Slack |
| BODEGA | `BGA` | por defecto |
| VALOR FINAL ACTUAL | `145500` | total + envío |
| ESTADO PAGO | `PAGADO` | por defecto sería `PENDIENTE` |
| MUESTRAS / PAGO CONTRAENTREGA | `NO` / `NO` | por defecto |
| NUMERO CONSECUTIVO | `1979` | último consecutivo + 1 |
| RETENCIÓN EN LA FUENTE | `0` | fijo |

**Hoja `DETALLES PEDIDO`** (4 filas, una por referencia):

| KEY | FECHA | PE | CLIENTE | ITEM NRO | FOTO | DESCRIPCION | EMPAQUE | CANTIDAD | PRECIO DE VENTA UND | SUBTOTAL | COSTO PROMEDIO PONDERADO UNITARIO |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `706d84c6` | 02/10/2026 | `PE1979a66b85b8` | ANGEL MARIA GAITAN PULIDO | B01TG | PRODUCTOS_Images/B01TG… | (copiado de PRODUCTOS) | PAQUETE X 25 UNIDADES | 25 | 1090 | 27250 | 488 |
| `fe522872` | 02/10/2026 | `PE1979a66b85b8` | … | B01T | … | … | … | 25 | 1090 | 27250 | 499 |
| `1fbc0508` | 02/10/2026 | `PE1979a66b85b8` | … | B02T | … | … | … | 25 | 1450 | 36250 | 621 |
| `7ccf9adf` | 02/10/2026 | `PE1979a66b85b8` | … | B02P | … | … | … | 25 | 1450 | 36250 | 649 |

Ojo: la columna `PE` del detalle guarda el **KEY** del pedido (`PE1979a66b85b8`), no `PE1979`. FOTO, DESCRIPCION, EMPAQUE y COSTO PROMEDIO se copian de la hoja `PRODUCTOS`.

**Hoja `CLIENTES`** (Angel ya existía, creado ese mismo día por el asesor):

| CLIENTE ID | NOMBRE | NIT | CONTACTO | TIPO CLIENTE | DIRECCION | DEPARTAMENTO | MUNICIPIO | CLIENTE DE | CANAL | FECHA PDF |
|---|---|---|---|---|---|---|---|---|---|---|
| `5647c37e` | ANGEL MARIA GAITAN PULIDO | `93287888` | 3007567875 | FINAL | Carrera 12 # 69-158… | TOLIMA | 73001 | ARQUI | WhatsApp | 02/10/2026 14:16:09 |

### 2.2 Hallazgos que afectan el diseño

1. **El mensaje de Slack no trae la ciudad.** PE1979 tiene TOLIMA/Ibagué porque el asesor lo sabía. El agente deberá: (a) si el cliente ya existe, tomar ciudad/departamento de su ficha; (b) si no, **preguntar en el hilo** "¿Ciudad de envío?" y resolver el código DANE con la hoja `MUNICIPIOS` (1.122 municipios; "Ibagué" → `73001`). Este es el caso típico de "falta información".
2. **El valor del envío llega "por confirmar".** El agente registra `VALOR DEL ENVÍO = 0` y marca el pedido con el estado que definas (§6). Después el asesor lo completa en la app, como hoy.
3. **Precios.** `PRODUCTOS` tiene 4 precios por referencia: cliente final (1.090), mayor a 100 und (980), distribuidor (800) y muestras. El agente aceptará el precio del mensaje **solo si coincide con alguno de la lista**; si no, avisa ("B01T a $1.000 no está en la lista: 1.090 / 980 / 800") y no crea el pedido hasta que el asesor confirme.
4. **Clientes duplicados.** Hay NIT repetidos y celulares repetidos en `CLIENTES` (y valores basura como `.` o `123456789`). Regla propuesta: buscar por NIT normalizado (solo dígitos: `93'287.888` → `93287888`); si no hay, por celular; si hay más de uno, el bot pregunta cuál. Nombres siempre en MAYÚSCULAS.
5. **Consecutivo PE.** Hoy va en PE2009. El agente calcula `MAX(NUMERO CONSECUTIVO) + 1` justo antes de escribir y reintenta si otro pedido entró en ese segundo. Riesgo bajo, pero existe (ver §8).
6. **Documentos de la página web.** Ya están en `main` (`como-se-registra-un-pedido-web.md` y `base-de-datos-sheets.md`) y revisé también el código real en el repo `pagina-web-as-coffee-bags`. Lo que cambia por eso está en §9.
7. **⚠️ Seguridad: la hoja es pública.** Pude descargar todas las pestañas como CSV **sin ninguna credencial**, solo con el enlace. Eso significa que "cualquiera con el enlace puede ver". Ahí están los datos de 769 clientes y la pestaña `USUARIOS` tiene contraseñas en texto plano. Recomiendo cambiar el acceso a "Restringido" (Compartir → Acceso general → Restringido) y compartir solo con las cuentas que la usan. El agente no necesita que sea pública: usará su propia cuenta de servicio.

---

## 3. Cómo funcionaría, paso a paso, con tu ejemplo

**Paso 1. El asesor escribe en el canal `#pedidos` (nombre a definir):**

```
Angel Maria Gaitan Pulido
93'287.888
Carrera 12 # 69-158 conjunto Balcones del Bosque torre 8 apartamento 201
3007567875, Con mucho gusto, esta es la cotización:

* B01TG — Bolsa con válvula y zipper · 250 g · 15,5 x 16,5 + 8 cm · gris translucido
  25 und × $1.090 = $27.250
* B01T — Bolsa con válvula y zipper · 250 g · 15,5 x 16,5 + 8 cm · transparente
  25 und × $1.090 = $27.250
* B02T — Bolsa con válvula y zipper · 500 g · 19,5 x 20,5 + 8 cm · transparente
  25 und × $1.450 = $36.250
* B02P — Bolsa con válvula y zipper · 500 g · 19,5 x 20,5 + 8 cm · papel
  25 und × $1.450 = $36.250

Subtotal: $127.000

Valor del envío: $__ (por confirmar)
```

**Paso 2. El bot reacciona con 👀 y extrae (IA → JSON):**

```json
{
  "cliente": { "nombre": "ANGEL MARIA GAITAN PULIDO", "nit": "93287888",
               "celular": "3007567875",
               "direccion": "Carrera 12 # 69-158 conjunto Balcones del Bosque torre 8 apartamento 201",
               "ciudad": null, "departamento": null },
  "items": [
    { "ref": "B01TG", "cantidad": 25, "precio": 1090 },
    { "ref": "B01T",  "cantidad": 25, "precio": 1090 },
    { "ref": "B02T",  "cantidad": 25, "precio": 1450 },
    { "ref": "B02P",  "cantidad": 25, "precio": 1450 }
  ],
  "subtotal_declarado": 127000,
  "envio": null,
  "notas": null
}
```

**Paso 3. El código valida (sin IA):**

- `B01TG`, `B01T`, `B02T`, `B02P` existen en `PRODUCTOS` ✅
- Precios coinciden con "PRECIO CLIENTE FINAL" ✅
- 25 × 1.090 = 27.250 ✅ (cada línea) y la suma = 127.000 = subtotal declarado ✅
- Cliente: NIT `93287888` → encontrado `5647c37e` ANGEL MARIA GAITAN PULIDO ✅ → ciudad tomada de su ficha: TOLIMA / 73001 (Ibagué)

**Paso 4a. Si todo está bien, responde en el hilo y crea:**

```
✅ Pedido PE2010 creado
Cliente: ANGEL MARIA GAITAN PULIDO (ya existía · 5647c37e)
Envío a: Carrera 12 # 69-158 … · IBAGUÉ, TOLIMA · 3007567875
4 referencias · 100 und · Subtotal $127.000 · Envío: pendiente
Vendedor: JULIAN
```

**Paso 4b. Si falta información (cliente nuevo sin ciudad):**

```
⚠️ Me falta un dato para crear el pedido:
• Ciudad de envío (no la encontré en el mensaje ni en CLIENTES).
Respóndeme aquí en el hilo, por ejemplo: "Ibagué".
```

El asesor contesta `Ibagué` en el hilo → el bot completa y crea el pedido (sin que tenga que volver a pegar todo).

**Paso 4c. Si algo no cuadra:**

```
❌ No creé el pedido:
• B02Z no existe en PRODUCTOS. ¿Quisiste decir B02P o B02T?
• B01T a $1.000: el precio de lista es 1.090 (final) / 980 (>100 und) / 800 (distribuidor).
Corrige y vuelve a enviar, o responde "crear igual" si el precio es un acuerdo especial.
```

**Paso 5. (Opcional, recomendado al inicio)** Antes de escribir, el bot muestra el resumen y pide confirmar con ✅ (reacción o botón). Cuando ya confíen en él, se quita.

---

## 4. Arquitectura técnica

```
Asesor en Slack ──► Slack Events API ──► Función en Vercel (Node.js)
                                             │
                     ┌───────────────────────┼─────────────────────────┐
                     ▼                       ▼                         ▼
              Claude API              Google Sheets API         Slack Web API
         (extraer JSON del texto)   (leer PRODUCTOS, CLIENTES,  (responder en el hilo,
                                     MUNICIPIOS; escribir        reacciones)
                                     PEDIDOS, DETALLES, CLIENTES)
```

**Estructura del repo que crearía:**

```
agente-pedidos/
├── api/slack/events.ts        # recibe eventos de Slack (responde 200 en <3 s, procesa en segundo plano)
├── src/
│   ├── parse/extract.ts       # llamada a Claude con salida estructurada (JSON con esquema estricto)
│   ├── parse/quote-regex.ts   # lector de reglas para las líneas "* REF — … N und × $P = $S" (respaldo sin IA)
│   ├── sheets/client.ts       # conexión Google Sheets (cuenta de servicio)
│   ├── sheets/productos.ts    # buscar referencia, precios, foto, empaque, costo
│   ├── sheets/clientes.ts     # buscar por NIT / celular, crear cliente
│   ├── sheets/municipios.ts   # "Ibagué" → 73001 / TOLIMA
│   ├── sheets/pedidos.ts      # consecutivo, KEY, escribir PEDIDOS + DETALLES
│   ├── validate.ts            # todas las reglas de negocio
│   ├── slack/reply.ts         # mensajes ✅ ⚠️ ❌ y manejo de hilos
│   └── config.ts              # defaults (BODEGA, estados, mapa asesor→VENDEDOR)
├── test/                      # pruebas con PE1979 y casos de error
└── README.md                  # cómo configurarlo y operarlo
```

**Decisiones técnicas:**

- **Node.js + TypeScript** (Vercel lo despliega sin configuración; mismo stack que probablemente usa tu página web).
- **Claude Opus 5.5** (`claude-opus-5-5`) con *salida estructurada* (esquema JSON estricto) para la extracción. Si quieres bajar costo, el cambio a Haiku 4.5 es una línea; lo dejo a tu decisión (§7).
- **Google Sheets API** con cuenta de servicio (un "usuario robot" de Google al que compartes la hoja como Editor). No requiere tu contraseña ni OAuth.
- **Idempotencia:** cada mensaje de Slack tiene un ID; el bot guarda en una pestaña `SLACK_LOG` (mensaje, resultado, PE creado) para no crear dos veces el mismo pedido si Slack reintenta.
- **Modo "dry run":** una variable de entorno hace que el bot calcule y muestre todo pero no escriba. Así probamos sin ensuciar la hoja.

---

## 5. Fases de trabajo

| Fase | Quién | Qué | Tiempo estimado |
|---|---|---|---|
| **0. Accesos** | Tú (yo te guío) | Crear la app de Slack, la cuenta de servicio de Google, la API key de Claude. Ver checklist abajo | 30–45 min |
| **1. Núcleo sin Slack** | Yo | Parser + validaciones + escritura. Prueba: le doy el texto de Angel y debe producir exactamente las filas de PE1979 (en modo dry run). Pruebas automáticas de los casos ⚠️ y ❌ | 1–2 días |
| **2. Slack + hoja de pruebas** | Yo, luego tú y 1 asesor | Bot conectado a un canal de prueba, escribiendo en **una copia** de la hoja. Ustedes mandan 10–20 pedidos reales | 1 día + pruebas |
| **3. Producción** | Yo + tú | Apuntar a la hoja real, canal real, todos los asesores. Pestaña `SLACK_LOG`, alertas de error | ½ día |
| **4. Mejoras (opcional)** | Yo | Botón de confirmación, API de AppSheet, "cotización → pedido" (hoja `COTIZACIONES`), editar/cancelar desde Slack | según necesidad |

### Checklist Fase 0 (lo que necesito de ti)

1. **Slack:** crear una app en <https://api.slack.com/apps> → "From scratch". Permisos del bot (OAuth scopes): `channels:history`, `channels:read`, `chat:write`, `reactions:write`, `users:read`. Activar *Event Subscriptions* con el evento `message.channels`. Instalarla en el workspace. Me pasas el **Bot Token** (`xoxb-…`) y el **Signing Secret**. (Te doy una guía con pantallazos cuando apruebes.)
2. **Google:** en <https://console.cloud.google.com> crear un proyecto, activar "Google Sheets API", crear una *cuenta de servicio* y descargar su JSON. Compartir la hoja `BD APP BOLSAS AS COFFE` con el correo de esa cuenta (`xxx@xxx.iam.gserviceaccount.com`) como **Editor**.
3. **Claude:** API key en <https://console.anthropic.com> (prepago, empiezas con $5–10 USD).
4. **Canal** de Slack donde escribirán los asesores (nuevo, por ejemplo `#pedidos`) y el **mapa asesor → VENDEDOR** (ej.: Julián en Slack = `JULIAN`, tú = `DANIELA`, …).
5. **Vercel:** confirmar en qué cuenta/proyecto despliego (ya tienes el conector; si tu página web está ahí, puedo poner el bot en el mismo equipo).
6. Las respuestas de §6.

---

## 6. Reglas de negocio que necesito que confirmes

Marca cada una con tu respuesta (o "OK" si el valor propuesto sirve):

| # | Pregunta | Propuesta por defecto |
|---|---|---|
| 1 | `ESTADO PEDIDO` al crearlo desde Slack | `EN CONSTRUCCIÓN` si el envío está "por confirmar"; `PENDIENTE POR ALISTAR` si ya tiene valor de envío |
| 2 | `ESTADO PAGO` | `PENDIENTE` |
| 3 | `ESTATUS` | `COMPLETADO` (todos los pedidos lo tienen) |
| 4 | `PAGO DEL ENVÍO` cuando el mensaje no lo dice | `PAGO EN BODEGA CON COBRO AL CLIENTE` (el más usado: 724 de 1.486). Si el asesor escribe "contraentrega" → `CONTRAENTREGA` |
| 5 | `BODEGA` | `BGA` (puede cambiar si el asesor escribe "San Gil") |
| 6 | `VENDEDOR` y `USUARIO` | el mismo valor, según quién escribe en Slack (mapa del checklist) |
| 7 | Cliente nuevo: `TIPO CLIENTE`, `CANAL`, `CLIENTE DE` | `FINAL`, `WhatsApp`, = VENDEDOR. Si el precio usado es el de distribuidor → `DISTRIBUIDOR` |
| 8 | Cliente existente con dirección distinta a la del mensaje | Usar la del mensaje en el pedido y **actualizar** la ficha del cliente (¿o no tocarla?) |
| 9 | Precio fuera de lista | No crear; pedir que el asesor responda "crear igual" |
| 10 | Confirmación antes de escribir (✅ en el hilo) | Sí durante las primeras semanas |
| 11 | ¿Tu app AppSheet tiene *bots* que se disparan al crear un pedido (descontar inventario, generar PDF, enviar correo)? | Si sí, evaluamos la API de AppSheet en Fase 4; si no, escribir en la hoja basta |
| 12 | ¿El bot debe aceptar también mensajes sin cotización formateada (texto totalmente libre: "2 paquetes de B01T y 1 de B02P")? | Sí, la IA lo soporta; solo pide confirmación |
| 13 | Campos `MUESTRAS`, `PAGO CONTRAENTREGA`, `RETENCIÓN EN LA FUENTE`, `DESCUENTO` | `NO`, `NO`, `0`, `0` salvo que el asesor lo diga |

---

## 7. Costos estimados (mensual, con 300 pedidos/mes)

| Concepto | Costo |
|---|---|
| Slack app | $0 |
| Google Sheets API + cuenta de servicio | $0 |
| Vercel Hobby | $0. **Nota:** el plan Hobby es para uso no comercial según sus términos; para un negocio lo correcto es Pro ($20/mes). Alternativa gratuita y legítima para uso comercial: Google Cloud Run (misma cuenta Google de la hoja; 2 millones de peticiones gratis al mes). Lo decides tú, el código es el mismo |
| Claude Opus 5.5 (≈1.500 tokens entrada + 300 salida por pedido) | ≈ $3.60 / mes |
| Claude Haiku 4.5 (misma carga) | ≈ $0.90 / mes |
| **Total** | **$1–4 /mes** (+$20 si Vercel Pro) |

---

## 8. Riesgos y cómo los manejo

| Riesgo | Mitigación |
|---|---|
| Dos pedidos al mismo tiempo (AppSheet + Slack) toman el mismo consecutivo | Calcular `MAX+1` en el instante de escribir, releer y reintentar si chocó |
| Slack reenvía el mismo evento (reintentos) | Registro por ID de mensaje en `SLACK_LOG`; el segundo se ignora |
| La IA lee mal un número | La IA no manda: cada cantidad × precio se recalcula y se compara con el subtotal del mensaje; cualquier diferencia → ⚠️ |
| Cambian las columnas de la hoja | El bot lee los encabezados por nombre, no por posición, y avisa si falta uno |
| Escribir en la hoja no dispara bots de AppSheet | Pregunta 11 de §6; adaptador AppSheet API en Fase 4 |
| Hoja pública (hallazgo §2.2.7) | Restringir el acceso; el bot usa su cuenta de servicio |

---

## 9. Revisión del plan tras leer tus dos documentos (2026-10-03, segunda vuelta)

Leí `como-se-registra-un-pedido-web.md` y `base-de-datos-sheets.md`, y además el código
real de la página en el repo `pagina-web-as-coffee-bags` (rama
`claude/as-coffee-bags-astro-hx5i7b`: `src/lib/pedidos.server.mjs`, `scripts/lib/google.mjs`,
`src/lib/slack.server.mjs`, `notas/avisos-de-slack.md`).

**Veredicto: el plan se mantiene. Cambian 5 cosas, y todas lo hacen más barato o más rápido.**

### 9.1 Lo que los documentos confirman del plan (sin cambios)

| Punto del plan | Lo que dicen los documentos / el código |
|---|---|
| Escribir directo en la hoja con cuenta de servicio, sin API de AppSheet | Es exactamente lo que hace la página. Funciona y AppSheet lo lee |
| Cliente: buscar por NIT y crear **antes** del pedido | Igual. "Al revés, AppSheet vería el pedido como inválido" |
| `DETALLES.PE` guarda la KEY completa del pedido | Confirmado: "si se escribe el corto, AppSheet no encuentra el pedido" |
| FOTO, DESCRIPCION, EMPAQUE y COSTO se copian de `PRODUCTOS` | Confirmado |
| Los precios no se toman del mensaje, se verifican contra `PRODUCTOS` | Confirmado: "los precios nunca se toman del navegador" |
| Leer columnas por nombre, no por posición | Confirmado; la página lo hace igual |
| Defaults `EN CONSTRUCCIÓN` + `ESTADO PAGO = PENDIENTE` | Son los que usa la página |
| Avisar en Slack si algo falla, nunca perder el pedido | Misma filosofía ("regla de oro") |

### 9.2 Los 5 ajustes

**1. Reutilizar el código de la página en vez de escribirlo de cero (ahorra 1 día).**
Ya existen y están probados (45 pruebas contra un Google simulado):
- `scripts/lib/google.mjs`: conexión a Google Sheets con cuenta de servicio, sin librerías pesadas.
- `pedidos.server.mjs`: lectura de `PRODUCTOS`, búsqueda/creación de cliente, armado de filas
  en el orden de la cabecera, anexado y el truco del marcador `PENDIENTE-xxxxxx`.
- `slack.server.mjs`: envío de mensajes a Slack.

Copio esos módulos a este repo y solo agrego lo nuevo: leer el mensaje de Slack (IA),
resolver ciudad → código DANE, numeración de `PEDIDOS` y las respuestas en el hilo.

**2. La cuenta de servicio de Google ya existe → Fase 0 se acorta.**
No hay que crear nada en Google Cloud: la hoja ya está compartida con esa cuenta como editor.
Solo necesito el correo de la cuenta (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) y su clave privada.
⚠️ El README de la página dice como pendiente: *"Rotar la clave de la cuenta de servicio
(quedó escrita en un chat)"*. Hay que hacerlo ya: generar una clave nueva en Google Cloud,
ponerla en Wix (`npx wix env set …` + `npm run release`) y en el bot, y borrar la vieja.
Te guío; son 10 minutos.

**3. El alojamiento: la página vive en Wix, no en Vercel.**
Yo asumí Vercel porque tienes el conector. La página se publica con `wix release` y corre en el
servidor de Wix. Para el bot sigo recomendando un servicio **aparte** (Vercel o Google Cloud
Run), por tres razones: (a) Slack exige un endpoint público que responda en menos de 3 segundos
y procese después, cosa que el servidor de Wix no garantiza; (b) así un cambio en el bot no
obliga a republicar la tienda; (c) el bot necesita Node completo (no el entorno "worker" de
Wix). El costo sigue siendo $0 en Cloud Run. Nada cambia en el código de la página.

**4. Regla de precios: adoptar la de la página, que es más exacta que la del plan.**
El plan decía "aceptar el precio si coincide con alguno de la lista". La página calcula el
precio que **corresponde**: menos de 100 unidades de una referencia → `PRECIO CLIENTE FINAL`;
100 o más → `PRECIO CLIENTE FINAL MAYOR 100 UND`; `TIPO CLIENTE = DISTRIBUIDOR` →
`PRECIO DISTRIBUIDOR`. El bot hará lo mismo: si el precio del mensaje coincide con el que
corresponde, crea; si no, avisa ("B01T × 150 und debería ir a $980, no a $1.090") y espera
confirmación del asesor. Con PE1979 (25 und a $1.090) pasa limpio.

**5. Numeración del pedido: la página usa el número de fila; en `PEDIDOS` eso no sirve.**
La página numera `PE057-W` con la fila donde quedó (es a prueba de dos pedidos simultáneos).
En `PEDIDOS` hay 1.486 filas pero el último es PE2009 (se han borrado filas), así que ahí el
número **tiene** que salir de `NUMERO CONSECUTIVO`. Lo que haré: anexar la fila con el marcador
`PENDIENTE-xxxxxx` (anexar es atómico), leer el mayor consecutivo de las filas que quedaron
**arriba** de la mía y sumar 1, y reemplazar el marcador. Dos pedidos del bot nunca chocan.
Queda un riesgo pequeño si alguien crea un pedido en AppSheet en el mismo segundo; lo
detecto releyendo y, si chocó, corrijo el número (ver pregunta 15).

### 9.3 Dos diferencias entre "pedido web" y "pedido de Slack" que debes decidir

Las agrego a la tabla de §6 como preguntas 14 a 16:

| # | Pregunta | Propuesta |
|---|---|---|
| 14 | **Inventario.** La página rechaza el pedido si `INVENTARIO ACTUAL − 300` no alcanza. ¿El bot también rechaza, o solo avisa? | Solo avisa ("⚠️ B02P: quedan 1.522, el pedido lleva 25; reserva de 300") y crea igual, porque los asesores sí pueden preventa. Tú decides |
| 15 | **Dónde escribir.** (A) En `PEDIDOS` con consecutivo normal, como PE1979. (B) En una pestaña nueva `PEDIDOS SLACK` + `DETALLES PEDIDOS SLACK`, numerada `PE0xx-S` como la web, y el equipo la trabaja desde AppSheet igual que la de la web | **A**, que es lo que pediste. B es más aislado y elimina el riesgo de choque de consecutivo, pero obliga a agregar dos tablas a la app |
| 16 | **Recargo contraentrega 7 %.** La web lo calcula y lo anota en `NOTAS`. ¿Aplica a los pedidos de WhatsApp/Slack? | No, salvo que el asesor escriba "contraentrega"; en ese caso copio la misma nota que la web |

### 9.4 Fase 0 revisada (queda más corta)

1. Slack: crear la app (o reutilizar la "AS Coffee Bags" de los avisos, agregándole permisos de bot
   y *Event Subscriptions*). Me pasas Bot Token y Signing Secret.
2. Google: **rotar** la clave de la cuenta de servicio existente y pasarme correo + clave nueva.
3. Claude: API key.
4. Canal de Slack + mapa asesor → VENDEDOR.
5. Respuestas de §6 (preguntas 1 a 16).

Lo demás (§3 flujo, §5 fases, §7 costos, §8 riesgos) sigue igual.

---

## 10. Qué pasa cuando apruebes

1. Me respondes las preguntas de §6 y las dudas del checklist (Fase 0).
2. Te envío la guía corta para crear la app de Slack y la cuenta de servicio (son clics, no código).
3. Arranco Fase 1 en este repo (`claude/eager-newton-ws5vlo`): te muestro el dry run con PE1979 reproducido exactamente.
4. Seguimos con Fases 2 y 3.

---

## 11. Decisiones tomadas y respuestas (2026-10-04, tercera vuelta)

Esta sección **reemplaza** las propuestas de §6 y §9.3 en lo que se contradigan.

### 11.1 Reglas de negocio ya definidas por ti

| # | Regla | Cómo la aplica el bot |
|---|---|---|
| 1 | `ESTADO PEDIDO` | Siempre `EN CONSTRUCCIÓN` |
| 2 | `ESTADO PAGO` | Siempre `PENDIENTE`. El pago lo registra después el asesor en la app o la automatización de pagos de Slack |
| 3 | `ESTATUS` y PDF | Ver §11.2: el pedido debe quedar con el PDF generado en `DOCUMENTO` |
| 4 | `PAGO DEL ENVÍO` | Solo lo que el asesor escriba (`CONTRAENTREGA`, `PAGO EN BODEGA CON COBRO AL CLIENTE`, `PAGO EN BODEGA SIN COBRO AL CLIENTE`). **Cambio 2026-10-05:** la app lo exige (Enum obligatorio), así que si no lo escribe el bot lo **pregunta en el hilo** en vez de dejarlo en blanco |
| 5 | `BODEGA` | `BGA`. Solo cambia a `SAN GIL` si el asesor lo escribe |
| 6 | `VENDEDOR` y `USUARIO` | Según quién envía el mensaje en Slack. Me das la lista "persona de Slack → VENDEDOR" (nombre como aparece en Slack o su correo; con el correo el bot los identifica solo) |
| 7 | Cliente nuevo | **Tipo de cliente** es `FINAL` salvo que el asesor escriba que es distribuidor (2026-10-05). El asesor debe indicar **Canal** (`WhatsApp` / `Instagram` / `Página web`) y **Cliente de** (`ARQUI` / `DANIELA` / `JULIAN`); si falta alguno, el bot lo pregunta en el hilo. **Si el canal es Página Web, Cliente de es siempre DANIELA**, diga lo que diga el asesor (2026-10-05) |
| 8 | Dirección | El pedido siempre lleva la dirección del mensaje. Si el cliente es nuevo, se crea con esa misma dirección. Si ya existe, su ficha **no se toca** |
| 9 | Precios | El asesor **no tiene que escribir el precio**: el bot lo toma de `PRODUCTOS`. El precio de 100 o más unidades es **por referencia** (100 de B01B sí; 50 de B01B + 50 de B01N no, confirmado 2026-10-05). Nunca se crea un pedido con un precio distinto al de la lista **según el tipo de cliente** (FINAL: <100 und precio final, ≥100 precio mayor; DISTRIBUIDOR: precio distribuidor). Si el mensaje trae otro precio o una referencia que no existe: ❌ alerta en Slack y no se crea nada |
| 10 | Confirmación ✅ antes de escribir | Sí |
| 11 | Bots de AppSheet | Existen: genera el PDF y alerta pedido nuevo. Ver §11.2 |
| 12 | Mensaje en texto libre | Se acepta; el bot pregunta todo lo que falte, incluidos los datos del cliente |
| 13 | `MUESTRAS`, `RETENCIÓN EN LA FUENTE`, `DESCUENTO` | `NO`, `0`, `0` salvo que el asesor lo diga |
| 13b | `PAGO CONTRAENTREGA` (la mercancía se paga al recibir) | Siempre `NO`, salvo que el asesor escriba que la mercancía es contraentrega |

### 11.2 El PDF del pedido (ESTATUS → EN PROCESO → bot de AppSheet → COMPLETADO)

Dato clave: **los bots de AppSheet solo se disparan con cambios hechos a través de AppSheet**
(la app o su API). Si el agente escribe la fila directamente en la hoja de Google, AppSheet la
ve, pero su bot de "nuevo pedido" y el del PDF **no corren**. Eso es lo que pasa hoy con los
pedidos de la página web (por eso el equipo los mueve a mano).

Para que el pedido quede con el PDF listo en `DOCUMENTO`, hay dos caminos:

| Camino | Cómo funciona | Qué necesita | Mi recomendación |
|---|---|---|---|
| **A. API de AppSheet (recomendado)** | El agente crea el cliente, el pedido y los detalles **a través de la API de AppSheet** en vez de la hoja. Para AppSheet es como si un usuario los hubiera creado: se disparan los bots (alerta de pedido nuevo y PDF), se aplican los valores iniciales de la app (KEY, consecutivo) y se respetan las validaciones. Luego el agente pone `ESTATUS = EN PROCESO` por la misma API, el bot genera el PDF y lo deja en `COMPLETADO` | Plan **Core** o superior de AppSheet. Como ya tienes bots, ya estás en Core, así que solo hay que **activar la API**: editor de la app → *Settings* → *Integrations* → *Enable* y copiar el *App Id* y la *Application Access Key* | ✅ Es el camino limpio: cero duplicación de lógica, el consecutivo lo asigna AppSheet (se acaba el riesgo de choque de §9.2) y las alertas que ya tienes funcionan solas |
| B. Hoja + bot programado | El agente escribe en la hoja con `ESTATUS = EN PROCESO`, y en AppSheet se crea un bot **programado** (cada 5 min, por ejemplo) que busque pedidos en ese estado y ejecute la misma acción del PDF | Crear un bot programado en AppSheet | Funciona, pero el PDF tarda hasta 5 min y hay que mantener dos lógicas (la del bot y la de la app) |

Con el camino A el diagrama de §4 cambia en una sola flecha: las **lecturas** (PRODUCTOS,
CLIENTES, MUNICIPIOS) siguen por Google Sheets API, y las **escrituras** (CLIENTES, PEDIDOS,
DETALLES PEDIDO, cambio de ESTATUS) van por la API de AppSheet. El costo no cambia.

**Lo que necesito de ti para esto:** activar la API en la app y pasarme el App Id y la Access
Key. Y confirmarme el nombre exacto de la acción que pasa `ESTATUS` a `EN PROCESO` (o si basta
con escribir ese valor en la columna para que el bot arranque).

### 11.3 Pruebas seguras sin tocar la hoja original

Tres capas, de la más aislada a la más real:

1. **Pruebas automáticas sin Google ni Slack.** Igual que `npm run probar` de la página: un Google
   simulado en memoria. Corren en segundos y las uso en cada cambio. Aquí reproduzco PE1979 y
   todos los casos ⚠️ y ❌.
2. **Hoja de pruebas.** Haces *Archivo → Hacer una copia* de `BD APP BOLSAS AS COFFE` y la
   llamas `BD PRUEBAS BOT` (quedan los 769 clientes y el catálogo real, pero es otra hoja).
   La compartes con la cuenta de servicio. El bot tiene una variable `HOJA_ID`: en pruebas
   apunta a la copia, en producción a la original.
3. ~~App de pruebas.~~ **Descartado (2026-10-04):** duplicar la app es demasiado trabajo. Se
   prueba contra la app real con el paso de confirmación ✅ y uno o dos clientes de prueba que
   luego se borran desde la app. Mientras la empresa no está operando, no hay riesgo de mezclar
   pedidos reales. Por la misma razón la copia de la hoja (punto 2) pasa a ser opcional.
4. **Canal de pruebas** `#pedidos-pruebas` en Slack. El bot solo escucha el canal que tenga
   configurado.

Pasar a producción = cambiar 1 variable (`SLACK_CANAL`) y borrar los pedidos y clientes de prueba
desde la app.

### 11.4 Formato de mensaje recomendado para los asesores

El bot entiende texto libre, pero con este formato **nunca** tendrá que preguntar. Las líneas
con `*` son obligatorias; las demás, si faltan, el bot usa el valor por defecto o pregunta.

```
PEDIDO
* Cliente: Angel Maria Gaitan Pulido
  Marca: (opcional)
* NIT/CC: 93287888
* Celular: 3007567875
* Dirección: Carrera 12 # 69-158 conjunto Balcones del Bosque torre 8 apartamento 201
* Ciudad: Ibagué, Tolima
* Tipo de cliente: FINAL              (FINAL o DISTRIBUIDOR; solo si es cliente nuevo)
* Canal: WhatsApp                     (WhatsApp, Instagram o Página web; solo si es cliente nuevo)
* Cliente de: ARQUI                   (ARQUI, DANIELA o JULIAN; solo si es cliente nuevo)
  Pago del envío: Pago en bodega con cobro al cliente   (o Contraentrega, o Pago en bodega sin cobro; vacío = el bot avisa)
  Valor del envío: por confirmar      (o el valor, ej. 18500)
  Pago contraentrega: NO              (SI solo si la mercancía se paga al recibir)
  Bodega: BGA                         (o SAN GIL)
  Descuento: 0
  Muestras: NO
  Notas despacho: (lo que deba saber bodega)
* Productos:
  * B01TG — 25 und × $1.090
  * B01T — 25 und × $1.090
  * B02T — 25 und × $1.450
  * B02P — 25 und × $1.450
```

Notas:
- El bloque de productos puede ir **pegado tal cual sale de la cotización** (con descripción y
  subtotal); el bot solo usa referencia, cantidad y precio y recalcula lo demás.
- "Ciudad" acepta `Ibagué`, `Ibagué, Tolima` o `Ibague Tolima`; el bot busca el código DANE en
  `MUNICIPIOS` y, si hay dos municipios con el mismo nombre (p. ej. hay varios "San José"),
  pregunta cuál.
- Si el cliente **ya existe** (por NIT o celular), Tipo de cliente, Canal y Cliente de se toman
  de su ficha y no hace falta escribirlos.
- Te entrego este formato como *snippet* o mensaje fijado en el canal para que lo copien.

### 11.5 ¿El bot sabe de qué pedido le están respondiendo si hay varios en cola?

Sí, y sin ambigüedad, gracias a cómo funciona Slack:

1. Cada mensaje de pedido que publica un asesor es un mensaje "raíz" con un identificador único
   (Slack lo llama `ts`). El bot **siempre responde en el hilo** de ese mensaje.
2. Cuando el asesor contesta dentro del hilo ("Ibagué"), Slack le manda al bot esa respuesta
   **junto con el identificador del mensaje raíz**. Así el bot sabe exactamente a qué pedido
   pertenece, aunque haya 10 pedidos pendientes de 3 asesores distintos.
3. El bot guarda el estado de cada pedido pendiente (lo que ya entendió y lo que falta) en la
   pestaña `SLACK_LOG`, con la llave = identificador del hilo. Si el servicio se reinicia, no
   pierde nada.
4. Si alguien responde en el canal y no en el hilo, el bot contesta: "Respóndeme en el hilo del
   pedido de *Angel Maria Gaitan*" para que no se mezclen.
5. Un pedido pendiente que nadie complete en 24 h se marca como `ABANDONADO` en `SLACK_LOG` y el
   bot lo avisa en el hilo; nunca se crea a medias.

Ejemplo con dos pedidos en cola:

```
#pedidos
├─ [Julián] PEDIDO · Angel Maria Gaitan … (sin ciudad)
│   └─ [bot] ⚠️ Me falta: Ciudad de envío. Respóndeme aquí.
│   └─ [Julián] Ibagué
│   └─ [bot] Resumen … ¿Creo el pedido? Reacciona ✅
│   └─ [Julián] ✅
│   └─ [bot] ✅ Pedido PE2010 creado · PDF en proceso
└─ [Daniela] PEDIDO · Café La Montaña … (sin pago del envío)
    └─ [bot] Resumen … ⚠️ No aclaraste el pago del envío; quedará en blanco. ¿Creo el pedido?
    └─ [Daniela] ✅
    └─ [bot] ✅ Pedido PE2011 creado · PDF en proceso
```

### 11.6 Qué queda pendiente de tu lado (Fase 0 definitiva)

1. Activar la API de AppSheet y pasarme *App Id* + *Access Key* (de la app de pruebas primero).
2. Hacer la copia de la hoja (`BD PRUEBAS BOT`) y la copia de la app con datos.
3. Crear la app de Slack con permisos de bot (o ampliar la de los avisos) y el canal
   `#pedidos-pruebas`. Pasarme Bot Token y Signing Secret.
4. Rotar la clave de la cuenta de servicio de Google y pasármela.
5. API key de Claude.
6. Lista "persona de Slack (nombre o correo) → VENDEDOR".
7. Nombre de la acción de AppSheet que pasa `ESTATUS` a `EN PROCESO`.

### 11.7 Aprobación y datos recibidos (2026-10-04)

- **Plan aprobado.**
- Acción de AppSheet para el PDF: **Generar PDF**, en la tabla PEDIDOS.
- Mapa de asesores: JULIAN RODRIGUEZ → JULIAN · Arqui Sandoval → ARQUI · Daniela Ochoa → DANIELA.
- API key de Claude recibida por chat (no se guarda en el repo; va como secreto del servidor; se
  recomienda rotarla cuando el bot esté en marcha).
- Guía de configuración para AppSheet, Slack y Google: [`GUIA-CONFIGURACION.md`](GUIA-CONFIGURACION.md).
