#!/usr/bin/env python3
"""
Base Extractor - Foundation for all file type extractors
Creates metadata skeleton and fills basic information
"""

import os
import json
import hashlib
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod


class BaseExtractor(ABC):
    """Base class for all file extractors"""

    def __init__(self, config_path: str = None):
        """Initialize with metadata skeleton"""
        if config_path is None:
            config_path = Path(os.environ.get("RUDI_TOOLS_DIR", str(Path(__file__).resolve().parents[1]))) / "config" / "metadata-skeleton.json"

        with open(config_path, 'r') as f:
            self.skeleton_config = json.load(f)

    def create_metadata_skeleton(self, file_path: str) -> Dict[str, Any]:
        """Create base metadata structure that all extractors will use"""
        path = Path(file_path)

        try:
            stat = path.stat()
            created = datetime.fromtimestamp(stat.st_ctime).isoformat()
            modified = datetime.fromtimestamp(stat.st_mtime).isoformat()
            size_bytes = stat.st_size
        except (OSError, IOError) as e:
            # Handle permission errors or other file access issues
            created = modified = None
            size_bytes = 0

        # Calculate hash (with error handling)
        try:
            file_hash = self.calculate_hash(file_path)
        except (OSError, IOError) as e:
            file_hash = None

        # Get MIME type
        mime_type, _ = mimetypes.guess_type(file_path)

        # Create skeleton
        metadata = {
            "original_name": path.name,
            "file_path": str(path.absolute()),
            "hash": file_hash,
            "file_type": self.get_file_type(path.suffix.lower()),

            "basic_metadata": {
                "size_bytes": size_bytes,
                "created": created,
                "modified": modified,
                "extension": path.suffix.lower() if path.suffix else "",
                "mime_type": mime_type
            },

            "extracted_content": {
                "full_text": None,
                "ocr_text": None,
                "transcript": None,
                "page_count": None,
                "duration_seconds": None,
                "dimensions": None,
                "has_images": None,
                "has_audio": None,
                "frame_rate": None,
                "bitrate": None
            },

            "llm_enhanced": {
                "description": None,
                "category": None,
                "subcategory": None,
                "summary": None,
                "topics": None,
                "entities": None,
                "searchable_keywords": None,
                "confidence": None
            },

            "processing_status": {
                "python_processed": False,
                "llm_processed": False,
                "stage": "initialized",
                "errors": []
            }
        }

        return metadata

    def calculate_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file"""
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except (OSError, IOError) as e:
            # Return None or empty string for files that can't be read
            raise

    def get_file_type(self, extension: str) -> str:
        """Determine file type category from extension"""
        for file_type, extensions in self.skeleton_config['file_type_mappings'].items():
            if extension in extensions:
                return file_type
        return "other"

    @abstractmethod
    def extract(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract content specific to file type.
        Must be implemented by each specific extractor.
        Updates and returns the metadata dict.
        """
        pass

    def process(self, file_path: str) -> Dict[str, Any]:
        """Main processing pipeline"""
        # Create skeleton
        metadata = self.create_metadata_skeleton(file_path)

        try:
            # Extract type-specific content
            metadata = self.extract(file_path, metadata)

            # Mark as Python processed
            metadata['processing_status']['python_processed'] = True
            metadata['processing_status']['stage'] = 'awaiting_llm'

        except Exception as e:
            metadata['processing_status']['errors'].append(str(e))
            metadata['processing_status']['stage'] = 'python_error'

        return metadata
