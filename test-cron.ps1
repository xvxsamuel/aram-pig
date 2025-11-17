# test cron jobs locally
# make sure dev server is running on localhost:3000

# load environment variables from .env.local
if (Test-Path ".env.local") {
    Write-Host "Loading environment variables from .env.local..." -ForegroundColor Gray
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    Write-Host "Environment variables loaded!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "Warning: .env.local not found!" -ForegroundColor Yellow
    Write-Host ""
}

# get cron secret from environment
$cronSecret = $env:CRON_SECRET
if (-not $cronSecret) {
    Write-Host "ERROR: CRON_SECRET not found in environment variables!" -ForegroundColor Red
    Write-Host "Add CRON_SECRET=your-secret-here to .env.local" -ForegroundColor Yellow
    exit 1
}

Write-Host "Testing Cron Jobs..." -ForegroundColor Cyan
Write-Host ""

# create auth header
$headers = @{
    "Authorization" = "Bearer $cronSecret"
}

# test scrape-matches cron
Write-Host "1. Testing /api/cron/scrape-matches..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/cron/scrape-matches" -Method GET -Headers $headers -TimeoutSec 120
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Gray
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# test refresh-stats cron
Write-Host "2. Testing /api/cron/refresh-stats..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/cron/refresh-stats" -Method POST -Headers $headers -TimeoutSec 120
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Gray
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
