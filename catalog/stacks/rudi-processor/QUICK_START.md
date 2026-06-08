# 🚀 RUDI Processor - Quick Start Guide

## Installation (One-Time)
```bash
cd /path/to/rudi-processor
pip3 install -r requirements.txt
```

## Common Commands

### Process Files
```bash
# Process single file
python3 metadata_processor.py /path/to/file.pdf

# Process all files in RUDI
python3 examples/batch_process_all.py
```

### File Watcher
```bash
# Start watching for new files
./scripts/start_watcher.sh

# Check if watcher is running
./scripts/watcher_status.sh

# Stop watcher
./scripts/stop_watcher.sh
```

### Audit & Search
```bash
# Check processing status
python3 tools/rudi_audit.py

# Search processed files
python3 tools/search_rudi.py "search term"
```

### Testing
```bash
# Run tests
python3 tests/test_error_handling.py
python3 tests/batch_test_stage1.py
```

## Configuration

### Change Output Organization
```bash
# Use environment variable (temporary)
export RUDI_OUTPUT_ORGANIZATION=date  # Options: month, date, year, flat
python3 examples/batch_process_all.py

# Or edit config/rudi-config.json (permanent)
```

### Use Different Paths
```bash
# Set custom paths
export RUDI_PATH="/path/to/your/dropzone"
export RUDI_INDEX_PATH="/path/to/your/index"
python3 examples/batch_process_all.py
```

## File Locations

| What | Where |
|------|-------|
| Drop files here | `~/.rudi/workspaces/rudi-processor/inbox/` |
| Metadata saved to | `~/.rudi/workspaces/rudi-processor/index/metadata/stage1/` |
| Logs | `~/.rudi/workspaces/rudi-processor/index/logs/` |
| Config | `config/rudi-config.json` |

## Supported File Types

✅ **Full Text Extraction**
- Documents: PDF, DOCX, TXT, MD
- Data: CSV, JSON, XML
- Code: PY, JS, HTML, CSS

✅ **Metadata Extraction**
- Images: PNG, JPG, HEIC (+ OCR)
- Video: MP4, MOV, AVI
- Audio: MP3, M4A, WAV

## Output Organization Examples

| Mode | Example Path |
|------|--------------|
| `month` | `Index/metadata/stage1/2025-08/file.json` |
| `date` | `Index/metadata/stage1/2025-08-07/file.json` |
| `year` | `Index/metadata/stage1/2025/file.json` |
| `flat` | `Index/metadata/stage1/file.json` |

## Troubleshooting

### Check System Status
```bash
# View configuration
python3 -c "from config import config; config.print_config()"

# Check logs
tail -f ~/.rudi/workspaces/rudi-processor/index/logs/metadata_*.log
```

### Common Issues

**Issue:** Files not being processed
- Check watcher is running: `./scripts/watcher_status.sh`
- Check file permissions
- Check logs for errors

**Issue:** HEIC images not working
- Install: `pip3 install pillow-heif`

**Issue:** OCR not working
- Install tesseract: `brew install tesseract`

## Next Steps

1. Drop files in `~/.rudi/workspaces/rudi-processor/inbox/`
2. Run `python3 examples/batch_process_all.py`
3. Check metadata in `~/.rudi/workspaces/rudi-processor/index/metadata/stage1/`
4. Start watcher for automatic processing

---
For full documentation, see `README.md`
