# Skills de Claude Code: inventario y revisión

Revisión hecha el 29 de octubre de 2026 antes de instalar, siguiendo el procedimiento de la skill institucional de ciberseguridad (procedencia, lectura del contenido, análisis automatizado con `revisar_skill_ia.py`, superficie de permisos y veredicto). Una skill recibe la misma autoridad que las instrucciones del agente: **toda actualización debe revisarse de nuevo antes de aceptarla**.

## Inventario

| Skill | Origen y versión revisada | Licencia | Dónde quedó | Veredicto |
|---|---|---|---|---|
| **playwright-cli** | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) `b1a5903` + CLI `@playwright/cli@0.1.22` | Apache-2.0 | `.claude/skills/playwright-cli/` | Instalar |
| **ui-ux-pro-max** | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) `28b3b8d` (v2.15.0) | MIT | `.claude/skills/ui-ux-pro-max/` | Instalar |
| **impeccable** | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `5e745ac` (v4.8.0) | Apache-2.0 | `.claude/skills/impeccable/` | Instalar con restricciones |
| **skillui** | [amaancoderx/npxskillui](https://github.com/amaancoderx/npxskillui) `bc913a8`, npm `skillui@1.3.4` | MIT (declarada en package.json) | herramienta de línea de comandos, no se versiona | Instalar como herramienta de desarrollo |

`skills-lock.json` guarda el hash del contenido instalado por `npx skills`. Junto a cada skill se agregó su archivo `LICENSE` (y el `NOTICE.md` de impeccable), exigidos para redistribuirlas en un repositorio público.

## Hallazgos de la revisión

El análisis automatizado marcó coincidencias «críticas» en todas; se revisaron una por una y son **falsos positivos** por palabras clave:

| Coincidencia | Contexto real |
|---|---|
| «silently», «Do not tell», «Do not show» (impeccable, ui-ux-pro-max, playwright-cli) | Instrucciones de flujo («descartar en silencio los hallazgos que el usuario marcó como ignorados», «no pedir al usuario que invoque el comando»). Ninguna oculta acciones al usuario. |
| «.profile» (skillui) | Variable `profile` del código TypeScript; no escribe perfiles de shell. |
| Decodificación base64 (skillui) | Lee fuentes y scripts incrustados como `data:` URI en el sitio que analiza. |
| «npm i» (playwright-cli) | Documentación de cómo instalar Playwright en un proyecto de pruebas. |

Salidas de red verificadas:

- **ui-ux-pro-max**: scripts Python locales con bases CSV; no hacen peticiones de red.
- **playwright-cli**: controla un navegador local; navega solo a donde el agente le indique.
- **skillui**: descarga el sitio que se le pide analizar y consulta la API pública de Google Fonts. En el modo `ultra` usa Playwright.
- **impeccable**: su lanzador `scripts/impeccable` descarga en el primer uso un binario desde *GitHub Releases* del mismo proyecto y lo verifica contra los SHA-256 de `scripts/engine-checksums.txt`. Como **plugin**, además registra *hooks* que ejecutan ese binario al iniciar sesión, en cada edición de archivos y al terminar.

### Restricciones para impeccable

1. Se instaló como **skill del proyecto**, no como plugin: así no se activan sus *hooks*. El binario solo corre cuando se usan sus comandos (`/impeccable audit`, `critique`, `polish`…).
2. No usar sus comandos en sesiones con credenciales de producción ni con datos personales reales cargados.
3. Revisar `engine-checksums.txt` y el cambio de versión antes de actualizarla.

### Sobre skillui

Se probó con `skillui --url https://narino.gov.co`. El resultado recoge sobre todo estilos de los plugins de WordPress del portal (por ejemplo, el azul `#334aff` es de «The Events Calendar»), no la paleta institucional, así que **no se incorporó como fuente de identidad**. Para diseño se usa el Manual de Identidad Visual (ver `docs/revision-ui-ux.md`).

## Instalar en otro equipo

Las tres skills del proyecto se cargan solas al abrir esta carpeta con Claude Code. Para instalarlas a nivel de usuario o actualizarlas (y revisarlas de nuevo):

```bash
npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli --agent claude-code --yes
```

```bash
npm install -g @playwright/cli@0.1.22
```

```bash
npx skills add nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max --agent claude-code --yes
```

```bash
npm install -g skillui@1.3.4
```

Impeccable como plugin (activa sus *hooks*; ver restricciones), dentro de Claude Code:

```
/plugin marketplace add pbakaus/impeccable
```

UI/UX Pro Max también se ofrece como plugin con `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`. No instale la skill y el plugin a la vez: quedarían duplicados.

Ojo con las copias: hay repositorios con el mismo nombre que no son los originales. Use solo los enlaces de la tabla.
