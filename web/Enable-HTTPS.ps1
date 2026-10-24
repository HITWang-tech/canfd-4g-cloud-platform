#requires -Version 5.1
[CmdletBinding()]
param([string]$InstallDir=(Join-Path $env:ProgramData 'CANFD4G'),[switch]$PrepareOnly)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$InstallDir=[IO.Path]::GetFullPath($InstallDir)
$marker=Join-Path $InstallDir '.canfd4g-owner'
if(-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne 'canfd-4g-cloud-platform'){throw 'Install and verify the CANFD4G receiver first.'}
if(-not $PrepareOnly){
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Open PowerShell as Administrator.'}
}
$config=Get-Content -LiteralPath (Join-Path $InstallDir 'config.json') -Raw | ConvertFrom-Json
$headers=@{Authorization=('Bearer '+$config.token)}
$null=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$config.httpPort+'/api/snapshot') -Headers $headers -TimeoutSec 5
$taskName='CANFD4G-HTTPS'
$node=Join-Path $InstallDir 'runtime\node.exe'
$runner=Join-Path $InstallDir 'https-bridge.mjs'
if(-not $PrepareOnly){
 $existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 if($existing -and ($existing.Actions.Execute -ne $node -or $existing.Actions.Arguments -notlike ('*'+$runner+'*'))){throw 'An unrelated scheduled task uses CANFD4G-HTTPS.'}
 if($existing){Stop-ScheduledTask -TaskName $taskName;Start-Sleep -Seconds 2}
 # Stop only this installation's bridge children when replacing its executable.
 $exe=Join-Path $InstallDir 'runtime\cloudflared.exe'
 Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object {$_.ExecutablePath -eq $exe -and $_.CommandLine -like ('*'+(Join-Path $InstallDir 'https-empty.yml')+'*')} | ForEach-Object {Stop-Process -Id $_.ProcessId}
}
function Download-Checked([string]$Url,[string]$Destination,[string]$Expected){
 if((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Expected){return}
 $temporary=$Destination+'.download'
 for($attempt=0;$attempt -lt 3;$attempt++){
  try{Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $temporary -TimeoutSec 120;break}catch{if($attempt -eq 2){throw};Start-Sleep -Seconds 2}
 }
 if((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $Expected){throw ('SHA256 verification failed: '+$Destination)}
 Move-Item -LiteralPath $temporary -Destination $Destination -Force
}
Write-Host '[1/3] Downloading and verifying HTTPS connector...'
Download-Checked 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-windows-amd64.exe' (Join-Path $InstallDir 'runtime\cloudflared.exe') '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'
$bridgeHash='509500a6d84bf908d398bb502123fd75bb40e36d51e77c1697cfa6e407622b52'
Download-Checked 'https://hitwang-tech.github.io/canfd-4g-cloud-platform/downloads/https-bridge.mjs' $runner $bridgeHash
[IO.File]::WriteAllText((Join-Path $InstallDir 'https-empty.yml'),'{}',(New-Object Text.UTF8Encoding($false)))
if($PrepareOnly){Write-Host 'HTTPS_PREPARED_ONLY';return}
Write-Host '[2/3] Starting HTTPS connector with automatic startup...'
$action=New-ScheduledTaskAction -Execute $node -Argument ('"'+$runner+'" "'+$InstallDir+'"') -WorkingDirectory $InstallDir
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$trigger=New-ScheduledTaskTrigger -AtStartup
$statePath=Join-Path $InstallDir 'data\https-state.json'
# Replace stale ready state before task startup, without changing the receiver.
[IO.File]::WriteAllText($statePath,'{"ready":false}',(New-Object Text.UTF8Encoding($false)))
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host '[3/3] Verifying HTTPS, authentication and browser CORS (up to 90 seconds)...'
$state=$null
for($i=0;$i -lt 45;$i++){
 Start-Sleep -Seconds 2
 try{$candidate=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json;if($candidate.ready){$state=$candidate;break}}catch{}
}
if(-not $state){
 Write-Host 'HTTPS_PENDING: no verified HTTPS endpoint yet.'
 Write-Host ('Please send the last 25 lines of '+(Join-Path $InstallDir 'logs\https-bridge.log')+' (this log does not contain the API token).')
 return
}
Write-Host 'HTTPS_READY'
Write-Host ('HTTPS_URL: '+$state.endpoint)
Write-Host ('OPEN_ON_SERVER: '+(Join-Path $InstallDir 'data\Open-Live.url'))
Write-Host ('IMPORT_ON_YOUR_PC: '+(Join-Path $InstallDir 'data\live-connection.json'))
Write-Host 'These two files contain your private access token. Do not post or screenshot their contents.'
Write-Host 'Temporary endpoint changes when the connector restarts; rerun this command to refresh the connection files.'
