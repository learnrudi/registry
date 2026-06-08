# 🚀 RUDI Processor - Intelligent File Processing System

**RUDI** (**R**esponsible **U**se of **D**igital **I**ntelligence) is an AI-powered file processing system that automatically extracts metadata, organizes files, and prepares content for semantic search and LLM enhancement.

## 📋 Table of Contents
- [Quick Start](#-quick-start)
- [Features](#-features)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [File Type Support](#-file-type-support)
- [Project Structure](#-project-structure)

## 🎯 Overview

RUDI Processor is a two-stage file processing system:
- **Stage 1**: Python-based extraction of metadata and content
- **Stage 2**: LLM-enhanced categorization and summarization

## ✨ Features

- **🎯 Two-Stage Processing**: Python extraction + LLM enhancement
- **📁 Multi-Format Support**: PDFs, images (including HEIC), videos, audio, documents, text, code
- **🔍 Intelligent Extraction**: Automatic text extraction, OCR, metadata parsing
- **📂 Smart Organization**: Configurable output (by date, month, year, or flat)
- **🔄 File Watching**: Automatic processing of new files
- **🎮 Dynamic Configuration**: Environment variables, config files, or defaults
- **🐳 Docker Support**: Fully containerized for portability
- **💯 Robust Error Handling**: 100% test coverage for edge cases

## 🚀 Quick Start

```bash
# 1. Install dependencies
pip3 install -r requirements.txt

# 2. Process a single file
python3 metadata_processor.py /path/to/file.pdf

# 3. Batch process all files in RUDI
python3 examples/batch_process_all.py

# 4. Start the file watcher
python3 tools/rudi_watcher.py
```

### Basic Usage

```bash
# Process a single file (Stage 1)
python3 metadata_processor.py /path/to/your/file.pdf

# Start the file watcher (monitors RUDI directory)
./scripts/start_watcher.sh

# Check system status
./scripts/watcher_status.sh

# Audit all files in RUDI
python3 tools/rudi_audit.py

# Test all extractors
python3 tests/batch_test_stage1.py
```

## 📁 Directory Structure

```
rudi-processor/
├── metadata_processor.py    # Main Stage 1 processor
├── config/                  # Configuration files
├── extractors/             # File type extractors
├── processors/             # Advanced processors
├── tools/                  # Executable tools
├── scripts/                # Shell scripts
├── tests/                  # Test files
└── docs/                   # Documentation
```

## 🔄 Processing Pipeline

### Stage 1: Python Extraction
1. File dropped in `RUDI_PATH` (configured via env var or `config/rudi-config.json`)
2. Watcher detects new file
3. Router selects appropriate extractor based on extension
4. Extractor creates metadata with:
   - Basic info (size, hash, dates)
   - Extracted content (full text for documents, dimensions for images)
   - Empty LLM fields for Stage 2

### Stage 2: LLM Enhancement (Future)
1. LLM reads Stage 1 metadata
2. Analyzes content and generates:
   - Category and subcategory
   - Summary and description
   - Topics and entities
   - Searchable keywords

## 📊 Supported File Types

### Full Text Extraction
- **Documents**: PDF, DOCX, TXT, MD
- **Data**: CSV, JSON, XML
- **Code**: PY, JS, HTML, CSS

### Metadata Extraction
- **Images**: PNG, JPG, HEIC (dimensions, EXIF, OCR)
- **Video**: MP4, MOV (duration, resolution)
- **Audio**: MP3, M4A (duration, bitrate, tags)

## 🛠️ Components

### Core Processor
- `metadata_processor.py` - Routes files to appropriate extractors

### Extractors (`extractors/`)
- `text_extractor.py` - Plain text and code files
- `pdf_extractor.py` - PDF documents
- `docx_extractor.py` - Office documents
- `image_extractor.py` - Image files with OCR
- `video_extractor.py` - Video metadata
- `audio_extractor.py` - Audio metadata

### Tools (`tools/`)
- `rudi_watcher.py` - File system monitor
- `rudi_orchestrator.py` - Processing decision engine
- `rudi_audit.py` - Audit and reporting
- `rudi_intelligent.py` - Smart categorization
- `search_rudi.py` - Search processed files

### Scripts (`scripts/`)
- `start_watcher.sh` - Start the file watcher
- `stop_watcher.sh` - Stop the file watcher
- `watcher_status.sh` - Check watcher status

## ⚙️ Configuration

### Three Ways to Configure

#### 1. Environment Variables (Highest Priority)
```bash
export RUDI_BASE_PATH="/Users/jane/Documents"
export RUDI_PATH="/Users/jane/Documents/RUDI"
export RUDI_INDEX_PATH="/Users/jane/Documents/Index"
export RUDI_OUTPUT_ORGANIZATION="date"  # Options: month, date, year, flat
```

#### 2. Config File (`config/rudi-config.json`)
```json
{
  "base_path": "~/.rudi/workspaces/rudi-processor",
  "rudi_path": "~/.rudi/workspaces/rudi-processor/inbox",
  "output_organization": "month"
}
```

#### 3. Default Values
Works out of the box with sensible defaults.

### Output Organization Options

| Mode | Setting | Result | Example Path |
|------|---------|--------|--------------|
| Month | `"month"` | Group by month | `Index/metadata/stage1/2025-08/` |
| Date | `"date"` | Daily folders | `Index/metadata/stage1/2025-08-07/` |
| Year | `"year"` | Yearly folders | `Index/metadata/stage1/2025/` |
| Flat | `"flat"` | No subdirectories | `Index/metadata/stage1/` |

## 🧪 Testing

```bash
# Run error handling tests (100% coverage)
python3 tests/test_error_handling.py

# Test all extractors with files in RUDI
python3 tests/batch_test_stage1.py

# Process a specific file
python3 metadata_processor.py /path/to/test/file.pdf

# Demo output organization modes
python3 examples/demo_output_modes.py
```

## 📈 Output

Processed metadata is saved to:
- `RUDI_INDEX_PATH/metadata/stage1/` - Stage 1 extraction (default: `~/.rudi/workspaces/rudi-processor/index/metadata/stage1/`)
- `RUDI_INDEX_PATH/manifest.jsonl` - Processing log

Each metadata file contains:
- File identification (name, path, hash)
- Basic metadata (size, dates, type)
- Extracted content (text, dimensions, duration)
- Placeholders for LLM enhancement

## 🔍 Example Metadata

```json
{
  "original_name": "document.pdf",
  "file_path": "/path/to/RUDI/document.pdf",
  "hash": "sha256...",
  "file_type": "documents",
  "basic_metadata": {
    "size_bytes": 245678,
    "created": "2025-08-07T10:30:00",
    "extension": ".pdf"
  },
  "extracted_content": {
    "full_text": "Complete document text...",
    "page_count": 15
  },
  "llm_enhanced": {
    "category": null,
    "summary": null,
    "topics": null
  },
  "processing_status": {
    "python_processed": true,
    "llm_processed": false,
    "stage": "awaiting_llm"
  }
}
```

## 🚦 System Status

Check the current status:
```bash
# Overall system status
./scripts/rudi_status.sh

# Watcher status
./scripts/watcher_status.sh

# Processing audit
python3 tools/rudi_audit.py
```

## 📚 Documentation

- `STRUCTURE.md` - Detailed system architecture
- `docs/COMPLETE_DOCUMENTATION.md` - Full documentation
- `docs/TERMINAL_AGENT_WORKFLOW.md` - Terminal agent integration
- `docs/WORKFLOW.md` - Processing workflows

## 🤝 Contributing

The system is designed to be extensible:
1. Add new extractors in `extractors/`
2. Extend file type support in `config/metadata-skeleton.json`
3. Create new tools in `tools/`

## 📄 License

Internal tool for Responsible Use of Digital Intelligence
