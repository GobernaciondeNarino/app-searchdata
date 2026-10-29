<?php
/**
 * Pulpo de datos – Cumbre Tecnológica IA Nariño
 * Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto
 *
 * Funciones compartidas por index.php, api.php e instalar.php.
 */
declare(strict_types=1);

const PULPO_VERSION = '2.2.0';
const PULPO_PASE_SEG = 86400;             // validez del pase que la pantalla presenta a api.php
const PULPO_PANTALLA_SEG = 30 * 86400;    // validez de la cookie de la clave de pantalla
define('PULPO_RAIZ', dirname(__DIR__));
define('PULPO_DATOS', PULPO_RAIZ . '/datos');

/* ---------------------------------------------------------------------
   Configuración
   --------------------------------------------------------------------- */
function pulpo_ruta_config(): string
{
    return PULPO_DATOS . '/config.php';
}

function pulpo_config_defecto(): array
{
    return [
        'api_base'      => 'https://tic.narino.gov.co/eventos/api/v1',
        'api_token'     => '',
        'ssl_verificar' => true,
        'el_key'        => '',
        'el_voz'        => '',
        'el_stt'        => 'scribe_v1',
        'el_tts'        => 'eleven_multilingual_v2',
        'gem_key'       => '',
        'gem_modelo'    => 'gemini-2.5-flash',
        'saludo'        => 'Bienvenido, {nombre}',
        'foco_seg'      => 9,
        'refresco_min'  => 3,
        'cache_seg'     => 60,
        'camara'        => true,
        'umbral'        => 0.5,
        'foto_url'      => '',
        'rostros_api'   => true,
        'pantalla_hash' => '',
        'admin_hash'    => '',
        'secreto'       => '',
        'instalado_en'  => '',
        'version'       => PULPO_VERSION,
    ];
}

/** Devuelve la configuración guardada o null si no existe. */
function pulpo_config(): ?array
{
    $f = pulpo_ruta_config();
    if (!is_file($f)) {
        return null;
    }
    $c = include $f;
    if (!is_array($c)) {
        return null;
    }
    return array_merge(pulpo_config_defecto(), $c);
}

function pulpo_instalado(?array $c): bool
{
    return $c !== null && !empty($c['admin_hash']) && !empty($c['api_token']);
}

/** Escribe un archivo de forma atómica (temporal + rename) con permisos 0640. */
function pulpo_escribir_atomico(string $destino, string $contenido): bool
{
    if (!is_dir(dirname($destino)) && !@mkdir(dirname($destino), 0750, true)) {
        return false;
    }
    $tmp = $destino . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, $contenido, LOCK_EX) === false) {
        return false;
    }
    @chmod($tmp, 0640);
    if (!@rename($tmp, $destino)) {
        @unlink($tmp);
        return false;
    }
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($destino, true);
    }
    return true;
}

function pulpo_guardar_config(array $c): bool
{
    $php = "<?php\n// Generado por el asistente de instalación del Pulpo de datos.\n"
         . "// Para cambiar valores use instalar.php (requiere la contraseña de administración).\n"
         . 'return ' . var_export($c, true) . ";\n";
    return pulpo_escribir_atomico(pulpo_ruta_config(), $php);
}

/** Clave interna para firmar pases y cookies. Se genera una vez y queda en datos/config.php. */
function pulpo_secreto(array &$c): string
{
    if (strlen((string) $c['secreto']) < 64) {
        $c['secreto'] = bin2hex(random_bytes(32));
        pulpo_guardar_config($c);
    }
    return (string) $c['secreto'];
}

/* ---------------------------------------------------------------------
   Token interno de instalación
   Mientras la aplicación no está instalada, el asistente solo se abre con
   este token. Vive en datos/token-instalacion.php (un archivo PHP que no
   muestra nada si se pide por la web) y se borra al terminar la instalación.
   Quien despliega lo lee desde el Administrador de archivos de Plesk o lo
   define en la variable de entorno PULPO_TOKEN_INSTALACION.
   --------------------------------------------------------------------- */
