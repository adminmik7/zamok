@echo off
set "JAVA_HOME=%~dp0.toolchain\jdk"
set "GRADLE_USER_HOME=%~dp0.toolchain\gradle-home"
if "%~1"=="" (
  call "%~dp0gradlew.bat" :app:apk
) else (
  call "%~dp0gradlew.bat" %*
)
