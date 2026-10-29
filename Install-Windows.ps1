#requires -Version 5.1
[CmdletBinding()]
param(
 [string]$InstallDir=(Join-Path $env:ProgramData 'CANFD4G'),
 [string]$PublicIp='',
 [ValidateRange(1024,65535)][int]$TcpPort=58023,
 [string]$PayloadFile='',
 [switch]$PrepareOnly
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$taskName='CANFD4G-Receiver'
$payloadHash='59bf6fa79ba844259a922b6237b282b1fcc1a9f94aa90b0d49039c467706bb9b'
$nodeHash='dccc52de28d8df2ee22d2062424f8c563070d95d8ad70c54c4bf01d590dec14f'
$nodeUrl='https://nodejs.org/dist/v22.23.4/win-x64/node.exe'
$site='https://hitwang-tech.github.io/canfd-4g-cloud-platform'
$InstallDir=[IO.Path]::GetFullPath($InstallDir)
if(-not $PrepareOnly){
 if([Environment]::OSVersion.Version.Major -lt 10){throw 'This installer requires Windows Server 2016 or later.'}
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Open PowerShell as Administrator, then run this script again.'}
}
$configuredTcpPort=$TcpPort
if(Test-Path -LiteralPath (Join-Path $InstallDir 'config.json')){$configuredTcpPort=[int](Get-Content -LiteralPath (Join-Path $InstallDir 'config.json') -Raw|ConvertFrom-Json).tcpPort}
$marker=Join-Path $InstallDir '.canfd4g-owner'
if((Test-Path -LiteralPath $InstallDir) -and (Get-ChildItem -LiteralPath $InstallDir -Force | Select-Object -First 1) -and -not (Test-Path -LiteralPath $marker)){throw 'Installation directory is not owned by this project. Select a new empty directory.'}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
if((Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -ne 'canfd-4g-cloud-platform'){throw 'Installation marker does not match this project.'}
Set-Content -LiteralPath $marker -Value 'canfd-4g-cloud-platform' -Encoding Ascii
foreach($sub in @('runtime','app','data','logs','downloads')){New-Item -ItemType Directory -Path (Join-Path $InstallDir $sub) -Force | Out-Null}
function Download-Checked([string]$Url,[string]$Destination,[string]$Expected){
 if((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Expected){return}
 for($attempt=0;$attempt -lt 3;$attempt++){
  try{Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -TimeoutSec 120;break}
  catch{if($attempt -eq 2){throw};Start-Sleep -Seconds 2}
 }
 if((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Expected){throw ('SHA256 verification failed: '+$Destination)}
}
Write-Host '[1/5] Downloading and verifying Node.js and receiver source...'
$node=Join-Path $InstallDir 'runtime\node.exe'
Download-Checked $nodeUrl $node $nodeHash
$payload=Join-Path $InstallDir 'downloads\receiver.zip'
if($PayloadFile){
 if(-not $PrepareOnly){throw 'PayloadFile is available only with PrepareOnly.'}
 if((Get-FileHash -LiteralPath $PayloadFile -Algorithm SHA256).Hash -ne $payloadHash){throw 'Local test payload hash mismatch.'}
 Copy-Item -LiteralPath $PayloadFile -Destination $payload -Force
}else{Download-Checked ($site+'/downloads/windows-receiver.zip') $payload $payloadHash}
if(-not $PrepareOnly){
 $existingTask=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 if($existingTask){
  if($existingTask.Actions.Arguments -notlike ('*'+(Join-Path $InstallDir 'Run-Receiver.ps1')+'*')){throw 'An unrelated scheduled task already uses this name.'}
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 }
 foreach($port in @(19080,$configuredTcpPort)){
  foreach($listener in @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)){
   $owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
   if($owner.ExecutablePath -eq $node -and $owner.CommandLine -like ('*'+(Join-Path $InstallDir 'app\server\collector.mjs')+'*')){Stop-Process -Id $listener.OwningProcess}
   else{throw ('Port '+$port+' is already used by another program (PID '+$listener.OwningProcess+'). No changes were made to that program.')}
  }
 }
}
Expand-Archive -LiteralPath $payload -DestinationPath (Join-Path $InstallDir 'app') -Force
Write-Host '[2/5] Preparing configuration...'
$configPath=Join-Path $InstallDir 'config.json'
if(-not (Test-Path -LiteralPath $configPath)){
 $bytes=New-Object byte[] 24;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
 $config=[ordered]@{token=[Convert]::ToBase64String($bytes);httpPort=19080;tcpPort=$TcpPort;origins='https://hitwang-tech.github.io';devices=''}
 [IO.File]::WriteAllText($configPath,($config | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
}
$config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8|ConvertFrom-Json
$run=@'
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$config=Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
$env:HOST='127.0.0.1'
$env:PORT=[string]$config.httpPort
$env:RECORDER_TCP_HOST='0.0.0.0'
$env:RECORDER_TCP_PORT=[string]$config.tcpPort
$env:RECORDER_API_TOKEN=$config.token
$env:RECORDER_ALLOWED_ORIGINS=$config.origins
$env:RECORDER_DEVICES=$config.devices
$env:RECORDER_LOG_DIR=Join-Path $root 'data'
& (Join-Path $root 'runtime\node.exe') (Join-Path $root 'app\server\collector.mjs') *> (Join-Path $root 'logs\receiver.log')
exit $LASTEXITCODE
'@
$runPath=Join-Path $InstallDir 'Run-Receiver.ps1'
[IO.File]::WriteAllText($runPath,$run,(New-Object Text.UTF8Encoding($false)))
if($PrepareOnly){Write-Host ('PREPARED_ONLY: '+$InstallDir);Write-Host 'No firewall rules, scheduled tasks or system settings were changed.';return}
Write-Host '[3/5] Setting permissions for the local service account...'
$acl=Get-Acl -LiteralPath $InstallDir
$acl.SetAccessRuleProtection($true,$false)
foreach($entry in @(@('S-1-5-18','FullControl'),@('S-1-5-32-544','FullControl'),@('S-1-5-19','ReadAndExecute'))){
 $sid=New-Object Security.Principal.SecurityIdentifier($entry[0])
 $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,$entry[1],'ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $InstallDir -AclObject $acl
foreach($sub in @('data','logs')){
 $folder=Join-Path $InstallDir $sub;$subAcl=Get-Acl -LiteralPath $folder
 $sid=New-Object Security.Principal.SecurityIdentifier('S-1-5-19')
 $subAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'Modify','ContainerInherit,ObjectInherit','None','Allow')))
 Set-Acl -LiteralPath $folder -AclObject $subAcl
}
Write-Host '[4/5] Starting the receiver and configuring automatic startup...'
$powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action=New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -NonInteractive -File "'+$runPath+'"') -WorkingDirectory $InstallDir
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
$ruleName='CANFD4G-TCP-'+$config.tcpPort
if(-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)){New-NetFirewallRule -Name $ruleName -DisplayName ('CANFD 4G recorder TCP '+$config.tcpPort) -Direction Inbound -Action Allow -Protocol TCP -LocalPort $config.tcpPort -Profile Any | Out-Null}
Start-ScheduledTask -TaskName $taskName
Write-Host '[5/5] Checking local receiver API...'
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$health=$null
for($i=0;$i -lt 20;$i++){
 try{$health=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$config.httpPort+'/api/snapshot') -Headers @{Authorization=('Bearer '+$config.token)} -TimeoutSec 2;break}catch{Start-Sleep -Seconds 1}
}
if(-not $health){throw ('Receiver did not start. Check '+(Join-Path $InstallDir 'logs\receiver.log'))}
Write-Host 'RECEIVER_OK'
Write-Host ('TCP_ENDPOINT: '+$(if($PublicIp){$PublicIp}else{'<PUBLIC_IPV4>'})+':'+$config.tcpPort)
Write-Host ('ACTIVE_CONNECTIONS: '+$health.report.activeConnections)
Write-Host ('RECEIVED_BYTES: '+$health.report.receivedBytes)
Write-Host ('VALID_FRAMES: '+$health.report.packets)
Write-Host 'HTTPS_API: NOT_CONFIGURED_YET'
Write-Host ('Next: allow inbound TCP '+$config.tcpPort+' in the Alibaba Cloud security group, then configure HTTPS API.')
Write-Host ('Access token is stored in '+$configPath+'; do not include it in screenshots.')
