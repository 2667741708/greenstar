#!/bin/bash
# 启动本地 FastAPI 代理以绕过 CORS 限制

cd /home/whm/Project/greenstar || exit

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install -r backend/requirements.txt
fi

echo "🟢 Starting Python backend on 127.0.0.1:8000 using local .venv..."
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