function pulpo_ruta_token_instalacion(): string
{
    return PULPO_DATOS . '/token-instalacion.php';
}

/** Devuelve el token vigente; lo crea si no existe. null si no se pudo escribir. */
function pulpo_token_instalacion(): ?string
{
    $env = getenv('PULPO_TOKEN_INSTALACION');
    if (is_string($env) && strlen(trim($env)) >= 16) {
        return trim($env);
    }
    $f = pulpo_ruta_token_instalacion();
    if (is_file($f)) {
        $t = include $f;
        if (is_string($t) && strlen($t) >= 16) {
            return $t;
        }
    }
    $t = implode('-', str_split(strtoupper(bin2hex(random_bytes(10))), 5));
    $php = "<?php\n// Token interno de instalación del Pulpo de datos.\n"
         . "// Cópielo en el asistente (instalar.php) para iniciar la configuración.\n"
         . "// Se borra solo al terminar la instalación. Para generar otro, elimine este archivo.\n"
         . 'return ' . var_export($t, true) . ";\n";
    return pulpo_escribir_atomico($f, $php) ? $t : null;
}

function pulpo_token_instalacion_valido(string $entrada): bool
{
    $t = pulpo_token_instalacion();
    $normal = static fn (string $s): string => strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $s));
    return $t !== null && $entrada !== '' && hash_equals($normal($t), $normal($entrada));
}

function pulpo_borrar_token_instalacion(): void
{
    @unlink(pulpo_ruta_token_instalacion());
}

/* ---------------------------------------------------------------------
   Rutas: la aplicación funciona en la raíz del dominio o en cualquier
   subdirectorio (por ejemplo https://tic.narino.gov.co/app/octadata/).
   --------------------------------------------------------------------- */
/** Ruta pública de la aplicación, con barra final: "/" o "/app/octadata/". */
function pulpo_base(): string
{
    static $base = null;
    if ($base !== null) {
        return $base;
    }
    $env = getenv('PULPO_BASE');   // solo si un proxy inverso cambia la ruta pública
    $dir = is_string($env) && $env !== '' ? $env : dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
    $partes = array_filter(explode('/', str_replace('\\', '/', $dir)), static fn ($p) => $p !== '' && $p !== '.' && $p !== '..');
    $partes = array_map(static fn ($p) => rawurlencode(rawurldecode($p)), $partes);
    return $base = '/' . implode('/', $partes) . ($partes ? '/' : '');
}

function pulpo_url(string $ruta = ''): string
{
    return pulpo_base() . ltrim($ruta, '/');
}

function pulpo_redirigir(string $ruta): never
{
    header('Location: ' . pulpo_url($ruta), true, 303);
    exit;
}

/** Nombre de cookie propio de esta copia, para no chocar con otras apps del mismo dominio. */
function pulpo_nombre_cookie(string $base): string
{
    return $base . '_' . substr(md5(pulpo_base()), 0, 8);
}

function pulpo_opciones_cookie(int $expira = 0): array
{
    return ['expires' => $expira, 'path' => pulpo_base(), 'httponly' => true, 'samesite' => 'Strict', 'secure' => pulpo_es_https()];
}

function pulpo_sesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name(pulpo_nombre_cookie('pulpo_admin'));
    $o = pulpo_opciones_cookie();
    unset($o['expires']);
    session_set_cookie_params(['lifetime' => 0] + $o);
    session_start();
}

/* ---------------------------------------------------------------------
   Firmas: pase de la pantalla hacia api.php y cookie de la clave de pantalla
   --------------------------------------------------------------------- */
function pulpo_firma(array $c, string $mensaje): string
{
    $s = (string) $c['secreto'];
    return $s === '' ? '' : hash_hmac('sha256', $mensaje . '|' . pulpo_base(), $s);
}

