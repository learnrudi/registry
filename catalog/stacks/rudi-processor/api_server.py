#!/usr/bin/env python3
"""
RUDI API Server - FastAPI backend for the RUDI file processing system
Provides REST API and WebSocket endpoints for the frontend
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from typing import Optional, List, Dict, Any
import json
import os
from pathlib import Path
import asyncio
from datetime import datetime
import hashlib
import shutil

# Import RUDI processors
from metadata_processor import MetadataProcessor
from stage2_processor import Stage2Processor
from batch_process_full import BatchProcessor

app = FastAPI(title="RUDI API", version="1.0.0")

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
# Override with RUDI_BASE_DIR / RUDI_INDEX_DIR env vars or edit paths for your setup
BASE_DIR = Path(os.environ.get("RUDI_BASE_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"))
INDEX_DIR = Path(os.environ.get("RUDI_INDEX_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index"))
METADATA_DIR = INDEX_DIR / "metadata"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Initialize processors
stage1 = MetadataProcessor()
stage2 = Stage2Processor()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "RUDI API Server", "status": "running"}

@app.get("/api/stats")
async def get_stats():
    """Get system statistics"""
    try:
        total_files = 0
        processed_files = 0
        vision_analyzed = 0
        categories = set()

        # Count files in RUDI directory
        if BASE_DIR.exists():
            total_files = len(list(BASE_DIR.glob("*")))

        # Analyze metadata - correct path structure
        stage2_dir = METADATA_DIR / "stage1" / "stage2" / "2025-08"
        if stage2_dir.exists():
            for stage2_file in stage2_dir.glob("*.stage2.json"):
                processed_files += 1
                with open(stage2_file) as f:
                    data = json.load(f)

                    # Count vision analyzed
                    if data.get("llm_enhanced", {}).get("vision_analysis"):
                        vision_analyzed += 1

                    # Collect categories
                    category = data.get("llm_enhanced", {}).get("category")
                    if category:
                        categories.add(category)

        return {
            "total_files": total_files,
            "processed_files": processed_files,
            "vision_analyzed": vision_analyzed,
            "categories": len(categories)
        }
    except Exception as e:
        return {"error": str(e), "total_files": 0, "processed_files": 0}

@app.get("/api/search")
async def search_files(
    q: str = Query("", description="Search query"),
    filters: str = Query("", description="Comma-separated file type filters"),
    limit: int = Query(50, description="Maximum results to return")
):
    """Search through processed files"""
    try:
        results = []
        search_terms = q.lower().split() if q else []
        filter_list = filters.split(",") if filters else []

        # Search through all stage2 metadata - correct path structure
        stage2_dir = METADATA_DIR / "stage1" / "stage2" / "2025-08"
        if stage2_dir.exists():
            for stage2_file in stage2_dir.glob("*.stage2.json"):
                with open(stage2_file) as f:
                    data = json.load(f)

                    # Apply filters
                    if filter_list:
                        file_type = data.get("file_type", "")
                        if file_type not in filter_list:
                            continue

                    # Search matching
                    if search_terms:
                        searchable_text = " ".join([
                            str(data.get("original_name", "")),
                            str(data.get("llm_enhanced", {}).get("summary", "")),
                            str(data.get("llm_enhanced", {}).get("description", "")),
                            " ".join(data.get("llm_enhanced", {}).get("searchable_keywords", [])),
                            " ".join(data.get("llm_enhanced", {}).get("entities", {}).get("names", [])),
                            " ".join(data.get("llm_enhanced", {}).get("entities", {}).get("organizations", [])),
                            str(data.get("extracted_content", {}).get("ocr_text", "")),
                            str(data.get("extracted_content", {}).get("full_text", ""))
                        ]).lower()

                        if not all(term in searchable_text for term in search_terms):
                            continue

                    # Format result
                    result = {
                        "original_name": data.get("original_name"),
                        "file_path": data.get("file_path"),
                        "file_type": data.get("file_type"),
                        "summary": data.get("llm_enhanced", {}).get("summary"),
                        "description": data.get("llm_enhanced", {}).get("description"),
                        "category": data.get("llm_enhanced", {}).get("category"),
                        "modified": data.get("basic_metadata", {}).get("modified"),
                        "size_bytes": data.get("basic_metadata", {}).get("size_bytes"),
                        "vision_analyzed": bool(data.get("llm_enhanced", {}).get("vision_analysis")),
                        "confidence": data.get("llm_enhanced", {}).get("confidence", 0)
                    }
                    results.append(result)

        # Sort by confidence/relevance
        results.sort(key=lambda x: x.get("confidence", 0), reverse=True)

        return results[:limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload and process a file"""
    try:
        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Process with Stage 1
        stage1_result = stage1.process_file(str(file_path))

        # Process with Stage 2 (using smart routing)
        stage2_result = stage2.process_metadata(stage1_result)

        # Broadcast update
        await manager.broadcast(json.dumps({
            "event": "file_processed",
            "file": file.filename,
            "status": "completed"
        }))

        return {
            "message": "File processed successfully",
            "filename": file.filename,
            "metadata": stage2_result
        }

    except Exception as e:
        await manager.broadcast(json.dumps({
            "event": "file_error",
            "file": file.filename,
            "error": str(e)
        }))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/directory")
