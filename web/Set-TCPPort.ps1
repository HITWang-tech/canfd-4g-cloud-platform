#requires -Version 5.1
[CmdletBinding()]
param([string]$InstallDir=(Join-Path $env:ProgramData 'CANFD4G'),[ValidateRange(1024,65535)][int]$Port=58023,[string]$PublicIp='',[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$InstallDir=[IO.Path]::GetFullPath($InstallDir)
$marker=Join-Path $InstallDir '.canfd4g-owner'
if(-not(Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne 'canfd-4g-cloud-platform'){throw 'This is not an owned CANFD4G installation.'}
$configPath=Join-Path $InstallDir 'config.json'
$original=[IO.File]::ReadAllText($configPath)
$config=$original|ConvertFrom-Json
$oldPort=[int]$config.tcpPort
if($oldPort -lt 1024 -or $oldPort -gt 65535 -or -not $config.token -or -not $config.httpPort){throw 'Receiver configuration is invalid.'}
if($Port -eq [int]$config.httpPort){throw 'TCP upload port cannot equal the local HTTP API port.'}
if($CheckOnly){Write-Host ('PORT_CHANGE_CHECK: '+$oldPort+' -> '+$Port);Write-Host 'No configuration, tasks or firewall rules were changed.';return}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Open PowerShell as Administrator.'}
$taskName='CANFD4G-Receiver';$runner=Join-Path $InstallDir 'Run-Receiver.ps1';$node=Join-Path $InstallDir 'runtime\node.exe';$collector=Join-Path $InstallDir 'app\server\collector.mjs'
$task=Get-ScheduledTask -TaskName $taskName
if(-not(@($task.Actions)|Where-Object{([string]$_.Arguments).IndexOf($runner,[StringComparison]::OrdinalIgnoreCase) -ge 0})){throw 'Receiver task does not belong to this installation.'}
function Test-ReceiverProcess([int]$ProcessId){
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ProcessId) -ErrorAction SilentlyContinue
 return $process -and $process.ExecutablePath -eq $node -and ([string]$process.CommandLine).IndexOf($collector,[StringComparison]::OrdinalIgnoreCase) -ge 0
}
function Write-ConfigAtomic([string]$Text){
 $temporary=$configPath+'.tcp-change.pending'
 [IO.File]::WriteAllText($temporary,$Text,(New-Object Text.UTF8Encoding($false)))
 [IO.File]::Replace($temporary,$configPath,[System.Management.Automation.Language.NullString]::Value)
}
function Stop-OwnedReceiver{
 Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 Start-Sleep -Seconds 1
 foreach($listener in @(Get-NetTCPConnection -LocalPort @($oldPort,$Port,[int]$config.httpPort) -State Listen -ErrorAction SilentlyContinue)){
  if(Test-ReceiverProcess $listener.OwningProcess){Stop-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue}
 }
}
function Test-ReceiverReady{
 $tcp=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)|Where-Object{Test-ReceiverProcess $_.OwningProcess}
 if(-not $tcp){return $false}
 $health=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$config.httpPort+'/api/snapshot?after=999999999') -Headers @{Authorization=('Bearer '+$config.token)} -TimeoutSec 2
 return $null -ne $health.report -and $null -ne $health.cursor
}
# Check all relevant listeners before stopping or changing anything.
foreach($listener in @(Get-NetTCPConnection -LocalPort @($oldPort,$Port,[int]$config.httpPort) -State Listen -ErrorAction SilentlyContinue)){
 if(-not(Test-ReceiverProcess $listener.OwningProcess)){throw ('Port '+$listener.LocalPort+' belongs to another process. Nothing was stopped or changed.')}
}
$ruleName='CANFD4G-TCP-'+$Port
$rule=Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if($rule){
 $filter=$rule|Get-NetFirewallPortFilter
 if($rule.Direction -ne 'Inbound' -or $rule.Action -ne 'Allow' -or $filter.LocalPort -ne [string]$Port -or [string]$filter.Protocol -notin @('TCP','6')){throw 'An incompatible firewall rule already uses the target rule name.'}
 Set-NetFirewallRule -Name $ruleName -Enabled True -Profile Any|Out-Null
}else{New-NetFirewallRule -Name $ruleName -DisplayName ('CANFD 4G recorder TCP '+$Port) -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any|Out-Null}
Write-Host ('TCP port migration: '+$oldPort+' -> '+$Port)
$alreadyReady=$false
if($oldPort -eq $Port){try{$alreadyReady=Test-ReceiverReady}catch{}}
if(-not $alreadyReady){
 try{
  Stop-OwnedReceiver
  $config.tcpPort=$Port
  Write-ConfigAtomic ($config|ConvertTo-Json -Depth 10)
  Start-ScheduledTask -TaskName $taskName
  $ready=$false
  for($i=0;$i -lt 20;$i++){Start-Sleep -Seconds 1;try{if(Test-ReceiverReady){$ready=$true;break}}catch{}}
  if(-not $ready){throw 'Receiver did not pass local TCP/API checks after restart.'}
 }catch{
  $failure=$_.Exception.Message
  try{Stop-OwnedReceiver;Write-ConfigAtomic $original;Start-ScheduledTask -TaskName $taskName;Write-Host ('Previous configuration restored: TCP '+$oldPort)}catch{Write-Host 'Automatic rollback failed. Inspect the receiver task locally; do not share config.json.'}
  throw ('TCP_PORT_CHANGE_FAILED: '+$failure)
 }
}
Write-Host 'TCP_PORT_READY'
Write-Host ('TCP_ENDPOINT: '+$(if($PublicIp){$PublicIp}else{'<PUBLIC_IPV4>'})+':'+$Port)
Write-Host 'Local listener and authenticated API checks passed.'
Write-Host ('NEXT: allow inbound TCP '+$Port+' in the Alibaba Cloud security group and change the recorder destination port.')
Write-Host 'Receiver restart resets in-memory counters; recorded files remain in the data folder.'
