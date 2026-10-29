<?php
/**
 * API de eventos simulada para pruebas locales (no se despliega).
 *   php -S 127.0.0.1:8090 tests/mock-api.php
 * Imita /perfiles, /personas y /expositores de tic.narino.gov.co/eventos/api/v1.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
if (($_GET['token'] ?? '') !== 'TOKEN-PRUEBA-123') {
    http_response_code(401);
    echo json_encode(['error' => 'token inválido']);
    return;
}
$ruta = preg_replace('#^/api/v1#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
mt_srand(7);
$nombres = ['Ana', 'Luis', 'Carmen', 'Jorge', 'Diana', 'Andrés', 'Paola', 'Camilo', 'Lucía', 'Mateo', 'Sofía', 'Felipe'];
$apellidos = ['Rosero', 'Burbano', 'Guerrero', 'Delgado', 'Pantoja', 'Muñoz', 'Benavides', 'Chaves', 'Insuasty', 'Córdoba'];
$munis = ['Pasto', 'Pasto', 'Ipiales', 'Tumaco', 'Túquerres', 'La Unión', ''];
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
            'carnet' => sprintf('STIC-2026-%06d', $id),
            'ingresos' => [],
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
