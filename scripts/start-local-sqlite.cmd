@echo off
set "APP_ENV=development"
set "APP_PORT=8080"
set "APP_TIMEZONE=Asia/Jakarta"
set "APP_URL=http://localhost:8080"
set "STATIC_DIR=..\dist"
set "FRONTEND_ORIGINS=http://localhost:8080,http://127.0.0.1:8080"
set "DB_DRIVER=sqlite"
set "DB_PATH=..\data\geopresensi-local.db"
set "DB_MAX_OPEN_CONNS=1"
set "DB_MAX_IDLE_CONNS=1"
set "TURNSTILE_REQUIRED=false"
cd /d "%~dp0..\backend"
build\geopresensi-local.exe
