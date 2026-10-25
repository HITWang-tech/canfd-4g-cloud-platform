param([string]$RepoRoot=(Get-Location).Path)
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $RepoRoot 'deploy\Renew-IPCertificate.ps1'),[ref]$tokens,[ref]$errors)
if($errors){throw ($errors|Out-String)}
$statement=$ast.Find({param($node) $node -is [System.Management.Automation.Language.IfStatementAst] -and $node.Extent.Text.Contains('[IO.File]::Replace(')},$true)
if(-not $statement){throw 'Certificate publication statement not found.'}
$publish=[scriptblock]::Create($statement.Extent.Text)
$folder=Join-Path ([IO.Path]::GetTempPath()) ('canfd-publish-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($folder)|Out-Null
$published=Join-Path $folder 'active-tls.json'
$temporary=$published+'.pending'
try{
 foreach($content in @('first-test-certificate','second-test-certificate','renewed-test-certificate')){
  [IO.File]::WriteAllText($temporary,$content)
  . $publish
  if([IO.File]::ReadAllText($published) -ne $content){throw 'Published content mismatch.'}
  if(Test-Path -LiteralPath $temporary){throw 'Pending file was not consumed.'}
  if(@(Get-ChildItem -LiteralPath $folder -Force).Count -ne 1){throw 'Unexpected backup or temporary file.'}
 }
 'PASS: first publication and repeated atomic replacements using production code on PowerShell '+$PSVersionTable.PSVersion
}finally{
 foreach($file in @($temporary,$published)){if([IO.File]::Exists($file)){[IO.File]::Delete($file)}}
 [IO.Directory]::Delete($folder)
}
