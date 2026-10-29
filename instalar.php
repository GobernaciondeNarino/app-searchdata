<?php
/**
 * Asistente de instalación del Pulpo de datos.
 * Primera vez: pide el token interno de instalación y guía la configuración completa.
 * Después: pide la contraseña de administración para modificar los ajustes.
 */
declare(strict_types=1);

require __DIR__ . '/inc/funciones.php';

pulpo_sesion();
pulpo_cabeceras_html("default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
    . "font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
header('Cache-Control: no-store');

$cfg = pulpo_config();
$instalado = pulpo_instalado($cfg);
$_SESSION['csrf'] ??= bin2hex(random_bytes(16));

const PASOS = [1 => 'Requisitos', 2 => 'API de eventos', 3 => 'ElevenLabs', 4 => 'Gemini', 5 => 'Experiencia', 6 => 'Administración'];

/* ---------------- Salir ---------------- */
if (isset($_GET['salir']) && hash_equals($_SESSION['csrf'], (string) ($_GET['csrf'] ?? ''))) {
    $_SESSION = [];
    session_destroy();
    pulpo_redirigir('instalar.php');
}

/* ---------------- Token interno de instalación ---------------- */
if (!$instalado && empty($_SESSION['instalador'])) {
    $token = pulpo_token_instalacion();
    $errorToken = '';
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) {
        if (pulpo_excede_limite('token', 10, 900)) {
            $errorToken = 'Demasiados intentos desde esta conexión. Espere 15 minutos.';
        } elseif (pulpo_token_instalacion_valido((string) ($_POST['token'] ?? ''))) {
            session_regenerate_id(true);
            $_SESSION['instalador'] = true;
            pulpo_redirigir('instalar.php?paso=1');
        } else {
            $errorToken = 'El token no coincide. Cópielo de nuevo desde el servidor.';
        }
    }
    pagina_inicio('Instalación – Pulpo de datos');
    ?>
    <section class="caja estrecha">
      <h1>Token de instalación</h1>
      <?php if ($token === null): ?>
        <p class="alerta error">No se pudo crear el token porque la carpeta <code>datos/</code> no permite escritura. En Plesk, abra el Administrador de archivos, clic derecho sobre <code>datos</code> → <b>Cambiar permisos</b> y permita la escritura al usuario del sitio. Luego recargue esta página.</p>
      <?php else: ?>
        <p>Para que nadie más configure la aplicación mientras usted la instala, el asistente pide un token que solo puede leer quien tiene acceso a los archivos del servidor.</p>
        <ol class="pasos-token">
          <li>En Plesk abra <b>Administrador de archivos</b> y entre a la carpeta de la aplicación.</li>
          <li>Abra <code>datos/token-instalacion.php</code> con el editor de texto.</li>
          <li>Copie el valor entre comillas (formato <code>XXXXX-XXXXX-XXXXX-XXXXX</code>) y péguelo aquí.</li>
        </ol>
        <?php if ($errorToken): ?><p class="alerta error" role="alert"><?= pulpo_e($errorToken) ?></p><?php endif; ?>
        <form method="post" action="instalar.php">
          <input type="hidden" name="csrf" value="<?= pulpo_e($_SESSION['csrf']) ?>">
          <label for="token">Token de instalación</label>
          <input id="token" name="token" type="text" autocomplete="off" spellcheck="false" autocapitalize="characters" required autofocus>
          <p class="ayuda">El archivo se borra solo al terminar la instalación. Si alguien más pudo verlo, elimínelo y recargue esta página para generar otro.</p>
          <div class="acciones"><button class="boton">Comenzar</button></div>
        </form>
      <?php endif; ?>
    </section>
    <?php
    pagina_fin();
    exit;
}

/* ---------------- Ingreso del administrador ---------------- */
$errorIngreso = '';
if ($instalado && empty($_SESSION['admin'])) {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) {
        // El límite va por IP: borrar la cookie de sesión no da intentos nuevos.
        if (pulpo_excede_limite('ingreso', 8, 900)) {
            $errorIngreso = 'Demasiados intentos desde esta conexión. Espere 15 minutos.';
        } elseif (password_verify((string) ($_POST['clave'] ?? ''), (string) $cfg['admin_hash'])) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            $_SESSION['wiz'] = $cfg;
            pulpo_redirigir('instalar.php?paso=2');
        } else {
            $errorIngreso = 'La contraseña no coincide.';
        }
    }
    pagina_inicio('Ajustes del Pulpo de datos');
    ?>
    <section class="caja estrecha">
      <h1>Ajustes protegidos</h1>
      <p>El Pulpo de datos ya está instalado. Ingrese la contraseña de administración para cambiar la configuración.</p>
      <?php if ($errorIngreso): ?><p class="alerta error"><?= pulpo_e($errorIngreso) ?></p><?php endif; ?>
      <form method="post" action="instalar.php">
        <input type="hidden" name="csrf" value="<?= pulpo_e($_SESSION['csrf']) ?>">
        <label for="clave">Contraseña de administración</label>
        <input id="clave" name="clave" type="password" autocomplete="current-password" required autofocus>
        <div class="acciones"><a class="boton secundario" href="./">Volver al pulpo</a><button class="boton">Ingresar</button></div>
      </form>
    </section>
    <?php
    pagina_fin();
    exit;
}

