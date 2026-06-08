# RUDI Processor - Clean Directory Structure

## 📁 Organization

```
rudi-processor/
├── README.md                   # Main documentation
├── metadata_processor.py       # Main Stage 1 processor (routes to extractors)
│
├── config/                     # Configuration files
│   ├── metadata-skeleton.json  # Metadata structure definition
│   └── rudi-config.json       # System configuration
│
├── extractors/                 # Stage 1: Python extractors by file type
│   ├── base_extractor.py      # Abstract base class
│   ├── text_extractor.py      # Text files (.txt, .md, .csv)
│   ├── pdf_extractor.py       # PDF documents
│   ├── docx_extractor.py      # Office documents (.docx, .xlsx)
│   ├── image_extractor.py     # Images (.png, .jpg, .heic)
│   ├── video_extractor.py     # Videos (.mp4, .mov, .avi)
│   └── audio_extractor.py     # Audio files (.mp3, .m4a, .wav)
│
├── processors/                 # Advanced processors
│   ├── intelligent_processor.py     # Smart categorization
│   └── terminal_agent_processor.py  # Terminal agent integration
│
├── tools/                      # Main executable tools
│   ├── rudi_watcher.py        # File watcher daemon
│   ├── rudi_orchestrator.py   # Decision engine
│   ├── rudi_intelligent.py    # Intelligent processing CLI
│   ├── rudi_audit.py          # Audit tool
│   └── search_rudi.py         # Search functionality
│
├── scripts/                    # Shell scripts
│   ├── start_watcher.sh       # Start the watcher
│   ├── stop_watcher.sh        # Stop the watcher
│   ├── watcher_status.sh      # Check watcher status
│   └── rudi_status.sh         # Overall system status
│
├── tests/                      # Test files
│   └── batch_test_stage1.py   # Test Stage 1 extraction
│
├── docs/                       # Documentation
│   ├── COMPLETE_DOCUMENTATION.md
│   ├── TERMINAL_AGENT_WORKFLOW.md
│   └── WORKFLOW.md
│
└── archive/                    # Old versions
    └── old_versions/
```

## 🔄 Two-Stage Processing Flow

### Stage 1: Python Extraction (metadata_processor.py)
1. File detected in `~/.rudi/workspaces/rudi-processor/inbox/`
2. Router selects appropriate extractor based on file extension
3. Extractor creates metadata skeleton with:
   - Basic metadata (size, dates, hash)
   - Extracted content (full_text for text files, dimensions for images, etc.)
   - Empty LLM fields (category, summary, topics = null)
4. Saves to `~/.rudi/workspaces/rudi-processor/index/metadata/stage1/`

### Stage 2: LLM Enhancement (future)
1. LLM reads Stage 1 metadata
2. For text files: reads full_text, generates category/summary
3. For images: views image directly, adds description
4. For videos: could process transcript or frames
5. Updates metadata with enhanced fields
6. Saves final metadata

## 🚀 Quick Commands

```bash
# Start the watcher
./scripts/start_watcher.sh

# Check status
./scripts/watcher_status.sh

# Process single file (Stage 1)
python3 metadata_processor.py /path/to/file.txt

# Run intelligent processing
python3 tools/rudi_intelligent.py /path/to/file.pdf

# Audit all files
python3 tools/rudi_audit.py

# Test all extractors
python3 tests/batch_test_stage1.py
```

## 📊 Current Capabilities

### Fully Supported (Extract Text)
- Text files (.txt, .md, .log)
- PDFs (with PyPDF2/pdfplumber)
- CSV files
- JSON files
- DOCX files (with python-docx)
- XLSX files (with openpyxl)

### Metadata Only (Need LLM for Content)
- Images (.png, .jpg - dimensions, EXIF, OCR if text present)
- Videos (.mp4 - duration, resolution, codec)
- Audio (.mp3, .m4a - duration, bitrate, tags)

### Not Yet Supported
- HEIC images (Apple format - needs pillow-heif)
- Archives (.zip, .tar)
- Executables
