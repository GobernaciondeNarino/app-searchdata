# Revisión responsive, UI y UX – Pulpo de datos

Fecha: 29 de octubre de 2026 · Alcance: pantalla del evento (`index.php`), acceso con clave de pantalla y asistente (`instalar.php`).

## Método

- Capturas automáticas con Playwright (Chromium) en **1920×1080, 1366×768, 1024×768, 768×1024 y 390×844**, con y sin pantalla táctil, con datos simulados y con la API de prueba, detectando desbordes y solapamientos en el DOM.
- Contraste de color según WCAG 2.1 sobre el fondo de los paneles (`#03140d`).
- Contraste con la identidad institucional:
  - *Manual de Identidad Visual – Arquitectura de marca y directrices*, v1.0, junio de 2024 (MIV).
  - *Manual de Usabilidad y Estructura de los Sitios Web*, v1.0, marzo de 2025.
- Skills usadas: `playwright-cli` (capturas), `impeccable` y `ui-ux-pro-max` (criterios de revisión).

## Resumen

La pantalla está pensada para un televisor o video beam de 1920 px o más, y ahí funciona bien. Los problemas estaban en tamaños medianos y móviles (cifras de la cámara recortadas, etiquetas fuera de la pantalla, título comprimido), en el uso táctil (la búsqueda escrita solo se abría con el teclado) y en la identidad (amarillo distinto al institucional y sin espacio para el logotipo oficial). Todo lo marcado como corregido quedó verificado con capturas en los cinco tamaños, sin desbordes.

## Hallazgos y correcciones

### Responsive

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| R-01 | El panel de cámara usaba una columna de video de ancho fijo: en 1366, 768 y 390 px las cifras («ahora», «hoy», «bienvenidas») quedaban recortadas o fuera del panel. | Alta | Corregido: columnas proporcionales y, en móvil, video arriba y cifras abajo. |
| R-02 | Las etiquetas de perfil se anclaban a la izquierda del punto y en pantallas angostas salían del borde («…y comunicaciones»). | Media | Corregido: la posición se limita a la pantalla; el ancho se mide una vez y no en cada cuadro. |
| R-03 | En móvil el título y el subtítulo ocupaban hasta 5 líneas y, con logotipo, el título se metía bajo los botones. | Media | Corregido: subtítulo en una línea con puntos suspensivos; con logotipo, logo arriba y título debajo. |
| R-04 | Por debajo de 760 px se ocultaba todo el estado de voz, incluidos «Te escucho…» y «Transcribiendo…». | Media | Corregido: por debajo de 1050 px el estado aparece como aviso flotante solo cuando hay actividad. |

### Interacción y UX

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| U-01 | La búsqueda escrita solo se abría con la tecla `/`: en pantallas táctiles no había forma de buscar por nombre. | Alta | Corregido: botón de lupa; el buscador es un formulario `role="search"` con tecla «Buscar» en el teclado del móvil. |
| U-02 | El texto guía pedía la barra espaciadora también en dispositivos sin teclado. | Baja | Corregido: en táctil dice «Mantén presionado el micrófono» o «Toca la lupa». |
| U-03 | Mantener presionado el micrófono en táctil podía abrir el menú contextual o desplazar la página y cortar la grabación. | Media | Corregido: `touch-action: none`, sin menú contextual y cierre limpio con `pointercancel`. |
| U-04 | Botones redondos de 40 px, por debajo de los 44 px recomendados para objetivos táctiles. | Baja | Corregido: 44 px. |
| U-05 | Si el pase de la pantalla vencía (más de 24 h sin conexión), la API fallaba sin explicación. | Media | Corregido: aviso y recarga automática, como máximo una vez cada 5 minutos. |

### Accesibilidad

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| A-01 | La ficha de la persona tenía `role="dialog"` sin manejo de foco, lo que confunde a los lectores de pantalla. | Media | Corregido: `role="region"` con `aria-live="polite"`. |
| A-02 | Los íconos SVG de los botones se leían como contenido. | Baja | Corregido: `aria-hidden="true"` y `title` en los botones. |
| A-03 | El aviso de privacidad de la pantalla de inicio estaba en 10,5 px. | Media | Corregido: 12,5 px y mayor contraste (7,6:1). |
| A-04 | La hora de la bitácora y los comentarios del panel de código tenían contraste 4,0:1 (WCAG AA pide 4,5:1). | Baja | Corregido: 6,0:1. |

