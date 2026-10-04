/**
 * Acceso de sólo lectura a Google Sheets con la cuenta de servicio.
 * Adaptado de scripts/lib/google.mjs del repo pagina-web-as-coffee-bags:
 * firma el JWT a mano con WebCrypto para no traer la librería googleapis.
 */

import { RANGOS } from './config.mjs';

const LECTURA = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export function credenciales(env = process.env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const clave = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return email && clave ? { email, clave } : null;
}

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const aJson = (obj) => base64url(new TextEncoder().encode(JSON.stringify(obj)));
function pemADer(pem) {
  const bin = atob(pem.replace(/-----[^-]+-----|\s+/g, ''));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function pedirToken({ email, clave }, scopes = [LECTURA]) {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = aJson({ alg: 'RS256', typ: 'JWT' });
  const cuerpo = aJson({ iss: email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 });
  const llave = await crypto.subtle.importKey('pkcs8', pemADer(clave), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(`${cabecera}.${cuerpo}`))));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecera}.${cuerpo}.${firma}` }),
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

export async function leerRango(hojaId, token, rango) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${hojaId}/values/${encodeURIComponent(rango)}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).values ?? [];
}

/** Lee PRODUCTOS, CLIENTES y MUNICIPIOS de la hoja. Devuelve { PRODUCTOS, CLIENTES, MUNICIPIOS }. */
export async function leerTablas(hojaId = process.env.HOJA_ID, creds = credenciales()) {
  if (!creds) throw new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY.');
  const token = await pedirToken(creds);
  const [PRODUCTOS, CLIENTES, MUNICIPIOS] = await Promise.all(
    [RANGOS.PRODUCTOS, RANGOS.CLIENTES, RANGOS.MUNICIPIOS].map((r) => leerRango(hojaId, token, r)),
  );
  return { PRODUCTOS, CLIENTES, MUNICIPIOS };
}
