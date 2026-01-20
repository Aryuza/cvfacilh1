@echo off
setlocal

:: Configuración (Edita estas 3 líneas con tus datos)
set GEMINI_API_KEY=AIzaSyBwZvOcfEYf7lCEsrktVeyvZGiE7IYkl9g, AIzaSyAJ9HOpRoGTfa7dSQJfSruZwH0mGCnxzUs, AIzaSyC4knPnuy3kW3hMyEsKQWW0ROHW7CV5XcI
set GMAIL_USER=curriculumfacilentregas@gmail.com
set GMAIL_APP_PASSWORD=hidv hwqe euln oubd

:: Si no pasas carpeta al ejecutar, te la pide
if "%~1"=="" (
    set /p "CLIENT_FOLDER=Arrastra aqui la carpeta del cliente y presiona Enter: "
) else (
    set CLIENT_FOLDER=%~1
)

:: Quitar comillas si las hay
set CLIENT_FOLDER=%CLIENT_FOLDER:"=%

echo.
echo === INICIANDO AUTOMATIZACION DE CV ===
echo Procesando carpeta: "%CLIENT_FOLDER%"
echo.

python main.py "%CLIENT_FOLDER%"

echo.
echo === PROCESO TERMINADO ===
pause
