param([string]$RepoRoot=(Get-Location).Path)
$ErrorActionPreference='Stop'
$syntaxTokens=$null;$syntaxErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $RepoRoot 'deploy\Install-Windows.ps1'),[ref]$syntaxTokens,[ref]$syntaxErrors)
if($syntaxErrors.Count){throw 'Installer syntax errors'}
foreach($name in @('Normalize-ReceiverPath','Test-OwnedReceiverProcess','Stop-ReceiverForUpdate')){
 $definition=$ast.FindAll({param($item)$item -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq $name
 Invoke-Expression $definition.Extent.Text
}
$expectedNode='C:\ProgramData\CANFD4G\runtime\node.exe'
$expectedCollector='C:\ProgramData\CANFD4G\app\server\collector.mjs'
$owned=[pscustomobject]@{ExecutablePath=$expectedNode;CommandLine='"C:/ProgramData/CANFD4G/runtime/node.exe" "C:/ProgramData/CANFD4G/app/server/collector.mjs"'}
if(-not(Test-OwnedReceiverProcess $owned $expectedNode $expectedCollector)){throw 'Forward slash path was not recognized'}
if(Test-OwnedReceiverProcess ([pscustomobject]@{ExecutablePath=$expectedNode;CommandLine='node.exe --eval "C:/ProgramData/CANFD4G/app/server/collector.mjs"'}) $expectedNode $expectedCollector){throw 'A script name inside eval was wrongly accepted'}
if(Test-OwnedReceiverProcess ([pscustomobject]@{ExecutablePath='C:\Other\node.exe';CommandLine=$owned.CommandLine}) $expectedNode $expectedCollector){throw 'An unrelated executable was accepted'}

function Get-NetTCPConnection {param($LocalPort,$State,$ErrorAction)
 if($script:scenario -eq 'disappeared' -and $script:stopped){return}
 if($script:scenario -eq 'null-then-gone' -and $script:queries -gt 0){return}
 if($script:processStopped){return}
 [pscustomobject]@{LocalPort=19080;OwningProcess=2656}
}
function Get-CimInstance {param($ClassName,$Filter,$ErrorAction)
 $script:queries++
 if($script:scenario -eq 'null-then-gone' -or ($script:scenario -eq 'timeout' -and $script:stopped)){return $null}
 if($script:scenario -eq 'unrelated' -or ($script:scenario -eq 'changed' -and $script:stopped)){return [pscustomobject]@{ExecutablePath='C:\Other\node.exe';CommandLine='node.exe other.mjs'}}
 if($script:scenario -eq 'exiting' -and $script:stopped){$script:processStopped=$true;return $null}
 $owned
}
function Stop-ScheduledTask {param($TaskName,$ErrorAction)$script:stopped=$true}
function Start-ScheduledTask {param($TaskName,$ErrorAction)$script:restarted=$true}
function Start-Sleep {param($Milliseconds)}
function Stop-Process {param($Id,$ErrorAction)$script:processStopped=$true;$script:terminated++}
foreach($case in @('disappeared','null-then-gone','exiting','owned','unrelated','changed','timeout')){
 $script:scenario=$case;$script:stopped=$false;$script:processStopped=$false;$script:restarted=$false;$script:queries=0;$script:terminated=0
 $failed=$false
 try{Stop-ReceiverForUpdate -NodePath $expectedNode -CollectorPath $expectedCollector -Ports @(19080,58023) -ReceiverTask 'CANFD4G-Receiver' -ExistingTask ([pscustomobject]@{State='Running'})}catch{$failed=$true;if($case -notin @('unrelated','changed','timeout')){throw}}
 if($case -eq 'unrelated'){
  if(-not $failed -or $script:stopped -or $script:terminated){throw 'Unrelated listener was not protected before task stop'}
 }elseif($case -in @('changed','timeout')){if(-not $failed -or -not $script:restarted -or $script:terminated){throw 'Failed update did not restore the receiver task safely'}}elseif($failed){throw ('Scenario failed: '+$case)}
 if($case -eq 'owned' -and $script:terminated -ne 1){throw 'Owned orphan child was not stopped exactly once'}
}
'INSTALLER_STOP_TEST_PASSED: owned paths, exiting/disappearing listeners, orphan child and unrelated process protection'
