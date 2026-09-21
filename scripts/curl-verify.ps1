$ErrorActionPreference = "Stop"
$base = "http://localhost:3000"
$outDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) ".."
$reportPath = Join-Path (Resolve-Path $outDir) "curl-verify.txt"
$lines = New-Object System.Collections.Generic.List[string]
$bodyFile = Join-Path $env:TEMP "hq-curl-body.json"

function Call-Api {
  param(
    [string]$Method,
    [string]$Url,
    [string]$Json,
    [string]$IdempotencyKey,
    [string]$PaySignature
  )
  $curlArgs = @("-sS", "-X", $Method, $Url, "-H", "content-type: application/json", "-w", "___STATUS___%{http_code}")
  if ($IdempotencyKey) {
    $curlArgs += @("-H", "Idempotency-Key: $IdempotencyKey")
  }
  if ($PaySignature) {
    $curlArgs += @("-H", "X-Pay-Signature: $PaySignature")
  }
  if ($PSBoundParameters.ContainsKey("Json") -and $null -ne $Json) {
    [System.IO.File]::WriteAllText($bodyFile, $Json, [System.Text.UTF8Encoding]::new($false))
    $curlArgs += @("--data-binary", "@$bodyFile")
  }
  $raw = & curl.exe @curlArgs
  $text = [string]$raw
  $status = "000"
  $body = $text
  $idx = $text.LastIndexOf("___STATUS___")
  if ($idx -ge 0) {
    $body = $text.Substring(0, $idx).Trim()
    $status = $text.Substring($idx + "___STATUS___".Length).Trim()
  }
  return @{ status = $status; body = $body }
}

function Sign-PayCallback([string]$PaymentRef, [string]$Status) {
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes("dev-mock-pay-secret"))
  $hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("${PaymentRef}:${Status}"))
  return ([System.BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
}

function Add-Section([string]$title, $result) {
  $lines.Add("### $title")
  $lines.Add("HTTP $($result.status)")
  $lines.Add($result.body)
  $lines.Add("")
}

$r = Call-Api -Method POST -Url "$base/api/session" -Json "{}"
Add-Section "a. POST /api/session" $r
$sessionId = (ConvertFrom-Json -InputObject $r.body).sessionId
$lines.Add("SESSION_ID=$sessionId")
$lines.Add("")

$r = Call-Api -Method PATCH -Url "$base/api/progress" -Json "{`"sessionId`":`"$sessionId`",`"step`":1,`"data`":{`"gender`":`"male`"}}"
Add-Section "b. PATCH /api/progress step=1 gender=male" $r

$r = Call-Api -Method PATCH -Url "$base/api/progress" -Json "{`"sessionId`":`"$sessionId`",`"step`":1,`"data`":{`"gender`":`"male`"}}"
Add-Section "c. PATCH /api/progress step=1 gender=male (repeat)" $r

$r = Call-Api -Method PATCH -Url "$base/api/progress" -Json "{`"sessionId`":`"$sessionId`",`"step`":3,`"data`":{`"age`":25}}"
Add-Section "d. PATCH /api/progress step=3 age=25" $r

$r = Call-Api -Method GET -Url "$base/api/progress?sessionId=$sessionId"
Add-Section "e. GET /api/progress (merged)" $r

$submit = "{`"sessionId`":`"$sessionId`",`"gender`":`"male`",`"goal`":`"lose_weight`",`"age`":25,`"heightCm`":175,`"weightKg`":70,`"targetWeightKg`":65,`"activityLevel`":`"moderate`"}"
$r = Call-Api -Method POST -Url "$base/api/assessment/submit" -Json $submit
Add-Section "f. POST /api/assessment/submit" $r

$r = Call-Api -Method GET -Url "$base/api/result?sessionId=$sessionId"
Add-Section "g. GET /api/result (unpaid)" $r

$key = [guid]::NewGuid().ToString()
$pay = "{`"sessionId`":`"$sessionId`",`"planType`":`"monthly`"}"
$r = Call-Api -Method POST -Url "$base/api/pay" -Json $pay -IdempotencyKey $key
Add-Section "h. POST /api/pay (pending)" $r
$lines.Add("PAY_KEY=$key")
$lines.Add("")
$paymentRef = (ConvertFrom-Json -InputObject $r.body).data.paymentRef

$r = Call-Api -Method POST -Url "$base/api/pay" -Json $pay -IdempotencyKey $key
Add-Section "i. POST /api/pay (same key)" $r

$sig = Sign-PayCallback $paymentRef "success"
$r = Call-Api -Method POST -Url "$base/api/pay/callback" -Json "{`"paymentRef`":`"$paymentRef`",`"status`":`"success`"}" -PaySignature $sig
Add-Section "j. POST /api/pay/callback" $r

$r = Call-Api -Method GET -Url "$base/api/result?sessionId=$sessionId"
Add-Section "k. GET /api/result (paid)" $r

$r = Call-Api -Method PATCH -Url "$base/api/progress" -Json "{`"sessionId`":`"$sessionId`",`"step`":1,`"data`":{`"age`":`"abc`"}}"
Add-Section "illegal-1. PATCH age=abc" $r

$hackKey = [guid]::NewGuid().ToString()
$r = Call-Api -Method POST -Url "$base/api/pay" -Json "{`"sessionId`":`"$sessionId`",`"planType`":`"hack`"}" -IdempotencyKey $hackKey
Add-Section "illegal-2. POST /api/pay planType=hack" $r

$lines | Set-Content -Encoding utf8 $reportPath
Write-Output "WROTE $reportPath"
Write-Output "SESSION=$sessionId"
Write-Output "PAY_KEY=$key"
