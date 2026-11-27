param([int]$Port=8080,[string]$JavaHome=$env:JAVA_HOME)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(!$JavaHome){$JavaHome=(Get-ChildItem "$projectRoot/.tools/jdk-*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).FullName}
if(!$JavaHome -or !(Test-Path "$JavaHome/bin/java.exe")){throw '需要 JDK 25。请设置 JAVA_HOME 或提供 -JavaHome。'}
$jar="$projectRoot/backend/target/mian-echo-2.0.0-SNAPSHOT.jar"
if(!(Test-Path $jar)){throw '尚未构建。先运行 powershell -File tools/build-formal.ps1'}
Set-Location "$projectRoot/backend"
$env:PORT="$Port"
Write-Host "正式版本地地址：http://127.0.0.1:$Port ，停止请按 Ctrl+C。"
& "$JavaHome/bin/java.exe" -jar $jar
