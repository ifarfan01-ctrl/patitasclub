#!/bin/bash
# Arma www/ con solo los archivos del sitio (lo que Capacitor empaqueta en
# las apps nativas). Todo lo que es backend o herramientas de desarrollo
# (functions/, firestore.rules, node_modules, android/, ios/, etc.) queda
# fuera a propósito: no debe viajar dentro de la app.
set -e
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www

rsync -a . www/ \
  --exclude ".git" \
  --exclude ".DS_Store" \
  --exclude "node_modules" \
  --exclude "functions" \
  --exclude "scripts" \
  --exclude "android" \
  --exclude "ios" \
  --exclude "www" \
  --exclude "firebase.json" \
  --exclude "firestore.rules" \
  --exclude ".firebaserc" \
  --exclude "package.json" \
  --exclude "package-lock.json" \
  --exclude "capacitor.config.json" \
  --exclude "CNAME" \
  --exclude "README.md" \
  --exclude "robots.txt" \
  --exclude "sitemap.xml" \
  --exclude "llms.txt"

echo "www/ listo."
