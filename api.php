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
 *   GET  api.php?accion=foto&id= foto de referencia de una persona (desde la API de eventos)
 *   POST api.php?accion=jev_orden   lo dicho + candidatos -> intención, característica y persona (Jev)
 *   POST api.php?accion=jev_camara  señales numéricas del rostro -> saludar, confirmar o ignorar (Jev)
 *   GET  api.php?accion=aprendizaje  conteos anónimos de «sí / no» por distancia del rostro
 *   POST api.php?accion=entrenar     registra una respuesta «sí / no» a «¿Eres tú?»
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
    case 'foto':
        pulpo_limitar('foto', 900);
        accion_foto($c);
    case 'jev_orden':
        $metodo === 'POST' || pulpo_error(405, 'Use POST');
        pulpo_limitar('ia', 40);
        accion_jev_orden($c);
    case 'jev_camara':
        $metodo === 'POST' || pulpo_error(405, 'Use POST');
        pulpo_limitar('jev_camara', 30);
        accion_jev_camara($c);
    case 'aprendizaje':
        pulpo_json(pulpo_aprendizaje());
    case 'entrenar':
        $metodo === 'POST' || pulpo_error(405, 'Use POST');
        pulpo_limitar('entrenar', 30);
        $in = pulpo_entrada_json();
        if (!is_numeric($in['distancia'] ?? null) || !in_array($in['respuesta'] ?? '', ['si', 'no'], true)) {
            pulpo_error(400, 'Faltan la distancia o la respuesta');
        }
        pulpo_json(pulpo_aprender((float) $in['distancia'], $in['respuesta'] === 'si'));
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

function accion_foto(array $c): never
{
    if (empty($c['rostros_api'])) {
        pulpo_error(403, 'El reconocimiento con las fotos de la API está desactivado en el asistente.');
    }
    $id = (int) ($_GET['id'] ?? 0);
    try {
        $f = $id > 0 ? pulpo_foto($c, $id) : null;
    } catch (Throwable $e) {
        error_log('Pulpo de datos (foto): ' . $e->getMessage());
        $f = null;
    }
    if ($f === null) {
        pulpo_error(404, 'Sin foto');
    }
    header('Content-Type: ' . $f['tipo']);
    header('Content-Length: ' . strlen($f['bin']));
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'");
    echo $f['bin'];
    exit;
}

/** Candidatos que manda la pantalla, recortados (los mismos campos que ve Gemini). */
function candidatos_entrada(array $in): array
{
    $out = [];
    foreach (array_slice(is_array($in['candidatos'] ?? null) ? $in['candidatos'] : [], 0, 30) as $p) {
        if (is_array($p) && isset($p['id'])) {
            $out[(int) $p['id']] = pulpo_cortar((string) ($p['nombre'] ?? ''), 120) . ' — ' . pulpo_cortar((string) ($p['entidad'] ?? ''), 120)
                . ' — ' . pulpo_cortar((string) ($p['municipio'] ?? ''), 60);
        }
    }
    return $out;
}

/**
 * Jev decide, en una sola llamada y con preguntas en paralelo, qué pidió la
 * persona (buscar a alguien u organizar la esfera), por qué característica y
 * a cuál de los candidatos se refiere. La pantalla actúa según la confianza.
 */
function accion_jev_orden(array $c): never
{
    if (!pulpo_jev_activo($c, 'busqueda')) {
        pulpo_error(501, 'Jev no está configurado para la búsqueda');
    }
    $in = pulpo_entrada_json();
    $dicho = pulpo_cortar((string) ($in['texto'] ?? ''), 300);
    if ($dicho === '') {
        pulpo_error(400, 'Falta el texto');
    }
    $personas = ['ninguna' => 'Ninguna de estas personas, o no se está buscando a una persona'];
    foreach (candidatos_entrada($in) as $id => $txt) {
        $personas['p' . $id] = $txt;
    }
    $preguntas = [
        'intencion' => ['type' => 'choice',
            'instructions' => 'Alguien habló o escribió frente a la pantalla de un evento de tecnología en Nariño, Colombia. ¿Qué pide en `dicho`?',
            'criteria' => [
                'buscar_persona' => 'Nombra o busca a una persona inscrita: dice un nombre, un apellido o ambos',
                'organizar'      => 'Pide organizar, agrupar, ordenar, clasificar o mostrar a los asistentes según alguna característica',
                'otra'           => 'Saluda, pregunta otra cosa o el texto no se entiende',
            ]],
        'caracteristica' => ['type' => 'choice',
            'instructions' => 'Si `dicho` pide organizar o agrupar a los asistentes, ¿según qué característica?',
            'criteria' => [
                'municipio'    => 'Municipio o ciudad de donde vienen',
                'departamento' => 'Departamento o región',
                'entidad'      => 'Entidad, empresa, universidad u organización a la que pertenecen',
                'sector'       => 'Tipo de organización: gobierno, academia, empresa, salud, fundación, medios…',
                'perfil'       => 'Perfil de inscripción: participante, expositor, prensa, rueda de negocios…',
                'registro'     => 'Fecha o día en que se inscribieron',
                'asistencia'   => 'Si ya llegaron o ingresaron al evento',
                'estado'       => 'Si el registro está completo o incompleto',
                'genero'       => 'Género, mujeres y hombres',
                'dependencia'  => 'Dependencia, secretaría u oficina',
                'ninguna'      => 'No pide organizar',
            ]],
        'persona' => ['type' => 'choice',
            'instructions' => 'La transcripción de `dicho` puede tener errores (acento nariñense, apellidos indígenas o compuestos, tildes ausentes) y puede mencionar la entidad o el municipio. ¿A cuál de estas personas inscritas se refiere?',
            'criteria' => $personas],
    ];
    try {
        $r = pulpo_jev($c, ['dicho' => $dicho], $preguntas);
    } catch (Throwable $e) {
        error_log('Pulpo de datos (Jev): ' . $e->getMessage());
        pulpo_error(502, 'Jev no respondió');
    }
    [$intencion, $ci] = pulpo_jev_eleccion($r['answers'], 'intencion', 'otra');
    [$caract, $cc] = pulpo_jev_eleccion($r['answers'], 'caracteristica', 'ninguna');
    [$persona, $cp] = pulpo_jev_eleccion($r['answers'], 'persona', 'ninguna');
    pulpo_json([
        'intencion'      => ['valor' => $intencion, 'confianza' => $ci],
        'caracteristica' => ['valor' => $caract, 'confianza' => $cc],
        'persona'        => ['id' => preg_match('/^p(\d+)$/', $persona, $m) ? (int) $m[1] : null, 'confianza' => $cp],
        'modelo'         => $r['modelo'],
        'ms'             => $r['ms'],
    ]);
}

