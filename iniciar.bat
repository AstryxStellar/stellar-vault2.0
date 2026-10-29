@echo off
chcp 65001 >nul
title STELLAR VAULT - servidor
cd /d "%~dp0"
echo Iniciando STELLAR VAULT...
echo Deja esta ventana abierta mientras uses la tienda. Para apagarla, cierra la ventana.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node server\server.js
echo.
echo El servidor se detuvo. Si ves un error arriba, revisa que Node.js este instalado (node -v).
pause
