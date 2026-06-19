# Run MicStage production growth crons from your PC (bypasses Hostinger CDN blocking GitHub Actions).
# Usage:
#   $env:CRON_SECRET = "Cron123Job456789"
#   .\scripts\run-production-crons.ps1
#
# Schedule in Windows Task Scheduler every 15 minutes for hands-off operation.

$ErrorActionPreference = "Stop"
$secret = $env:CRON_SECRET
if (-not $secret) { $secret = "Cron123Job456789" }

$base = "https://micstage.com"

function Invoke-Cron($label, $url, $timeoutSec) {
  Write-Host "`n=== $label ===" -ForegroundColor Cyan
  try {
    $resp = curl.exe -fsS -m $timeoutSec -X POST -H "Authorization: Bearer $secret" $url
    Write-Host $resp
  } catch {
    Write-Host "FAILED: $_" -ForegroundColor Red
  }
}

# One call: mine up to 50 venue emails, create drafts, send outreach.
Invoke-Cron "Growth tick (emails + outreach)" "$base/api/cron/growth-pipeline?phase=tick" 360

# Nationwide + regional venue discovery (run less often if scheduling hourly).
$minuteUtc = (Get-Date).ToUniversalTime().Minute
if ($minuteUtc -lt 15) {
  Invoke-Cron "Venue discovery (nationwide)" "$base/api/cron/growth-pipeline?phase=discovery" 300
}

Write-Host "`nDone." -ForegroundColor Green
