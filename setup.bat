@echo off
setlocal
echo Mohammad Travels - local setup
where node >nul 2>nul || (echo Node.js is required. Install Node.js 20 LTS or newer. & exit /b 1)
where npm >nul 2>nul || (echo npm is required. & exit /b 1)
where docker >nul 2>nul || (echo Docker Desktop is required. & exit /b 1)

if not exist .env copy .env.example .env
call npm install || exit /b 1
call docker compose up -d postgres redis || exit /b 1
timeout /t 5 /nobreak >nul
call npm run db:migrate || exit /b 1
call npm run db:seed || exit /b 1
call npm run typecheck || exit /b 1

echo.
echo Setup complete.
echo Run "npm run dev:api" for the API.
echo Run "npm run dev:web" for B2C.
echo Run "npm run dev:b2b" for B2B.
echo Run "npm run dev:corporate" for Corporate.
echo Run "npm run dev:admin" for Admin.
