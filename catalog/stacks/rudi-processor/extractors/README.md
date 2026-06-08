# Extractors

File type-specific extractors for Stage 1 processing. Each extractor inherits from `BaseExtractor` and implements content extraction for its file type.

## Available Extractors

| Extractor | File Types | Extracts |
|-----------|------------|----------|
| `text_extractor.py` | .txt, .md, .csv | Full text content, line/word counts |
| `pdf_extractor.py` | .pdf | Full text, page count, PDF metadata |
| `docx_extractor.py` | .docx, .xlsx | Full text, tables, document properties |
| `image_extractor.py` | .png, .jpg, .heic | Dimensions, EXIF data, OCR text |
| `video_extractor.py` | .mp4, .mov, .avi | Duration, resolution, codec info |
| `audio_extractor.py` | .mp3, .m4a, .wav | Duration, bitrate, ID3 tags |

## Base Extractor

All extractors inherit from `base_extractor.py` which provides:
- Metadata skeleton creation
- SHA256 hash calculation
- File type detection
- Error handling

## Usage

Extractors are called automatically by `metadata_processor.py` based on file extension:

```python
from extractors import PDFExtractor

extractor = PDFExtractor()
metadata = extractor.process("/path/to/file.pdf")
```

## Output Structure

Each extractor populates the `extracted_content` section of the metadata:

```json
{
  "extracted_content": {
    "full_text": "...",      // Text content if available
    "page_count": 10,        // For documents
    "dimensions": {...},     // For images/video
    "duration_seconds": 60,  // For audio/video
    ...
  }
}
```

## Adding New Extractors

1. Create a new file: `new_type_extractor.py`
2. Inherit from `BaseExtractor`
3. Implement the `extract()` method
4. Add to `__init__.py`
5. Update `metadata_processor.py` to route to your extractor
