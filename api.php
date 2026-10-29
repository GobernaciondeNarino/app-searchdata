<?php
/**
 * Proxy del Pulpo de datos.
 * Las claves (token de eventos, ElevenLabs, Gemini) se quedan en el servidor;
 * el navegador solo habla con este archivo.
 *
 *   GET  api.php?accion=datos    perfiles + personas + expositores (minimizados, en caché)
 *   POST api.php?accion=stt      audio  -> texto (ElevenLabs)
 *   POST api.php?accion=tts      texto  -> mp3   (ElevenLabs)
 *   POST api.php?accion=gemini   texto + candidatos -> persona elegida (Gemini)
 *
 * Cada petición debe traer la cabecera X-Pulpo-Pase que index.php entrega a la
 * pantalla (firmada con la clave interna, válida 24 h). Cada respuesta trae un
 * pase nuevo, así la pantalla se mantiene autorizada mientras siga encendida.
 */
declare(strict_types=1);

require __DIR__ . '/inc/funciones.php';

$c = pulpo_config();
if (!pulpo_instalado($c)) {
    pulpo_error(503, 'La aplicación no está instalada. Abra instalar.php.');
}
pulpo_mismo_origen();
if (!pulpo_firmado_valido($c, 'pase', (string) ($_SERVER['HTTP_X_PULPO_PASE'] ?? ''))) {
    pulpo_error(401, 'La pantalla debe recargarse para obtener un pase nuevo.', 'pase');
}
header('X-Pulpo-Pase: ' . pulpo_firmar($c, 'pase', PULPO_PASE_SEG));

$accion = (string) ($_GET['accion'] ?? '');
$metodo = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');

switch ($accion) {
    case 'datos':
        accion_datos($c);
    case 'stt':
        $metodo === 'POST' || pulpo_error(405, 'Use POST');
        pulpo_limitar('voz', 25);
        accion_stt($c);
    case 'tts':
        $metodo === 'POST' || pulpo_error(405, 'Use POST');
        pulpo_limitar('voz', 25);
        accion_tts($c);
    case 'gemini':
        $metodo === 'POST' || pulpo_error(405, 'Use POST');
        pulpo_limitar('ia', 30);
        accion_gemini($c);
    default:
        pulpo_error(400, 'Acción desconocida');
}

