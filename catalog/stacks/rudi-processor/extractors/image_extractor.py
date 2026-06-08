#!/usr/bin/env python3
"""
Image Extractor - Extracts metadata from image files
LLM will need to view image for description
"""

from .base_extractor import BaseExtractor
from typing import Dict, Any
from pathlib import Path

# Try to import image libraries
try:
    from PIL import Image
    from PIL.ExifTags import TAGS
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Try to import HEIC support
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HAS_HEIC = True
except ImportError:
    HAS_HEIC = False

try:
    import pytesseract
    HAS_OCR = True
except ImportError:
    HAS_OCR = False


class ImageExtractor(BaseExtractor):
    """Extract metadata from image files"""

    def extract(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Extract image metadata and OCR if possible"""

        if not HAS_PIL:
            metadata['processing_status']['errors'].append("PIL/Pillow not available for image processing")
            return metadata

        # Check HEIC support for HEIC files
        file_ext = Path(file_path).suffix.lower()
        if file_ext in ['.heic', '.heif'] and not HAS_HEIC:
            metadata['processing_status']['errors'].append("HEIC support not available - install pillow-heif")
            metadata['extracted_content']['note'] = "HEIC file detected but library not installed"

        try:
            with Image.open(file_path) as img:
                # Get dimensions
                metadata['extracted_content']['dimensions'] = {
                    'width': img.width,
                    'height': img.height
                }

                # Get format and mode
                metadata['extracted_content']['image_format'] = img.format
                metadata['extracted_content']['image_mode'] = img.mode

                # Extract EXIF data if available
                exifdata = img.getexif()
                if exifdata:
                    exif_dict = {}
                    for tag_id, value in exifdata.items():
                        tag = TAGS.get(tag_id, tag_id)
                        # Convert to string to ensure JSON serializable
                        if isinstance(value, bytes):
                            value = value.decode('utf-8', errors='ignore')
                        exif_dict[tag] = str(value)

                    metadata['extracted_content']['exif_data'] = exif_dict

                    # Extract specific useful EXIF fields
                    metadata['extracted_content']['camera_make'] = exif_dict.get('Make')
                    metadata['extracted_content']['camera_model'] = exif_dict.get('Model')
                    metadata['extracted_content']['date_taken'] = exif_dict.get('DateTime')
                    metadata['extracted_content']['gps_info'] = exif_dict.get('GPSInfo')

                # Try OCR if available
                if HAS_OCR:
                    try:
                        ocr_text = pytesseract.image_to_string(img)
                        if ocr_text.strip():
                            metadata['extracted_content']['ocr_text'] = ocr_text.strip()
                            metadata['extracted_content']['has_text'] = True
                        else:
                            metadata['extracted_content']['has_text'] = False
                    except Exception as ocr_error:
                        metadata['extracted_content']['ocr_text'] = None
                        metadata['extracted_content']['has_text'] = False
                        metadata['processing_status']['errors'].append(f"OCR failed: {str(ocr_error)}")
                else:
                    metadata['extracted_content']['ocr_text'] = None
                    metadata['extracted_content']['has_text'] = None

                # Calculate aspect ratio
                if img.height > 0:
                    aspect_ratio = round(img.width / img.height, 2)
                    metadata['extracted_content']['aspect_ratio'] = aspect_ratio

                    # Determine orientation
                    if aspect_ratio > 1.2:
                        metadata['extracted_content']['orientation'] = 'landscape'
                    elif aspect_ratio < 0.8:
                        metadata['extracted_content']['orientation'] = 'portrait'
                    else:
                        metadata['extracted_content']['orientation'] = 'square'

                # Note: full_text remains None - LLM will need to view image for description
                metadata['extracted_content']['full_text'] = None
                metadata['extracted_content']['needs_visual_analysis'] = True

        except Exception as e:
            metadata['processing_status']['errors'].append(f"Image extraction error: {str(e)}")

        return metadata