Contrastes verificados sobre el fondo de los paneles: texto principal 17,7:1 · verde 14,4:1 · amarillo 13,3:1 · cian 12,4:1 · rosa 5,9:1 · texto tenue 7,1:1 · notas del HUD 4,9:1.

### Identidad institucional

| ID | Hallazgo | Referencia | Estado |
|---|---|---|---|
| I-01 | El amarillo de la interfaz era `#ffc93c`; el institucional es **`#FFD500`**. | MIV p. 15, colores principales | Corregido en CSS, escena 3D y HUD. |
| I-02 | El comentario del verde decía «#00A859 institucional»; el MIV define **`#10A13B`**. | MIV p. 15 | Corregido el comentario. Se conserva el verde neón `#3dffa0` como derivado para fondo oscuro. |
| I-03 | La pantalla no mostraba el logotipo oficial, que el MIV exige en la señalización de eventos. | MIV p. 9 (eventos) y p. 45 (posición 1, superior izquierda) | Preparado: la pantalla muestra `assets/img/logo-gobernacion.svg` si existe. **Pendiente**: archivo oficial para fondos oscuros, de Prensa y Comunicaciones. |
| I-04 | Tipografía. | MIV p. 26: Hind Madurai | Conforme. Ahora se sirve desde el propio servidor e incluye el peso bold. |
| I-05 | Las fuentes se cargaban desde Google Fonts: dependencia externa y envío de la IP de cada visitante a un tercero. | Ley 1581; manual web («tiempo de carga optimizado») | Corregido: fuentes locales (latin y latin-ext). |

## Observaciones para decidir (no se cambiaron)

1. **Paleta de evento.** El rosa `#ff3fa4`, el cian `#4de3ff` y el violeta `#b48cff` no son institucionales. El MIV (p. 15) presenta la paleta como «guía pero no restricción» para piezas específicas, y la estética neón es parte de la experiencia del evento. Si Prensa y Comunicaciones lo pide, el cian puede pasar al azul claro institucional `#80BEFF` y el rosa al rojo `#DA1C24`.
2. **Barra GOV.CO, encabezado y pie de página.** El manual de sitios web los exige para los *sitios web* de la Gobernación (WordPress con Elementor y Astra). Esta aplicación es una pantalla de evento (señalización), por lo que aplica el MIV de eventos. Si se publicara como sitio permanente, habría que incorporar la barra GOV.CO y el pie institucional con la hora legal.
3. **Textos del HUD de 9,5 a 10,5 px.** Son decorativos y se leen a distancia como textura; la información útil (ficha de la persona, títulos, perfiles) es grande. En una pantalla menor de 1366 px conviene usar el modo de pantalla completa del navegador.
4. **Movimiento reducido.** Con `prefers-reduced-motion` se detienen las animaciones CSS, pero no la escena 3D, que es el contenido principal.
5. **Asistente con estética oscura.** El manual web propone fondo blanco con títulos `#003366` para sitios públicos; el asistente es una herramienta interna y se mantuvo coherente con la pantalla.

## Versión 2.2.0: esfera, panel lateral y organización

| Cambio | Detalle | Verificado |
|---|---|---|
| Red en esfera 3D | Las personas se reparten sobre la superficie (espiral de Fibonacci ordenada por curva de Hilbert, para que cada grupo quede compacto) y los grupos quedan dentro, a menor radio. La esfera gira para llevar al frente la zona que el pulpo organiza, se acomoda un poco con cada dato colocado y gira despacio en reposo. La cara oculta se ve más tenue. | Capturas en 1600, 1366, 768 y 390 px |
| Panel lateral | Reemplaza la tarjeta flotante: foto (desde la API), nombre, entidad, perfil, municipio, departamento, ingresos y charla. Al pie, las coincidencias se deslizan solas cada 2,6 s, se pausan al pasar el puntero y al tocarlas enfocan a esa persona. En móvil es una hoja sobre el HUD. | E2E y capturas, sin desbordes |
| Sin «Vincular mi rostro» | El reconocimiento usa automáticamente la foto que cada persona subió al inscribirse. | E2E: 102 fotos procesadas solas |
| Nombres al organizar | Cada persona colocada aparece un momento con su nombre y su grupo, en carriles verticales que no se tapan (máximo uno cada 0,35 s). | Capturas |
| Organizar por voz o texto | «organiza por municipio», «por departamento y entidad», «por asistencia», «vista inicial»… con recorrido por los grupos más grandes. | E2E |

## Versión 2.5.0: pulpo de 8 tentáculos, nube ordenada y líneas en reposo