function accion_datos(array $c): never
{
    try {
        $r = pulpo_datos($c);
    } catch (Throwable $e) {
        error_log('Pulpo de datos: ' . $e->getMessage());
        pulpo_error(502, 'No se pudo consultar la API de eventos. Revise la conexión en el asistente.');
    }
    if (!empty($r['aviso'])) {
        error_log('Pulpo de datos (sirve caché): ' . $r['aviso']);
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Pulpo-Cache: ' . ($r['cache'] ? 'si' : 'no'));
    echo $r['json'];
    exit;
}

function accion_stt(array $c): never
{
    if ($c['el_key'] === '') {
        pulpo_error(501, 'ElevenLabs no está configurado');
    }
    $f = $_FILES['audio'] ?? null;
    if (!is_array($f) || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
        pulpo_error(400, 'No llegó el audio');
    }
    if ((int) $f['size'] > 8 * 1024 * 1024) {
        pulpo_error(413, 'El audio es demasiado largo');
    }
    $tipo = (string) ($f['type'] ?? '');
    if ($tipo === '' || !str_starts_with($tipo, 'audio/')) {
        $tipo = 'audio/webm';
    }
    $r = pulpo_http('POST', 'https://api.elevenlabs.io/v1/speech-to-text', [
        'headers' => ['xi-api-key: ' . $c['el_key']],
        'cuerpo'  => [
            'model_id'      => $c['el_stt'] ?: 'scribe_v1',
            'language_code' => 'spa',
            'file'          => new CURLFile((string) $f['tmp_name'], $tipo, 'voz.webm'),
        ],
        'timeout' => 45,
    ]);
    if ($r['estado'] !== 200) {
        pulpo_error(502, 'ElevenLabs respondió ' . ($r['estado'] ?: $r['error']));
    }
    $j = json_decode($r['cuerpo'], true);
    pulpo_json(['texto' => trim((string) ($j['text'] ?? '')), 'ms' => $r['ms']]);
}

function accion_tts(array $c): never
{
    if ($c['el_key'] === '' || $c['el_voz'] === '') {
        pulpo_error(501, 'La voz de ElevenLabs no está configurada');
    }
    $texto = trim((string) (pulpo_entrada_json()['texto'] ?? ''));
    if ($texto === '' || pulpo_largo($texto) > 220) {
        pulpo_error(400, 'Texto vacío o demasiado largo');
    }
    $url = 'https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode((string) $c['el_voz']) . '?output_format=mp3_44100_128';
    $r = pulpo_http('POST', $url, [
        'headers' => ['xi-api-key: ' . $c['el_key'], 'Content-Type: application/json', 'Accept: audio/mpeg'],
        'cuerpo'  => json_encode(['text' => $texto, 'model_id' => $c['el_tts'] ?: 'eleven_multilingual_v2'], JSON_UNESCAPED_UNICODE),
        'timeout' => 45,
    ]);
    if ($r['estado'] !== 200) {
        pulpo_error(502, 'ElevenLabs respondió ' . ($r['estado'] ?: $r['error']));
    }
    header('Content-Type: audio/mpeg');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo $r['cuerpo'];
    exit;
}

function accion_gemini(array $c): never
{
    if ($c['gem_key'] === '') {
        pulpo_error(501, 'Gemini no está configurado');
    }
    $in = pulpo_entrada_json();
    $dicho = pulpo_cortar((string) ($in['texto'] ?? ''), 300);
    if ($dicho === '') {
        pulpo_error(400, 'Falta el texto');
    }
    $candidatos = [];
    foreach (array_slice(is_array($in['candidatos'] ?? null) ? $in['candidatos'] : [], 0, 30) as $p) {
        if (!is_array($p) || !isset($p['id'])) {
            continue;
        }
        $candidatos[] = [
            'id'        => (int) $p['id'],
            'nombre'    => pulpo_cortar((string) ($p['nombre'] ?? ''), 120),
            'entidad'   => pulpo_cortar((string) ($p['entidad'] ?? ''), 120),
            'municipio' => pulpo_cortar((string) ($p['municipio'] ?? ''), 60),
        ];
    }
    $prompt = "Eres el buscador de asistentes de un evento en Nariño, Colombia. Alguien dijo por voz: «{$dicho}».\n"
        . "La transcripción puede tener errores fonéticos (acento nariñense, apellidos indígenas o compuestos, tildes ausentes). "
        . "También puede mencionar la entidad o el municipio.\n"
        . "Elige de la lista el registro que corresponde. Si ninguno corresponde de forma razonable, devuelve id null.\n"
        . 'Responde solo con JSON: {"id": número o null, "confianza": número entre 0 y 1, "nombre_escuchado": texto}.' . "\n"
        . 'Candidatos: ' . json_encode($candidatos, JSON_UNESCAPED_UNICODE);

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode((string) $c['gem_modelo']) . ':generateContent';
    $r = pulpo_http('POST', $url, [
        'headers' => ['Content-Type: application/json', 'x-goog-api-key: ' . $c['gem_key']],
        'cuerpo'  => json_encode([
            'contents'         => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
            'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0],
        ], JSON_UNESCAPED_UNICODE),
        'timeout' => 30,
    ]);
    if ($r['estado'] !== 200) {
        pulpo_error(502, 'Gemini respondió ' . ($r['estado'] ?: $r['error']));
    }
    $j = json_decode($r['cuerpo'], true);
    $texto = '';
    foreach (($j['candidates'][0]['content']['parts'] ?? []) as $parte) {
        $texto .= (string) ($parte['text'] ?? '');
    }
    $res = json_decode(trim(str_replace(['```json', '```'], '', $texto)), true);
    if (!is_array($res)) {
        pulpo_error(502, 'Gemini no devolvió JSON válido');
    }
    pulpo_json([
        'id'               => isset($res['id']) && $res['id'] !== null ? (int) $res['id'] : null,
        'confianza'        => (float) ($res['confianza'] ?? 0),
        'nombre_escuchado' => (string) ($res['nombre_escuchado'] ?? ''),
        'ms'               => $r['ms'],
    ]);
}
