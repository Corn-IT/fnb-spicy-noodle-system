@echo off
title FnB Spicy Noodle System Starter
echo ========================================================
echo   FnB Spicy Noodle System - Auto Starter
echo ========================================================

set "PATH=C:\Users\thant\tools\node;C:\Users\thant\tools\git\cmd;C:\Users\thant\tools\pgsql\bin;%PATH%"

echo [1/3] Kiem tra va khoi dong PostgreSQL 16...
"C:\Users\thant\tools\pgsql\bin\pg_ctl.exe" -D "C:\Users\thant\tools\pgsql\data" status >nul 2>&1
if errorlevel 1 (
    echo Khoi dong PostgreSQL...
    "C:\Users\thant\tools\pgsql\bin\pg_ctl.exe" -D "C:\Users\thant\tools\pgsql\data" -l "C:\Users\thant\tools\pgsql\logfile.log" start
) else (
    echo PostgreSQL da dang chay.
)

echo [2/3] Khoi dong Backend API Server (Port 3000)...
start "FnB API Server" cmd /k "cd /d ""%~dp0apps\api-server"" && pnpm dev"

echo [3/3] Khoi dong Frontend Web App (Port 5173)...
start "FnB Web App" cmd /k "cd /d ""%~dp0apps\web-app"" && pnpm dev"

echo ========================================================
echo   He thong dang khoi chay:
echo   - Web App: http://localhost:5173
echo   - API Server: http://localhost:3000/api/v1/health
echo ========================================================
pause
