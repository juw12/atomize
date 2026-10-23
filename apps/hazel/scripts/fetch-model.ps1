# Fetches the faster-whisper tiny.en model into engine/models/ for fully
# offline use. Uses curl with redirect-following; on a normal network this
# "just works". On a locked-down network (HuggingFace blocked) it will fail --
# in that case, copy the model files in manually from another machine.

$ErrorActionPreference = "Stop"

$repo = "Systran/faster-whisper-tiny.en"
$dest = Join-Path $PSScriptRoot "..\engine\models\faster-whisper-tiny.en"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$files  = @("config.json", "model.bin", "tokenizer.json", "vocabulary.txt", "preprocessor_config.json")
$hosts  = @("https://huggingface.co", "https://hf-mirror.com")

foreach ($f in $files) {
  $got = $false
  foreach ($h in $hosts) {
    $url  = "$h/$repo/resolve/main/$f"
    $out  = Join-Path $dest $f
    try {
      & curl.exe -sL --max-time 600 -o $out $url
      if ((Test-Path $out) -and (Get-Item $out).Length -gt 0) {
        Write-Host ("got   {0} <- {1} ({2} bytes)" -f $f, $h, (Get-Item $out).Length)
        $got = $true
        break
      }
    } catch { }
  }
  if (-not $got) { Write-Warning "could not fetch $f" }
}

Write-Host ""
Write-Host "Model dir: $dest"
Write-Host "faster-whisper will now load it locally (offline)."
