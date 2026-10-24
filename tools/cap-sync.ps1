$ErrorActionPreference = 'Continue'
$env:JAVA_HOME = 'D:\dev\zamok\tools\jdk21'
$env:ANDROID_HOME = 'D:\dev\zamok\tools\android-sdk'
$env:ANDROID_SDK_ROOT = 'D:\dev\zamok\tools\android-sdk'
$env:GRADLE_USER_HOME = 'D:\dev\zamok\tools\gradle-home'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
Set-Location 'D:\dev\zamok'
$log = 'D:\dev\zamok\tools\cap-sync.log'
"[$(Get-Date -Format HH:mm:ss)] sync start" | Out-File $log -Encoding utf8
npx cap sync android *>> $log
"[$(Get-Date -Format HH:mm:ss)] sync rc=$LASTEXITCODE" | Out-File $log -Append -Encoding utf8
"DONE" | Out-File $log -Append -Encoding utf8
