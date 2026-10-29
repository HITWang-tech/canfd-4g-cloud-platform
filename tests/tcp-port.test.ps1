param([string]$RepoRoot=(Get-Location).Path)
$ErrorActionPreference='Stop'
$folder=Join-Path ([IO.Path]::GetTempPath()) ('canfd-port-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($folder)|Out-Null
$configPath=Join-Path $folder 'config.json';$marker=Join-Path $folder '.canfd4g-owner'
$original='{"tcpPort":19090,"httpPort":19080,"token":"synthetic-port-test-token","origins":"https://example.test","devices":""}'
$scriptPath=Join-Path $RepoRoot 'deploy\Set-TCPPort.ps1'
$source=[IO.File]::ReadAllText($scriptPath)
try{
 [IO.File]::WriteAllText($marker,'canfd-4g-cloud-platform');[IO.File]::WriteAllText($configPath,$original)
 & ([scriptblock]::Create($source)) -InstallDir $folder -Port 58023 -CheckOnly
 if([IO.File]::ReadAllText($configPath) -ne $original){throw 'CheckOnly changed configuration.'}
 $failed=$false
 try{& ([scriptblock]::Create($source)) -InstallDir $folder -Port 19080 -CheckOnly}catch{$failed=$_.Exception.Message -match 'HTTP API'}
 if(-not $failed){throw 'HTTP port collision was not rejected.'}
 $tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
 if($errors){throw ($errors|Out-String)}
 $function=$ast.Find({param($node)$node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Write-ConfigAtomic'},$true)
 . ([scriptblock]::Create($function.Extent.Text))
 $config=$original|ConvertFrom-Json;$config.tcpPort=58023;Write-ConfigAtomic ($config|ConvertTo-Json -Depth 10)
 $updated=[IO.File]::ReadAllText($configPath)|ConvertFrom-Json
 if($updated.tcpPort -ne 58023 -or $updated.httpPort -ne 19080 -or $updated.token -ne 'synthetic-port-test-token'){throw 'Configuration update did not preserve API settings.'}
 Write-ConfigAtomic $original
 if([IO.File]::ReadAllText($configPath) -ne $original){throw 'Atomic rollback failed.'}
 'PASS: port preflight, collision rejection, native atomic update and rollback on PowerShell '+$PSVersionTable.PSVersion
}finally{
 foreach($file in @($configPath,$marker,($configPath+'.tcp-change.pending'))){if([IO.File]::Exists($file)){[IO.File]::Delete($file)}}
 [IO.Directory]::Delete($folder)
}
