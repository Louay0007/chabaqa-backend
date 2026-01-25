@echo off
REM ========================================
REM Chabaqa Backend - Production Deployment
REM ========================================

echo.
echo ========================================
echo   Chabaqa Backend - Docker Deployment
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    exit /b 1
)

REM Parse command line arguments
set ACTION=%1
if "%ACTION%"=="" set ACTION=up

if "%ACTION%"=="up" goto :deploy
if "%ACTION%"=="build" goto :build
if "%ACTION%"=="stop" goto :stop
if "%ACTION%"=="restart" goto :restart
if "%ACTION%"=="logs" goto :logs
if "%ACTION%"=="status" goto :status
goto :usage

:deploy
echo [1/3] Building and starting containers...
docker compose up -d --build
if errorlevel 1 (
    echo [ERROR] Failed to start containers
    exit /b 1
)

echo.
echo [2/3] Waiting for services to be healthy...
timeout /t 30 /nobreak >nul

echo.
echo [3/3] Checking health status...
docker compose ps
echo.

REM Check if backend is healthy
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/health | findstr "200" >nul
if errorlevel 1 (
    echo [WARNING] Backend health check failed. Check logs with: deploy.cmd logs
) else (
    echo [SUCCESS] Backend is healthy and running!
)
echo.
goto :end

:build
echo Building containers (no cache)...
docker compose build --no-cache
goto :end

:stop
echo Stopping containers...
docker compose down
echo [SUCCESS] All containers stopped.
goto :end

:restart
echo Restarting containers...
docker compose restart
goto :end

:logs
echo Showing backend logs (Ctrl+C to exit)...
docker logs -f chabaqa-backend
goto :end

:status
echo Container status:
docker compose ps
echo.
echo Backend health:
curl -s http://localhost:3000/api/health 2>nul || echo [ERROR] Backend not responding
goto :end

:usage
echo.
echo Usage: deploy.cmd [command]
echo.
echo Commands:
echo   up       Build and start all containers (default)
echo   build    Rebuild containers without cache
echo   stop     Stop all containers
echo   restart  Restart all containers
echo   logs     View backend logs
echo   status   Check container status
echo.
goto :end

:end