async def process_directory(directory_path: str):
    """Process all files in a directory"""
    try:
        path = Path(directory_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")

        # Use batch processor
        processor = BatchProcessor(directory_path, use_smart_routing=True)

        # Run processing in background
        asyncio.create_task(run_batch_processing(processor))

        return {
            "message": "Batch processing started",
            "directory": directory_path
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def run_batch_processing(processor):
    """Run batch processing and send updates via WebSocket"""
    try:
        # This would ideally be integrated with the batch processor
        # to send real-time updates
        await manager.broadcast(json.dumps({
            "event": "batch_started",
            "directory": processor.input_directory
        }))

        # Run processor (in production, this should be async)
        processor.process_all()

        await manager.broadcast(json.dumps({
            "event": "batch_completed",
            "directory": processor.input_directory
        }))
    except Exception as e:
        await manager.broadcast(json.dumps({
            "event": "batch_error",
            "error": str(e)
        }))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            await manager.send_message(f"Echo: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/file/{file_hash}")
async def get_file_metadata(file_hash: str):
    """Get detailed metadata for a specific file"""
    try:
        # Search for the file by hash - correct path structure
        stage2_dir = METADATA_DIR / "stage1" / "stage2" / "2025-08"
        if stage2_dir.exists():
            stage2_file = stage2_dir / f"{file_hash}.stage2.json"
            if stage2_file.exists():
                with open(stage2_file) as f:
                    return json.load(f)

        raise HTTPException(status_code=404, detail="File metadata not found")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{file_hash}")
async def download_file(file_hash: str):
    """Download original file"""
    try:
        # Find file metadata - correct path structure
        stage2_dir = METADATA_DIR / "stage1" / "stage2" / "2025-08"
        if stage2_dir.exists():
            stage2_file = stage2_dir / f"{file_hash}.stage2.json"
            if stage2_file.exists():
                with open(stage2_file) as f:
                    data = json.load(f)
                    file_path = data.get("file_path")
                    if file_path and Path(file_path).exists():
                        return FileResponse(file_path)

        raise HTTPException(status_code=404, detail="File not found")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/clear-metadata")
async def clear_metadata():
    """Clear all metadata (use with caution)"""
    try:
        # Remove all metadata directories
        stage1_dir = METADATA_DIR / "stage1" / "2025-08"
        stage2_dir = METADATA_DIR / "stage1" / "stage2" / "2025-08"
        if stage1_dir.exists():
            shutil.rmtree(stage1_dir)
        if stage2_dir.exists():
            shutil.rmtree(stage2_dir)

        return {"message": "Metadata cleared successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/categories")
async def get_categories():
    """Get all unique categories"""
    try:
        categories = {}

        stage2_dir = METADATA_DIR / "stage1" / "stage2" / "2025-08"
        if stage2_dir.exists():
            for stage2_file in stage2_dir.glob("*.stage2.json"):
                with open(stage2_file) as f:
                    data = json.load(f)
                    category = data.get("llm_enhanced", {}).get("category")
                    subcategory = data.get("llm_enhanced", {}).get("subcategory")

                    if category:
                        if category not in categories:
                            categories[category] = set()
                        if subcategory:
                            categories[category].add(subcategory)

        # Convert sets to lists for JSON serialization
        result = {k: list(v) for k, v in categories.items()}
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("Starting RUDI API Server on http://localhost:8000")
    print("Frontend should connect to this server for all operations")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
