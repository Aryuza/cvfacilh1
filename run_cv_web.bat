@echo off
setlocal

:: Configuración (Pega aquí tus credenciales)
set GEMINI_API_KEY=AIzaSyBwZvOcfEYf7lCEsrktVeyvZGiE7IYkl9g, AIzaSyAJ9HOpRoGTfa7dSQJfSruZwH0mGCnxzUs, AIzaSyC4knPnuy3kW3hMyEsKQWW0ROHW7CV5XcI
set GMAIL_USER=curriculumfacilentregas@gmail.com
set GMAIL_APP_PASSWORD=hidv hwqe euln oubd

echo.
echo === INICIANDO INTERFAZ WEB DE CV ===
echo.
echo Abrí tu navegador en: http://localhost:5000
echo.

python app.py

pause
