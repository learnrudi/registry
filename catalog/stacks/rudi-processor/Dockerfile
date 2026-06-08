# RUDI Processor Docker Image
# Fully portable, self-contained processing system

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first (for better caching)
COPY setup.py requirements.txt* ./
RUN pip install --no-cache-dir -e .

# Copy application code
COPY . .

# Create directories for volumes
RUN mkdir -p /data/RUDI /data/Index /data/logs

# Environment variables (can be overridden)
ENV RUDI_BASE_PATH=/data
ENV RUDI_PATH=/data/RUDI
ENV RUDI_INDEX_PATH=/data/Index
ENV PYTHONUNBUFFERED=1

# Volumes for data persistence
VOLUME ["/data/RUDI", "/data/Index"]

# Default command (can be overridden)
CMD ["python", "-m", "tools.rudi_watcher"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD python -c "from pathlib import Path; exit(0 if Path('/data/Index/.watcher.pid').exists() else 1)"
