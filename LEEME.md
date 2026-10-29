# Pulpo de datos – Cumbre Tecnológica IA Nariño

Animación en three.js y anime.js para pantalla de evento: un pulpo lineal organiza a las personas inscritas en una red de neuronas (perfil → municipio → entidad → nombre), las busca por voz y da la bienvenida con la cámara.

Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto. Versión 2.0.0.

## Requisitos del hosting

- Plesk con PHP 8.1 o superior (recomendado 8.2) y las extensiones cURL, JSON y mbstring.
- Apache activo para el dominio (es lo predeterminado en Plesk: «PHP-FPM servido por Apache»).
- Certificado SSL. La cámara y el micrófono solo funcionan por HTTPS.

## Instalación en Plesk

1. En **Sitios web y dominios**, elija el dominio o cree un subdominio (por ejemplo `pulpo.narino.gov.co`). Verifique en **SSL/TLS** que tenga certificado (Let's Encrypt sirve).
2. En **Configuración de PHP**, seleccione PHP 8.2 con «FPM servido por Apache».
3. Abra **Administrador de archivos**, entre a `httpdocs` (o a la carpeta del subdominio) y suba `pulpo-cumbre-ia.zip`.
4. Haga clic derecho sobre el ZIP → **Extraer archivos**. Queda la carpeta `pulpo-cumbre-ia/`. Si quiere el pulpo en la raíz del dominio, mueva su contenido un nivel arriba.
5. Abra en el navegador `https://su-dominio/pulpo-cumbre-ia/` y siga el asistente. Haga este paso apenas suba los archivos: mientras no termine la instalación, el asistente está abierto para cualquiera.

### Pasos del asistente

| Paso | Qué pide |
|---|---|
| 1. Requisitos | Revisa PHP, extensiones, permisos de `datos/`, HTTPS y modelos de rostro. |
| 2. API de eventos | Dirección base y token. El botón «Probar conexión» muestra el nombre del evento y los totales por perfil. |
| 3. ElevenLabs | Clave, ID de voz y modelos. Es opcional: sin clave se usa el reconocimiento del navegador. |
| 4. Gemini | Clave y modelo. Es opcional: sin clave la búsqueda usa coincidencia fonética. |
| 5. Experiencia | Saludo, tiempos, cámara, exigencia del reconocimiento y plantilla de fotos. |
| 6. Administración | Contraseña para volver a entrar al asistente. Muestra un resumen antes de guardar. |

Para cambiar algo después, abra `instalar.php` (o el botón de engranaje en la pantalla) e ingrese la contraseña.

## Si el dominio usa solo nginx

Las carpetas `datos/` e `inc/` se protegen con `.htaccess`, que solo lee Apache. Si el dominio sirve archivos únicamente con nginx, agregue en **Configuración de Apache y nginx → Directivas adicionales de nginx**:

```
location ~ ^/(.*/)?(datos|inc)/ { deny all; }
```

Compruébelo abriendo `https://su-dominio/pulpo-cumbre-ia/datos/config.php`: debe responder 403 o una página vacía, nunca el contenido.

## Uso en el evento

- Pulse **Iniciar** (activa audio y cámara).
- **Barra espaciadora** sostenida: búsqueda por voz.
- **/**: búsqueda escrita.
- **Esc**: cierra la ficha de la persona.
- `index.php?demo=1` muestra la animación con datos inventados, sin consultar la API.

Para el kiosco se recomienda Chrome en pantalla completa (`--kiosk`). Conceda permisos de cámara y micrófono una vez; el navegador los recuerda para el dominio HTTPS.

## Cómo protege los datos

- El token de la API, y las claves de ElevenLabs y Gemini, quedan en `datos/config.php`. El navegador solo habla con `api.php`.
- `api.php` entrega al navegador únicamente nombre, perfil, entidad, municipio, carné, número de ingresos y la charla aprobada. Si alguien escribió su número de documento como entidad, ese valor no sale del servidor.
- Las respuestas de la API se guardan en caché (60 s por defecto) para no saturar el servidor de eventos. Si la API falla, se sirve la última copia.
- Voz y Gemini tienen límite de solicitudes por IP y solo aceptan peticiones desde el mismo dominio.
- Los rostros vinculados y los conteos de la cámara viven en la memoria del navegador y se borran al cerrar la página. No se guardan imágenes.

## Tratamiento de datos personales

La Ley 1581 de 2012 considera sensibles los datos biométricos. Antes de usar la cámara, publique un aviso de privacidad visible junto a la pantalla y obtenga la autorización expresa de quien vincule su rostro. La estimación de género es binaria, puede equivocarse y solo se muestra como cifra agregada.

## Estructura

```
pulpo-cumbre-ia/
├── index.php          pantalla del pulpo
├── instalar.php       asistente de instalación y ajustes
├── api.php            intermediario con la API de eventos, ElevenLabs y Gemini
├── .htaccess
├── inc/funciones.php  funciones del servidor (protegida)
├── datos/             configuración y caché (protegida, debe permitir escritura)
└── assets/
    ├── css/app.css
    ├── js/app.js      escena, pulpo, búsqueda y cámara
    ├── js/hud.js      panel de estadísticas
    ├── vendor/        three.js r149, anime.js 3.2.2, face-api 1.7.14 (sin CDN)
    └── modelos/       modelos de detección, puntos faciales, reconocimiento y género
```

## Actualizar

Reemplace todos los archivos excepto la carpeta `datos/`. La configuración y la contraseña se conservan.
