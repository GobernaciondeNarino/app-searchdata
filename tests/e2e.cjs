/**
 * Prueba de punta a punta del Pulpo de datos (no se despliega).
 *   BASE=http://localhost:8080/app/octadata/ DATOS=/var/www/html/app/octadata/datos \
 *   API=http://127.0.0.1:8090/api/v1 node tests/e2e.cjs [carpeta-capturas]
 * Requiere: la app recién desplegada (sin datos/config.php) y tests/mock-api.php en marcha.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:8080/app/octadata/';
const DATOS = process.env.DATOS || '/var/www/html/app/octadata/datos';
const API = process.env.API || 'http://127.0.0.1:8090/api/v1';
const CAPTURAS = process.argv[2] || '';
const CLAVE_ADMIN = 'Admin-Prueba-2026!';
const CLAVE_PANTALLA = 'pantalla-1234';
let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) fallos++; };
const php = code => execFileSync('php', ['-r', code], { encoding: 'utf8' });

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', e => errores.push(String(e)));
  const foto = async nombre => { if (CAPTURAS) await page.screenshot({ path: path.join(CAPTURAS, nombre + '.png') }); };

  /* 1. Sin barra final y sin instalar: termina en el token de instalación */
  await page.goto(BASE.replace(/\/$/, ''));
  ok(page.url() === BASE + 'instalar.php', `redirige al asistente dentro del subdirectorio (${page.url()})`);
  ok(await page.getByRole('heading', { name: 'Token de instalación' }).isVisible(), 'pide el token interno de instalación');
  await foto('01-token');

  /* 2. Token incorrecto y luego el correcto, leído del servidor */
  await page.fill('#token', 'AAAAA-BBBBB-CCCCC-DDDDD');
  await page.click('button:has-text("Comenzar")');
  ok(await page.locator('.alerta.error').isVisible(), 'rechaza un token incorrecto');
  const token = php(`echo include '${DATOS}/token-instalacion.php';`).trim();
  ok(/^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/.test(token), `el archivo del token tiene el formato esperado (${token.slice(0, 5)}…)`);
  await page.fill('#token', token.toLowerCase());
  await page.click('button:has-text("Comenzar")');
  ok(page.url().endsWith('instalar.php?paso=1'), 'el token correcto abre el paso 1');

  /* 3. Requisitos */
  const filas = await page.locator('table tr').allInnerTexts();
  ok(filas.some(f => /bloqueada desde la web.*bloqueada/s.test(f)), 'la sonda HTTP confirma que datos/ está bloqueada');
  ok(filas.some(f => /\.htaccess.*presentes/s.test(f)), 'detecta los .htaccess');
  await foto('02-requisitos');
  await page.click('button[value=siguiente]');

  /* 4. API de eventos */
  await page.fill('#api_base', API);
  await page.fill('#api_token', 'TOKEN-PRUEBA-123');
  await page.click('button[value=probar]');
  const msgApi = await page.locator('.alerta').innerText();
  ok(/Conexión correcta/.test(msgApi) && /152 inscripciones/.test(msgApi), `«Probar conexión» funciona: ${msgApi.split('\n')[0]}`);
  await foto('03-api');
  await page.click('button[value=siguiente]');
  ok(page.url().endsWith('paso=3'), 'avanza a ElevenLabs');
  await page.click('button[value=siguiente]');
  await page.click('button[value=siguiente]');
  ok(page.url().endsWith('paso=5'), 'ElevenLabs y Gemini son opcionales');

  /* 5. Experiencia + clave de pantalla */
  await page.fill('#pantalla', 'corta');
  await page.$eval('#pantalla', el => el.removeAttribute('minlength'));   // probar la validación del servidor
  await page.click('button[value=siguiente]');
  ok(/al menos 8/.test(await page.locator('.alerta').innerText()), 'exige clave de pantalla de 8 caracteres');
  await page.fill('#pantalla', CLAVE_PANTALLA);
  await page.click('button[value=siguiente]');
  ok(page.url().endsWith('paso=6'), 'paso 5 guardado');

  /* 6. Administración */
  ok(/con clave/.test(await page.locator('table.resumen').innerText()), 'el resumen muestra la pantalla con clave');
  await page.fill('#clave1', CLAVE_ADMIN);
  await page.fill('#clave2', CLAVE_ADMIN);
  await foto('04-resumen');
  await page.click('button[value=siguiente]');
  ok(await page.getByRole('heading', { name: 'Instalación completa' }).isVisible(), 'instalación completa');
  await foto('05-fin');

  /* 7. Almacenamiento */
  const cfg = JSON.parse(php(`echo json_encode(include '${DATOS}/config.php');`));
  ok(cfg.api_token === 'TOKEN-PRUEBA-123' && cfg.api_base === API, 'config.php guarda la API y el token');
  ok(/^\$2y\$/.test(cfg.admin_hash) && /^\$2y\$/.test(cfg.pantalla_hash), 'contraseñas guardadas como hash bcrypt');
  ok(/^[0-9a-f]{64}$/.test(cfg.secreto), 'genera la clave interna de firmas');
  ok(!fs.existsSync(`${DATOS}/token-instalacion.php`), 'el token de instalación se borró');
  const modo = (fs.statSync(`${DATOS}/config.php`).mode & 0o777).toString(8);
  ok(modo === '640', `config.php con permisos 0640 (${modo})`);

  /* 8. Pantalla con clave */
  await page.goto(BASE);
  ok(await page.locator('#clave').isVisible(), 'la pantalla pide su clave');
  await page.fill('#clave', 'otra-clave-x');
  await page.click('button:has-text("Abrir")');
  ok(await page.locator('.error').isVisible(), 'rechaza una clave de pantalla incorrecta');
  await page.fill('#clave', CLAVE_PANTALLA);
  await page.click('button:has-text("Abrir")');
  await page.click('#btnIniciar');
  await page.waitForFunction(() => document.querySelector('#nTot').textContent === '152', null, { timeout: 15000 });
  ok(true, 'carga las 152 personas a través de api.php');
  await page.waitForTimeout(4000);
  await foto('06-pantalla');

  /* 9. Búsqueda táctil */
  await page.click('#btnBuscar');
  await page.fill('#buscadorInput', 'maria erazo');
  await page.press('#buscadorInput', 'Enter');
  await page.waitForSelector('#tarjeta:not([hidden])', { timeout: 5000 });
  ok(/María Fernanda Erazo Pantoja/.test(await page.locator('#tNombre').innerText()), 'la lupa busca y muestra la tarjeta');
  await page.waitForTimeout(800);
  await foto('07-tarjeta');

  /* 10. Minimización de datos */
  const datos = await page.evaluate(async () => {
    const r = await fetch('api.php?accion=datos', { headers: { 'X-Pulpo-Pase': window.PULPO_CONFIG.pase } });
    return r.json();
  });
  const crudo = JSON.stringify(datos);
  ok(!/1085 123 456|documento|correo|ejemplo\.co/.test(crudo), 'no salen documento, correo ni documentos escritos como entidad');
  ok(datos.personas.every(p => p.carnet === ''), 'el carné no sale si la plantilla de fotos no lo usa');

  /* 11. Controles de acceso, sin cookies ni pase */
  const pide = async (ruta, opc = {}) => (await fetch(BASE + ruta, opc)).status;
  ok(await pide('api.php?accion=datos') === 401, 'api.php sin pase → 401');
  ok(await pide('api.php?accion=datos', { headers: { 'X-Pulpo-Pase': '9999999999.' + 'a'.repeat(64) } }) === 401, 'api.php con pase falsificado → 401');
  for (const r of ['datos/config.php', 'datos/cache/datos.json.php', 'inc/funciones.php', '.git/config', '.claude/skills/playwright-cli/SKILL.md', 'README.md', 'skills-lock.json', 'tests/e2e.cjs']) {
    const s = await pide(r);
    ok(s === 403 || s === 404, `${r} bloqueado (${s})`);
  }
  const cab = (await fetch(BASE + 'instalar.php')).headers;
  ok(/script-src 'none'/.test(cab.get('content-security-policy') || ''), 'el asistente envía CSP sin scripts');
  ok((cab.get('set-cookie') || '').includes('path=/app/octadata/'), `la cookie de sesión queda limitada al subdirectorio`);

  /* 12. Fuerza bruta: el límite es por IP aunque se cambie de sesión */
  let bloqueado = false;
  for (let i = 0; i < 10 && !bloqueado; i++) {
    const c2 = await browser.newContext();
    const p2 = await c2.newPage();
    await p2.goto(BASE + 'instalar.php');
    await p2.fill('#clave', 'incorrecta-' + i);
    await p2.click('button:has-text("Ingresar")');
    bloqueado = /Demasiados intentos/.test(await p2.locator('.alerta').innerText());
    await c2.close();
  }
  ok(bloqueado, 'bloquea el ingreso tras 8 intentos fallidos por IP');

  /* 13. Errores de consola (CSP, scripts) */
  const reales = errores.filter(e => !/Failed to load resource.*(401|403)/.test(e));
  ok(reales.length === 0, `sin errores en consola${reales.length ? ': ' + reales.slice(0, 3).join(' | ') : ''}`);

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobaciones fallaron` : '\nTodas las comprobaciones pasaron');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
