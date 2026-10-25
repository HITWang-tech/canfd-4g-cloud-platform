#requires -Version 5.1
[CmdletBinding()]
param([string]$InstallDir=(Join-Path $env:ProgramData 'CANFD4G'),[string]$PublicIp='',[switch]$AcceptLetsEncryptTerms,[switch]$PrepareOnly)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$InstallDir=[IO.Path]::GetFullPath($InstallDir)
$ipValue=$null
if(-not [Net.IPAddress]::TryParse($PublicIp,[ref]$ipValue) -or $ipValue.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or [Net.IPAddress]::IsLoopback($ipValue)){throw 'Provide the server public IPv4 using -PublicIp.'}
$marker=Join-Path $InstallDir '.canfd4g-owner'
if(-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne 'canfd-4g-cloud-platform'){throw 'Install the CANFD4G receiver first.'}
if(-not $PrepareOnly){
 if(-not $AcceptLetsEncryptTerms){throw 'Read https://letsencrypt.org/repository/ and rerun with -AcceptLetsEncryptTerms only if you agree to the Subscriber Agreement.'}
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Open PowerShell as Administrator.'}
 $framework=(Get-ItemProperty 'HKLM:SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full').Release
 if($framework -lt 461308){throw '.NET Framework 4.7.1 or newer is required by the certificate module.'}
}
$folder=Join-Path $InstallDir 'ip-https'
$owner=Join-Path $folder '.canfd4g-ip-owner'
if((Test-Path -LiteralPath $folder) -and (Get-ChildItem -LiteralPath $folder -Force|Select-Object -First 1) -and (-not(Test-Path -LiteralPath $owner) -or (Get-Content -LiteralPath $owner -Raw).Trim() -ne 'canfd4g-ip-https')){throw 'IP HTTPS folder is not owned by this project.'}
foreach($sub in @($folder,(Join-Path $folder 'published'),(Join-Path $folder 'acme'),(Join-Path $InstallDir 'downloads'))){New-Item -ItemType Directory -Path $sub -Force|Out-Null}
Set-Content -LiteralPath $owner -Value 'canfd4g-ip-https' -Encoding Ascii
$node=Join-Path $InstallDir 'runtime\node.exe'
$proxy=Join-Path $folder 'direct-https.mjs'
$renew=Join-Path $folder 'Renew-IPCertificate.ps1'
$proxyTask='CANFD4G-DirectHTTPS'
$renewTask='CANFD4G-IPCertificate'
$powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if(-not $PrepareOnly){
 $config=Get-Content -LiteralPath (Join-Path $InstallDir 'config.json') -Raw|ConvertFrom-Json
 $null=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$config.httpPort+'/api/snapshot') -Headers @{Authorization=('Bearer '+$config.token)} -TimeoutSec 5
 foreach($item in @(@($proxyTask,$proxy),@($renewTask,$renew))){$task=Get-ScheduledTask -TaskName $item[0] -ErrorAction SilentlyContinue;if($task -and $task.Actions.Arguments -notlike ('*'+$item[1]+'*')){throw ('Unrelated scheduled task uses '+$item[0])}}
 foreach($listener in @(Get-NetTCPConnection -State Listen -LocalPort 443 -ErrorAction SilentlyContinue)){
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
  if($process.ExecutablePath -ne $node -or $process.CommandLine -notlike ('*'+$proxy+'*')){throw 'Port 443 is used by another application; no processes were stopped.'}
 }
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
Write-Host '[1/4] Preparing verified certificate tools (about 2 MB)...'
Write-Host 'IP HTTPS installer version: 20261025.4'
$package=Join-Path $InstallDir 'downloads\ip-https-tools.zip'
Download-Checked 'https://hitwang-tech.github.io/canfd-4g-cloud-platform/downloads/ip-https-tools.zip' $package '3f8240726108974fa3d0818d1a67688adb5d3f363cd1fbc06e24d6a88ef4fbcf'
$unpacked=Join-Path $InstallDir 'downloads\ip-https-tools'
Expand-Archive -LiteralPath $package -DestinationPath $unpacked -Force
$moduleZip=Join-Path $unpacked 'Posh-ACME.4.35.0.zip'
if((Get-FileHash -LiteralPath $moduleZip).Hash -ne '219611b6cd99e92a2607264c5adb05b987ae6c54f5242f80cf260d286aae1f05'){throw 'Certificate module checksum mismatch.'}
Expand-Archive -LiteralPath $moduleZip -DestinationPath (Join-Path $folder 'module') -Force
Copy-Item -LiteralPath (Join-Path $unpacked 'Posh-ACME-LICENSE.txt') -Destination (Join-Path $folder 'Posh-ACME-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $unpacked 'direct-https.mjs') -Destination $proxy -Force
Copy-Item -LiteralPath (Join-Path $unpacked 'Renew-IPCertificate.ps1') -Destination $renew -Force
$settingsPath=Join-Path $folder 'settings.json'
if(Test-Path -LiteralPath $settingsPath){$old=Get-Content -LiteralPath $settingsPath -Raw|ConvertFrom-Json;if($old.ip -ne $PublicIp){throw 'Configured IP differs from this request. Use a separate owned installation for IP migration.'}}
[IO.File]::WriteAllText($settingsPath,(@{ip=$PublicIp;acceptTerms=[bool]$AcceptLetsEncryptTerms}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
if($PrepareOnly){Write-Host 'IP_HTTPS_PREPARED_ONLY: no certificate was requested; no tasks or security settings were changed.';return}
# ACME account data is restricted to SYSTEM and administrators; the proxy only reads published certificates.
$private=Join-Path $folder 'acme';$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
foreach($id in @('S-1-5-18','S-1-5-32-544')){$sid=New-Object Security.Principal.SecurityIdentifier($id);$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
Set-Acl -LiteralPath $private -AclObject $acl
Write-Host '[2/4] Requesting/renewing the trusted public-IP certificate through port 80...'
$renewAction=New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -NonInteractive -File "'+$renew+'" -InstallDir "'+$InstallDir+'"') -WorkingDirectory $folder
$system=New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
$triggers=@((New-ScheduledTaskTrigger -AtStartup))
foreach($hour in @(0,6,12,18)){$triggers+=New-ScheduledTaskTrigger -Daily -At ((Get-Date).Date.AddHours($hour).AddMinutes(15))}
$renewSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$statePath=Join-Path $folder 'renewal-state.json'
# Do not consume an earlier success as evidence that this request completed.
if((Get-ScheduledTask -TaskName $renewTask -ErrorAction SilentlyContinue).State -eq 'Running'){throw 'Certificate renewal is already running. Wait for it to finish before rerunning the installer.'}
[IO.File]::WriteAllText($statePath,'{"status":"waiting"}',(New-Object Text.UTF8Encoding($false)))
Register-ScheduledTask -TaskName $renewTask -Action $renewAction -Trigger $triggers -Principal $system -Settings $renewSettings -Force|Out-Null
Start-ScheduledTask -TaskName $renewTask
$state=$null
for($i=0;$i -lt 48;$i++){
 Start-Sleep -Seconds 5
 try{$candidate=Get-Content -LiteralPath $statePath -Raw -Encoding UTF8|ConvertFrom-Json;if($candidate.status -eq 'error'){throw ('CERTIFICATE_REQUEST_FAILED: '+$candidate.message)};if($candidate.status -eq 'issued'){$state=$candidate;break}}catch{if($_.Exception.Message -like 'CERTIFICATE_REQUEST_FAILED:*'){throw}}
 if($i%6 -eq 0){Write-Host ('Waiting for certificate validation... '+(($i+1)*5)+' seconds')}
}
if(-not $state){Write-Host ('CERTIFICATE_PENDING: inspect '+(Join-Path $InstallDir 'logs\ip-certificate.log'));return}
Write-Host 'CERTIFICATE_ISSUED'
Write-Host '[3/4] Starting the direct HTTPS API on TCP 443...'
$existing=Get-ScheduledTask -TaskName $proxyTask -ErrorAction SilentlyContinue
if($existing){Stop-ScheduledTask -TaskName $proxyTask;Start-Sleep -Seconds 2}
$proxyAction=New-ScheduledTaskAction -Execute $node -Argument ('"'+$proxy+'" "'+$InstallDir+'"') -WorkingDirectory $folder
$service=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$proxySettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $proxyTask -Action $proxyAction -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $service -Settings $proxySettings -Force|Out-Null
Start-ScheduledTask -TaskName $proxyTask
Write-Host '[4/4] Checking trusted TLS, certificate IP, authentication and CORS locally...'
$verified=$false
for($i=0;$i -lt 15;$i++){
 Start-Sleep -Seconds 2
 $previousPreference=$ErrorActionPreference
 try{$ErrorActionPreference='Continue';$check=& $node $proxy $InstallDir --probe 2>&1;$probeExit=$LASTEXITCODE}finally{$ErrorActionPreference=$previousPreference}
 if($probeExit -eq 0){$verified=$true;break}
}
if(-not $verified){throw ('Direct HTTPS did not pass TLS/API checks. '+($check -join ' ')+' Check logs\direct-https.log and task '+$proxyTask)}
$url='https://'+$PublicIp
$privateConnection=Join-Path $InstallDir 'data\direct-connection.json'
[IO.File]::WriteAllText($privateConnection,(@{version=1;endpoint=$url;token=$config.token}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
$link='https://hitwang-tech.github.io/canfd-4g-cloud-platform/#liveEndpoint='+[Uri]::EscapeDataString($url)+'&liveToken='+[Uri]::EscapeDataString($config.token)
[IO.File]::WriteAllText((Join-Path $InstallDir 'data\Open-Direct.url'),("[InternetShortcut]`r`nURL="+$link+"`r`n"),(New-Object Text.UTF8Encoding($false)))
Write-Host 'DIRECT_HTTPS_LOCAL_OK'
Write-Host ('HTTPS_URL: '+$url)
Write-Host ('CERT_EXPIRES_UTC: '+[DateTimeOffset]::FromUnixTimeMilliseconds([long]$state.expires).UtcDateTime.ToString('o'))
Write-Host 'AUTO_RENEWAL: every 6 hours and at startup; certificate reload is automatic.'
Write-Host ('PRIVATE_CONNECTION_FILE: '+$privateConnection)
Write-Host 'Do not share the connection file or private key. Next: verify the public endpoint from another network.'