function pulpo_firmado_valido(array $c, string $tipo, string $valor): bool
{
    if (!preg_match('/^(\d{10})\.([a-f0-9]{64})$/', $valor, $m) || (int) $m[1] < time()) {
        return false;
    }
    $esperado = pulpo_firma($c, $tipo . '|' . $m[1]);
    return $esperado !== '' && hash_equals($esperado, $m[2]);
}

function pulpo_firmar(array $c, string $tipo, int $segundos): string
{
    $exp = time() + $segundos;
    return $exp . '.' . pulpo_firma($c, $tipo . '|' . $exp);
}

/** La pantalla pública está abierta, o el navegador ya presentó la clave de pantalla. */
function pulpo_pantalla_autorizada(array $c): bool
{
    if ((string) $c['pantalla_hash'] === '') {
        return true;
    }
    $cookie = (string) ($_COOKIE[pulpo_nombre_cookie('pulpo_pantalla')] ?? '');
    return pulpo_firmado_valido($c, 'pantalla|' . substr((string) $c['pantalla_hash'], -12), $cookie);
}

function pulpo_autorizar_pantalla(array $c): void
{
    $valor = pulpo_firmar($c, 'pantalla|' . substr((string) $c['pantalla_hash'], -12), PULPO_PANTALLA_SEG);
    setcookie(pulpo_nombre_cookie('pulpo_pantalla'), $valor, pulpo_opciones_cookie(time() + PULPO_PANTALLA_SEG));
}

/* ---------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------- */
function pulpo_cortar(string $s, int $max): string
{
    $s = trim($s);
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function pulpo_largo(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s) : strlen($s);
}

function pulpo_dir_cache(): string
{
    $d = PULPO_DATOS . '/cache';
    if (!is_dir($d)) {
        @mkdir($d, 0750, true);
    }
    return $d;
}

/**
 * La caché con datos personales se guarda como .php con una guarda al inicio:
 * si alguien la pide por la web, PHP la ejecuta y no entrega nada, aunque el
 * servidor no lea .htaccess (por ejemplo, nginx sin reglas).
 */
const PULPO_GUARDA = "<?php http_response_code(404); exit; ?>\n";

function pulpo_cache_leer(string $f): string
{
    $raw = (string) @file_get_contents($f);
    return str_starts_with($raw, PULPO_GUARDA) ? substr($raw, strlen(PULPO_GUARDA)) : '';
}

function pulpo_cache_escribir(string $f, string $contenido): bool
{
    return pulpo_escribir_atomico($f, PULPO_GUARDA . $contenido);
}

function pulpo_json(array $datos, int $estado = 200): never
{
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function pulpo_error(int $estado, string $mensaje, string $codigo = ''): never
{
    pulpo_json(['error' => $mensaje] + ($codigo !== '' ? ['codigo' => $codigo] : []), $estado);
}

function pulpo_e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function pulpo_es_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

/** Cabeceras de seguridad comunes a las páginas HTML. */
function pulpo_cabeceras_html(string $csp): void
{
    header('Content-Security-Policy: ' . $csp);
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('X-Frame-Options: SAMEORIGIN');
    header('Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=()');
}

/** Origen (esquema://host[:puerto]) de una URL http(s), o '' si no lo es. */
function pulpo_origen(string $url): string
{
    $p = parse_url(str_replace(['{carnet}', '{id}'], 'x', $url));
    if (!is_array($p) || !in_array($p['scheme'] ?? '', ['http', 'https'], true) || empty($p['host'])) {
        return '';
    }
    return $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . (int) $p['port'] : '');
}

/* ---------------------------------------------------------------------
   Cliente HTTP (cURL)
   --------------------------------------------------------------------- */
