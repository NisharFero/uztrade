"""HTTP front for the document AI pipeline. Runs locally next to the web app:

    .venv/Scripts/python -m uvicorn docai.app:app --host 127.0.0.1 --port 8765
"""

from __future__ import annotations

import json
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from . import pipeline

MAX_BYTES = 15 * 1024 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load both models in the background so the first upload isn't the slow one.
    if os.environ.get("DOCAI_WARM", "1") == "1":
        threading.Thread(target=lambda: (pipeline.reader(), pipeline.qa()), daemon=True).start()
    yield


app = FastAPI(title="UzTrade Document AI", version="1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return pipeline.health_info()


@app.post("/parse")
def parse(file: UploadFile = File(...), spec: str = Form("{}")) -> dict:
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 15 MB")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        spec_obj = json.loads(spec)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail=f"spec is not valid JSON: {error}") from error
    try:
        return pipeline.parse(data, file.filename, file.content_type, spec_obj)
    except Exception as error:  # unreadable image, broken PDF
        raise HTTPException(status_code=415, detail=f"Could not read the document: {error}") from error
