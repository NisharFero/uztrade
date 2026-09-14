#!/usr/bin/env sh
# Starts the document AI service on http://127.0.0.1:8765 (keeps caches on this drive).
here="$(cd "$(dirname "$0")" && pwd)"
export DOCAI_CACHE="$here/.cache"
export HF_HOME="$DOCAI_CACHE/hf"
cd "$here" || exit 1
if [ -x .venv/Scripts/python.exe ]; then py=.venv/Scripts/python.exe; else py=.venv/bin/python; fi
exec "$py" -m uvicorn app:app --host 127.0.0.1 --port 8765
