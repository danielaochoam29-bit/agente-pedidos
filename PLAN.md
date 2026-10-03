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
6. **El repo está vacío.** Mencionas que subiste cómo se registran los pedidos de la página web, pero en GitHub el repositorio `agente-pedidos` no tiene commits. No bloquea el plan: vi directamente las hojas `PEDIDOS PAGINA WEB` / `DETALLES PEDIDOS PAGINA WEB` (pedidos `PE001-W`… `PE014-W`) y el canal `#pedidos-pagina-web` donde tu página ya publica los pedidos con un formato fijo. Si ese código existe, súbelo o pásamelo: me sirve para reutilizar la conexión con la hoja.
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

## 9. Qué pasa cuando apruebes

1. Me respondes las preguntas de §6 y las dudas del checklist (Fase 0).
2. Te envío la guía corta para crear la app de Slack y la cuenta de servicio (son clics, no código).
3. Arranco Fase 1 en este repo (`claude/eager-newton-ws5vlo`): te muestro el dry run con PE1979 reproducido exactamente.
4. Seguimos con Fases 2 y 3.
