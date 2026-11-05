@echo off
rem Abre o Vetora no navegador (uso local). Feche esta janela para desligar.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install --no-audit --no-fund
)
call npm run build
start "" http://localhost:5181
call npx vite preview --port 5181 --strictPort
