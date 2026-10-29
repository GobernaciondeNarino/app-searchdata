<?php
/**
 * Pulpo de datos – Cumbre Tecnológica IA Nariño
 * Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto
 */
declare(strict_types=1);

require __DIR__ . '/inc/funciones.php';

$demo = isset($_GET['demo']);
$c = pulpo_config();
if (!$demo && !pulpo_instalado($c)) {
    header('Location: instalar.php');
    exit;
}
$c ??= pulpo_config_defecto();

header('X-Content-Type-Options: nosniff');
header('Permissions-Policy: camera=(self), microphone=(self)');

// Solo valores públicos: ninguna clave sale del servidor.
$cliente = [
    'saludo'       => (string) $c['saludo'],
    'foco_seg'     => (int) $c['foco_seg'],
    'refresco_min' => (int) $c['refresco_min'],
    'camara'       => (bool) $c['camara'],
    'umbral'       => (float) $c['umbral'],
    'foto_url'     => (string) $c['foto_url'],
    'voz'          => $c['el_key'] !== '',
    'tts'          => $c['el_key'] !== '' && $c['el_voz'] !== '',
    'gemini'       => $c['gem_key'] !== '',
    'version'      => PULPO_VERSION,
];
$v = PULPO_VERSION;
?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Pulpo de datos – Cumbre Tecnológica IA Nariño</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind+Madurai:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/app.css?v=<?= $v ?>">
</head>
<body>
<div id="escena" aria-hidden="true"></div>
<div id="etiquetas" aria-hidden="true"></div>
<svg id="guia" aria-hidden="true"><line id="guiaLinea" x1="0" y1="0" x2="0" y2="0" style="display:none"/></svg>

<header class="barra">
  <div class="marca">
    <strong id="nombreEvento">Cumbre Tecnológica IA Nariño</strong>
    <span>Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto</span>
  </div>
  <div class="voz">
    <span id="vozEstado" aria-live="polite"></span>
    <button class="boton-redondo" id="btnMic" aria-label="Buscar por voz (mantener presionado)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
    </button>
    <a class="boton-redondo" href="instalar.php" aria-label="Ajustes (requiere contraseña)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
    </a>
  </div>
</header>

<div id="tarjeta" class="tarjeta" hidden role="dialog" aria-live="assertive">
  <p class="saludo" id="tSaludo"></p>
  <h2 id="tNombre"></h2>
  <p class="entidad" id="tEntidad"></p>
  <p class="meta"><i id="tDot"></i><span id="tMeta"></span></p>
  <p class="charla" id="tCharla" hidden></p>
  <button id="tVincular" hidden>Vincular mi rostro</button>
</div>

<div id="aviso" class="aviso" hidden role="status"><p id="avisoTexto"></p><div class="opciones" id="avisoOpciones"></div></div>
<div id="buscador" hidden><input id="buscadorInput" type="text" autocomplete="off" placeholder="Escribe un nombre y presiona Enter" aria-label="Buscar persona por nombre"></div>

<section id="stats" aria-label="Estadísticas en vivo">
  <div class="ticker" aria-hidden="true"><div class="ticker-pista" id="ticker"></div></div>
  <div class="hud">
    <article class="panel" id="pTent">
      <header><h3>tentáculos en paralelo</h3><span class="tag" id="tRitmo">0/s</span></header>
      <canvas id="cvTent"></canvas>
      <div class="pie-cifra"><b id="nOrg">0</b><span>de <span id="nTot">0</span> organizados</span><span class="estado" id="estadoPulpo">Conectando…</span></div>
    </article>
    <article class="panel doble" id="pFlujo">
      <header><h3>flujo de la red</h3><span class="tag" id="tFlujo">en vivo</span></header>
      <canvas id="cvFlujo"></canvas>
      <header class="sub"><h3>calor por perfil</h3><span class="tag rosa" id="tCalor">0 ev</span></header>
      <canvas id="cvCalor"></canvas>
    </article>
    <article class="panel" id="pNucleo">
      <header><h3>núcleo de registros</h3><span class="tag" id="tNucleo">0 %</span></header>
      <canvas id="cvNucleo"></canvas>
    </article>
    <article class="panel" id="pEnt">
      <header><h3>entidades</h3><span class="tag" id="tEnt">0</span></header>
      <div class="tiles" id="tiles"></div>
    </article>
    <article class="panel doble" id="pCodigo">
      <header><h3>pulpo.js</h3><span class="tag dorado" id="tTokens">0 car</span></header>
      <pre id="codigo"></pre>
      <header class="sub"><h3>bitácora</h3><span class="tag" id="tLog">0/min</span></header>
      <ol id="bitacora"></ol>
    </article>
    <article class="panel camara" id="pCamara">
      <div class="video"><video id="video" playsinline muted></video><canvas id="hud"></canvas><p id="camEstado">Cámara apagada</p></div>
      <div class="cam-datos">
        <header><h3>frente a la cámara</h3><span class="tag cian" id="tCam">off</span></header>
        <div class="cam-num">
          <div><b id="cAhora">0</b>ahora</div>
          <div><b id="cUnicos">0</b>hoy</div>
          <div><b id="cRecon">0</b>bienvenidas</div>
        </div>
        <div class="figuras" title="Estimación agregada; no se guarda ninguna imagen">
          <span class="figura"><svg viewBox="0 0 16 24" fill="none" stroke="#ff9be8" stroke-width="1.3"><circle cx="8" cy="4" r="3"/><path d="M8 7v8M8 15l-4 8M8 15l4 8M3 10l5-1 5 1"/></svg><b id="cA">0</b> mujeres</span>
          <span class="figura"><svg viewBox="0 0 16 24" fill="none" stroke="#7cf7ff" stroke-width="1.3"><circle cx="8" cy="4" r="3"/><path d="M8 7v8M8 15l-4 8M8 15l4 8M3 10l5-1 5 1"/></svg><b id="cB">0</b> hombres</span>
        </div>
        <canvas id="onda"></canvas>
        <p class="nota">Estimación agregada. No se guardan imágenes.</p>
      </div>
    </article>
    <article class="panel" id="pSistema">
      <header><h3>sistema</h3><span class="tag" id="tFps">60 fps</span></header>
      <ul class="luces" id="luces"></ul>
      <canvas id="cvHisto"></canvas>
      <div class="split" id="split"></div>
    </article>
  </div>
</section>

<div class="capa" id="inicio">
  <div class="caja">
    <h1>Pulpo de datos</h1>
    <p>Un pulpo recorre la red de la Cumbre y ubica a cada persona inscrita en su neurona: perfil, municipio, entidad y nombre.</p>
    <p>Di un nombre manteniendo presionada la barra espaciadora, escribe <b>/</b> para buscar con el teclado o párate frente a la cámara.</p>
    <button class="principal" id="btnIniciar">Iniciar</button>
    <p class="nota" style="margin-top:14px">La cámara solo se usa para dar la bienvenida y contar asistentes de forma agregada. No se guardan imágenes ni rostros al cerrar la página.</p>
  </div>
</div>

<script>window.PULPO_CONFIG = <?= json_encode($cliente, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="assets/vendor/three.min.js?v=<?= $v ?>"></script>
<script src="assets/vendor/anime.min.js?v=<?= $v ?>"></script>
<script src="assets/vendor/face-api.js?v=<?= $v ?>"></script>
<script src="assets/js/hud.js?v=<?= $v ?>"></script>
<script src="assets/js/app.js?v=<?= $v ?>"></script>
</body>
</html>
