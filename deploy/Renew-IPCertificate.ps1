#requires -Version 5.1
param([Parameter(Mandatory)][string]$InstallDir)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$folder=Join-Path $InstallDir 'ip-https'
$log=Join-Path $InstallDir 'logs\ip-certificate.log'
$statePath=Join-Path $folder 'renewal-state.json'
function Save-State($State){[IO.File]::WriteAllText($statePath,($State|ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))}
try{
 $settings=Get-Content -LiteralPath (Join-Path $folder 'settings.json') -Raw|ConvertFrom-Json
 if(-not $settings.acceptTerms){throw 'Let''s Encrypt subscriber agreement has not been accepted.'}
 Save-State @{status='requesting';time=[DateTime]::UtcNow.ToString('o')}
 Add-Content -LiteralPath $log -Value (([DateTime]::UtcNow.ToString('o'))+' Checking certificate renewal for '+$settings.ip)
 $env:POSHACME_HOME=Join-Path $folder 'acme'
 Import-Module (Join-Path $folder 'module\Posh-ACME.psd1') -Force
 Set-PAServer LE_PROD
 $name='canfd4g-public-ip'
 $order=$null
 if(Get-PAAccount){$order=Get-PAOrder -Name $name -ErrorAction SilentlyContinue}
 if($order){
  if($order.status -eq 'valid'){Submit-Renewal -Name $name -ErrorAction Stop | Out-Null}
  else{Submit-Renewal -Name $name -Force -ErrorAction Stop | Out-Null}
 }
 # Posh-ACME 4.35 forwards bound parameters to New-PAAccount with its own -EA Stop.
 # Windows PowerShell 5.1 rejects a second explicit ErrorAction; inherit Stop above.
 else{New-PACertificate -Domain $settings.ip -Name $name -Profile shortlived -Plugin WebSelfHost -PluginArgs @{WSHTimeout=180;WSHDelayAfterStart=2} -ValidationTimeout 120 -AcceptTOS | Out-Null}
 $cert=Get-PACertificate -Name $name -ErrorAction Stop
 if(-not $cert){throw 'No completed certificate was returned.'}
 $bundle=@{cert=[IO.File]::ReadAllText($cert.FullChainFile);key=[IO.File]::ReadAllText($cert.KeyFile)}
 $published=Join-Path $folder 'published\active-tls.json'
 $temporary=$published+'.pending'
 [IO.File]::WriteAllText($temporary,($bundle|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
 $node=Join-Path $InstallDir 'runtime\node.exe'
 $checked=& $node (Join-Path $folder 'direct-https.mjs') --validate $temporary $settings.ip
 if($LASTEXITCODE -ne 0){throw 'Certificate IP, expiry or key validation failed.'}
 $metadata=$checked|ConvertFrom-Json
 # Same-volume replacement publishes cert and key together; the proxy retains the previous pair until this succeeds.
 # PS 5.1 converts $null to an empty string for this .NET string argument.
 # NullString supplies a real null backup path, preserving atomic replacement.
 if(Test-Path -LiteralPath $published){[IO.File]::Replace($temporary,$published,[System.Management.Automation.Language.NullString]::Value)}else{[IO.File]::Move($temporary,$published)}
 Save-State @{status='issued';time=[DateTime]::UtcNow.ToString('o');expires=$metadata.expires;fingerprint=$metadata.fingerprint}
 Add-Content -LiteralPath $log -Value (([DateTime]::UtcNow.ToString('o'))+' CERTIFICATE_READY expires '+$cert.NotAfter.ToUniversalTime().ToString('o'))
}catch{
 $message=$_.Exception.Message
 Save-State @{status='error';time=[DateTime]::UtcNow.ToString('o');message=$message}
 Add-Content -LiteralPath $log -Value (([DateTime]::UtcNow.ToString('o'))+' ERROR '+$message)
 Write-Error $message
 exit 1
}