| Cambio | Detalle | Verificado |
|---|---|---|
| 8 tentáculos | Se quitaron los 22 tentáculos cortos: quedan los 8 que trabajan. En reposo cuelgan en curva de S hacia afuera, recostados sobre la esfera (no salen de su silueta). | Capturas ampliadas |
| Ventosas y estela | Cada tentáculo lleva 16 ventosas (puntos que crecen hacia el medio y se achican en los extremos, con un pulso hacia la punta) y 22 puntos finos de estela que se apartan hacia la punta, como en el diseño de referencia. | Capturas ampliadas |
| Líneas solo en reposo | Meridianos, contorno y enlaces se apagan en ~1 s al empezar a organizar y vuelven cuando no queda nada por organizar (o antes de empezar). Al enfocar a alguien solo se ve su ruta. El desvanecido usa tiempo real. | E2E |
| Nube ordenada | Antes de organizar, los registros esperan en 3 a 7 anillos alrededor de la esfera (una elipse inclinada que pasa por delante de la mitad baja y por detrás de la alta), ordenados por grupo: los colores forman arcos seguidos. Los anillos giran despacio y se vacían a medida que el pulpo toma los datos. En celular quedan más pegados a la esfera. | E2E y capturas 1600 y 390 px |
| Toma desde el borde | El tentáculo llega al borde de la esfera en dirección al dato y el punto viaja hasta su punta; el tentáculo nunca sale (máximo 0,98 R medido). | Medido |
| Pausa inicial | Tras «Iniciar», la nube se ve ordenada unos 2,5 s antes de que el pulpo empiece. | E2E |

## Versión 2.4.0: esfera grande, «¿Eres tú?» y fondo binario

| Cambio | Detalle | Verificado |
|---|---|---|
| Esfera más grande | Solo crece la esfera (hasta 1,9 veces): usa todo el alto bajo la barra y las estadísticas semitransparentes quedan encima. El pulpo compensa la escala y conserva su tamaño. | 1600 px: 1,84×; 390 px: 1,25× |
| Tentáculos 3D | Cada brazo es una curva Bézier en 3D que sale del pulpo, cruza el interior y toma el dato del otro lado de la esfera; su brillo y grosor bajan con la profundidad. Ningún punto sale de la esfera (máximo 1,03 R, en la base junto al pulpo). | Medido en 1600 y 390 px |
| Sí / No | El panel de la cámara pregunta «¿Eres tú?» (o «¿Acerté?» al saludar) con botones de 44 px de alto. Cada respuesta ajusta la coincidencia de ese tramo de distancia. | E2E |
| Regla del 80 % | Barra de coincidencia con una marca en 80 %. Por debajo: iniciales con borde punteado, sin foto ni datos personales en la cámara; en las búsquedas, la foto de cada coincidencia también exige 80 %. | E2E y capturas |
| Fondo binario | Filas de unos y ceros (UTF-8 de los nombres) que suben despacio, sin marco, recortadas alrededor de la esfera, la barra y las estadísticas. La fila del dato encontrado se ilumina con el nombre en claro y sus bits en el color del grupo. Con «reducir movimiento» las filas no se desplazan. | Capturas 1600 y 390 px |
| Panel estable | Si se abre un resultado mientras el anterior se está cerrando, el nuevo ya no desaparece. | E2E |

## Versión 2.3.0: diseño del pulpo, colores por grupo y Jev

| Cambio | Detalle |
|---|---|
| Pulpo nuevo | Cabeza circular de contorno, ojo rosado unido por hilos al núcleo, 22 tentáculos finos con punto en la punta y 8 brazos de trabajo más delgados con cuentas punteadas. Se ubica sobre la superficie de la esfera y se mueve a otro lado cada vez que cambia de zona; en reposo pasea. |
| Halo de datos | Las personas que faltan por organizar orbitan alrededor de la esfera; los brazos toman las más cercanas al pulpo. |
| Colores por grupo | Cada valor de los niveles 1 y 2 (por ejemplo cada municipio) tiene su color en toda la esfera: primero los 12 de la paleta derivada del MIV y luego tonos separados por el ángulo áureo. Entidades y personas usan matices del color de su grupo. |
| Etiquetas | Nombres en texto claro con la etiqueta rosada del grupo, como en el diseño de referencia; grupos en tipografía monoespaciada con su color. |
| Decisiones visibles | El panel indica cuándo decidió Jev (o Gemini) y con qué confianza. |
