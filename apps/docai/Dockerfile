FROM python:3.11-slim

WORKDIR /app
COPY requirements-remote.txt .
RUN pip install --no-cache-dir -r requirements-remote.txt
COPY docai ./docai

ENV DOCAI_PROVIDER=hf_endpoint DOCAI_WARM=0
CMD ["sh", "-c", "uvicorn docai.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
