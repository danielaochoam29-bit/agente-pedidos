# Guía de configuración paso a paso (lo que haces tú, sin código)

Son tres bloques: **AppSheet**, **Slack** y **Google**. Cada uno te da una o dos "llaves" que
me pasas por chat. Tiempo total: 20 a 30 minutos.

> Regla de oro: las llaves (tokens, claves, secretos) **nunca** van al repositorio ni a un
> canal de Slack. Me las pasas por este chat y yo las guardo como variables secretas del
> servidor. Si una llave se filtra, se revoca y se crea otra.

---

## Bloque 1 · AppSheet: activar la API (5 minutos)

La API permite que el bot cree clientes, pedidos y detalles **como si fuera un usuario de la
app**. Así se disparan tus bots (alerta de pedido nuevo y la acción *Generar PDF*).

1. Entra a <https://www.appsheet.com/> con la cuenta dueña de la app (`ascoffee.col@gmail.com`).
2. En **My apps**, abre la app de bolsas y entra al **editor** (botón de lápiz).
3. En el menú de la izquierda, abajo, pulsa el **engranaje ⚙ Settings**.
4. Pestaña **Integrations**.
5. Busca la sección **IN: from cloud services to your app** (a veces se llama *API*).
6. Activa el interruptor **Enable**.
7. Ahí aparece el **App Id** (un texto largo tipo `a1b2c3d4-…`). Cópialo.
8. Pulsa **Create Application Access Key**. Aparece una clave larga. Cópiala.
   Si no la copias en ese momento, puedes crear otra después.
9. Pulsa **Save** arriba a la derecha.

**Me pasas:** `App Id` y `Application Access Key`.

También verifica (solo mirar, sin cambiar):

10. En **Data** → tabla **PEDIDOS**, confirma que la acción **Generar PDF** existe con ese nombre
    exacto (en **Behavior** → **Actions**, filtrando por la tabla PEDIDOS). El bot la invocará
    por nombre a través de la API.
11. En **Automation**, mira el bot que genera el PDF: ¿su evento es "Adds only", "Updates only"
    o "Adds and updates" sobre PEDIDOS, y tiene alguna condición (por ejemplo
    `[ESTATUS] = "EN PROCESO"`)? Mándame una captura de pantalla de esa condición; con eso sé
    exactamente qué debe escribir el bot para que se dispare.

> ¿Y si "Enable" aparece gris o pide subir de plan? Entonces la app no está en plan Core.
> No pasa nada: volvemos al plan B (escribir en la hoja y un bot programado en AppSheet que
> genere los PDF). Avísame y lo ajusto.

---

## Bloque 2 · Slack: crear la app del bot (10 minutos)

### 2.1 Crear la app

1. Entra a <https://api.slack.com/apps> con tu cuenta de Slack.
2. **Create New App** → **From scratch**.
3. App Name: `Agente Pedidos`. Workspace: el de AS Coffee Bags. **Create App**.

### 2.2 Permisos del bot

4. Menú izquierdo → **OAuth & Permissions**.
5. Baja hasta **Scopes** → **Bot Token Scopes** → **Add an OAuth Scope**. Agrega estos, uno por uno:

   | Scope | Para qué |
   |---|---|
   | `channels:history` | leer los mensajes del canal de pedidos |
   | `channels:read` | saber en qué canal está |
   | `groups:history` | leer si el canal es privado |
   | `chat:write` | responder en los hilos |
   | `reactions:read` | ver el ✅ de confirmación |
   | `reactions:write` | poner 👀 cuando recibe un pedido |
   | `users:read` | saber quién escribió (para VENDEDOR) |
   | `users:read.email` | identificar al asesor por su correo |

### 2.3 Instalar y copiar las llaves

6. Sube al inicio de **OAuth & Permissions** → **Install to Workspace** → **Allow**.
7. Aparece el **Bot User OAuth Token**, empieza por `xoxb-`. Cópialo.
8. Menú izquierdo → **Basic Information** → sección **App Credentials** → **Signing Secret**
   → **Show** → cópialo.