function pulpo_http(string $metodo, string $url, array $opc = []): array
{
    $ch = curl_init($url);
    $ssl = (bool) ($opc['ssl'] ?? true);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_TIMEOUT        => (int) ($opc['timeout'] ?? 25),
        CURLOPT_CONNECTTIMEOUT => min(8, (int) ($opc['timeout'] ?? 25)),
        CURLOPT_HTTPHEADER     => $opc['headers'] ?? [],
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_USERAGENT      => 'PulpoDeDatos/' . PULPO_VERSION,
        CURLOPT_SSL_VERIFYPEER => $ssl,
        CURLOPT_SSL_VERIFYHOST => $ssl ? 2 : 0,
    ]);
    // Solo HTTP y HTTPS, también en redirecciones (nada de file://, gopher://, etc.).
    if (defined('CURLOPT_PROTOCOLS_STR')) {
        curl_setopt($ch, CURLOPT_PROTOCOLS_STR, 'http,https');
        curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS_STR, 'http,https');
    } else {
        curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
        curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
    }
    if (array_key_exists('cuerpo', $opc)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $opc['cuerpo']);
    }
    $t = microtime(true);
    $cuerpo = curl_exec($ch);
    return [
        'estado' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'cuerpo' => $cuerpo === false ? '' : (string) $cuerpo,
        'error'  => $cuerpo === false ? curl_error($ch) : '',
        'ms'     => (int) round((microtime(true) - $t) * 1000),
    ];
}

/* ---------------------------------------------------------------------
   API de eventos (tic.narino.gov.co)
   --------------------------------------------------------------------- */
/**
 * GET a la API de eventos. El token va en la cabecera Authorization (no queda en
 * los registros de acceso); si el servidor responde 401, se reintenta con ?token=.
 */
function pulpo_evento_http(array $c, string $url, string $acepta): array
{
    $opc = ['ssl' => (bool) $c['ssl_verificar'], 'timeout' => 25];
    $r = pulpo_http('GET', $url, $opc + ['headers' => ['Accept: ' . $acepta, 'Authorization: Bearer ' . $c['api_token']]]);
    if ($r['estado'] === 401) {
        $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query(['token' => $c['api_token']]);
        $r = pulpo_http('GET', $url, $opc + ['headers' => ['Accept: ' . $acepta]]);
    }
    return $r;
}

function pulpo_evento_get(array $c, string $ruta, array $params = []): array
{
    $url = rtrim((string) $c['api_base'], '/') . $ruta . ($params ? '?' . http_build_query($params) : '');
    $r = pulpo_evento_http($c, $url, 'application/json');
    if ($r['error'] !== '') {
        throw new RuntimeException('Sin conexión con la API de eventos: ' . $r['error']);
    }
    if ($r['estado'] !== 200) {
        throw new RuntimeException("La API de eventos respondió {$r['estado']} en {$ruta}");
    }
    $j = json_decode($r['cuerpo'], true);
    if (!is_array($j)) {
        throw new RuntimeException('La API de eventos no devolvió JSON válido');
    }
    return $j;
}

/** Recorre todas las páginas de un listado paginado. */
function pulpo_evento_todas(array $c, string $ruta, array $params): array
{
    $vistos = [];
    $salida = [];
    $pagina = 1;
    for ($guardia = 0; $guardia < 100; $guardia++) {
        $j = pulpo_evento_get($c, $ruta, $params + ['pagina' => $pagina]);
        $nuevos = 0;
        foreach (($j['datos'] ?? []) as $d) {
            $id = $d['id'] ?? null;
            if ($id === null || isset($vistos[$id])) {
                continue;
            }
            $vistos[$id] = true;
            $salida[] = $d;
            $nuevos++;
        }
        $p = $j['paginacion'] ?? null;
        if (!$p || empty($p['siguiente']) || $nuevos === 0) {
            break;
        }
        $pagina = (int) $p['siguiente'];
    }
    return $salida;
}

/** Algunas personas escriben su documento en "entidad": no se envía al navegador. */
function pulpo_entidad_segura(mixed $e): string
{
    $e = trim((string) $e);
    if ($e === '' || preg_match('/^[\d\s.\-]+$/', $e)) {
        return '';
    }
    return pulpo_cortar($e, 140);
}