/* ---------------- Estado del asistente ---------------- */
$_SESSION['wiz'] ??= $instalado ? $cfg : array_merge(pulpo_config_defecto(), $cfg ?? []);
$w = &$_SESSION['wiz'];
$_SESSION['ok'] ??= [];
$paso = max(1, min(6, (int) ($_GET['paso'] ?? 1)));
$mensaje = null;      // ['tipo' => 'ok'|'error'|'aviso', 'texto' => '...', 'detalle' => [...]]
$terminado = false;

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) {
        $mensaje = ['tipo' => 'error', 'texto' => 'La sesión expiró. Vuelva a enviar el formulario.'];
    } else {
        $boton = (string) ($_POST['boton'] ?? 'siguiente');
        if ($boton === 'anterior') {
            pulpo_redirigir('instalar.php?paso=' . max(1, $paso - 1));
        }
        [$valido, $mensaje] = procesar_paso($paso, $w, $boton);
        if ($valido && $boton === 'siguiente') {
            if ($paso < 6) {
                pulpo_redirigir('instalar.php?paso=' . ($paso + 1));
            }
            $terminado = true;
        }
    }
}

/* ---------------- Lógica de cada paso ---------------- */
function procesar_paso(int $paso, array &$w, string $boton): array
{
    switch ($paso) {
        case 1:
            $req = requisitos();
            foreach ($req as $r) {
                if ($r['critico'] && !$r['ok']) {
                    return [false, ['tipo' => 'error', 'texto' => 'Corrija los requisitos marcados antes de continuar.']];
                }
            }
            return [true, null];

        case 2:
            $w['api_base'] = rtrim(trim((string) ($_POST['api_base'] ?? '')), '/');
            $token = trim((string) ($_POST['api_token'] ?? ''));
            if ($token !== '') {
                $w['api_token'] = $token;
            }
            $w['ssl_verificar'] = !empty($_POST['ssl_verificar']);
            if (!filter_var($w['api_base'], FILTER_VALIDATE_URL)) {
                return [false, ['tipo' => 'error', 'texto' => 'La dirección de la API no es válida.']];
            }
            if ($w['api_token'] === '') {
                return [false, ['tipo' => 'error', 'texto' => 'Escriba el token de la API de eventos.']];
            }
            try {
                $j = pulpo_evento_get($w, '/perfiles');
                $det = [];
                foreach (($j['datos'] ?? []) as $p) {
                    $det[] = ($p['nombre'] ?? $p['clave']) . ': ' . (int) ($p['total'] ?? 0);
                }
                $_SESSION['ok'][2] = true;
                return [true, ['tipo' => 'ok', 'texto' => 'Conexión correcta con «' . ($j['evento']['nombre'] ?? 'evento') . '», ' . (int) ($j['total'] ?? 0) . ' inscripciones.', 'detalle' => $det]];
            } catch (Throwable $e) {
                $sug = stripos($e->getMessage(), 'SSL') !== false || stripos($e->getMessage(), 'certificate') !== false
                    ? ' Si el certificado del servidor no es reconocido, desmarque «Verificar el certificado SSL».' : '';
                return [false, ['tipo' => 'error', 'texto' => $e->getMessage() . '.' . $sug]];
            }

        case 3:
            $key = trim((string) ($_POST['el_key'] ?? ''));
            if (!empty($_POST['el_quitar'])) {
                $w['el_key'] = '';
            } elseif ($key !== '') {
                $w['el_key'] = $key;
            }
            $w['el_voz'] = trim((string) ($_POST['el_voz'] ?? ''));
            $w['el_stt'] = trim((string) ($_POST['el_stt'] ?? '')) ?: 'scribe_v1';
            $w['el_tts'] = trim((string) ($_POST['el_tts'] ?? '')) ?: 'eleven_multilingual_v2';
            if ($w['el_key'] === '') {
                return [true, ['tipo' => 'aviso', 'texto' => 'Sin ElevenLabs: la voz se reconocerá con el navegador (Chrome o Edge) y el saludo usará la voz del sistema.']];
            }
            if ($boton === 'probar' || $w['el_voz'] !== '') {
                $url = $w['el_voz'] !== '' ? 'https://api.elevenlabs.io/v1/voices/' . rawurlencode($w['el_voz']) : 'https://api.elevenlabs.io/v1/models';
                $r = pulpo_http('GET', $url, ['headers' => ['xi-api-key: ' . $w['el_key']], 'timeout' => 15]);
                if ($r['estado'] !== 200) {
                    return [false, ['tipo' => 'error', 'texto' => 'ElevenLabs rechazó la prueba (' . ($r['estado'] ?: $r['error']) . '). Revise la clave y el ID de voz.']];
                }
                $j = json_decode($r['cuerpo'], true);
                $voz = $w['el_voz'] !== '' ? ('voz «' . ($j['name'] ?? $w['el_voz']) . '»') : 'clave válida; falta el ID de voz para el saludo';
                return [true, ['tipo' => 'ok', 'texto' => "ElevenLabs responde: {$voz}."]];
            }
            return [true, null];

        case 4:
            $key = trim((string) ($_POST['gem_key'] ?? ''));
            if (!empty($_POST['gem_quitar'])) {
                $w['gem_key'] = '';
            } elseif ($key !== '') {
                $w['gem_key'] = $key;
            }
            $w['gem_modelo'] = trim((string) ($_POST['gem_modelo'] ?? '')) ?: 'gemini-2.5-flash';
            if ($w['gem_key'] === '') {
                return [true, ['tipo' => 'aviso', 'texto' => 'Sin Gemini: la búsqueda elegirá la coincidencia más parecida por fonética.']];
            }
            $r = pulpo_http('GET', 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($w['gem_modelo']), [
                'headers' => ['x-goog-api-key: ' . $w['gem_key']], 'timeout' => 15,
            ]);
            if ($r['estado'] !== 200) {
                return [false, ['tipo' => 'error', 'texto' => 'Gemini rechazó la prueba (' . ($r['estado'] ?: $r['error']) . '). Revise la clave y el nombre del modelo.']];
            }
            $j = json_decode($r['cuerpo'], true);
            return [true, ['tipo' => 'ok', 'texto' => 'Gemini responde con el modelo «' . ($j['displayName'] ?? $w['gem_modelo']) . '».']];

        case 5:
            $w['saludo'] = pulpo_cortar((string) ($_POST['saludo'] ?? ''), 80);
            $w['foco_seg'] = max(4, min(30, (int) ($_POST['foco_seg'] ?? 9)));
            $w['refresco_min'] = max(1, min(60, (int) ($_POST['refresco_min'] ?? 3)));
            $w['cache_seg'] = max(15, min(600, (int) ($_POST['cache_seg'] ?? 60)));
            $w['camara'] = !empty($_POST['camara']);
            $w['umbral'] = max(0.3, min(0.7, (float) str_replace(',', '.', (string) ($_POST['umbral'] ?? '0.5'))));
            $w['foto_url'] = trim((string) ($_POST['foto_url'] ?? ''));
            $pantalla = (string) ($_POST['pantalla'] ?? '');
            if (!empty($_POST['pantalla_quitar'])) {
                $w['pantalla_hash'] = '';
            } elseif ($pantalla !== '') {
                if (strlen($pantalla) < 8) {
                    return [false, ['tipo' => 'error', 'texto' => 'La clave de la pantalla debe tener al menos 8 caracteres.']];
                }
                $w['pantalla_hash'] = password_hash($pantalla, PASSWORD_DEFAULT);
            }
            if (!str_contains($w['saludo'], '{nombre}')) {
                return [false, ['tipo' => 'error', 'texto' => 'El saludo debe incluir {nombre}.']];
            }
            if ($w['foto_url'] !== '' && pulpo_origen($w['foto_url']) === '') {
                return [false, ['tipo' => 'error', 'texto' => 'La plantilla de fotos no es una dirección válida.']];
            }
            return [true, null];

        case 6:
            if ($boton !== 'siguiente') {
                return [false, null];
            }
            $c1 = (string) ($_POST['clave1'] ?? '');
            $c2 = (string) ($_POST['clave2'] ?? '');
            if ($w['admin_hash'] === '' || $c1 !== '') {
                if (strlen($c1) < 10) {
                    return [false, ['tipo' => 'error', 'texto' => 'La contraseña debe tener al menos 10 caracteres.']];
                }
                if ($c1 !== $c2) {
                    return [false, ['tipo' => 'error', 'texto' => 'Las contraseñas no coinciden.']];
                }
                $w['admin_hash'] = password_hash($c1, PASSWORD_DEFAULT);
            }
            if (empty($w['api_token'])) {
                return [false, ['tipo' => 'error', 'texto' => 'Falta configurar la API de eventos (paso 2).']];
            }
            $w['instalado_en'] = $w['instalado_en'] ?: date('c');
            $w['version'] = PULPO_VERSION;
            // Conserva la clave interna vigente (la pantalla pudo crearla mientras el asistente estaba abierto).
            $w['secreto'] = (string) (pulpo_config()['secreto'] ?? '') ?: (string) $w['secreto'];
            if (strlen($w['secreto']) < 64) {
                $w['secreto'] = bin2hex(random_bytes(32));
            }
            if (!pulpo_guardar_config($w)) {
                return [false, ['tipo' => 'error', 'texto' => 'No se pudo escribir datos/config.php. Revise los permisos de la carpeta datos.']];
            }
            // Comprueba que lo guardado se lee igual antes de dar la instalación por terminada.
            $leida = pulpo_config();
            if (!pulpo_instalado($leida) || $leida['api_token'] !== $w['api_token'] || $leida['admin_hash'] !== $w['admin_hash']) {
                return [false, ['tipo' => 'error', 'texto' => 'datos/config.php quedó escrito pero no se pudo leer de vuelta. Revise los permisos de la carpeta datos.']];
            }
            pulpo_borrar_cache_datos();
            pulpo_borrar_token_instalacion();
            session_regenerate_id(true);
            unset($_SESSION['instalador']);
            $_SESSION['admin'] = true;
            return [true, null];
    }
    return [false, null];
}

