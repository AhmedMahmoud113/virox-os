# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Virox computer program (Windows 10/11, Windows PowerShell 5.1). It asks the Virox router every
# 3 seconds whether there is a command for this computer and does it. Only these commands exist:
# shutdown, restart (both after 60 seconds, with a message, so work can be saved), sleep,
# hibernate, lock, signout, cancel (a shutdown or restart not done yet). Nothing listens on this
# computer; it only asks the router. Settings: %LOCALAPPDATA%\Virox\pc.json (router, id, token).
# Removed from the router's page: it deletes itself at its next question.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'Virox'
$cfgFile = Join-Path $dir 'pc.json'
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Virox.lnk'

# one copy at a time
$mutex = New-Object System.Threading.Mutex($false, 'Local\ViroxPC')
if (-not $mutex.WaitOne(0)) { exit 0 }

function Call-Router($router, $method, $params) {
	$body = @{ jsonrpc = '2.0'; id = 1; method = 'call';
		params = @('00000000000000000000000000000000', 'virox.pc', $method, $params) } | ConvertTo-Json -Depth 6 -Compress
	$r = Invoke-RestMethod -Uri "http://$router/ubus" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
		-ContentType 'application/json' -TimeoutSec 10 -UseBasicParsing
	if ($r.result -and $r.result[0] -eq 0) { return $r.result[1] }
	return $null
}

# shutdown.exe through cmd: Windows PowerShell 5.1 turns a native program's error output into an
# exception under ErrorActionPreference Stop, and the result was lost (tried on Windows 11)
function Run-Cmd($line) { & cmd.exe /c "$line >nul 2>&1"; return $LASTEXITCODE -eq 0 }
function Do-Command($name) {
	try {
		switch ($name) {
			'shutdown'  { return Run-Cmd 'shutdown.exe /s /t 60 /c "Virox: this computer shuts down in one minute."' }
			'restart'   { return Run-Cmd 'shutdown.exe /r /t 60 /c "Virox: this computer restarts in one minute."' }
			'cancel'    { return Run-Cmd 'shutdown.exe /a' }
			'signout'   { return Run-Cmd 'shutdown.exe /l' }
			'lock'      { return Run-Cmd 'rundll32.exe user32.dll,LockWorkStation' }
			'sleep'     { Add-Type -AssemblyName System.Windows.Forms
			              return [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false) }
			'hibernate' { Add-Type -AssemblyName System.Windows.Forms
			              return [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Hibernate, $false, $false) }
			default     { return $false }
		}
	} catch { return $false }
}

function Remove-Self {
	Remove-Item -Force -ErrorAction SilentlyContinue $link, $cfgFile, (Join-Path $dir 'virox-pc.ps1')
}

$cfg = Get-Content -Raw $cfgFile | ConvertFrom-Json
$result = $null
$fails = 0
while ($true) {
	try {
		$macs = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled = True' | ForEach-Object { $_.MACAddress } | Where-Object { $_ })
		$uptime = [int]((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds
		$p = @{ id = $cfg.id; token = $cfg.token; host = $env:COMPUTERNAME; user = $env:USERNAME; macs = $macs; uptime = $uptime }
		if ($result) { $p.result = $result }
		$a = Call-Router $cfg.router 'poll' $p
		$fails = 0
		if ($a -and $a.result -eq $false -and $a.error -eq 'unknown_pc') { Remove-Self; exit 0 }
		if ($a -and $a.result) { $result = $null }
		if ($a -and $a.cmd) {
			$c = $a.cmd
			# sleep, hibernate, lock and sign out end this program's turn: say "done" first
			if ($c.name -in @('sleep', 'hibernate', 'lock', 'signout')) {
				$ok = $true
				try { Call-Router $cfg.router 'poll' (@{ id = $cfg.id; token = $cfg.token; result = @{ nonce = $c.nonce; ok = $true } }) | Out-Null } catch { }
				$ok = Do-Command $c.name
				if (-not $ok) { $result = @{ nonce = $c.nonce; ok = $false; error = "$($c.name)_failed" } }
			} else {
				$ok = Do-Command $c.name
				$result = @{ nonce = $c.nonce; ok = [bool]$ok; error = $(if ($ok) { $null } else { "$($c.name)_failed" }) }
			}
		}
	} catch {
		$fails++
	}
	# the router does not answer (restarting, or this computer is away): ask less often
	Start-Sleep -Seconds $(if ($fails -gt 5) { 15 } else { 3 })
}
