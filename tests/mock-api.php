<?php
/**
 * API de eventos simulada para pruebas locales (no se despliega).
 *   php -S 127.0.0.1:8090 tests/mock-api.php
 * Imita /perfiles, /personas y /expositores de tic.narino.gov.co/eventos/api/v1.
 */
declare(strict_types=1);
const TOKEN = 'TOKEN-PRUEBA-123';
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$ruta = preg_replace('#^/api/v1#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (($_GET['token'] ?? '') !== TOKEN && $auth !== 'Bearer ' . TOKEN) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => ['codigo' => 401, 'titulo' => 'Falta el token']]);
    return;
}
file_put_contents(sys_get_temp_dir() . '/mock-api-auth.log', ($auth !== '' ? 'cabecera' : 'url') . " {$ruta}\n", FILE_APPEND);
// Fotos: /fotos/{id}/{version}/{hash} → PNG generado (sin rostro real).
if (preg_match('#^/fotos/(\d+)/\d+/[0-9a-f]{32}$#', $ruta, $m)) {
    $im = imagecreatetruecolor(240, 300);
    imagefill($im, 0, 0, imagecolorallocate($im, 40 + ((int) $m[1] * 37) % 200, 120, 160));
    header('Content-Type: image/png');
    imagepng($im);
    return;
}
header('Content-Type: application/json; charset=utf-8');
mt_srand(7);
$nombres = ['Ana', 'Luis', 'Carmen', 'Jorge', 'Diana', 'Andrés', 'Paola', 'Camilo', 'Lucía', 'Mateo', 'Sofía', 'Felipe'];
$apellidos = ['Rosero', 'Burbano', 'Guerrero', 'Delgado', 'Pantoja', 'Muñoz', 'Benavides', 'Chaves', 'Insuasty', 'Córdoba'];
$munis = ['Pasto', 'Pasto', 'Ipiales', 'Tumaco', 'Túquerres', 'La Unión', ''];
$deptos = ['Nariño', 'Nariño', 'Nariño', 'Putumayo', 'Cauca', ''];
$base = 'http://' . $_SERVER['HTTP_HOST'] . '/api/v1';
$ents = ['Universidad de Nariño', 'Gobernación de Nariño', 'SENA', 'Alcaldía de Pasto', 'Independiente', '1085 123 456', ''];
$totales = ['participante' => 130, 'prensa' => 6, 'rueda_de_negocios' => 9, 'expositor' => 7];
$id = 1;
$todo = [];
foreach ($totales as $perfil => $n) {
    for ($i = 0; $i < $n; $i++, $id++) {
        $p = [
            'id' => $id,
            'nombre' => strtoupper($nombres[mt_rand(0, 11)] . ' ' . $apellidos[mt_rand(0, 9)] . ' ' . $apellidos[mt_rand(0, 9)]),
            'perfil' => ['clave' => $perfil, 'nombre' => ucfirst(str_replace('_', ' ', $perfil))],
            'entidad' => $ents[mt_rand(0, 6)],
            'municipio' => $munis[mt_rand(0, 6)],
            'documento' => (string) (1085000000 + $id),
            'correo' => "persona{$id}@ejemplo.co",
            'departamento' => $deptos[mt_rand(0, 5)],
            'registro_completo' => mt_rand(0, 4) > 0,
            'carnet' => sprintf('STIC-2026-%06d', $id),
            'ingresos' => mt_rand(0, 2) ? [] : [['fecha' => '2026-11-05T08:10:00-05:00']],
            'en_directorio' => (bool) mt_rand(0, 1),
            'registrado_en' => sprintf('2026-10-%02dT10:00:00-05:00', 1 + mt_rand(0, 20)),
            'foto' => $id % 3 === 0 ? null : "{$base}/fotos/{$id}/2/" . md5((string) $id),
        ];
        if ($perfil === 'expositor') {
            $p['propuesta'] = ['titulo' => "La IA en el territorio {$i}", 'duracion_min' => 20, 'agenda' => ['dia' => 1, 'fecha' => '2026-11-05', 'hora' => sprintf('%02d:00', 9 + $i), 'salon' => 'A']];
        }
        $todo[$perfil][] = $p;
    }
}
// Un nombre fijo para buscar en las pruebas.
$todo['participante'][0]['nombre'] = 'MARÍA FERNANDA ERAZO PANTOJA';
$perfiles = [];
foreach ($totales as $k => $n) {
    $perfiles[] = ['clave' => $k, 'nombre' => ucfirst(str_replace('_', ' ', $k)), 'total' => $n];
}
$paginar = static function (array $lista): array {
    $pag = max(1, (int) ($_GET['pagina'] ?? 1));
    $tam = 50;
    $total = count($lista);
    return ['datos' => array_slice($lista, ($pag - 1) * $tam, $tam), 'paginacion' => ['pagina' => $pag, 'siguiente' => $pag * $tam < $total ? $pag + 1 : null, 'total' => $total]];
};
echo json_encode(match ($ruta) {
    '/perfiles' => ['evento' => ['nombre' => 'Cumbre Tecnológica AI Nariño 2026'], 'total' => array_sum($totales), 'datos' => $perfiles],
    '/personas' => $paginar($todo[$_GET['perfil'] ?? ''] ?? []),
    '/expositores' => $paginar($todo['expositor']),
    default => ['error' => 'ruta desconocida'],
}, JSON_UNESCAPED_UNICODE);
