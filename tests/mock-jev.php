<?php
/**
 * Jev simulado para pruebas locales (no se despliega). Responde como
 * POST /v1/systemone de TypeSafe AI, con reglas simples en lugar del modelo,
 * y guarda cada petición en mock-jev.log para revisar qué datos recibe.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer JEV-PRUEBA') {
    http_response_code(401);
    echo json_encode(['error' => ['message' => 'Missing or invalid API key']]);
    return;
}
$ruta = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($ruta === '/jev/v1/models') {
    echo json_encode(['models' => [['name' => 'jev-latest'], ['name' => 'jev-preview']]]);
    return;
}
$cuerpo = (string) file_get_contents('php://input');
file_put_contents(sys_get_temp_dir() . '/mock-jev.log', $cuerpo . "\n", FILE_APPEND);
$req = json_decode($cuerpo, true);
$estado = $req['state'] ?? [];
$sin = static fn (string $t): string => strtolower(strtr($t, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n', 'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u']));
$dicho = $sin((string) ($estado['dicho'] ?? ''));
$respuestas = [];
foreach (($req['questions'] ?? []) as $id => $q) {
    $opciones = array_keys($q['criteria'] ?? []);
    $elegida = $opciones[0] ?? '';
    $conf = 0.9;
    if ($id === 'intencion') {
        $elegida = preg_match('/organiz|agrup|orden|clasific|muestra|por (tipo|sector)/', $dicho) ? 'organizar' : 'buscar_persona';
    } elseif ($id === 'caracteristica') {
        $elegida = match (true) {
            (bool) preg_match('/tipo|sector/', $dicho) => 'sector',
            (bool) preg_match('/universidad|empresa|entidad/', $dicho) => 'entidad',
            (bool) preg_match('/municipio|ciudad/', $dicho) => 'municipio',
            default => 'ninguna',
        };
    } elseif ($id === 'persona') {
        $mejor = ['ninguna', 0];
        $palabras = array_filter(explode(' ', preg_replace('/[^a-z ]/', ' ', $dicho)), static fn ($w) => strlen($w) > 3);
        foreach ($q['criteria'] as $k => $desc) {
            $n = 0;
            foreach ($palabras as $w) {
                $n += str_contains($sin((string) $desc), $w) ? 1 : 0;
            }
            if ($k !== 'ninguna' && $n > $mejor[1]) {
                $mejor = [$k, $n];
            }
        }
        $elegida = $mejor[0];
        $conf = $mejor[1] >= 2 ? 0.92 : ($mejor[1] === 1 ? 0.45 : 0.8);
    } elseif ($id === 'accion') {
        $d1 = (float) $estado['distancia_mejor'];
        $d2 = (float) $estado['distancia_segundo'];
        $u = (float) $estado['umbral_configurado'];
        $elegida = $d1 < $u * 0.8 && $d2 - $d1 > 0.1 ? 'saludar' : ($d1 < $u ? 'confirmar' : 'ignorar');
    } elseif ($id === 'saludo') {
        $elegida = ((int) ($estado['ingresos_previos'] ?? 0)) > 0 ? 'regreso' : 'bienvenida';
    } elseif (preg_match('/^e\d+$/', $id)) {
        $e = $sin((string) ($estado['entidades'][$id] ?? ''));
        $elegida = match (true) {
            (bool) preg_match('/universidad|cesmag|mariana|unad/', $e) => 'academia',
            (bool) preg_match('/gobernacion|idsn|secretaria/', $e) => 'gobierno_departamental',
            (bool) preg_match('/alcaldia/', $e) => 'gobierno_municipal',
            (bool) preg_match('/sena/', $e) => 'gobierno_nacional',
            (bool) preg_match('/independiente|particular/', $e) => 'independiente',
            default => 'empresa',
        };
    }
    $respuestas[$id] = ['type' => 'choice', 'choice' => $elegida, 'confidence' => $conf, 'probabilities' => [$elegida => $conf]];
}
echo json_encode(['model' => 'jev-1.14.0', 'answers' => $respuestas, 'usage' => ['input_tokens' => strlen($cuerpo) >> 2, 'output_tokens' => 10]], JSON_UNESCAPED_UNICODE);
