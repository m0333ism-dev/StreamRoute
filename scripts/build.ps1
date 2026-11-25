$ErrorActionPreference = 'Stop'
$extensionRoot = Split-Path -Parent $PSScriptRoot
$releasesRoot = Join-Path $extensionRoot 'releases'
New-Item -ItemType Directory -Path $releasesRoot -Force | Out-Null
$archivePath = Join-Path $releasesRoot 'StreamRoute-Chrome.zip'
$runtimeNames = @('manifest.json', 'routing.js', 'background.js', 'popup.html', 'popup.css', 'popup.js', 'README.md')
$runtimePaths = $runtimeNames | ForEach-Object { Join-Path $extensionRoot $_ }
Compress-Archive -LiteralPath $runtimePaths -DestinationPath $archivePath -Force
Write-Output $archivePath
