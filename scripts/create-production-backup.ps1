#Requires -Version 5.1
<#
.SYNOPSIS
  Create a MicStage production logical backup (roles + schema + data) with PostgreSQL 17.

.DESCRIPTION
  Reads DIRECT_URL / DATABASE_URL from .env.local / .env (never prints secrets).
  Writes timestamped SQL files outside the Git repo by default.
  Refuses to overwrite existing files. Exit 0 on success, 1 on failure.

.EXAMPLE
  .\scripts\create-production-backup.ps1

.EXAMPLE
  $env:MICSTAGE_BACKUP_DIR = "C:\Users\chris\Projects\OpenMic-private-backups"
  $env:PG_DUMP_PATH = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
  .\scripts\create-production-backup.ps1
#>
$ErrorActionPreference = "Stop"

function Load-EnvFile([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if (-not [string]::IsNullOrEmpty($env:MICSTAGE_FORCE_ENV) -or -not (Test-Path "Env:$key")) {
      Set-Item -Path "Env:$key" -Value $val
    } elseif (-not (Get-Item "Env:$key").Value) {
      Set-Item -Path "Env:$key" -Value $val
    }
  }
}

# Load env without overriding already-set process env
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot
Load-EnvFile (Join-Path $repoRoot ".env.local")
Load-EnvFile (Join-Path $repoRoot ".env")

function Redact([string]$s) {
  if (-not $s) { return "" }
  $s = [regex]::Replace($s, 'postgres(?:ql)?://[^\s"'']+', '[REDACTED_URL]')
  $s = [regex]::Replace($s, 'password=[^\s&"'']+', 'password=[REDACTED]')
  return $s
}

function Prefer-DumpSafeUrl([string]$url) {
  try {
    $u = [Uri]$url
    # Rebuild carefully — Uri may hide password; use string rewrite for port only
    if ($url -match 'pooler\.supabase\.com:6543') {
      return ($url -replace ':6543', ':5432') -replace '[?&]pgbouncer=true', ''
    }
    return $url
  } catch {
    return $url
  }
}

function Get-DbUrl {
  foreach ($k in @("DIRECT_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL")) {
    $v = [Environment]::GetEnvironmentVariable($k)
    if ($v -and $v.Trim()) { return @{ Key = $k; Url = $v.Trim() } }
  }
  return $null
}

function Get-HostMeta([string]$url) {
  try {
    # Strip credentials for display
    $safe = [regex]::Replace($url, '://([^:/@]+):([^@]+)@', '://$1@[REDACTED]@')
    if ($url -match '@([^/:?]+):(\d+)/([^?]+)') {
      return @{ Host = $Matches[1]; Port = $Matches[2]; Database = $Matches[3].Trim('/') }
    }
    if ($url -match '@([^/:?]+)/([^?]+)') {
      return @{ Host = $Matches[1]; Port = "5432"; Database = $Matches[2].Trim('/') }
    }
  } catch {}
  return @{ Host = "(unknown)"; Port = "?"; Database = "?" }
}

function Resolve-PgDump {
  if ($env:PG_DUMP_PATH -and (Test-Path $env:PG_DUMP_PATH)) { return $env:PG_DUMP_PATH }
  $candidates = @(
    "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    "$env:USERPROFILE\Tools\pgsql-bin\bin\pg_dump.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

$picked = Get-DbUrl
if (-not $picked) {
  Write-Error (ConvertTo-Json @{ ok = $false; error = "No DATABASE_URL/DIRECT_URL configured" })
  exit 1
}

$dumpUrl = Prefer-DumpSafeUrl $picked.Url
$meta = Get-HostMeta $dumpUrl
$pgDump = Resolve-PgDump
if (-not $pgDump) {
  Write-Error (ConvertTo-Json @{ ok = $false; error = "pg_dump_not_found"; hint = "Install PostgreSQL 17 or set PG_DUMP_PATH" })
  exit 1
}

$backupRoot = if ($env:MICSTAGE_BACKUP_DIR) { $env:MICSTAGE_BACKUP_DIR } else {
  Join-Path $env:USERPROFILE "Projects\OpenMic-private-backups"
}
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$roles = Join-Path $backupRoot "micstage-prod-$stamp-roles.sql"
$schema = Join-Path $backupRoot "micstage-prod-$stamp-schema.sql"
$data = Join-Path $backupRoot "micstage-prod-$stamp-data.sql"
$manifest = Join-Path $backupRoot "micstage-prod-$stamp.manifest.json"

foreach ($f in @($roles, $schema, $data, $manifest)) {
  if (Test-Path $f) {
    Write-Error (ConvertTo-Json @{ ok = $false; error = "refusing_overwrite"; file = (Split-Path $f -Leaf) })
    exit 1
  }
}

$ver = & $pgDump --version
Write-Host (ConvertTo-Json @{
  phase = "dump"
  tool = "pg_dump"
  version = "$ver".Trim()
  host = $meta.Host
  port = $meta.Port
  database = $meta.Database
  stamp = $stamp
  note = "connection string not logged"
})

$env:PGSSLMODE = if ($env:PGSSLMODE) { $env:PGSSLMODE } else { "require" }
$common = @("--no-owner", "--no-privileges", "--quote-all-identifiers")
$started = Get-Date

# Roles (may fail on managed Supabase — write stub)
$rolesOk = $false
try {
  & $pgDump @($common + @("--roles-only", "--file", $roles, $dumpUrl)) 2>&1 | Out-String | ForEach-Object {
    if ($_ -match "error|fatal" -and $_ -notmatch "^\s*$") { throw $_ }
  }
  if ((Test-Path $roles) -and ((Get-Item $roles).Length -gt 50)) { $rolesOk = $true }
} catch {
  $rolesOk = $false
}
if (-not $rolesOk) {
  @(
    "-- MicStage roles dump"
    "-- Note: full --roles-only failed or empty on this connection (common on Supabase managed)."
    "-- Application restore of public schema does not require custom cluster roles."
    "-- detail: redacted"
    ""
  ) | Set-Content -Path $roles -Encoding utf8
}

# Schema
$schemaOut = & $pgDump @($common + @("--schema-only", "--schema=public", "--file", $schema, $dumpUrl)) 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  Write-Error (ConvertTo-Json @{ ok = $false; error = "schema_dump_failed"; detail = (Redact $schemaOut).Substring(0, [Math]::Min(800, (Redact $schemaOut).Length)) })
  exit 1
}

# Data (COPY format is default for pg_dump plain)
$dataOut = & $pgDump @($common + @("--data-only", "--schema=public", "--file", $data, $dumpUrl)) 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  Write-Error (ConvertTo-Json @{ ok = $false; error = "data_dump_failed"; detail = (Redact $dataOut).Substring(0, [Math]::Min(800, (Redact $dataOut).Length)) })
  exit 1
}

