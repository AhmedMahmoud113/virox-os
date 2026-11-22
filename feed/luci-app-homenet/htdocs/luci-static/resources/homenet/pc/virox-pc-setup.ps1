# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Virox computer program, setup (run once by the small file the router's page gives; that file sets
# VX_ROUTER and VX_CODE). Copies the program to %LOCALAPPDATA%\Virox, links this computer to the
# router with the 6-digit code, starts it now and at every sign-in (a shortcut in the Startup
# folder; no administrator rights needed). Run again to link again.
$ErrorActionPreference = 'Stop'
$router = $env:VX_ROUTER; $code = $env:VX_CODE
if (-not $router -or -not $code) { Write-Host 'Virox: open the router page and download the file again.'; exit 1 }
$dir = Join-Path $env:LOCALAPPDATA 'Virox'
New-Item -ItemType Directory -Force $dir | Out-Null
$prog = Join-Path $dir 'virox-pc.ps1'
Invoke-WebRequest -UseBasicParsing "http://$router/luci-static/resources/homenet/pc/virox-pc.ps1" -OutFile $prog

$body = @{ jsonrpc = '2.0'; id = 1; method = 'call';
	params = @('00000000000000000000000000000000', 'virox.pc', 'pair', @{ code = $code; name = $env:COMPUTERNAME; host = $env:COMPUTERNAME }) } | ConvertTo-Json -Depth 6 -Compress
$r = Invoke-RestMethod -Uri "http://$router/ubus" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json' -TimeoutSec 15 -UseBasicParsing
$a = if ($r.result -and $r.result[0] -eq 0) { $r.result[1] } else { $null }
if (-not $a -or -not $a.result) {
	$e = if ($a) { $a.error } else { 'no_answer' }
	Write-Host "Virox: linking failed ($e). Get a new code on the router page and download the file again."
	exit 1
}
@{ router = $router; id = $a.id; token = $a.token } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $dir 'pc.json')

# start at every sign-in, without a window
$runArgs = "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$prog`""
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Virox.lnk'))
$lnk.TargetPath = Join-Path $env:WINDIR 'System32\conhost.exe'
$lnk.Arguments = $runArgs
$lnk.WindowStyle = 7
$lnk.Description = 'Virox: the router can shut down, restart, sleep or lock this computer'
$lnk.Save()
Start-Process -FilePath (Join-Path $env:WINDIR 'System32\conhost.exe') -ArgumentList $runArgs -WindowStyle Hidden
Write-Host 'Virox: this computer is linked. It shows on the router page within a few seconds.'
