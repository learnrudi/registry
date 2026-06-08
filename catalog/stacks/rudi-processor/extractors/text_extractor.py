#!/usr/bin/env python3
"""
Text Extractor - Handles all text-based files
Extracts full text content for LLM processing
"""

from .base_extractor import BaseExtractor
from typing import Dict, Any
import json
import csv
import io


class TextExtractor(BaseExtractor):
    """Extract content from text-based files"""

    def extract(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Extract full text from text files"""

        extension = metadata['basic_metadata']['extension']

        try:
            # Try multiple encodings to handle various text files
            encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'ascii']
            content = None

            for encoding in encodings:
                try:
                    with open(file_path, 'r', encoding=encoding) as f:
                        content = f.read()
                    break
                except (UnicodeDecodeError, LookupError):
                    continue

            if content is None:
                # If all encodings fail, read as binary and try to decode
                with open(file_path, 'rb') as f:
                    raw_content = f.read()
                    content = raw_content.decode('utf-8', errors='ignore')
                metadata['processing_status']['errors'].append("File encoding issues - some characters may be missing")

            # Store full text for all text files
            metadata['extracted_content']['full_text'] = content

            # Handle specific formats
            if extension == '.csv':
                # For CSV, also parse structure
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.reader(f)
                    rows = list(reader)
                    metadata['extracted_content']['row_count'] = len(rows)
                    if rows:
                        metadata['extracted_content']['column_count'] = len(rows[0])

            elif extension == '.json':
                # Validate JSON
                try:
                    json_data = json.loads(content)
                    metadata['extracted_content']['is_valid_json'] = True
                    # Count keys if it's an object
                    if isinstance(json_data, dict):
                        metadata['extracted_content']['top_level_keys'] = list(json_data.keys())
                except:
                    metadata['extracted_content']['is_valid_json'] = False

            # Count lines and words for all text files
            lines = content.split('\n')
            words = content.split()
            metadata['extracted_content']['line_count'] = len(lines)
            metadata['extracted_content']['word_count'] = len(words)
            metadata['extracted_content']['char_count'] = len(content)

        except Exception as e:
            metadata['processing_status']['errors'].append(f"Text extraction error: {str(e)}")

        return metadata
