# Document Processor MCP

Extract PDF slides as images and remove watermarks intelligently.

## Features

- **PDF to Images**: Convert PDF pages to high-resolution PNGs (300+ DPI)
- **Watermark Removal**: Intelligent pixel replacement using color sampling
- **Batch Processing**: Process entire directories of images
- **One-Step Workflow**: Extract slides + remove watermarks in single command

## Installation

```bash
rudi install document-processor
```

## Tools

### `pdf_extract_slides`
Extract PDF slides as images and optionally remove watermarks.

```typescript
{
  pdf_path: string              // Path to PDF file
  output_dir?: string           // Output directory (default: PDF_name_slides/)
  remove_watermarks?: boolean   // Remove watermarks (default: false)
  watermark_config?: {          // Optional: specify watermark location
    x_from_right: number
    y_from_bottom: number
    width: number
    height: number
  }
  dpi?: number                  // Resolution (default: 300)
}
```

**Example:**
```javascript
{
  "pdf_path": "/path/to/presentation.pdf",
  "remove_watermarks": true,
  "dpi": 300
}
```

### `pdf_to_images`
Convert PDF pages to images without watermark removal.

```typescript
{
  pdf_path: string
  output_dir: string
  dpi?: number                  // Default: 300
  format?: string               // Default: "png"
  prefix?: string               // Default: "slide"
}
```

### `remove_watermark`
Remove watermark from a single image.

```typescript
{
  image_path: string
  output_path: string
  watermark_region?: {
    x_from_right: number
    y_from_bottom: number
    width: number
    height: number
  }
}
```

### `batch_remove_watermark`
Remove watermarks from all images in a directory.

```typescript
{
  image_dir: string
  output_dir?: string           // Default: image_dir/cleaned
  watermark_config?: {
    x_from_right: number
    y_from_bottom: number
    width: number
    height: number
  }
  pattern?: string              // Default: "*.png"
}
```

## How Watermark Removal Works

1. **Color Sampling**: Samples background color from clean area adjacent to watermark
2. **Pixel Replacement**: Replaces watermark pixels with sampled background color
3. **Noise Addition**: Adds subtle random variation to blend seamlessly
4. **Auto-Detection**: Defaults to bottom-right corner (typical watermark location)

Best for:
- Text watermarks (e.g., "NotebookLM", "© Company Name")
- Logo watermarks on uniform backgrounds
- Bottom-right corner watermarks (auto-detected)

## Examples

### Extract slides and remove watermarks
```bash
# Via Claude
"Extract all slides from presentation.pdf and remove the watermarks"
```

### Custom watermark location
```bash
# If watermark is in different location
{
  "pdf_path": "slides.pdf",
  "remove_watermarks": true,
  "watermark_config": {
    "x_from_right": 500,
    "y_from_bottom": 100,
    "width": 400,
    "height": 80
  }
}
```

### Batch clean existing images
```bash
# Clean all PNGs in a folder
{
  "image_dir": "/path/to/slides",
  "pattern": "*.png"
}
```

## Requirements

- `pdftoppm` (from poppler-utils)
- Python 3.8+
- Pillow
- numpy
- opencv-python

## Tips

- **DPI Settings**: Use 300 DPI for print quality, 150 DPI for web/screen
- **Watermark Detection**: If auto-detection fails, manually specify region
- **Batch Processing**: Process large batches efficiently with `batch_remove_watermark`
- **Output Quality**: PNG format preserves quality better than JPG for slides

## License

MIT
