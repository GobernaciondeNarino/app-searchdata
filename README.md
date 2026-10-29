# Pulpo de datos – Cumbre Tecnológica IA Nariño

Pantalla de evento hecha con three.js y anime.js: un pulpo lineal organiza a las personas inscritas en una red de neuronas (perfil → municipio → entidad → nombre), las busca por voz o por texto y da la bienvenida con la cámara.

Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto. Versión 2.1.0.

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
| 4. Gemini | Clave y modelo. Opcional: sin clave la búsqueda usa coincidencia fonética. |
| 5. Experiencia | Saludo, tiempos, cámara, exigencia del reconocimiento, plantilla de fotos y **clave de la pantalla** (recomendada). |
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

- Pulse **Iniciar** (activa audio y cámara).
- **Barra espaciadora** sostenida, o el botón del **micrófono** sostenido: búsqueda por voz.
- **/** o el botón de la **lupa**: búsqueda escrita (también en pantallas táctiles).
- **Esc**: cierra la ficha de la persona.
- `?demo=1` (por ejemplo `https://tic.narino.gov.co/app/octadata/?demo=1`) muestra la animación con datos inventados, sin consultar la API.

Para el kiosco se recomienda Chrome en pantalla completa:

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required https://tic.narino.gov.co/app/octadata/
```

Conceda permisos de cámara y micrófono una vez; el navegador los recuerda para el dominio HTTPS.

## 8. Cómo protege los datos

- Las claves (token de la API de eventos, ElevenLabs, Gemini) viven en `datos/config.php`. El navegador solo habla con `api.php`.
- `api.php` exige un **pase firmado** que entrega `index.php` (válido 24 h y renovado en cada respuesta), y rechaza peticiones de otros sitios. Si la pantalla tiene clave, el pase solo se obtiene después de escribirla.
- Al navegador solo llegan nombre, perfil, entidad, municipio, número de ingresos y la charla aprobada. El documento, el correo y cualquier entidad escrita como número de documento no salen del servidor. El carné solo se envía si la plantilla de fotos lo usa.
- La caché de la API se guarda como archivo PHP protegido (`datos/cache/datos.json.php`) y se renueva cada 60 s por defecto; si la API falla se sirve la última copia.
- El asistente usa token de instalación, contraseña con hash bcrypt, protección CSRF, límite de intentos **por IP** (8 cada 15 minutos) y cookies `HttpOnly`, `SameSite=Strict` y limitadas a la carpeta de la aplicación.
- Las páginas envían Content-Security-Policy, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`. Fuentes y librerías se sirven desde el propio servidor (sin CDN ni Google Fonts).
- Los rostros vinculados y los conteos de la cámara viven en la memoria del navegador y se borran al cerrar la página. No se guardan imágenes.

## 9. Tratamiento de datos personales (Ley 1581 de 2012)

- La Ley 1581 considera sensibles los datos biométricos. Antes de usar la cámara, publique un aviso de privacidad visible junto a la pantalla y obtenga la autorización expresa de quien vincule su rostro.
- Si activa **ElevenLabs** (audio de voz) o **Gemini** (nombre, entidad y municipio de hasta 25 candidatos por búsqueda), esos datos se procesan en servidores fuera de Colombia: inclúyalo en el aviso de privacidad del evento.
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
├── index.php            pantalla del pulpo (y acceso con clave de pantalla)
├── instalar.php         asistente de instalación y ajustes
├── api.php              intermediario con la API de eventos, ElevenLabs y Gemini
├── .htaccess            bloquea archivos ocultos, documentación y listados
├── inc/funciones.php    funciones del servidor (protegida con .htaccess)
├── datos/               configuración, token y caché (protegida, debe permitir escritura)
└── assets/
    ├── css/             app.css y fuentes.css
    ├── fuentes/         Hind Madurai (tipografía institucional) y JetBrains Mono, licencia OFL
    ├── img/             aquí va el logotipo oficial (no se versiona)
    ├── js/app.js        escena, pulpo, búsqueda y cámara
    ├── js/hud.js        panel de estadísticas
    ├── vendor/          three.js r149, anime.js 3.2.2, face-api 1.7.14 (sin CDN)
    └── modelos/         modelos de detección, puntos faciales, reconocimiento y género
```

Solo en el repositorio (no van al servidor): `docs/` (revisiones), `tests/` (pruebas) y `.claude/` (skills de Claude Code).

## 14. Desarrollo y pruebas

La prueba de punta a punta recorre el asistente con el token, guarda y relee la configuración, abre la pantalla con clave, busca una persona y verifica los bloqueos de seguridad en un Apache real con la aplicación en `/app/octadata/`:

```bash
php -S 127.0.0.1:8090 tests/mock-api.php
```

```bash
sudo sh tests/desplegar-local.sh /var/www/html/app/octadata
```

```bash
node tests/e2e.cjs
```

Requiere Apache con `AllowOverride All`, PHP y Playwright con Chromium. `tests/mock-api.php` simula la API de eventos (token `TOKEN-PRUEBA-123`).

## 15. Skills de Claude Code

El repositorio trae, en `.claude/skills/`, tres skills revisadas y fijadas a una versión (`skills-lock.json`): **impeccable**, **ui-ux-pro-max** y **playwright-cli**. Claude Code las carga solo al abrir el proyecto. La revisión de seguridad de cada una, su versión y cómo instalarlas en otro equipo están en [`docs/skills-claude-code.md`](docs/skills-claude-code.md).