$expected = @(
  "PublicOpenMicListing", "Venue", "VenueOwner", "MusicianUser", "PromoterUser",
  "GrowthLead", "OperationalRuntimeSetting", "_prisma_migrations",
  "ListingClaimInviteToken", "ListingOpenMicEvidence", "PublicOpenMicSchedule", "EventTemplate"
)

function Test-BackupFile([string]$Kind, [string]$Path) {
  $errors = @()
  if (-not (Test-Path $Path)) { return @{ ok = $false; bytes = 0; errors = @("missing") } }
  $bytes = (Get-Item $Path).Length
  if ($bytes -le 0) { $errors += "zero_bytes" }
  $text = Get-Content -Path $Path -Raw -Encoding utf8
  if ($Kind -eq "schema") {
    if ($bytes -lt 5000) { $errors += "too_small" }
    if ($text -notmatch "CREATE TABLE") { $errors += "no_create_table" }
    foreach ($t in $expected) {
      if ($text -notmatch [regex]::Escape($t)) { $errors += "missing_$t" }
    }
  }
  if ($Kind -eq "data") {
    if ($bytes -lt 10000) { $errors += "too_small" }
    if ($text -notmatch "(?m)^COPY ") { $errors += "no_copy" }
    $starts = ([regex]::Matches($text, '(?m)^COPY ')).Count
    $ends = ([regex]::Matches($text, '(?m)^\\\.$')).Count
    if ($starts -gt 0 -and $ends -lt [math]::Floor($starts * 0.9)) { $errors += "truncation_risk" }
    foreach ($t in @("PublicOpenMicListing", "Venue", "GrowthLead", "_prisma_migrations")) {
      if ($text -notmatch [regex]::Escape($t)) { $errors += "missing_copy_$t" }
    }
  }
  if ($Kind -eq "roles" -and $bytes -lt 20) { $errors += "too_small" }
  return @{ ok = ($errors.Count -eq 0); bytes = $bytes; errors = $errors }
}

$vRoles = Test-BackupFile "roles" $roles
$vSchema = Test-BackupFile "schema" $schema
$vData = Test-BackupFile "data" $data
$allOk = $vRoles.ok -and $vSchema.ok -and $vData.ok

$result = [ordered]@{
  ok = $allOk
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
  method = "pg_dump_postgresql_17"
  pgDumpPath = $pgDump
  pgDumpVersion = "$ver".Trim()
  stamp = $stamp
  backupRoot = $backupRoot
  host = $meta.Host
  port = $meta.Port
  database = $meta.Database
  envKeyUsed = $picked.Key
  files = @{
    roles = (Split-Path $roles -Leaf)
    schema = (Split-Path $schema -Leaf)
    data = (Split-Path $data -Leaf)
  }
  bytes = @{
    roles = $vRoles.bytes
    schema = $vSchema.bytes
    data = $vData.bytes
    total = ($vRoles.bytes + $vSchema.bytes + $vData.bytes)
  }
  sha256 = @{
    roles = (Get-Sha256 $roles)
    schema = (Get-Sha256 $schema)
    data = (Get-Sha256 $data)
  }
  validation = @{
    roles = $vRoles
    schema = $vSchema
    data = $vData
  }
  storageObjects = "DB dump does not include object blobs. MicStage uses Vercel Blob for profile images when configured - not Supabase Storage."
  offSiteReminder = "Keep a second copy on OneDrive/Google Drive. Do not commit dumps to Git."
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Path $manifest -Encoding utf8
Write-Host ($result | ConvertTo-Json -Depth 6)

if (-not $allOk) { exit 1 }
exit 0
