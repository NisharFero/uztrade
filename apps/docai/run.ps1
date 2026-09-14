# Starts the document AI service on http://127.0.0.1:8765 (keeps caches on this drive).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:DOCAI_CACHE = Join-Path $here ".cache"
$env:HF_HOME = Join-Path $env:DOCAI_CACHE "hf"
Set-Location $here
& (Join-Path $here ".venv\Scripts\python.exe") -m uvicorn docai.app:app --host 127.0.0.1 --port 8765
