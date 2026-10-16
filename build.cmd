@echo off
set "JAVA_HOME=%~dp0.toolchain\jdk"
set "GRADLE_USER_HOME=%~dp0.toolchain\gradle-home"
call "%~dp0gradlew.bat" %*
