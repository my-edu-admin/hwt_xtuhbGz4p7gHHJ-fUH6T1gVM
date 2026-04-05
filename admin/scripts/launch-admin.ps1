param(
  [switch]$CheckOnly,
  [switch]$Detached,
  [switch]$Foreground,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$adminDir = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $adminDir
$serverPath = Join-Path $adminDir "server.js"
$nodeModulesPath = Join-Path $adminDir "node_modules"
$envFilePath = Join-Path $adminDir ".env"

function Resolve-NodeCommand {
  $localNode = Get-Command node -ErrorAction SilentlyContinue
  if ($localNode) {
    return $localNode.Source
  }

  throw "Node.js was not found in PATH. Install Node.js or add it to PATH, then run edudata-admin again."
}

function Get-AdminEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Key,
    [string]$Default = ""
  )

  if (-not (Test-Path -LiteralPath $envFilePath)) {
    return $Default
  }

  foreach ($line in Get-Content -LiteralPath $envFilePath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
      continue
    }

    $parts = $trimmed -split "=", 2
    if ($parts[0].Trim() -ne $Key) {
      continue
    }

    return $parts[1].Trim().Trim("'`"")
  }

  return $Default
}

function Resolve-AdminEndpoint {
  $hostValue = (Get-AdminEnvValue -Key "ADMIN_HOST" -Default "0.0.0.0").Trim()
  $portValue = (Get-AdminEnvValue -Key "ADMIN_PORT" -Default "3000").Trim()
  $parsedPort = 0
  if (-not [int]::TryParse($portValue, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
    $parsedPort = 3000
  }

  $browserHost = switch ($hostValue.ToLowerInvariant()) {
    "" { "localhost" }
    "0.0.0.0" { "localhost" }
    "::" { "localhost" }
    "[::]" { "localhost" }
    default { $hostValue }
  }

  return [pscustomobject]@{
    ProbeHost = $browserHost
    Port = $parsedPort
    Url = "http://${browserHost}:${parsedPort}"
  }
}

function Test-AdminEndpointReady {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProbeHost,
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [int]$TimeoutMilliseconds = 2000
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connectAsync = $client.BeginConnect($ProbeHost, $Port, $null, $null)
    if (-not $connectAsync.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
      return $false
    }

    $client.EndConnect($connectAsync)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-ForAdminEndpoint {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProbeHost,
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $TimeoutSeconds))
  while ((Get-Date) -lt $deadline) {
    if (Test-AdminEndpointReady -ProbeHost $ProbeHost -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Admin server entry file was not found at '$serverPath'."
}

$nodeCommand = Resolve-NodeCommand
$adminEndpoint = Resolve-AdminEndpoint
$adminUrl = $adminEndpoint.Url
$adminHost = $adminEndpoint.ProbeHost
$adminPort = $adminEndpoint.Port
$runForeground = $Foreground.IsPresent -and -not $Detached.IsPresent

if ($CheckOnly) {
  [pscustomobject]@{
    project_root = $projectRoot
    admin_dir = $adminDir
    server_path = $serverPath
    node_command = $nodeCommand
    node_modules_present = Test-Path -LiteralPath $nodeModulesPath
    admin_url = $adminUrl
    server_running = (Test-AdminEndpointReady -ProbeHost $adminHost -Port $adminPort)
  } | Format-List
  exit 0
}

Write-Host "Starting EduData Admin from $adminDir" -ForegroundColor Cyan
Write-Host "Server entry: $serverPath" -ForegroundColor DarkGray
Write-Host "Admin URL: $adminUrl" -ForegroundColor DarkGray

if (Test-AdminEndpointReady -ProbeHost $adminHost -Port $adminPort) {
  Write-Host "EduData Admin is already running." -ForegroundColor Yellow
  if (-not $NoBrowser) {
    Start-Process $adminUrl | Out-Null
    Write-Host "Browser opened at $adminUrl." -ForegroundColor Green
  }
  exit 0
}

if (-not $runForeground) {
  Start-Process -FilePath $nodeCommand `
    -WindowStyle Hidden `
    -WorkingDirectory $adminDir `
    -ArgumentList @($serverPath) | Out-Null
  if (-not (Wait-ForAdminEndpoint -ProbeHost $adminHost -Port $adminPort -TimeoutSeconds 20)) {
    throw "Admin server did not become reachable at $adminUrl within 20 seconds."
  }

  Write-Host "Admin server started in a separate process." -ForegroundColor Green
  if (-not $NoBrowser) {
    Start-Process $adminUrl | Out-Null
    Write-Host "Browser opened at $adminUrl." -ForegroundColor Green
  }
  exit 0
}

if (-not $NoBrowser) {
  $openBrowserCommand = @(
    "-NoProfile",
    "-WindowStyle", "Hidden",
    "-Command",
    "& {" +
      "`$deadline = (Get-Date).AddSeconds(20);" +
      "while ((Get-Date) -lt `$deadline) {" +
        "try { " +
          "`$client = [System.Net.Sockets.TcpClient]::new();" +
          "`$connectAsync = `$client.BeginConnect('$adminHost', $adminPort, `$null, `$null);" +
          "if (`$connectAsync.AsyncWaitHandle.WaitOne(2000, `$false)) { " +
            "`$client.EndConnect(`$connectAsync); " +
            "if (`$client.Connected) { Start-Process '$adminUrl' | Out-Null; break } " +
          "} " +
        "} catch {} finally { if (`$client) { `$client.Dispose() } }; Start-Sleep -Milliseconds 500" +
      "}" +
    "}"
  )
  Start-Process -FilePath "powershell.exe" -ArgumentList $openBrowserCommand -WorkingDirectory $adminDir | Out-Null
}

Push-Location $adminDir
try {
  & $nodeCommand $serverPath
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
