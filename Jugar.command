#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if command -v node >/dev/null; then
  exec node scripts/serve.mjs --open
fi
if [[ -x "/Applications/ChatGPT.app/Contents/Resources/node" ]]; then
  exec "/Applications/ChatGPT.app/Contents/Resources/node" scripts/serve.mjs --open
fi
echo "Instala Node.js o abre el juego desde el Mac donde se preparó."
read
