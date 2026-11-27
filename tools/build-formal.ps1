param([string]$JavaHome=$env:JAVA_HOME,[string]$Maven='mvn.cmd')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
if(!$JavaHome){$JavaHome=(Get-ChildItem "$projectRoot/.tools/jdk-*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).FullName}
if(!$JavaHome -or !(Test-Path "$JavaHome/bin/java.exe")){throw '请安装 JDK 25，设置 JAVA_HOME，或用 -JavaHome 指定安装位置。'}
$env:JAVA_HOME=$JavaHome
if(Test-Path "$projectRoot/.tools/apache-maven-3.9.11/bin/mvn.cmd"){$Maven="$projectRoot/.tools/apache-maven-3.9.11/bin/mvn.cmd"}
& npm.cmd ci --prefix frontend
if($LASTEXITCODE){throw '前端依赖安装失败'}
& npm.cmd run build --prefix frontend
if($LASTEXITCODE){throw '前端构建失败'}
& $Maven -f backend/pom.xml verify
if($LASTEXITCODE){throw '后端测试或打包失败'}
Write-Host '构建成功：backend/target/mian-echo-2.0.0-SNAPSHOT.jar'
