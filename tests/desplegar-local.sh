#!/bin/sh
# Copia la aplicación a un Apache local en /app/octadata/ para probarla (no se despliega).
# Uso: sh tests/desplegar-local.sh [/var/www/html/app/octadata]
set -eu
ORIGEN=$(cd "$(dirname "$0")/.." && pwd)
DESTINO=${1:-/var/www/html/app/octadata}
rm -rf "$DESTINO"
mkdir -p "$DESTINO"
# Copia todo, incluso lo que no debería subirse (.claude, docs, tests), para comprobar que .htaccess lo bloquea.
tar -C "$ORIGEN" --exclude=.git --exclude='datos/config.php' --exclude='datos/cache' --exclude='datos/token-instalacion.php' -cf - . | tar -C "$DESTINO" -xf -
mkdir -p "$DESTINO/.git" && echo "[core]" > "$DESTINO/.git/config"
chown -R www-data:www-data "$DESTINO/datos"
echo "Desplegado en $DESTINO"
