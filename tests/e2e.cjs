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
const TMP = php('echo sys_get_temp_dir();').trim();
const LOG_API = TMP + '/mock-api-auth.log', LOG_JEV = TMP + '/mock-jev.log';
for (const f of [LOG_API, LOG_JEV]) { try { fs.unlinkSync(f); } catch (_) {} }
const JEV = API.replace(/\/api\/v1$/, '/jev/v1');

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
  ok(page.url().endsWith('paso=4'), 'ElevenLabs es opcional');
  await page.fill('#jev_key', 'JEV-PRUEBA');
  await page.fill('#jev_base', JEV);
  await page.click('button[value=probar]');
  ok(/Jev responde/.test(await page.locator('.alerta').innerText()), '«Probar conexión» valida la clave de Jev');
  await page.click('button[value=siguiente]');
  ok(page.url().endsWith('paso=5'), 'paso de IA guardado (Gemini opcional)');

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
  const nube = await page.evaluate(() => ({ n: S.lista.filter(p => !p.placed).length, ancho: Math.max(...S.lista.map(p => Math.abs(p.actual.x))) / RE(), anillos: S.lista.every(p => p.nube.r > 1.05), lineas: LIN.v, octo: octo.brazos.length, cortos: 'cortos' in octo }));
  const nubeOk = nube.n === 152 && nube.anillos && nube.ancho > 1.1 && nube.lineas > 0.9;
  ok(nubeOk, `antes de organizar, los ${nube.n} datos esperan en anillos alrededor de la esfera y las líneas se ven${nubeOk ? '' : ' ' + JSON.stringify(nube)}`);
  ok(nube.octo === 8 && !nube.cortos && await page.evaluate(() => octo.cuentas.geometry.attributes.position.count === 8 * (NV + NE)), 'el pulpo tiene solo 8 tentáculos, con ventosas y estela de puntos');
  ok(await page.evaluate(() => S.nodos.every(n => !n.vis) && S.niveles.join() === 'municipio,entidad,perfil'), 'antes de empezar la esfera está vacía; los niveles son municipio → entidad → perfil');
  await page.waitForFunction(() => S.red.fase === 'construye' && S.red.nivel === 1, null, { timeout: 20000 });
  const red1 = await page.evaluate(() => ({ munis: S.nodos.filter(n => n.nivel === 0 && n.tipo === 'grupo').every(n => n.vis), personas: S.colocados }));
  ok(red1.munis && red1.personas === 0, 'primero coloca todos los municipios (nodos principales), sin ubicar personas');
  await page.waitForFunction(() => S.red.fase === 'lista', null, { timeout: 30000 });
  await page.waitForTimeout(1200);   // la última línea termina de crecer
  const red2 = await page.evaluate(() => ({ orden: S.red.orden.join(), antes: S.red.colocadosAntes, faltan: S.nodos.filter(n => n.tipo === 'grupo' && !(n.vis && n.enlace > 0.99)).length }));
  const red2Ok = red2.orden === '0,1,2' && red2.antes === 0 && red2.faltan === 0;
  ok(red2Ok, `luego conecta entidades y perfiles con su padre (niveles ${red2.orden}) y solo después ubica a las personas${red2Ok ? '' : ' ' + JSON.stringify(red2)}`);
  await foto('05b-red-construida');
  await page.waitForFunction(() => S.colocados > 3, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const lin = await page.evaluate(() => ({ v: LIN.v, modo: S.modo, quedan: LIN.quedan, arranque: S.arranque - performance.now(), col: S.colocados }));
  ok(lin.v < 0.1, `al organizar se ocultan las líneas de la esfera${lin.v < 0.1 ? '' : ' ' + JSON.stringify(lin)}`);
  ok(await page.evaluate(() => { let m = 0; for (const b of octo.brazos) { const a = b.geo.attributes.position.array; for (let i = 0; i < a.length; i += 3) m = Math.max(m, Math.hypot(a[i], a[i + 1], a[i + 2]) / RE()); } return m; }) < 1.05, 'los tentáculos toman los datos desde el borde, sin salir de la esfera');
  await page.waitForTimeout(2000);
  await foto('06-pantalla');

  /* 9. Búsqueda táctil y panel lateral */
  await page.click('#btnBuscar');
  await page.fill('#buscadorInput', 'maria erazo');
  await page.press('#buscadorInput', 'Enter');
  await page.waitForSelector('#panel:not([hidden])', { timeout: 5000 });
  ok(/María Fernanda Erazo Pantoja/.test(await page.locator('#pNombre').innerText()), 'la lupa busca y abre el panel lateral');
  ok(await page.locator('#tVincular, button:has-text("Vincular")').count() === 0, 'ya no existe el botón «Vincular mi rostro»');
  ok(/Departamento/.test(await page.locator('#pDatos').innerText()), 'el panel muestra los detalles (departamento, ingresos…)');
  await page.waitForTimeout(800);
  const medidor = await page.locator('#pMedidor').innerText();
  ok(parseInt(medidor.replace(/\D+/g, ''), 10) >= 80 && await page.locator('#pFoto.con-foto').count() === 1, `con ${medidor.replace(/\s+/g, ' ')} el panel muestra la foto`);
  ok(await page.evaluate(() => BIN.filas.some(f => f.luz && f.p && /ERAZO/.test(f.cab))), 'el fondo de unos y ceros ilumina el nombre encontrado');
  ok(await page.evaluate(() => { const c = $('#binario').getContext('2d').getImageData(0, 0, 300, innerHeight).data; let n = 0; for (let i = 3; i < c.length; i += 4) if (c[i]) n++; return n > 2000; }), 'los bits de los nombres se dibujan al fondo, a la izquierda');
  await foto('07-panel');
  await page.keyboard.press('Escape');
  await page.click('#btnBuscar');
  await page.fill('#buscadorInput', 'maria pantoja');
  await page.press('#buscadorInput', 'Enter');
  await page.waitForSelector('#pCoinc:not([hidden])', { timeout: 5000 });
  const nCoinc = await page.locator('#pCoincLista li').count();
  ok(nCoinc >= 2, `muestra las coincidencias al pie del panel (${nCoinc})`);
  const t0 = await page.$eval('#pCoincLista', el => el.style.transform);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2900);
  ok(t0 !== await page.$eval('#pCoincLista', el => el.style.transform), 'las coincidencias se deslizan solas');
  await foto('08-coincidencias');
  await page.hover('#pCoinc h3');   // al pasar el puntero el carrusel se detiene, como haría una persona
  await page.waitForTimeout(700);
  await page.locator('#pCoincLista li button').nth(await page.evaluate(() => PANEL.idx)).click();   // la tarjeta visible
  ok(/pantoja/i.test(await page.locator('#pNombre').innerText()), 'tocar una coincidencia la enfoca');
  await page.keyboard.press('Escape');
  await page.click('#btnBuscar'); await page.fill('#buscadorInput', 'pantoja'); await page.press('#buscadorInput', 'Enter');
  await page.waitForSelector('#panel.solo-lista:not([hidden])', { timeout: 5000 });
  ok(await page.locator('#pDecision').isVisible() && /mostrar opciones/.test(await page.locator('#pDecision').innerText()), 'si Jev duda (muchos «Pantoja»), ofrece la lista en vez de elegir');
  await page.keyboard.press('Escape');

  /* 9b. Organizar por voz o texto */
  const orden = async texto => { await page.click('#btnBuscar'); await page.fill('#buscadorInput', texto); await page.press('#buscadorInput', 'Enter'); await page.waitForTimeout(400); };
  await orden('organiza por municipio');
  ok(await page.evaluate(() => S.niveles[0]) === 'municipio' && /Organizado por municipio/.test(await page.locator('#avisoTexto').innerText()), '«organiza por municipio» reorganiza la esfera');
  await page.waitForTimeout(2500);
  await foto('09-organiza-municipio');
  await orden('agrúpalos por departamento y entidad');
  ok(JSON.stringify(await page.evaluate(() => S.niveles)) === '["departamento","entidad","municipio"]', 'entiende dos características en orden');
  await orden('ordénalos por género');
  ok(/no envía el género/.test(await page.locator('#avisoTexto').innerText()), 'avisa que la API no trae género');
  await orden('vista inicial');
  ok(await page.evaluate(() => S.niveles.join()) === 'municipio,entidad,perfil', '«vista inicial» vuelve a municipio → entidad → perfil');

  /* 9b-2. Jev: sectores, frases libres y elección de persona */
  ok(await page.evaluate(() => S.lista.every(p => !!p.sector === (p.ent.key !== 'no-reporta'))), 'Jev clasificó por sector la entidad de cada persona que la reportó');
  await orden('organiza por sector');
  ok(await page.evaluate(() => S.niveles[0]) === 'sector', '«organiza por sector» usa la clasificación de Jev');
  await orden('vista inicial');
  await orden('muéstrame la gente por tipo de organización');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => S.niveles[0]) === 'sector' && /Lo decidió Jev/.test(await page.locator('#avisoTexto').innerText()), 'Jev entiende una frase libre y organiza por sector');
  await orden('vista inicial');
  await orden('fernanda de la gobernación');   // no es un nombre exacto: decide Jev
  await page.waitForSelector('#panel:not([hidden]) #pDecision:not([hidden])', { timeout: 5000 });
  ok(/Erazo/.test(await page.locator('#pNombre').innerText()) && /Decisión de Jev: elegir/.test(await page.locator('#pDecision').innerText()), `Jev elige a la persona y el panel lo dice (${await page.locator('#pDecision').innerText()})`);
  await page.keyboard.press('Escape');
  const cam = await page.evaluate(async () => (await fetch('api.php?accion=jev_camara', { method: 'POST', headers: { 'X-Pulpo-Pase': CONFIG.PASE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ d1: 0.3, d2: 0.62, cuadros: 5, calidad: 0.93, ancho: 140, caras: 1, perfil: 'participante', ingresos: 1, charla_min: null, nombre: 'NO-DEBE-SALIR' }) })).json());
  ok(cam.accion === 'saludar' && cam.saludo === 'regreso', `la cámara consulta a Jev: ${cam.accion} / ${cam.saludo}`);
  const logJev = fs.readFileSync(LOG_JEV, 'utf8').trim().split('\n');
  const ultima = logJev[logJev.length - 1];
  ok(/distancia_mejor/.test(ultima) && !/NO-DEBE-SALIR|base64|data:image|Erazo/i.test(ultima), 'a Jev le llegan solo números y el perfil desde la cámara (sin nombre ni imagen)');
  ok(!logJev.some(l => /data_base64|"assets"/.test(l)), 'nunca se envían imágenes a Jev');

  /* 9c. Rostros de referencia desde las fotos de la API */
  await page.waitForFunction(() => REF.total > 0 && REF.hechas === REF.total, null, { timeout: 120000 });
  const ref = await page.evaluate(() => ({ total: REF.total, conFoto: S.lista.filter(p => p.foto).length }));
  ok(ref.total === ref.conFoto, `procesa automáticamente las ${ref.total} fotos de la API`);

  /* 9c-2. En reposo vuelven las líneas */
  await page.evaluate(() => { for (const b of octo.brazos) cancelarBrazo(b); S.lista.forEach(colocar); });
  await page.waitForFunction(() => LIN.v > 0.9, null, { timeout: 8000 });
  ok(true, 'con todo organizado (reposo) las líneas de la esfera vuelven a aparecer');

  /* 9d. «¿Eres tú?»: sí / no entrena la cámara; sin 80 % de coincidencia no hay foto */
  // Las fotos de prueba no tienen rostros reales: se usa una huella sintética para esa persona.
  const conRef = await page.evaluate(() => { const p = S.lista.find(q => q.foto); if (!S.rostros.has(p.id)) S.rostros.set(p.id, [new Float32Array(128).fill(0.05)]); return p.id; });
  const cara = (dist, id) => page.evaluate(([dist, id]) => {
    window.__cara = { id, dist, dist2: 0.75, r: { descriptor: S.rostros.get(id)[0], detection: { score: 0.92, box: { width: 130 } } } };
    return coincidencia(dist);
  }, [dist, id]);
  const baja = await cara(0.52, conRef);
  await page.evaluate(() => reaccionar(S.personas.get(__cara.id), __cara, coincidencia(__cara.dist)));
  await page.waitForSelector('#pEntrenar:not([hidden])', { timeout: 3000 });
  ok(baja < 0.8 && /¿Eres tú\?/.test(await page.locator('#pPregunta').innerText()) && await page.locator('#pSi').isVisible() && await page.locator('#pNo').isVisible(),
    `con ${Math.round(baja * 100)} % pregunta «¿Eres tú?» con botones Sí y No`);
  await page.waitForTimeout(600);
  ok(await page.locator('#pFoto.reservada').count() === 1 && await page.locator('#pFoto.con-foto').count() === 0 && !(await page.locator('#pDatos').isVisible()), 'sin 80 % no muestra la foto ni los datos');
  await foto('09-eres-tu');
  await page.click('#pSi');
  await page.waitForFunction(() => /Bienvenid|Te damos/.test($('#pSaludo').textContent), null, { timeout: 4000 });
  await page.waitForTimeout(700);
  ok(await page.locator('#pFoto.con-foto').count() === 1 && await page.evaluate(id => S.rostros.get(id).length, conRef) === 2, '«Sí» saluda con la foto y suma ese rostro a la referencia en memoria');
  await page.keyboard.press('Escape');
  await page.evaluate(() => reaccionar(S.personas.get(__cara.id), __cara, coincidencia(__cara.dist)));
  await page.waitForSelector('#pEntrenar:not([hidden])', { timeout: 3000 });
  await page.click('#pNo');
  await page.waitForFunction(() => APR.si + APR.no >= 2, null, { timeout: 4000 });
  ok(await page.evaluate(id => S.negativos.get(id).length, conRef) === 1 && /lo tendré en cuenta/.test(await page.locator('#pPregunta').innerText()), '«No» agradece y guarda el rostro como «no es esta persona» (solo en memoria)');
  const apr = await page.evaluate(async () => (await fetch('api.php?accion=aprendizaje', { headers: { 'X-Pulpo-Pase': CONFIG.PASE } })).json());
  ok(apr.si === 1 && apr.no === 1 && apr.bins['0.500'] && apr.bins['0.500'].si === 1 && apr.bins['0.500'].no === 1, `el servidor guarda los conteos por tramo de distancia (${JSON.stringify(apr.bins)})`);
  const archivoApr = fs.readFileSync(`${DATOS}/cache/aprendizaje.json.php`, 'utf8');
  ok(/^<\?php http_response_code\(404\)/.test(archivoApr) && !/nombre|"id"|descriptor|Erazo|[A-ZÁÉÍÓÚ][a-záéíóú]+ [A-Z]/.test(archivoApr), 'el aprendizaje solo guarda conteos anónimos, en un archivo protegido');
  ok(await page.evaluate(() => coincidencia(0.52)) !== baja, 'las respuestas cambian la coincidencia calibrada de ese tramo');
  const errMalo = errores.length;   // el 400 que sigue es provocado a propósito
  const malo = await page.evaluate(async () => (await fetch('api.php?accion=entrenar', { method: 'POST', headers: { 'X-Pulpo-Pase': CONFIG.PASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ distancia: 'x', respuesta: 'quizá' }) })).status);
  await page.waitForTimeout(200);
  for (let i = errores.length - 1; i >= errMalo; i--) if (/Failed to load resource.*400/.test(errores[i])) errores.splice(i, 1);
  ok(malo === 400, 'rechaza respuestas que no son «si» o «no»');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // Jev dice «saludar», pero sin 80 % la pantalla solo pregunta.
  await cara(0.3, conRef);
  await page.evaluate(() => decidirConJev(S.personas.get(__cara.id), __cara, 1, 5, 0.6));
  await page.waitForSelector('#pEntrenar:not([hidden])', { timeout: 5000 });
  ok(/saludar/.test(await page.locator('#pDecision').innerText()) && /¿Eres tú\?/.test(await page.locator('#pPregunta').innerText()) && await page.locator('#pFoto.reservada').count() === 1,
    'aunque Jev diga «saludar», con 60 % de coincidencia pregunta sin foto');
  const ultJev = fs.readFileSync(LOG_JEV, 'utf8').trim().split('\n').pop();
  ok(/coincidencia_calibrada/.test(ultJev) && /respuestas_previas_en_esta_distancia/.test(ultJev), 'Jev recibe la coincidencia calibrada y cuántos dijeron sí / no a esa distancia');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* 10. Minimización de datos */
  const datos = await page.evaluate(async () => {
    const r = await fetch('api.php?accion=datos', { headers: { 'X-Pulpo-Pase': window.PULPO_CONFIG.pase } });
    return r.json();
  });
  const crudo = JSON.stringify(datos);
  ok(!/1085 123 456|documento|correo|ejemplo\.co/.test(crudo), 'no salen documento, correo ni documentos escritos como entidad');
  ok(datos.personas.every(p => p.carnet === ''), 'el carné no sale si la plantilla de fotos no lo usa');
  ok(!/fotos\/\d|TOKEN-PRUEBA|JEV-PRUEBA/.test(crudo + await page.content()) && datos.personas.some(p => p.foto === true), 'la URL de la foto, el token y la clave de Jev no llegan al navegador');
  const errAntes = errores.length;   // los 404/401 que siguen son provocados a propósito
  const fotoRes = await page.evaluate(async () => {
    const h = { 'X-Pulpo-Pase': window.PULPO_CONFIG.pase };
    const conFoto = S.lista.find(p => p.foto), sinFoto = S.lista.find(p => !p.foto);
    const a = await fetch('api.php?accion=foto&id=' + conFoto.id, { headers: h });
    const b = await fetch('api.php?accion=foto&id=' + sinFoto.id, { headers: h });
    const c = await fetch('api.php?accion=foto&id=' + conFoto.id);
    return [a.status, a.headers.get('content-type'), b.status, c.status];
  });
  await page.waitForTimeout(300);
  for (let i = errores.length - 1; i >= errAntes; i--) if (/Failed to load resource.*(401|404)/.test(errores[i])) errores.splice(i, 1);
  ok(fotoRes[0] === 200 && fotoRes[1] === 'image/png', `api.php entrega la foto de la API (${fotoRes.slice(0, 2).join(' ')})`);
  ok(fotoRes[2] === 404 && fotoRes[3] === 401, 'sin foto → 404; sin pase → 401');
  const log = fs.readFileSync(LOG_API, 'utf8');
  ok(/cabecera \/perfiles/.test(log) && !/^url /m.test(log), 'el token viaja en la cabecera Authorization, no en la URL');

  /* 11. Controles de acceso, sin cookies ni pase */
  const pide = async (ruta, opc = {}) => (await fetch(BASE + ruta, opc)).status;
  ok(await pide('api.php?accion=datos') === 401, 'api.php sin pase → 401');
  ok(await pide('api.php?accion=datos', { headers: { 'X-Pulpo-Pase': '9999999999.' + 'a'.repeat(64) } }) === 401, 'api.php con pase falsificado → 401');
  for (const r of ['datos/config.php', 'datos/cache/datos.json.php', 'datos/cache/fotos.json.php', 'datos/cache/aprendizaje.json.php', 'inc/funciones.php', '.git/config', '.claude/skills/playwright-cli/SKILL.md', 'README.md', 'skills-lock.json', 'tests/e2e.cjs']) {
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
