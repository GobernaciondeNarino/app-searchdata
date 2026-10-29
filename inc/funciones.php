<?php
/**
 * Pulpo de datos – Cumbre Tecnológica IA Nariño
 * Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto
 *
 * Funciones compartidas por index.php, api.php e instalar.php.
 */
declare(strict_types=1);

const PULPO_VERSION = '2.0.0';
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
        'admin_hash'    => '',
        'instalado_en'  => '',
        'version'       => PULPO_VERSION,
    ];
}

/** Devuelve la configuración guardada o null si la aplicación no está instalada. */
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

function pulpo_guardar_config(array $c): bool
{
    if (!is_dir(PULPO_DATOS) && !@mkdir(PULPO_DATOS, 0750, true)) {
        return false;
    }
    $php = "<?php\n// Generado por el asistente de instalación del Pulpo de datos.\n"
         . "// Para cambiar valores use instalar.php (requiere la contraseña de administración).\n"
         . 'return ' . var_export($c, true) . ";\n";
    $destino = pulpo_ruta_config();
    $tmp = $destino . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $php, LOCK_EX) === false) {
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

function pulpo_json(array $datos, int $estado = 200): never
{
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function pulpo_error(int $estado, string $mensaje): never
{
    pulpo_json(['error' => $mensaje], $estado);
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
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER     => $opc['headers'] ?? [],
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_USERAGENT      => 'PulpoDeDatos/' . PULPO_VERSION,
        CURLOPT_SSL_VERIFYPEER => $ssl,
        CURLOPT_SSL_VERIFYHOST => $ssl ? 2 : 0,
    ]);
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
function pulpo_evento_get(array $c, string $ruta, array $params = []): array
{
    $params['token'] = $c['api_token'];
    $url = rtrim((string) $c['api_base'], '/') . $ruta . '?' . http_build_query($params);
    $r = pulpo_http('GET', $url, ['ssl' => (bool) $c['ssl_verificar'], 'headers' => ['Accept: application/json']]);
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

/** Deja solo los campos que la animación necesita (minimización de datos). */
function pulpo_minimizar(array $d, ?int $orden = null): array
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
        'carnet'    => (string) ($d['carnet'] ?? ''),
        'ingresos'  => is_array($d['ingresos'] ?? null) ? count($d['ingresos']) : 0,
        'propuesta' => $propuesta,
        'orden'     => $orden,
    ];
}

/**
 * Descarga perfiles, personas y expositores aprobados, y los guarda en caché.
 * Si la API falla y hay una copia anterior, la sirve.
 */
function pulpo_datos(array $c, bool $forzar = false): array
{
    $dir = pulpo_dir_cache();
    $f = $dir . '/datos.json';
    $ttl = max(15, (int) $c['cache_seg']);
    $vigente = static fn (): bool => is_file($f) && (time() - (int) filemtime($f)) < $ttl;

    if (!$forzar && $vigente()) {
        return ['json' => (string) file_get_contents($f), 'cache' => true];
    }
    $lock = fopen($dir . '/datos.lock', 'c');
    if ($lock) {
        flock($lock, LOCK_EX);
    }
    try {
        clearstatcache(true, $f);
        if (!$forzar && $vigente()) {
            return ['json' => (string) file_get_contents($f), 'cache' => true];
        }
        $t = microtime(true);
        $perfiles = pulpo_evento_get($c, '/perfiles');
        $personas = [];
        foreach (($perfiles['datos'] ?? []) as $p) {
            $clave = (string) ($p['clave'] ?? '');
            if ($clave === '' || $clave === 'expositor' || (int) ($p['total'] ?? 0) < 1) {
                continue;
            }
            foreach (pulpo_evento_todas($c, '/personas', ['perfil' => $clave]) as $d) {
                $personas[] = pulpo_minimizar($d);
            }
        }
        $expositores = pulpo_evento_todas($c, '/expositores', ['estado' => 'aprobada', 'orden' => 'jornada']);
        foreach ($expositores as $i => $d) {
            $personas[] = pulpo_minimizar($d, $i);
        }
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
        $tmp = $f . '.tmp';
        file_put_contents($tmp, $json, LOCK_EX);
        @rename($tmp, $f);
        return ['json' => $json, 'cache' => false];
    } catch (Throwable $e) {
        if (is_file($f)) {
            return ['json' => (string) file_get_contents($f), 'cache' => true, 'aviso' => $e->getMessage()];
        }
        throw $e;
    } finally {
        if ($lock) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}

/* ---------------------------------------------------------------------
   Protección básica del proxy
   --------------------------------------------------------------------- */
/** Rechaza peticiones que vengan de otro sitio (Origin o Referer distintos). */
function pulpo_mismo_origen(): void
{
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

/** Límite simple por IP: $max solicitudes por minuto en el cubo indicado. */
function pulpo_limitar(string $cubo, int $max): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'desconocida');
    $f = pulpo_dir_cache() . '/rl_' . $cubo . '_' . md5($ip) . '.json';
    $ahora = time();
    $h = fopen($f, 'c+');
    if (!$h) {
        return;
    }
    flock($h, LOCK_EX);
    $lista = json_decode((string) stream_get_contents($h), true);
    $lista = array_values(array_filter(is_array($lista) ? $lista : [], static fn ($t) => $ahora - (int) $t < 60));
    $excedido = count($lista) >= $max;
    if (!$excedido) {
        $lista[] = $ahora;
    }
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, (string) json_encode($lista));
    flock($h, LOCK_UN);
    fclose($h);
    if ($excedido) {
        pulpo_error(429, 'Demasiadas solicitudes seguidas; espera un minuto.');
    }
}

/** Lee el cuerpo JSON de la petición. */
function pulpo_entrada_json(): array
{
    $j = json_decode((string) file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
}
