# Pulpo de datos – Cumbre Tecnológica IA Nariño

Pantalla de evento hecha con three.js y anime.js: un pulpo lineal organiza a las personas inscritas en una **esfera de neuronas** que gira hacia donde trabaja (municipio → entidad → perfil → persona, o la característica que se le pida), las busca por voz o por texto y da la bienvenida con la cámara reconociendo a cada persona por la foto que subió al inscribirse.

Con **Jev** (TypeSafe AI) el pulpo entiende frases libres, elige entre personas de nombre parecido, clasifica las entidades por sector y la cámara decide si saluda, pide confirmación o ignora un rostro (ver [`docs/integracion-jev.md`](docs/integracion-jev.md)).

Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto. Versión 2.7.1.

La aplicación funciona en la raíz de un dominio o en **cualquier subdirectorio** (por ejemplo `https://tic.narino.gov.co/app/octadata/`) sin cambiar ningún archivo: calcula su ruta pública sola.

---

## 1. Requisitos del hosting

| Requisito | Detalle |
|---|---|
| PHP | 8.1 o superior (recomendado 8.2 o 8.3) con las extensiones **cURL**, **JSON** y **mbstring** |
| Servidor web | Apache (lo predeterminado en Plesk: «PHP-FPM servido por Apache»). Si el dominio usa solo nginx, vea la [sección 6](#6-si-el-dominio-usa-solo-nginx) |
| HTTPS | Obligatorio: la cámara y el micrófono solo funcionan con certificado SSL (Let's Encrypt sirve) |
| Escritura | La carpeta `datos/` debe permitir escritura al usuario del sitio |
| Navegador del kiosco | Chrome o Edge actualizados |

## 2. Obtener el paquete

En GitHub, botón **Code → Download ZIP**. El ZIP ya sale limpio para el servidor: deja fuera la documentación, las pruebas y las skills de Claude Code (`.gitattributes` → `export-ignore`).

Desde una terminal también sirve:

```bash
git archive --format=zip --prefix=octadata/ -o octadata.zip main
```

> El paquete incluye archivos ocultos (`.htaccess`) que protegen las carpetas privadas. Si sube los archivos uno a uno o arrastrando una carpeta, compruebe que esos archivos también quedaron en el servidor.

## 3. Instalación en Plesk (ejemplo: `https://tic.narino.gov.co/app/octadata/`)

1. **Dominio y SSL.** En *Sitios web y dominios* abra `tic.narino.gov.co` y verifique en **SSL/TLS** que el certificado esté vigente.
2. **PHP.** En *Configuración de PHP* elija PHP 8.2 o superior con «FPM servido por Apache».
3. **Carpeta.** En *Administrador de archivos* entre a `httpdocs` (o a la raíz del subdominio) y cree la ruta `app/octadata`.
4. **Subir y extraer.** Suba el ZIP dentro de `app/octadata`, clic derecho → **Extraer archivos**. Si queda una carpeta intermedia (por ejemplo `app-searchdata-main/`), mueva su contenido un nivel arriba para que `index.php` quede directamente en `app/octadata/`. Borre el ZIP.
5. **Permisos.** Clic derecho sobre `datos` → **Cambiar permisos** y permita lectura y escritura al usuario del sitio (en Plesk normalmente ya lo tiene).
6. **Abrir el asistente.** Entre a `https://tic.narino.gov.co/app/octadata/`. La página lo lleva a `instalar.php`, que pide el **token interno de instalación** (siguiente sección).

Para usar otro subdirectorio basta con extraer la aplicación en otra carpeta: no hay rutas que editar.

### 3.1 Token interno de instalación

Mientras la aplicación no está instalada, el asistente **no se abre sin un token** que solo puede leer quien tiene acceso a los archivos del servidor. Así nadie más puede configurarla en el intervalo entre la subida y la instalación.

1. La primera vez que se abre `instalar.php`, la aplicación crea `datos/token-instalacion.php`.
2. En el *Administrador de archivos* de Plesk abra ese archivo con el editor de texto. Verá una línea así:
   ```php
   return 'A1B2C-D3E4F-56789-0ABCD';
   ```
3. Copie el valor entre comillas y péguelo en el asistente (mayúsculas, minúsculas y guiones dan igual).

El archivo es PHP: si alguien lo pide por la web, el servidor no muestra nada. Se **borra solo al terminar la instalación**. Si sospecha que alguien lo vio, elimínelo y recargue `instalar.php` para generar otro.

Para despliegues automatizados puede definir el token en la variable de entorno `PULPO_TOKEN_INSTALACION` (mínimo 16 caracteres); en ese caso no se crea el archivo.

### 3.2 Pasos del asistente

| Paso | Qué pide |
|---|---|
| Token | Token interno de instalación (sección 3.1). |
| 1. Requisitos | Revisa PHP, extensiones, permisos de `datos/`, los `.htaccess`, HTTPS, los modelos de rostro y hace una **prueba real** pidiendo por HTTP un archivo dentro de `datos/`: debe decir «bloqueada». |
| 2. API de eventos | Dirección base y token de la API. «Probar conexión» muestra el nombre del evento y los totales por perfil. |
| 3. ElevenLabs | Clave, ID de voz y modelos. Opcional: sin clave se usa el reconocimiento de voz del navegador. |
| 4. IA: Gemini y Jev | Jev: clave (console.typesafe.ai), modelo fijo (`jev-1.14.0`), dirección de la API y tres usos: búsqueda por voz/texto, sectores de las entidades y decisiones de la cámara. Gemini: clave y modelo. Ambos son opcionales: sin ellos la búsqueda usa coincidencia fonética y la cámara reglas fijas. |
| 5. Experiencia | Saludo, tiempos, cámara, **reconocimiento con las fotos de la API** (activado por defecto), exigencia del reconocimiento, plantilla de fotos (solo si la API no trae `foto`) y **clave de la pantalla** (recomendada). |
| 6. Administración | Contraseña de administración (mínimo 10 caracteres) y resumen antes de guardar. |

Al terminar, la configuración queda en `datos/config.php` (permisos 0640), el asistente comprueba que se lee de vuelta igual, borra el token de instalación y genera la clave interna con la que se firman los pases de la pantalla.

Para cambiar algo después, abra `instalar.php` (o el engranaje de la pantalla) e ingrese la contraseña de administración.

### 3.3 Clave de la pantalla

La pantalla muestra nombres, entidades y municipios de personas inscritas. Si define una clave en el paso 5, cada navegador la pide una vez y la recuerda 30 días (cookie firmada, limitada a la carpeta de la aplicación). Sin clave, cualquiera que conozca la dirección ve la pantalla. **Se recomienda definirla.**

## 4. Comprobar la instalación

Haga estas pruebas desde un navegador o una terminal fuera del servidor:

| Abra | Resultado esperado |
|---|---|
| `https://tic.narino.gov.co/app/octadata` (sin barra final) | Redirige a `…/app/octadata/` y abre la pantalla |
| `https://tic.narino.gov.co/app/octadata/datos/config.php` | 403 o página vacía; **nunca** el contenido |
| `https://tic.narino.gov.co/app/octadata/inc/funciones.php` | 403 o página vacía |
| `https://tic.narino.gov.co/app/octadata/api.php?accion=datos` | `401` con `"codigo":"pase"` (la API solo responde a la pantalla) |
| `https://tic.narino.gov.co/app/octadata/README.md` | 403 o 404 |
| `instalar.php` → paso 1 | «datos/ bloqueada desde la web (prueba real): bloqueada» |

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tic.narino.gov.co/app/octadata/datos/config.php
```

## 5. Logotipo oficial

El Manual de Identidad Visual (MIV) pide el logotipo de la Gobernación en toda la señalización de eventos. Solicite a Prensa y Comunicaciones la **versión horizontal para fondos oscuros** y súbala como:

```
assets/img/logo-gobernacion.svg   (o .png / .webp)
```

La pantalla lo muestra en la esquina superior izquierda (posición 1 del MIV) y también en el acceso con clave. No se versiona en el repositorio porque el MIV prohíbe usar copias no autorizadas o modificadas.

## 6. Si el dominio usa solo nginx

Los archivos `.htaccess` solo los lee Apache. Aun sin ellos, la configuración, el token y la caché con datos personales son archivos PHP que no muestran nada por la web, pero conviene bloquear las carpetas privadas. En Plesk: **Configuración de Apache y nginx → Directivas adicionales de nginx**:

```nginx
location ~ ^/(.*/)?(datos|inc|docs|tests)/ { deny all; }
location ~ /\.(?!well-known/) { deny all; }
location ~* \.(md|lock|log|sh)$ { deny all; }
```

Las reglas no dependen del subdirectorio. Luego repita las pruebas de la sección 4 y el paso 1 del asistente.

## 7. Uso en el evento

- Pulse **Iniciar** (activa audio y cámara). Antes de empezar, todos los registros esperan en una **nube que rodea el contorno de la esfera**, agrupados por color alrededor del círculo y moviéndose levemente, en desorden.
- Primero el pulpo **arma la red dentro de la esfera**: coloca los nodos principales (**municipios**), luego conecta cada **entidad** con su municipio y cada **perfil** (participante, expositor, organizador…) con su entidad; las líneas crecen del padre al hijo. Tarda unos 15 segundos.
- Después toma a las **personas** de la nube y las ubica; cada una se conecta a su grupo con una línea que crece y brilla un momento.
- **Barra espaciadora** sostenida, o el botón del **micrófono** sostenido: búsqueda por voz.
- **/** o el botón de la **lupa**: búsqueda escrita (también en pantallas táctiles).
- Al buscar (por texto o por voz), el pulpo **recorre rápido todos los nodos** durante 3 a 5 segundos: la esfera gira, una onda de luz pasa por la red, los tentáculos tocan nodos, aparecen los nombres que va comparando y arriba se ve cuántos nodos lleva revisados. Al final la esfera trae al frente a la persona y se abre el resultado. Si la IA (Jev o Gemini) tarda más, el resultado sale en cuanto responde.
- El resultado abre un **panel lateral** con la entidad, el perfil, el municipio, el departamento y los ingresos, y una barra de **coincidencia**. La **foto solo aparece con 80 % de coincidencia o más**; por debajo se ven las iniciales. Al pie se deslizan solas las demás **coincidencias** (cada una con foto solo si llega al 80 %); al tocar una, el pulpo la busca.
- **Cámara:** con 80 % de coincidencia o más saluda en voz alta, con foto, y pregunta «¿Acerté?». Entre 30 % y 80 % solo muestra el nombre y la entidad (sin foto ni datos) y pregunta **«¿Eres tú?»** con los botones **Sí** y **No** (también se puede responder «sí» o «no» por voz). Al responder «sí» a «¿Eres tú?», saluda con la foto.
- **Así aprende:** cada respuesta suma un conteo anónimo por tramo de distancia del rostro (`datos/cache/aprendizaje.json.php`, sin nombres, fotos ni huellas) y la coincidencia de ese tramo se recalcula para todas las personas. Además, durante la sesión el rostro confirmado se suma a la referencia de esa persona y el rechazado se descarta para ella (solo en memoria). El panel «frente a la cámara» muestra cuántas respuestas lleva.
- Al fondo, sin marco, suben los **unos y ceros** de los nombres inscritos (su código UTF-8); cuando el pulpo coloca o encuentra a alguien, su fila se ilumina con el nombre y sus bits en el color de su grupo.
- **Esc** o la ✕: cierra el panel.
- `?demo=1` (por ejemplo `https://tic.narino.gov.co/app/octadata/?demo=1`) muestra la animación con datos inventados, sin consultar la API.

### 7.1 Organizar la esfera por voz o por texto

Diga (o escriba en el buscador) frases como estas:

| Frase | Resultado |
|---|---|
| «organiza por municipio» | municipio → entidad → perfil |
| «agrúpalos por departamento» | departamento → municipio → entidad |
| «ordénalos por entidad y municipio» | entidad → municipio → perfil |
| «organiza por perfil» | perfil → municipio → entidad |
| «organiza por sector» | gobierno, academia, empresas, salud… (necesita Jev) |
| «organiza por fecha de registro» | por día de inscripción |
| «organiza por asistencia» | quienes ya ingresaron y quienes no |
| «organiza por estado» | registro completo o incompleto |
| «por dependencia» | usa el campo `dependencia` si la API lo envía; si no, la entidad |
| «por género» | solo si la API envía el campo `genero` (hoy no lo envía; la pantalla lo avisa) |
| «vista inicial» | vuelve a municipio → entidad → perfil |

La esfera se reorganiza, el pulpo recorre los grupos más grandes y muestra el nombre y el total de cada uno. Mientras organiza, cada persona que coloca aparece un momento con su nombre junto a su punto en la esfera.

Con Jev activo también entiende frases libres, como «muéstrame la gente por tipo de organización». Cada grupo tiene su propio color (por ejemplo, cada municipio), y sus entidades y personas usan matices de ese color. La esfera ocupa todo el alto disponible (las estadísticas, semitransparentes, quedan encima) y el pulpo conserva su tamaño: tiene **8 tentáculos** con ventosas y una estela de puntos, se mueve por la superficie de un lado a otro y sus tentáculos cruzan el interior de la esfera para tomar los datos del lado opuesto, sin salirse de ella. Los datos que faltan por organizar flotan en la nube que rodea la esfera; cada tentáculo llega al borde y el dato viaja hasta su punta. Mientras organiza se ocultan los meridianos y el contorno de la esfera, y vuelven cuando queda en reposo. Las líneas de la estructura (municipio → entidad → perfil) se ven siempre; las de las personas brillan al conectarse y quedan tenues hasta el reposo. Al encontrar a una persona se resalta su ruta. Al reorganizar («organiza por…»), los grupos nuevos aparecen también por niveles.

Para el kiosco se recomienda Chrome en pantalla completa:

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required https://tic.narino.gov.co/app/octadata/
```

Conceda permisos de cámara y micrófono una vez; el navegador los recuerda para el dominio HTTPS.

## 8. Cómo protege los datos

- Las claves (token de la API de eventos, ElevenLabs, Gemini) viven en `datos/config.php`. El navegador solo habla con `api.php`.
- El token de la API de eventos viaja en la cabecera `Authorization: Bearer`, no en la URL (no queda en los registros de acceso).
- **Fotos:** el navegador nunca recibe la URL de la foto ni el token; pide `api.php?accion=foto&id=…` con su pase. El servidor solo descarga fotos alojadas en el mismo servidor que la API, valida que sean imágenes (JPEG, PNG, WebP o GIF, máximo 6 MB) y las guarda en `datos/cache/fotos/` como archivos protegidos.
- `api.php` exige un **pase firmado** que entrega `index.php` (válido 24 h y renovado en cada respuesta), y rechaza peticiones de otros sitios. Si la pantalla tiene clave, el pase solo se obtiene después de escribirla.
- Al navegador solo llegan nombre, perfil, entidad, municipio, número de ingresos y la charla aprobada. El documento, el correo y cualquier entidad escrita como número de documento no salen del servidor. El carné solo se envía si la plantilla de fotos lo usa.
- La caché de la API se guarda como archivo PHP protegido (`datos/cache/datos.json.php`) y se renueva cada 60 s por defecto; si la API falla se sirve la última copia.
- El asistente usa token de instalación, contraseña con hash bcrypt, protección CSRF, límite de intentos **por IP** (8 cada 15 minutos) y cookies `HttpOnly`, `SameSite=Strict` y limitadas a la carpeta de la aplicación.
- Las páginas envían Content-Security-Policy, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`. Fuentes y librerías se sirven desde el propio servidor (sin CDN ni Google Fonts).
- Las huellas faciales que se calculan a partir de las fotos y los conteos de la cámara viven en la memoria del navegador y se borran al cerrar la página. No se guardan imágenes en el navegador.
- Las respuestas «sí / no» de la cámara se guardan en el servidor solo como conteos por tramo de distancia (por ejemplo, «entre 0,500 y 0,525: 3 sí, 1 no»), sin nombre, identificador, foto ni huella facial. Para empezar de cero, borre `datos/cache/aprendizaje.json.php`.
- Sin 80 % de coincidencia la pantalla no muestra la foto de nadie, ni sus datos cuando la cámara pregunta «¿Eres tú?».

## 9. Tratamiento de datos personales (Ley 1581 de 2012)

- La Ley 1581 considera sensibles los datos biométricos. Con el reconocimiento activado, la pantalla convierte en huella facial la foto de **todas** las personas inscritas que subieron una. Úselo solo si el formulario de inscripción informó esa finalidad (reconocimiento facial para la bienvenida en el evento) y obtuvo autorización expresa; si no, desactívelo en el paso 5 del asistente. Publique además un aviso de privacidad visible junto a la pantalla.
- La API trae el campo `en_directorio`. Si significa que la persona **no** autorizó aparecer en un directorio público, conviene excluirla de la pantalla: confírmelo con el equipo de la plataforma de eventos.
- Si activa **ElevenLabs** (audio de voz), **Gemini** o **Jev** (lo dicho y nombre, entidad y municipio de hasta 25 candidatos por búsqueda; nombres de entidades; y de la cámara solo números y el perfil, nunca imágenes), esos datos se procesan en servidores fuera de Colombia: inclúyalo en el aviso de privacidad del evento.
- La estimación de género es binaria, puede equivocarse y solo se muestra como cifra agregada.

## 10. Actualizar

Reemplace todos los archivos **excepto la carpeta `datos/`**. La configuración y las contraseñas se conservan. Si viene de la versión 2.0.0, al abrir la pantalla la aplicación genera su clave interna, y en la primera consulta a la API borra la caché antigua sin protección (`datos/cache/datos.json`). Revise además el paso 5 del asistente para definir la clave de la pantalla.

## 11. Recuperar el acceso

Si se olvidó la contraseña de administración:

1. En el *Administrador de archivos* abra `datos/config.php` y deje vacío el valor de `'admin_hash'` (`'admin_hash' => '',`).
2. Abra `instalar.php`: pedirá un token de instalación nuevo, que se crea en `datos/token-instalacion.php`.
3. Recorra el asistente (los demás ajustes se conservan) y defina una contraseña nueva en el paso 6.

Para reiniciar todo, borre `datos/config.php` y la carpeta `datos/cache/`.

## 12. Proxy inverso

Si un proxy publica la aplicación en una ruta distinta de la carpeta real (por ejemplo, la carpeta es `/octadata/` pero se ve como `/app/octadata/`), defina la variable de entorno `PULPO_BASE=/app/octadata/`. En el caso normal no hace falta.

## 13. Estructura

```
octadata/
├── index.php            pantalla del pulpo, panel lateral (y acceso con clave de pantalla)
├── instalar.php         asistente de instalación y ajustes
├── api.php              intermediario con la API de eventos (datos y fotos), ElevenLabs, Gemini, Jev y el aprendizaje sí/no
├── .htaccess            bloquea archivos ocultos, documentación y listados
├── inc/funciones.php    funciones del servidor (protegida con .htaccess)
├── datos/               configuración, token y caché (protegida, debe permitir escritura)
└── assets/
    ├── css/             app.css y fuentes.css
    ├── fuentes/         Hind Madurai (tipografía institucional) y JetBrains Mono, licencia OFL
    ├── img/             aquí va el logotipo oficial (no se versiona)
    ├── js/app.js        esfera, pulpo, organización, búsqueda, panel y cámara
    ├── js/hud.js        panel de estadísticas
    ├── vendor/          three.js r149, anime.js 3.2.2, face-api 1.7.14 (sin CDN)
    └── modelos/         modelos de detección, puntos faciales, reconocimiento y género
```

Solo en el repositorio (no van al servidor): `docs/` (revisiones), `tests/` (pruebas) y `.claude/` (skills de Claude Code).

## 14. Desarrollo y pruebas

La prueba de punta a punta (90 comprobaciones) recorre el asistente con el token, guarda y relee la configuración, abre la pantalla con clave, busca una persona (con el barrido de 3 a 5 s) y revisa el panel, la regla del 80 % para la foto, el fondo binario y las coincidencias, revisa la nube inicial, los 8 tentáculos, que la red se arme por niveles (municipios, entidades, perfiles) antes de ubicar a las personas y las líneas que se ocultan al organizar, organiza la esfera por voz/texto, procesa las fotos de la API, prueba «¿Eres tú?» con Sí y No (y que el servidor solo guarde conteos), las decisiones de Jev (y que no reciba imágenes ni nombres desde la cámara) y verifica los bloqueos de seguridad en un Apache real con la aplicación en `/app/octadata/`:

```bash
php -S 127.0.0.1:8090 tests/mock-api.php
```

```bash
sudo sh tests/desplegar-local.sh /var/www/html/app/octadata
```

```bash
node tests/e2e.cjs
```

Requiere Apache con `AllowOverride All`, PHP con GD y Playwright con Chromium. `tests/mock-api.php` simula la API de eventos con sus fotos (token `TOKEN-PRUEBA-123`, por cabecera o por URL) y `tests/mock-jev.php` simula Jev (clave `JEV-PRUEBA`, dirección `http://127.0.0.1:8090/jev/v1`).

## 15. Skills de Claude Code

El repositorio trae, en `.claude/skills/`, tres skills revisadas y fijadas a una versión (`skills-lock.json`): **impeccable**, **ui-ux-pro-max** y **playwright-cli**. Claude Code las carga solo al abrir el proyecto. La revisión de seguridad de cada una, su versión y cómo instalarlas en otro equipo están en [`docs/skills-claude-code.md`](docs/skills-claude-code.md).
