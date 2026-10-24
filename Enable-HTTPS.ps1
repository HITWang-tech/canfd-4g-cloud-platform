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
 for($attempt=1;$attempt -le 2;$attempt++){
  $response=$null;$inputStream=$null;$outputStream=$null
  try{
   Write-Host ('Connecting to download server (attempt '+$attempt+'/2)...')
   $request=[Net.HttpWebRequest]::Create($Url)
   $request.Timeout=20000;$request.ReadWriteTimeout=20000
   $request.UserAgent='CANFD4G-Installer/20261024.3'
   $response=$request.GetResponse();$inputStream=$response.GetResponseStream()
   $outputStream=[IO.File]::Create($temporary)
   $buffer=New-Object byte[] 65536
   $received=0L;$clock=[Diagnostics.Stopwatch]::StartNew();$lastDisplay=-3.0
   while(($count=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0){
    $outputStream.Write($buffer,0,$count);$received+=$count
    if($clock.Elapsed.TotalSeconds-$lastDisplay -ge 2){
     $total=if($response.ContentLength -gt 0){' / '+[Math]::Round($response.ContentLength/1MB,1)+' MB'}else{''}
     Write-Host ('Downloaded '+[Math]::Round($received/1MB,1)+' MB'+$total)
     $lastDisplay=$clock.Elapsed.TotalSeconds
    }
    if($clock.Elapsed.TotalSeconds -gt 300){throw 'Download exceeded 5 minutes. Check server network connectivity.'}
   }
   Write-Host ('Download complete: '+[Math]::Round($received/1MB,1)+' MB')
   break
  }catch{
   Write-Host ('Download failed: '+$_.Exception.Message)
   if($attempt -eq 2){throw};Start-Sleep -Seconds 2
  }finally{
   if($outputStream){$outputStream.Dispose()};if($inputStream){$inputStream.Dispose()};if($response){$response.Dispose()}
  }
 }
 if((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $Expected){throw ('SHA256 verification failed: '+$Destination)}
 Move-Item -LiteralPath $temporary -Destination $Destination -Force
}
Write-Host '[1/3] Downloading and verifying HTTPS connector...'
Write-Host 'Installer version: 20261024.3 (compressed website download with progress)'
$connector=Join-Path $InstallDir 'runtime\cloudflared.exe'
$connectorHash='86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'
if(-not (Test-Path -LiteralPath $connector) -or (Get-FileHash -LiteralPath $connector -Algorithm SHA256).Hash -ne $connectorHash){
 $archive=Join-Path $InstallDir 'downloads\cloudflared-2026.10.0-win64.zip'
 Download-Checked 'https://hitwang-tech.github.io/canfd-4g-cloud-platform/downloads/cloudflared-2026.10.0-win64.zip' $archive 'b93a5538eb3377fa712eb716de03a44a544c1976290b830434ae8fe2adec9c99'
 Write-Host 'Unpacking and verifying official executable...'
 $unpacked=Join-Path $InstallDir 'downloads\https-unpacked'
 Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -Force
 $unpackedExe=Join-Path $unpacked 'cloudflared.exe'
 if((Get-FileHash -LiteralPath $unpackedExe -Algorithm SHA256).Hash -ne $connectorHash){throw 'Connector executable SHA256 verification failed.'}
 Move-Item -LiteralPath $unpackedExe -Destination $connector -Force
 Copy-Item -LiteralPath (Join-Path $unpacked 'LICENSE.txt') -Destination (Join-Path $InstallDir 'runtime\cloudflared-LICENSE.txt') -Force
}
$bridgeHash='98f55462df41b46681c688deaf570c8521518e2495444d0f310009863ee023ab'
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
