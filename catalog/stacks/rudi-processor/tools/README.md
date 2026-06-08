# Tools

Main executable tools for the RUDI processing system.

## Available Tools

### 🔄 rudi_watcher.py
Monitors the RUDI directory for new files and triggers processing.
```bash
python3 rudi_watcher.py
# Runs in background, logs to Index/logs/watcher_background.log
```

### 🎯 rudi_orchestrator.py
Decision engine that determines processing strategy based on file type.
```bash
python3 rudi_orchestrator.py /path/to/file.pdf
# Routes to appropriate processor (Python, Terminal Agent, or Hybrid)
```

### 📊 rudi_audit.py
Audits all files in RUDI and reports processing status.
```bash
python3 rudi_audit.py
# Shows processed, unprocessed, and files needing review
```

### 🧠 rudi_intelligent.py
Smart processing with categorization and semantic naming.
```bash
python3 rudi_intelligent.py /path/to/file.txt
# Generates intelligent filenames and categories
```

### 🔍 search_rudi.py
Search through processed files and metadata.
```bash
python3 search_rudi.py "search term"
# Searches in metadata and extracted content
```

## Import Note

These tools import from parent directories. The import paths are configured to work from this location:
```python
sys.path.insert(0, str(Path(__file__).parent.parent))
```

## Running Tools

All tools can be run directly:
```bash
cd /path/to/rudi-processor
python3 tools/rudi_watcher.py
```

Or made executable:
```bash
chmod +x tools/*.py
./tools/rudi_audit.py
```