function requisitos(): array
{
    $escribible = false;
    if (is_dir(PULPO_DATOS) || @mkdir(PULPO_DATOS, 0750, true)) {
        $prueba = PULPO_DATOS . '/.prueba-' . bin2hex(random_bytes(3));
        $escribible = @file_put_contents($prueba, 'ok') !== false;
        @unlink($prueba);
    }
    $modelos = glob(PULPO_RAIZ . '/assets/modelos/*.bin') ?: [];
    $htaccess = is_file(PULPO_RAIZ . '/.htaccess') && is_file(PULPO_DATOS . '/.htaccess') && is_file(PULPO_RAIZ . '/inc/.htaccess');
    $sonda = $escribible ? sonda_proteccion() : 'sin comprobar';
    return [
        ['nombre' => 'PHP 8.1 o superior', 'ok' => version_compare(PHP_VERSION, '8.1.0', '>='), 'valor' => PHP_VERSION, 'critico' => true],
        ['nombre' => 'Extensión cURL', 'ok' => extension_loaded('curl'), 'valor' => extension_loaded('curl') ? 'activa' : 'falta', 'critico' => true],
        ['nombre' => 'Extensión JSON', 'ok' => function_exists('json_encode'), 'valor' => 'activa', 'critico' => true],
        ['nombre' => 'Extensión mbstring', 'ok' => extension_loaded('mbstring'), 'valor' => extension_loaded('mbstring') ? 'activa' : 'recomendada', 'critico' => false],
        ['nombre' => 'Carpeta datos/ con permiso de escritura', 'ok' => $escribible, 'valor' => $escribible ? 'correcto' : 'sin permiso', 'critico' => true],
        ['nombre' => 'Archivos .htaccess (raíz, datos/ e inc/)', 'ok' => $htaccess, 'valor' => $htaccess ? 'presentes' : 'faltan: suba también los archivos ocultos', 'critico' => false],
        ['nombre' => 'datos/ bloqueada desde la web (prueba real)', 'ok' => $sonda === 'bloqueada', 'valor' => $sonda, 'critico' => false],
        ['nombre' => 'Modelos de rostro en assets/modelos', 'ok' => count($modelos) >= 4, 'valor' => count($modelos) . ' de 4', 'critico' => false],
        ['nombre' => 'Sitio servido por HTTPS (cámara y micrófono)', 'ok' => pulpo_es_https(), 'valor' => pulpo_es_https() ? 'sí' : 'no: active SSL/TLS en Plesk', 'critico' => false],
    ];
}