/**
 * Jev decide qué hace la cámara con un rostro que se parece a una persona
 * inscrita. Solo recibe números y el perfil: ni la imagen, ni el nombre.
 */
function accion_jev_camara(array $c): never
{
    if (!pulpo_jev_activo($c, 'camara')) {
        pulpo_error(501, 'Jev no está configurado para la cámara');
    }
    $in = pulpo_entrada_json();
    $num = static fn (string $k, float $min, float $max): float => max($min, min($max, (float) ($in[$k] ?? 0)));
    $estado = [
        'distancia_mejor'     => round($num('d1', 0, 2), 3),
        'distancia_segundo'   => round($num('d2', 0, 2), 3),
        'umbral_configurado'  => (float) $c['umbral'],
        'cuadros_estables'    => (int) $num('cuadros', 0, 100),
        'calidad_deteccion'   => round($num('calidad', 0, 1), 2),
        'ancho_rostro_px'     => (int) $num('ancho', 0, 4000),
        'rostros_en_cuadro'   => (int) $num('caras', 0, 50),
        'perfil'              => pulpo_cortar((string) ($in['perfil'] ?? ''), 40),
        'ingresos_previos'    => (int) $num('ingresos', 0, 99),
        'minutos_para_charla' => is_numeric($in['charla_min'] ?? null) ? (int) $in['charla_min'] : null,
        'coincidencia_calibrada' => round($num('coincidencia', 0, 1), 2),
        'respuestas_previas_en_esta_distancia' => (pulpo_aprendizaje()['bins'][pulpo_tramo($num('d1', 0, 2))] ?? ['si' => 0, 'no' => 0]),
    ];
    $preguntas = [
        'accion' => ['type' => 'choice',
            'instructions' => 'Una cámara de bienvenida compara un rostro con las fotos de inscripción. Una distancia menor indica más parecido; por debajo de `umbral_configurado` se considera la misma persona. `coincidencia_calibrada` es la probabilidad estimada con las respuestas «sí / no» que han dado las personas, y `respuestas_previas_en_esta_distancia` cuenta cuántas confirmaron o rechazaron con una distancia parecida. Solo se saluda en voz alta con una coincidencia de 0,8 o más. ¿Qué debe hacer la pantalla?',
            'criteria' => [
                'saludar'   => 'El parecido es claro, estable durante varios cuadros y le saca buen margen al segundo candidato: saludar por su nombre en voz alta',
                'confirmar' => 'Probablemente es esa persona, pero el margen es poco, la calidad es baja o hay pocos cuadros: mostrar su nombre en silencio para que confirme',
                'ignorar'   => 'No hay una coincidencia confiable, el rostro es muy pequeño o hay demasiados rostros: no hacer nada',
            ]],
        'saludo' => ['type' => 'choice',
            'instructions' => '¿Qué mensaje de bienvenida conviene para esta persona?',
            'criteria' => [
                'bienvenida' => 'Primera llegada, sin nada especial',
                'regreso'    => 'Ya había ingresado antes al evento (`ingresos_previos` mayor que 0)',
                'charla'     => 'Su perfil es expositor y su charla empieza en menos de 90 minutos',
                'expositor'  => 'Su perfil es expositor y su charla no es pronto o ya pasó',
            ]],
    ];
    try {
        $r = pulpo_jev($c, $estado, $preguntas, 5);
    } catch (Throwable $e) {
        error_log('Pulpo de datos (Jev, cámara): ' . $e->getMessage());
        pulpo_error(502, 'Jev no respondió');
    }
    [$accion, $ca] = pulpo_jev_eleccion($r['answers'], 'accion', 'confirmar');
    [$saludo, $cs] = pulpo_jev_eleccion($r['answers'], 'saludo', 'bienvenida');
    pulpo_json(['accion' => $accion, 'confianza' => $ca, 'saludo' => $saludo, 'saludo_confianza' => $cs, 'modelo' => $r['modelo'], 'ms' => $r['ms']]);
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
