$env:JAVA_HOME = 'D:\dev\zamok\tools\jdk21'
$env:ANDROID_HOME = 'D:\dev\zamok\tools\android-sdk'
$env:ANDROID_SDK_ROOT = 'D:\dev\zamok\tools\android-sdk'
$env:GRADLE_USER_HOME = 'D:\dev\zamok\tools\gradle-home'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
Set-Location 'D:\dev\zamok'
$log = 'D:\dev\zamok\tools\gradle.log'
"[$(Get-Date -Format HH:mm:ss)] web build start" | Out-File $log -Encoding utf8
& npm run sync *>> $log
$web = $LASTEXITCODE
"[$(Get-Date -Format HH:mm:ss)] web rc=$web" | Out-File $log -Append -Encoding utf8
if ($web -ne 0) {
    "[$(Get-Date -Format HH:mm:ss)] FAILED: web build, gradle skipped" | Out-File $log -Append -Encoding utf8
    "DONE" | Out-File $log -Append -Encoding utf8
    exit 1
}
"[$(Get-Date -Format HH:mm:ss)] gradle build start" | Out-File $log -Append -Encoding utf8
Push-Location 'D:\dev\zamok\android'
& '.\gradlew.bat' assembleDebug --no-daemon *>> $log
$rc = $LASTEXITCODE
Pop-Location
"[$(Get-Date -Format HH:mm:ss)] gradle rc=$rc" | Out-File $log -Append -Encoding utf8
if ($rc -eq 0) {
    $apk = 'D:\dev\zamok\android\app\build\outputs\apk\debug\app-debug.apk'
    if (Test-Path $apk) {
        Copy-Item $apk 'D:\dev\zamok\build\apk\zamok-debug.apk' -Force
        "[$(Get-Date -Format HH:mm:ss)] APK copied" | Out-File $log -Append -Encoding utf8
    }
}
"DONE" | Out-File $log -Append -Encoding utf8
