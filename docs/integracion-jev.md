# Integración de Jev (TypeSafe AI) en el Pulpo de datos

Fecha: 29 de octubre de 2026 · Versión de la aplicación: 2.7.1 · Modelo fijado por defecto: `jev-1.14.0`

## Qué es Jev

Jev es el primer modelo «System One» de TypeSafe AI ([anuncio](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [documentación](https://docs.typesafe.ai)). No genera texto: recibe un **estado** (texto o JSON) y una o varias **preguntas tipadas**, y devuelve para cada una la respuesta con **probabilidades calibradas** y una **confianza** de 0 a 1.

| Tipo de pregunta | Devuelve | Uso en el Pulpo |
|---|---|---|
| `choice` | la opción elegida, `probabilities`, `confidence` | todas las decisiones |
| `score` | posición en una escala | no se usa |
| `noul` | probabilidad de que algo sea cierto | no se usa |

Datos publicados por TypeSafe y verificados en su documentación: endpoint `POST https://api.typesafe.ai/v1/systemone` con `Authorization: Bearer`, 64 000 tokens por petición, US$ 0,042 por millón de tokens de entrada (la salida no se cobra), latencia de 70 a 500 ms según el fabricante, hasta 255 opciones por `choice`, no entrena con los datos de los clientes, retención cero (ZDR) solo en planes empresariales. El inglés es su idioma principal y en español su precisión es menor: por eso todas las decisiones usan umbrales de confianza y tienen una regla de respaldo.

## Dónde decide Jev

```
voz / texto ──► ¿nombre exacto? ──sí──► enfoca a la persona
                    │ no
                    ▼
          Jev (1 petición, 3 preguntas en paralelo)
          intención · característica · persona
                    │
   organizar (≥ 0,5) ──► reorganiza la esfera
   persona (≥ 0,6)   ──► enfoca a la persona
   persona (0,3–0,6) ──► panel con opciones (la más probable primero)
   otra (≥ 0,7)      ──► explica qué se puede pedir
   error             ──► Gemini o coincidencia fonética
```

### 1. Pulpo: entender lo que se dice o escribe (`api.php?accion=jev_orden`)

- **Estado:** `{"dicho": "<lo transcrito>"}`.
- **Preguntas:** `intencion` (buscar persona / organizar / otra), `caracteristica` (municipio, departamento, entidad, sector, perfil, fecha, asistencia, estado, género, dependencia, ninguna) y `persona` (los 25 candidatos más parecidos por fonética, con nombre, entidad y municipio, más «ninguna»).
- Las frases normales («organiza por municipio») las resuelve antes un intérprete local sin costo. Jev atiende las frases libres («muéstrame la gente por tipo de organización») y los nombres mal transcritos («fernanda de la gobernación»).
- El panel muestra quién decidió y con qué confianza: «Decisión de Jev: elegir a esta persona · confianza 92 %».

### 2. Pulpo: clasificar entidades por sector (en el servidor, con caché)

- Cada nombre de entidad escrito al inscribirse se clasifica una sola vez en 12 sectores (gobierno departamental, municipal o nacional, academia, colegios, salud, empresas, fundaciones y ONG, gremios, medios, independientes, otro). Se guarda en `datos/cache/jev-sectores.json.php` (archivo protegido).
- Va en lotes de 40 preguntas por petición, con 4 segundos por consulta de datos como máximo; lo que no alcance queda para el siguiente refresco.
- Si la confianza es menor de 0,35, la entidad queda en «otro».
- Así nace una característica nueva: «organiza por sector».

### 3. Cámara: decidir qué hacer con un rostro (`api.php?accion=jev_camara`)

Cuando un rostro se parece de forma estable (3 cuadros) a una persona inscrita, la pantalla le pregunta a Jev:

- **Estado (solo números y el perfil):** distancia al más parecido y al segundo, umbral configurado, cuadros estables, calidad de la detección, ancho del rostro en píxeles, rostros en el cuadro, perfil, ingresos previos, minutos para su charla, **coincidencia calibrada** y **cuántas personas respondieron «sí» o «no» con una distancia parecida**.
- **Preguntas:** `accion` (saludar en voz alta / confirmar en silencio / ignorar) y `saludo` (bienvenida, regreso, charla pronto, expositor).
- **Límite que Jev no puede saltarse:** la pantalla solo saluda en voz alta y muestra la foto con **80 % de coincidencia o más**. Si Jev dice «saludar» por debajo de eso, la pantalla pregunta «¿Eres tú?» sin foto. Si Jev dice «ignorar» con confianza de 0,5 o más (o la coincidencia es menor de 30 %), no hace nada y vuelve a evaluar a los 30 s.
- **Regla de respaldo:** si Jev no responde, saluda con 80 % o más y pregunta entre 30 % y 80 %.
- Se evalúan también los casos dudosos (hasta 0,08 por encima del umbral) para preguntar en lugar de descartarlos o saludar por error.

### 4. Aprendizaje con «sí / no» (`api.php?accion=entrenar` y `api.php?accion=aprendizaje`)

- La **coincidencia** que muestra el panel parte de una curva según la distancia del rostro (50 % en el umbral configurado, 80 % unas 0,05 por debajo) y se corrige con las respuestas de las personas en ese tramo de distancia (tramos de 0,025, con el vecino de cada lado a medio peso). La curva pesa como 4 respuestas: con pocas respuestas manda la curva y con muchas manda lo aprendido.
- Al pulsar **Sí** o **No** (o decirlo por voz) se envía solo `{distancia, respuesta}`. El servidor guarda conteos por tramo en `datos/cache/aprendizaje.json.php` (archivo protegido, con bloqueo de escritura y límite de 30 respuestas por minuto por IP).
- En la memoria del navegador, «sí» suma ese rostro a la referencia de la persona (hasta 6) y «no» lo guarda como «no es esta persona» para no volver a proponerla con un rostro casi igual.

## Qué no se le envía a Jev

- **Ninguna imagen.** Jev acepta imágenes de forma experimental («dreamer-ready», cabecera `TypeSafe-Danger-Zone-Images`) y podría comparar un rostro con la foto de inscripción. **No se usa** porque implicaría enviar datos biométricos de las personas a un tercero en EE. UU., con una función que el propio fabricante no considera lista para producción. La comparación de rostros sigue haciéndose en el navegador del kiosco con face-api.
- Desde la cámara no se envía el nombre ni ningún identificador de la persona.
- La clave de Jev nunca llega al navegador; solo `api.php` habla con TypeSafe.

La prueba `tests/e2e.cjs` verifica estas tres condiciones revisando lo que recibe un Jev simulado.

## Costo estimado

Con el precio publicado (US$ 0,042 por millón de tokens de entrada):

| Uso | Tokens aprox. por llamada | Para un evento de 1 000 búsquedas y 2 000 saludos |
|---|---:|---:|
| Búsqueda / orden | ~2 000 | ~2 M tokens |
| Cámara | ~700 | ~1,4 M tokens |
| Sectores (una vez) | ~200 por entidad | ~0,1 M tokens |
| **Total** | | **~3,5 M tokens ≈ US$ 0,15** |

Estimación propia a partir del tamaño de las peticiones; confírmela en la consola de TypeSafe.

## Configuración

Asistente → paso 4 «IA: Gemini y Jev»: clave (console.typesafe.ai), modelo **fijo** (`jev-1.14.0`; no use `jev-latest`, que cambia solo con cada versión), dirección de la API y tres casillas: búsqueda, sectores y cámara. «Probar conexión» consulta `GET /v1/models`.

## Riesgos y límites

- Acceso anticipado (lista de espera); el servicio, el precio y los modelos pueden cambiar.
- Precisión menor en español: los umbrales son conservadores y siempre hay respaldo. Conviene medir con datos reales del evento antes de bajar los umbrales.
- Los datos se procesan en EE. UU.: inclúyalo en el aviso de privacidad (Ley 1581 de 2012, transferencia internacional) y evalúe el acuerdo de tratamiento de datos (DPA) de TypeSafe o la retención cero para el plan empresarial.
- La decisión de la cámara también podría resolverse con reglas fijas. Jev aporta confianza calibrada y combina varias señales; si no se dispone de clave, la pantalla funciona igual con las reglas.