/** Primer valor de texto entre varias claves posibles (acepta {nombre: …}). */
function pulpo_campo(array $d, array $claves, int $max = 80): string
{
    foreach ($claves as $k) {
        $v = $d[$k] ?? null;
        if (is_array($v)) {
            $v = $v['nombre'] ?? $v['clave'] ?? null;
        }
        if (is_scalar($v) && trim((string) $v) !== '') {
            return pulpo_cortar((string) $v, $max);
        }
    }
    return '';
}

/**
 * Deja solo los campos que la animación necesita (minimización de datos).
 * El carné solo sale del servidor si la plantilla de fotos lo usa. De la foto
 * solo sale si existe: el navegador la pide a api.php por id, nunca por URL.
 */
function pulpo_minimizar(array $d, ?int $orden = null, bool $conCarnet = false): array
{
    $propuesta = null;
    if (!empty($d['propuesta']) && is_array($d['propuesta'])) {
        $p = $d['propuesta'];
        $ag = $p['agenda'] ?? null;
        $propuesta = [
            'titulo'       => pulpo_cortar((string) ($p['titulo'] ?? ''), 220),
            'categoria'    => (string) ($p['categoria'] ?? ''),
            'duracion_min' => (int) ($p['duracion_min'] ?? 20),
            'agenda'       => is_array($ag) ? [
                'dia'   => (int) ($ag['dia'] ?? 0),
                'fecha' => (string) ($ag['fecha'] ?? ''),
                'hora'  => (string) ($ag['hora'] ?? ''),
                'salon' => (string) ($ag['salon'] ?? ''),
            ] : null,
        ];
    }
    return [
        'id'        => (int) $d['id'],
        'nombre'    => pulpo_cortar((string) ($d['nombre'] ?? ''), 120),
        'perfil'    => [
            'clave'  => (string) ($d['perfil']['clave'] ?? 'participante'),
            'nombre' => (string) ($d['perfil']['nombre'] ?? ''),
        ],
        'entidad'   => pulpo_entidad_segura($d['entidad'] ?? ''),
        'municipio' => pulpo_cortar((string) ($d['municipio'] ?? ''), 80),
        'departamento' => pulpo_campo($d, ['departamento']),
        'dependencia'  => pulpo_campo($d, ['dependencia']),
        'genero'       => pulpo_campo($d, ['genero', 'sexo', 'identidad_genero'], 40),
        'registro'     => preg_match('/^\d{4}-\d{2}-\d{2}/', (string) ($d['registrado_en'] ?? ''), $m) ? $m[0] : '',
        'completo'     => array_key_exists('registro_completo', $d) ? (bool) $d['registro_completo'] : null,
        'foto'         => pulpo_foto_url($d) !== '',
        'carnet'    => $conCarnet ? (string) ($d['carnet'] ?? '') : '',
        'ingresos'  => is_array($d['ingresos'] ?? null) ? count($d['ingresos']) : 0,
        'propuesta' => $propuesta,
        'orden'     => $orden,
    ];
}

function pulpo_foto_url(array $d): string
{
    $u = $d['foto'] ?? '';
    if (is_array($u)) {
        $u = $u['url'] ?? '';
    }
    return is_string($u) && pulpo_origen($u) !== '' ? $u : '';
}

/**
 * Descarga perfiles, personas y expositores aprobados, y los guarda en caché.
 * Si la API falla y hay una copia anterior, la sirve.
 */
