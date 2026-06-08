# Tests

Test files for validating the RUDI processing system.

## Available Tests

### 📊 batch_test_stage1.py
Comprehensive test of Stage 1 extraction for all files in RUDI.

```bash
python3 batch_test_stage1.py
```

**What it tests:**
- All extractors with real files
- Text extraction from documents
- Metadata extraction from media files
- Error handling for unsupported types
- Processing statistics

**Output includes:**
- File-by-file processing results
- Summary by file type
- Statistics (files processed, text extracted, errors)

## Running Tests

From the main directory:
```bash
cd /path/to/rudi-processor
python3 tests/batch_test_stage1.py
```

## Test Results

The test processes all files in `~/.rudi/workspaces/rudi-processor/inbox/` and shows:

```
📄 TEXT FILES (15 files)
  • file.txt: 500 chars extracted

📑 PDF FILES (6 files)
  • document.pdf: 10 pages, ✓ Text extracted

🖼️ IMAGE FILES (2 files)
  • image.png: 1024x1024, OCR: True

🎥 VIDEO FILES (2 files)
  • video.mp4: 246.3s, 1080x1920

STATISTICS
Total files: 31
Successfully processed: 31
Files with extracted text: 26
Files needing LLM processing: 5
```

## Adding New Tests

Create new test files in this directory:
```python
# test_new_feature.py
from metadata_processor import MetadataProcessor

def test_feature():
    processor = MetadataProcessor()
    # Add test logic
    assert result == expected
```

## Test Data

Test files should be placed in:
- `~/.rudi/workspaces/rudi-processor/inbox/` - Real test files
- Or create a `test_data/` subdirectory for isolated testing