**Me pasas:** `Bot User OAuth Token` (xoxb-…) y `Signing Secret`.

### 2.4 El canal

9. En Slack crea el canal **`#pedidos-pruebas`** (público, es más simple).
10. Dentro del canal escribe `/invite @Agente Pedidos` para que el bot pueda leerlo.
11. Cuando pasemos a producción, haremos lo mismo con el canal definitivo (`#pedidos`).

### 2.5 Eventos (este paso va DESPUÉS, cuando yo te dé una URL)

Slack necesita saber a dónde enviar los mensajes. Esa dirección existe solo cuando el bot
esté desplegado. Cuando te la mande, haces:

12. Menú izquierdo → **Event Subscriptions** → **Enable Events** (interruptor).
13. En **Request URL** pegas la URL que te doy. Slack muestra **Verified ✓**.
14. **Subscribe to bot events** → **Add Bot User Event**: `message.channels`,
    `message.groups`, `reaction_added`.
15. **Save Changes**. Si Slack pide **reinstalar la app**, acepta.

---

## Bloque 3 · Google: la cuenta de servicio (ya existe)

El bot **lee** PRODUCTOS, CLIENTES y MUNICIPIOS directamente de la hoja con la misma cuenta de
servicio que usa la página web. No hay que crear nada nuevo.

Opción rápida (la de hoy):

1. Las dos variables ya están guardadas en Wix para la página:
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`. Quien las puso (o el JSON original
   descargado de Google Cloud) las tiene. Me pasas las dos.

Opción correcta (cuando tengas 10 minutos, porque la clave actual quedó en un chat):

2. <https://console.cloud.google.com> → proyecto de la página → **IAM y administración** →
   **Cuentas de servicio** → la cuenta `…@….iam.gserviceaccount.com` → pestaña **Claves** →
   **Agregar clave** → **Crear clave nueva** → JSON → se descarga un archivo.
3. Me pasas el contenido del JSON (tiene `client_email` y `private_key`).
4. Actualizas la página: `npx wix env set GOOGLE_PRIVATE_KEY "…"` y `npm run release`.
5. Borras la clave vieja en la misma pantalla de **Claves**.

> Si prefieres no tocar Google por ahora: el bot también puede **leer** las tablas por la API
> de AppSheet (acción *Find*). Es un poco más lento pero funciona igual. Dímelo y lo configuro
> así.

---

## Bloque 4 · Claude

Ya me pasaste la clave. Queda como variable secreta del servidor. Recuerda revocarla y crear
otra cuando el bot esté en marcha, porque quedó escrita en el chat.

---

## Resumen de lo que me envías

| Llave | De dónde |
|---|---|
| AppSheet **App Id** | Bloque 1, paso 7 |
| AppSheet **Application Access Key** | Bloque 1, paso 8 |
| Captura de la condición del bot del PDF | Bloque 1, paso 11 |
| Slack **Bot User OAuth Token** (`xoxb-…`) | Bloque 2, paso 7 |
| Slack **Signing Secret** | Bloque 2, paso 8 |
| Google `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` (o el JSON) | Bloque 3 |

Mapa de asesores (ya definido):

| Persona en Slack | VENDEDOR / USUARIO |
|---|---|
| JULIAN RODRIGUEZ | JULIAN |
| Arqui Sandoval | ARQUI |
| Daniela Ochoa | DANIELA |

---

## Cómo haremos las pruebas (sin copiar la app)

1. Yo pruebo primero en seco: el bot calcula todo y me muestra las filas, sin escribir.
2. En `#pedidos-pruebas` envías un pedido con un cliente de prueba (por ejemplo
   `CLIENTE PRUEBA BOT`, NIT `999999999`, celular `3000000000`). El bot pide confirmación ✅
   antes de escribir; hasta que no reaccionas, no toca nada.
3. Revisamos en la app que el pedido, los detalles, el cliente y el PDF quedaron bien.
4. Borramos el pedido y el cliente de prueba desde la app.
5. Repetimos una vez con un caso de error (referencia inexistente, ciudad faltante).
6. Pasamos al canal definitivo.