function pulpo_datos(array $c, bool $forzar = false): array
{
    $dir = pulpo_dir_cache();
    $f = $dir . '/datos.json.php';
    $ttl = max(15, (int) $c['cache_seg']);
    $vigente = static fn (): bool => is_file($f) && (time() - (int) filemtime($f)) < $ttl;

    if (!$forzar && $vigente()) {
        return ['json' => pulpo_cache_leer($f), 'cache' => true];
    }
    $lock = fopen($dir . '/datos.lock', 'c');
    if ($lock) {
        flock($lock, LOCK_EX);
    }
    try {
        clearstatcache(true, $f);
        if (!$forzar && $vigente()) {
            return ['json' => pulpo_cache_leer($f), 'cache' => true];
        }
        $t = microtime(true);
        $conCarnet = str_contains((string) $c['foto_url'], '{carnet}');
        $perfiles = pulpo_evento_get($c, '/perfiles');
        $personas = [];
        $fotos = [];   // id => URL de la foto: se queda en el servidor
        foreach (($perfiles['datos'] ?? []) as $p) {
            $clave = (string) ($p['clave'] ?? '');
            if ($clave === '' || $clave === 'expositor' || (int) ($p['total'] ?? 0) < 1) {
                continue;
            }
            foreach (pulpo_evento_todas($c, '/personas', ['perfil' => $clave]) as $d) {
                $personas[] = pulpo_minimizar($d, null, $conCarnet);
                if (($u = pulpo_foto_url($d)) !== '') {
                    $fotos[(int) $d['id']] = $u;
                }
            }
        }
        $expositores = pulpo_evento_todas($c, '/expositores', ['estado' => 'aprobada', 'orden' => 'jornada']);
        foreach ($expositores as $i => $d) {
            $personas[] = pulpo_minimizar($d, $i, $conCarnet);
            if (($u = pulpo_foto_url($d)) !== '') {
                $fotos[(int) $d['id']] = $u;
            }
        }
        pulpo_cache_escribir($dir . '/fotos.json.php', (string) json_encode($fotos, JSON_UNESCAPED_SLASHES));
        $salida = [
            'evento'   => $perfiles['evento'] ?? null,
            'perfiles' => array_map(static fn ($p) => [
                'clave'  => (string) ($p['clave'] ?? ''),
                'nombre' => (string) ($p['nombre'] ?? ''),
                'total'  => (int) ($p['total'] ?? 0),
            ], $perfiles['datos'] ?? []),
            'personas' => $personas,
            'generado' => date('c'),
            'ms'       => (int) round((microtime(true) - $t) * 1000),
        ];
        $json = (string) json_encode($salida, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        pulpo_cache_escribir($f, $json);
        @unlink($dir . '/datos.json');   // caché sin protección de la versión 2.0.0
        return ['json' => $json, 'cache' => false];
    } catch (Throwable $e) {
        if (is_file($f)) {
            return ['json' => pulpo_cache_leer($f), 'cache' => true, 'aviso' => $e->getMessage()];
        }
        throw $e;
    } finally {
        if ($lock) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}

function pulpo_borrar_cache_datos(): void
{
    @unlink(pulpo_dir_cache() . '/datos.json.php');
    @unlink(pulpo_dir_cache() . '/datos.json');
    @unlink(pulpo_dir_cache() . '/fotos.json.php');
}

/**
 * Foto de una persona inscrita, tomada de la API de eventos y guardada en caché
 * (archivo PHP con guarda). Devuelve ['tipo' => mime, 'bin' => bytes] o null.
 * Solo acepta fotos alojadas en el mismo servidor que la API de eventos.
 */
function pulpo_foto(array $c, int $id): ?array
{
    $mapa = json_decode(pulpo_cache_leer(pulpo_dir_cache() . '/fotos.json.php'), true);
    if (!is_array($mapa)) {
        pulpo_datos($c);
        $mapa = json_decode(pulpo_cache_leer(pulpo_dir_cache() . '/fotos.json.php'), true);
    }
    $url = is_array($mapa) ? (string) ($mapa[$id] ?? $mapa[(string) $id] ?? '') : '';
    if ($url === '') {
        return null;
    }
    $dir = pulpo_dir_cache() . '/fotos';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $f = $dir . '/' . $id . '-' . substr(hash('sha256', $url), 0, 20) . '.php';
    $bin = is_file($f) ? pulpo_cache_leer($f) : '';
    if ($bin === '') {
        // Solo fotos del mismo servidor que la API: una URL ajena podría apuntar a la red interna.
        if (pulpo_origen($url) !== pulpo_origen((string) $c['api_base'])) {
            return null;
        }
        $r = pulpo_evento_http($c, $url, 'image/*');
        if ($r['estado'] !== 200 || strlen($r['cuerpo']) > 6 * 1024 * 1024) {
            return null;
        }
        $bin = $r['cuerpo'];
        if (pulpo_tipo_imagen($bin) === '') {
            return null;
        }
        foreach (glob($dir . '/' . $id . '-*.php') ?: [] as $viejo) {
            @unlink($viejo);   // versiones anteriores de la foto de esta persona
        }
        pulpo_cache_escribir($f, $bin);
    }
    $tipo = pulpo_tipo_imagen($bin);
    return $tipo === '' ? null : ['tipo' => $tipo, 'bin' => $bin];
}

/** Tipo MIME por los primeros bytes; '' si no es una imagen permitida. */
function pulpo_tipo_imagen(string $bin): string
{
    return match (true) {
        str_starts_with($bin, "\xFF\xD8\xFF")                              => 'image/jpeg',
        str_starts_with($bin, "\x89PNG\r\n\x1A\n")                        => 'image/png',
        str_starts_with($bin, 'RIFF') && substr($bin, 8, 4) === 'WEBP'     => 'image/webp',
        str_starts_with($bin, 'GIF87a') || str_starts_with($bin, 'GIF89a') => 'image/gif',
        default                                                            => '',
    };
}

/* ---------------------------------------------------------------------
   Protección básica del proxy
   --------------------------------------------------------------------- */
/** Rechaza peticiones que vengan de otro sitio (Sec-Fetch-Site, Origin o Referer). */
function pulpo_mismo_origen(): void
{
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        pulpo_error(403, 'Origen no permitido');
    }
    $host = strtolower(preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
    foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $k) {
        if (!empty($_SERVER[$k])) {
            $h = strtolower((string) parse_url((string) $_SERVER[$k], PHP_URL_HOST));
            if ($h !== $host) {
                pulpo_error(403, 'Origen no permitido');
            }
            return;
        }
    }
}

/**
 * Registra un intento de la IP actual en el cubo indicado y dice si ya superó
 * $max intentos dentro de la ventana (en segundos).
 */
function pulpo_excede_limite(string $cubo, int $max, int $ventana = 60): bool
{
    $dir = pulpo_dir_cache();
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'desconocida');
    $f = $dir . '/rl_' . $cubo . '_' . hash('sha256', $ip . '|' . __DIR__) . '.json';
    $ahora = time();
    $h = @fopen($f, 'c+');
    if (!$h) {
        return false;
    }
    flock($h, LOCK_EX);
    $lista = json_decode((string) stream_get_contents($h), true);
    $lista = array_values(array_filter(is_array($lista) ? $lista : [], static fn ($t) => $ahora - (int) $t < $ventana));
    $excedido = count($lista) >= $max;
    if (!$excedido) {
        $lista[] = $ahora;
    }
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, (string) json_encode($lista));
    flock($h, LOCK_UN);
    fclose($h);
    if (random_int(1, 200) === 1) {   // limpieza ocasional de contadores viejos
        foreach (glob($dir . '/rl_*.json') ?: [] as $viejo) {
            if ($ahora - (int) @filemtime($viejo) > 86400) {
                @unlink($viejo);
            }
        }
    }
    return $excedido;
}

/** Límite simple por IP: $max solicitudes por minuto en el cubo indicado. */
function pulpo_limitar(string $cubo, int $max): void
{
    if (pulpo_excede_limite($cubo, $max)) {
        pulpo_error(429, 'Demasiadas solicitudes seguidas; espera un minuto.');
    }
}

/** Lee el cuerpo JSON de la petición. */
function pulpo_entrada_json(): array
{
    $j = json_decode((string) file_get_contents('php://input', false, null, 0, 65536), true);
    return is_array($j) ? $j : [];
}
