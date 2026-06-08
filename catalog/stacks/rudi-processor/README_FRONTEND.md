# RUDI Frontend & API Integration

## Overview
The RUDI system now has a complete web interface for searching and managing your AI-enhanced file system.

## Components

### 1. Backend API Server (`api_server.py`)
- **Running on**: http://localhost:8001
- **Technologies**: FastAPI, WebSockets
- **Features**:
  - RESTful API for file search and stats
  - WebSocket support for real-time updates
  - File upload and processing endpoints
  - Category management

### 2. Frontend Interface (`frontend/rudi_search.html`)
- **Access**: Open the HTML file directly in your browser
- **Features**:
  - Real-time search across all processed files
  - File type filtering (Documents, Images, Text, Video, Audio, Data)
  - Drag-and-drop file upload
  - Statistics dashboard
  - Natural language search queries

## How to Use

### Starting the Backend
```bash
cd /path/to/rudi-processor
uvicorn api_server:app --host 0.0.0.0 --port 8001
```

### Opening the Frontend
```bash
open frontend/rudi_search.html
```

## API Endpoints

### Core Endpoints
- `GET /` - API status
- `GET /api/stats` - System statistics
- `GET /api/search?q=query&filters=images,documents` - Search files
- `POST /api/upload` - Upload and process file
- `GET /api/categories` - Get all categories
- `GET /api/file/{hash}` - Get file metadata
- `GET /api/download/{hash}` - Download file
- `WS /ws` - WebSocket for real-time updates

### Search Examples
- Natural language: "contracts from 2025"
- By content: "machine learning algorithms"
- By entities: "Example Person"
- Vision-based: "images with documents"

## Processing Flow
1. Files are uploaded or batch processed
2. Stage 1 extracts basic metadata and text
3. Stage 2 uses LLMs for enhancement:
   - Google Gemini for images (vision)
   - DeepSeek for cost-effective text
   - Smart routing based on file type
4. Results are searchable via the frontend

## Current Status
- API server running on port 8001
- Frontend connected and functional
- 33 files detected in RUDI directory
- Ready for processing and search

## Next Steps
To process all files:
```python
from batch_process_full import BatchProcessor
processor = BatchProcessor(use_smart_routing=True)
processor.process_all()
```

Or use the API:
```bash
curl -X POST http://localhost:8001/api/process/directory \
  -H "Content-Type: application/json" \
  -d '{"directory_path": "~/.rudi/workspaces/rudi-processor/inbox"}'
```
