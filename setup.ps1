$ErrorActionPreference = "Stop"

Write-Host "Mohammad Travels - local setup" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js 20 LTS or newer, then reopen PowerShell."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is not available. Reinstall Node.js and reopen PowerShell."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is not installed/running. Install Docker Desktop and start it."
}

Write-Host "Node: $(node --version)"
Write-Host "npm : $(npm --version)"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example" -ForegroundColor Green
}

npm install
docker compose up -d postgres redis

Write-Host "Waiting for PostgreSQL and Redis..."
Start-Sleep -Seconds 5

npm run db:migrate
npm run db:seed
npm run typecheck

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Start the API:       npm run dev:api"
Write-Host "Start B2C:           npm run dev:web"
Write-Host "Start B2B:           npm run dev:b2b"
Write-Host "Start Corporate:     npm run dev:corporate"
Write-Host "Start Admin:         npm run dev:admin"