/**
 * Pide por HTTP un archivo de prueba dentro de datos/cache/ para comprobar que el
 * servidor no lo entrega. Devuelve 'bloqueada', 'EXPUESTA' o 'no se pudo comprobar'.
 */
function sonda_proteccion(): string
{
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if (!preg_match('/^[a-z0-9.\-]+(:\d{1,5})?$/i', $host)) {
        return 'no se pudo comprobar';
    }
    $nombre = 'sonda-' . bin2hex(random_bytes(6)) . '.txt';
    $valor = bin2hex(random_bytes(12));
    $f = pulpo_dir_cache() . '/' . $nombre;
    if (@file_put_contents($f, $valor) === false) {
        return 'no se pudo comprobar';
    }
    $url = (pulpo_es_https() ? 'https' : 'http') . '://' . $host . pulpo_url('datos/cache/' . $nombre);
    $r = pulpo_http('GET', $url, ['timeout' => 4, 'ssl' => false]);
    @unlink($f);
    if ($r['estado'] === 200 && str_contains($r['cuerpo'], $valor)) {
        return 'EXPUESTA: revise .htaccess o nginx';
    }
    return in_array($r['estado'], [401, 403, 404], true) ? 'bloqueada' : 'no se pudo comprobar';
}

/* ---------------- Plantilla ---------------- */
function pagina_inicio(string $titulo): void
{
    ?><!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<base href="<?= pulpo_e(pulpo_base()) ?>">
<title><?= pulpo_e($titulo) ?></title>
<link rel="stylesheet" href="assets/css/fuentes.css?v=<?= PULPO_VERSION ?>">
<style>
:root{--verde:#3dffa0;--rosa:#ff3fa4;--dorado:#ffd500;--texto:#dcfff1;--tenue:#7fae9b;--borde:rgba(61,255,160,.2);--mono:"JetBrains Mono",ui-monospace,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:radial-gradient(ellipse at 50% 0%,#063322 0%,#01120a 55%,#000704 100%);color:var(--texto);font:16px/1.5 "Hind Madurai",system-ui,sans-serif;padding:32px 18px 60px}
.marco{max-width:760px;margin:0 auto}
.encabezado{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:22px}
.encabezado strong{font-size:1.05rem;font-weight:600}
.encabezado span,.encabezado a{font:12px var(--mono);color:var(--tenue)}
.pasos{list-style:none;display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:22px}
.pasos li{font:11px var(--mono);color:var(--tenue);border-top:2px solid rgba(61,255,160,.15);padding-top:6px}
.pasos li.hecho{color:#9fd9c3;border-color:rgba(61,255,160,.5)}
.pasos li.actual{color:var(--verde);border-color:var(--verde)}
.pasos a{color:inherit;text-decoration:none}
.caja{background:rgba(3,26,18,.55);border:1px solid var(--borde);border-radius:14px;padding:26px 28px;backdrop-filter:blur(10px)}
.estrecha{max-width:440px;margin:60px auto}
h1{font-weight:600;font-size:1.6rem;line-height:1.15;margin-bottom:8px;color:#f0fff8}
h2{font-weight:500;font-size:1.05rem;margin:22px 0 4px}
p{color:#bfe6d6;margin-bottom:10px;max-width:68ch}
label{display:block;font-size:.88rem;color:var(--tenue);margin:14px 0 4px}
input[type=text],input[type=password],input[type=url],input[type=number]{width:100%;font:15px var(--mono);padding:9px 11px;border-radius:9px;border:1px solid var(--borde);background:rgba(0,0,0,.3);color:var(--texto)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--verde);outline-offset:2px}
.check{display:flex;gap:9px;align-items:center;color:var(--texto);font-size:.95rem}
.ayuda{font-size:.8rem;color:#6e9c8a;margin-top:4px}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.acciones{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:24px}
.boton{font:500 15px "Hind Madurai",sans-serif;padding:9px 18px;border-radius:9px;border:1px solid var(--verde);background:rgba(61,255,160,.14);color:var(--verde);cursor:pointer;text-decoration:none;display:inline-block}
.boton.secundario{border-color:var(--borde);background:transparent;color:var(--texto)}
.boton.prueba{border-color:rgba(255,63,164,.5);color:#ff8ccb;background:rgba(255,63,164,.08);margin-right:auto}
.alerta{border-radius:10px;padding:10px 14px;margin:14px 0;font-size:.93rem;border:1px solid}
.alerta.ok{border-color:rgba(61,255,160,.4);background:rgba(61,255,160,.08);color:#c8ffe6}
.alerta.error{border-color:rgba(255,90,120,.5);background:rgba(255,63,100,.1);color:#ffd0dc}
.alerta.aviso{border-color:rgba(255,213,0,.45);background:rgba(255,213,0,.08);color:#ffeab0}
.alerta ul{margin:6px 0 0 18px;font:12px var(--mono)}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:.92rem}
td{padding:8px 4px;border-bottom:1px solid rgba(61,255,160,.1)}
td:last-child{text-align:right;font:12px var(--mono)}
.si{color:var(--verde)} .no{color:#ff7a9c} .medio{color:var(--dorado)}
.resumen td:first-child{color:var(--tenue)}
code{font:13px var(--mono);color:var(--dorado);overflow-wrap:anywhere}
.pasos-token{margin:12px 0 4px 20px;color:#bfe6d6}
.pasos-token li{margin-bottom:4px}
@media (max-width:620px){.dos{grid-template-columns:1fr}.pasos li{font-size:0;height:4px}.caja{padding:20px}}
</style></head><body><div class="marco">
<div class="encabezado"><strong>Pulpo de datos – Cumbre Tecnológica IA Nariño</strong><span>versión <?= PULPO_VERSION ?><?php if (!empty($_SESSION['admin']) || !empty($_SESSION['instalador'])): ?> – <a href="instalar.php?salir=1&amp;csrf=<?= pulpo_e($_SESSION['csrf']) ?>">cerrar sesión</a><?php endif; ?></span></div>
<?php
}

function pagina_fin(): void
{
    echo '</div></body></html>';
}

function campo_secreto(string $nombre, string $etiqueta, string $actual, string $ayuda = '', string $quitar = ''): void
{
    $tiene = $actual !== '';
    ?>
    <label for="<?= $nombre ?>"><?= pulpo_e($etiqueta) ?></label>
    <input id="<?= $nombre ?>" name="<?= $nombre ?>" type="password" autocomplete="off" placeholder="<?= $tiene ? 'Guardada (termina en ' . pulpo_e(substr($actual, -4)) . '). Deje vacío para conservarla.' : '' ?>">
    <?php if ($ayuda): ?><p class="ayuda"><?= $ayuda ?></p><?php endif; ?>
    <?php if ($tiene && $quitar): ?><label class="check"><input type="checkbox" name="<?= $quitar ?>" value="1"> Quitar esta clave</label><?php endif;
}

pagina_inicio('Instalación – Pulpo de datos');

/* ---------------- Pantalla final ---------------- */
if ($terminado) {
    $_SESSION['ok'] = [];
    ?>
    <section class="caja">
      <h1><?= $instalado ? 'Cambios guardados' : 'Instalación completa' ?></h1>
      <p>La configuración quedó en <code>datos/config.php</code>, protegida del acceso público. Las claves nunca llegan al navegador: la página usa <code>api.php</code> como intermediario.</p>
      <p>Para volver a este asistente abra <code><?= pulpo_e(pulpo_url('instalar.php')) ?></code> e ingrese la contraseña de administración.<?= $instalado ? '' : ' El token de instalación ya se borró del servidor.' ?></p>
      <div class="acciones"><a class="boton secundario" href="instalar.php?paso=1">Revisar ajustes</a><a class="boton" href="./">Abrir el pulpo</a></div>
    </section>
    <?php
    pagina_fin();
    exit;
}

/* ---------------- Barra de pasos ---------------- */
echo '<ol class="pasos">';
foreach (PASOS as $n => $nombre) {
    $clase = $n === $paso ? 'actual' : ($n < $paso ? 'hecho' : '');
    $enlace = ($instalado || $n < $paso) ? "<a href=\"instalar.php?paso={$n}\">{$n}. " . pulpo_e($nombre) . '</a>' : "{$n}. " . pulpo_e($nombre);
    echo "<li class=\"{$clase}\">{$enlace}</li>";
}
echo '</ol>';
?>
<section class="caja">
<form method="post" action="instalar.php?paso=<?= $paso ?>" autocomplete="off">
<input type="hidden" name="csrf" value="<?= pulpo_e($_SESSION['csrf']) ?>">

<?php if ($paso === 1): $req = requisitos(); ?>
  <h1><?= $instalado ? 'Revisión del servidor' : 'Bienvenido al asistente' ?></h1>
  <p>Este asistente deja listo el Pulpo de datos en este hosting de Plesk: conecta la API de inscripciones de la Cumbre, las voces de ElevenLabs, la búsqueda con Gemini y la cámara de bienvenida.</p>
  <table>
    <?php foreach ($req as $r): ?>
      <tr><td><?= pulpo_e($r['nombre']) ?></td><td class="<?= $r['ok'] ? 'si' : ($r['critico'] ? 'no' : 'medio') ?>"><?= pulpo_e($r['valor']) ?></td></tr>
    <?php endforeach; ?>
  </table>
  <p class="ayuda" style="margin-top:12px">Si el dominio sirve los archivos solo con nginx, agregue en Plesk (Configuración de Apache y nginx → directivas adicionales de nginx): <code>location ~ ^/(.*/)?(datos|inc)/ { deny all; }</code></p>

<?php elseif ($paso === 2): ?>
  <h1>API de eventos</h1>
  <p>De aquí salen los perfiles, participantes y expositores aprobados. El token se guarda en el servidor y no aparece en la página pública.</p>
  <label for="api_base">Dirección base de la API</label>
  <input id="api_base" name="api_base" type="url" required value="<?= pulpo_e($w['api_base']) ?>">
  <?php campo_secreto('api_token', 'Token de acceso', (string) $w['api_token'], 'Es el valor del parámetro <code>token</code> de las URL de la API.'); ?>
  <label class="check" style="margin-top:16px"><input type="checkbox" name="ssl_verificar" value="1" <?= $w['ssl_verificar'] ? 'checked' : '' ?>> Verificar el certificado SSL de la API</label>
  <p class="ayuda">Desmárquelo solo si el servidor gubernamental usa una cadena de certificados que este hosting no reconoce.</p>

<?php elseif ($paso === 3): ?>
  <h1>ElevenLabs (opcional)</h1>
  <p>Transcribe lo que se dice al micrófono y pronuncia el saludo de bienvenida. Sin esta clave, el reconocimiento usa el del navegador.</p>
  <?php campo_secreto('el_key', 'Clave de API', (string) $w['el_key'], 'En elevenlabs.io: Developers → API Keys. Necesita permisos de Speech to Text, Text to Speech y lectura de voces.', 'el_quitar'); ?>
  <label for="el_voz">ID de la voz para el saludo</label>
  <input id="el_voz" name="el_voz" type="text" value="<?= pulpo_e($w['el_voz']) ?>">
  <p class="ayuda">En la biblioteca de voces, use «Copy voice ID». Recomendado: una voz en español latino.</p>
  <div class="dos">
    <div><label for="el_stt">Modelo de transcripción</label><input id="el_stt" name="el_stt" type="text" value="<?= pulpo_e($w['el_stt']) ?>"></div>
    <div><label for="el_tts">Modelo de voz</label><input id="el_tts" name="el_tts" type="text" value="<?= pulpo_e($w['el_tts']) ?>"></div>
  </div>

<?php elseif ($paso === 4): ?>
  <h1>Gemini (opcional)</h1>
  <p>Cuando lo dicho por voz se parece a varias personas, Gemini elige la correcta entre los 25 candidatos más cercanos. Solo recibe nombre, entidad y municipio de esos candidatos.</p>
  <?php campo_secreto('gem_key', 'Clave de API de Google AI Studio', (string) $w['gem_key'], 'En aistudio.google.com: Get API key.', 'gem_quitar'); ?>
  <label for="gem_modelo">Modelo</label>
  <input id="gem_modelo" name="gem_modelo" type="text" value="<?= pulpo_e($w['gem_modelo']) ?>">

<?php elseif ($paso === 5): ?>
  <h1>Experiencia en pantalla</h1>
  <label for="saludo">Saludo al reconocer a alguien con la cámara</label>
  <input id="saludo" name="saludo" type="text" value="<?= pulpo_e($w['saludo']) ?>">
  <p class="ayuda"><code>{nombre}</code> se reemplaza por el nombre y primer apellido. Ejemplo neutro: «Te damos la bienvenida, {nombre}».</p>
  <div class="dos">
    <div><label for="foco_seg">Segundos que se muestra una persona</label><input id="foco_seg" name="foco_seg" type="number" min="4" max="30" value="<?= (int) $w['foco_seg'] ?>"></div>
    <div><label for="refresco_min">Minutos entre consultas a la API</label><input id="refresco_min" name="refresco_min" type="number" min="1" max="60" value="<?= (int) $w['refresco_min'] ?>"></div>
    <div><label for="cache_seg">Segundos de caché en el servidor</label><input id="cache_seg" name="cache_seg" type="number" min="15" max="600" value="<?= (int) $w['cache_seg'] ?>"></div>
    <div><label for="umbral">Exigencia del reconocimiento (0,3 a 0,7)</label><input id="umbral" name="umbral" type="text" value="<?= pulpo_e((string) $w['umbral']) ?>"></div>
  </div>
  <p class="ayuda">En el reconocimiento, un número menor es más estricto: 0,45 evita confusiones; 0,55 reconoce con peor luz.</p>
  <label class="check" style="margin-top:16px"><input type="checkbox" name="camara" value="1" <?= $w['camara'] ? 'checked' : '' ?>> Encender la cámara al iniciar</label>
  <label for="foto_url">Plantilla de fotos de referencia (opcional)</label>
  <input id="foto_url" name="foto_url" type="text" placeholder="https://…/fotos/{carnet}.jpg" value="<?= pulpo_e($w['foto_url']) ?>">
  <p class="ayuda">Si existen fotos de las personas inscritas, la cámara podrá reconocerlas desde el inicio. Requiere autorización expresa para tratar datos biométricos (Ley 1581 de 2012).</p>
  <h2>Acceso a la pantalla</h2>
  <label for="pantalla">Clave de la pantalla (recomendada)</label>
  <input id="pantalla" name="pantalla" type="password" autocomplete="new-password" minlength="8" placeholder="<?= $w['pantalla_hash'] ? 'Configurada. Deje vacío para conservarla.' : 'Sin clave: cualquiera con el enlace ve la pantalla' ?>">
  <p class="ayuda">La pantalla muestra nombres, entidades y municipios de las personas inscritas. Con una clave, cada navegador la escribe una vez y queda recordada 30 días.</p>
  <?php if ($w['pantalla_hash']): ?><label class="check"><input type="checkbox" name="pantalla_quitar" value="1"> Quitar la clave (pantalla pública)</label><?php endif; ?>

<?php elseif ($paso === 6): ?>
  <h1>Administración</h1>
  <p><?= $instalado ? 'Escriba una contraseña nueva solo si quiere cambiarla.' : 'Esta contraseña protege el asistente después de la instalación.' ?></p>
  <div class="dos">
    <div><label for="clave1">Contraseña</label><input id="clave1" name="clave1" type="password" autocomplete="new-password" <?= $instalado ? '' : 'required' ?> minlength="10"></div>
    <div><label for="clave2">Repita la contraseña</label><input id="clave2" name="clave2" type="password" autocomplete="new-password" <?= $instalado ? '' : 'required' ?>></div>
  </div>
  <h2>Resumen</h2>
  <table class="resumen">
    <tr><td>API de eventos</td><td><?= pulpo_e($w['api_base']) ?></td></tr>
    <tr><td>Token</td><td><?= $w['api_token'] ? 'guardado' : '<span class="no">falta</span>' ?></td></tr>
    <tr><td>ElevenLabs</td><td><?= $w['el_key'] ? ('activo' . ($w['el_voz'] ? ', con voz' : ', sin voz de saludo')) : 'navegador' ?></td></tr>
    <tr><td>Gemini</td><td><?= $w['gem_key'] ? pulpo_e($w['gem_modelo']) : 'no' ?></td></tr>
    <tr><td>Cámara</td><td><?= $w['camara'] ? 'al iniciar' : 'apagada' ?></td></tr>
    <tr><td>Pantalla</td><td><?= $w['pantalla_hash'] ? 'con clave' : '<span class="medio">pública</span>' ?></td></tr>
    <tr><td>Dirección</td><td><?= pulpo_e(pulpo_url()) ?></td></tr>
    <tr><td>Saludo</td><td><?= pulpo_e($w['saludo']) ?></td></tr>
  </table>
<?php endif; ?>

<?php if ($mensaje): ?>
  <div class="alerta <?= pulpo_e($mensaje['tipo']) ?>"><?= pulpo_e($mensaje['texto']) ?>
    <?php if (!empty($mensaje['detalle'])): ?><ul><?php foreach ($mensaje['detalle'] as $d): ?><li><?= pulpo_e($d) ?></li><?php endforeach; ?></ul><?php endif; ?>
  </div>
<?php endif; ?>

<div class="acciones">
  <?php if (in_array($paso, [2, 3, 4], true)): ?><button class="boton prueba" name="boton" value="probar">Probar conexión</button><?php endif; ?>
  <?php if ($paso > 1): ?><button class="boton secundario" name="boton" value="anterior" formnovalidate>Anterior</button><?php endif; ?>
  <button class="boton" name="boton" value="siguiente"><?= $paso === 6 ? ($instalado ? 'Guardar cambios' : 'Instalar') : 'Siguiente' ?></button>
</div>
</form>
</section>
<?php
pagina_fin();
