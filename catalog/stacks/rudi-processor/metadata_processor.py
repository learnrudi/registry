#!/usr/bin/env python3
"""
Metadata Processor - Routes files to appropriate extractors based on extension
Stage 1 of the two-stage processing system
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

# Import configuration
from config import config

# Import all extractors
from extractors import (
    TextExtractor,
    PDFExtractor,
    ImageExtractor,
    VideoExtractor,
    AudioExtractor
)
from extractors.docx_extractor import DocxExtractor


class MetadataProcessor:
    """Routes files to appropriate extractors and saves metadata"""

    def __init__(self, config_path: str = None):
        """Initialize with metadata skeleton config"""
        if config_path is None:
            config_path = config.tools_path / "config" / "metadata-skeleton.json"

        with open(config_path, 'r') as f:
            self.config = json.load(f)

        self.setup_logging()
        self.setup_extractors()

    def setup_logging(self):
        """Setup logging configuration"""
        log_dir = config.log_dir
        log_dir.mkdir(parents=True, exist_ok=True)

        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_dir / f'metadata_{datetime.now().strftime("%Y%m%d")}.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)

    def setup_extractors(self):
        """Initialize all extractors"""
        self.extractors = {
            'text': TextExtractor(),
            'code': TextExtractor(),  # Use same extractor for code
            'structured': TextExtractor(),  # Use same for structured data
            'documents': PDFExtractor(),
            'images': ImageExtractor(),
            'video': VideoExtractor(),
            'audio': AudioExtractor(),
            'office': DocxExtractor()  # For DOCX and XLSX files
        }

    def get_extractor_for_file(self, file_path: str) -> Optional[object]:
        """Determine which extractor to use based on file extension"""
        extension = Path(file_path).suffix.lower()

        # Handle files with no extension
        if not extension:
            self.logger.info(f"File has no extension, using text extractor: {file_path}")
            return self.extractors.get('text')

        # Find the file type category
        for file_type, extensions in self.config['file_type_mappings'].items():
            if extension in extensions:
                # Special handling for documents
                if file_type == 'documents':
                    if extension == '.pdf':
                        return self.extractors.get('documents')
                    elif extension in ['.docx', '.xlsx']:
                        return self.extractors.get('office')
                    else:
                        # For other document types, use text extractor as fallback
                        self.logger.warning(f"No specific extractor for {extension}, using text extractor")
                        return self.extractors.get('text')

                return self.extractors.get(file_type)

        self.logger.warning(f"No extractor found for extension {extension}, using text extractor as fallback")
        return self.extractors.get('text')

    def process_file(self, file_path: str) -> Dict[str, Any]:
        """
        Process a file to extract metadata (Stage 1)
        Returns metadata with nulls for LLM to fill (Stage 2)
        """
        self.logger.info(f"Processing file: {file_path}")

        # Check if file exists
        if not Path(file_path).exists():
            self.logger.error(f"File does not exist: {file_path}")
            # Create minimal error metadata
            return {
                "original_name": Path(file_path).name,
                "file_path": file_path,
                "hash": None,
                "file_type": "unknown",
                "basic_metadata": {},
                "extracted_content": {},
                "llm_enhanced": {},
                "processing_status": {
                    "python_processed": False,
                    "llm_processed": False,
                    "stage": "error",
                    "errors": [f"File does not exist: {file_path}"]
                }
            }

        # Get appropriate extractor
        extractor = self.get_extractor_for_file(file_path)

        if extractor is None:
            # For files with no extension or unsupported types, use TextExtractor as fallback
            self.logger.warning(f"No specific extractor for {file_path}, using text extractor as fallback")
            extractor = self.extractors.get('text')

        # Process with the appropriate extractor
        try:
            metadata = extractor.process(file_path)
        except Exception as e:
            self.logger.error(f"Error processing file {file_path}: {e}")
            # Create error metadata
            from extractors.text_extractor import TextExtractor
            text_extractor = TextExtractor()
            metadata = text_extractor.create_metadata_skeleton(file_path)
            metadata['processing_status']['errors'].append(str(e))
            metadata['processing_status']['stage'] = 'python_error'
            return metadata

        # Log extraction results
        self.logger.info(f"Extraction complete for {Path(file_path).name}")
        self.logger.info(f"  File type: {metadata['file_type']}")
        self.logger.info(f"  Has full_text: {metadata['extracted_content']['full_text'] is not None}")
        self.logger.info(f"  Stage: {metadata['processing_status']['stage']}")

        return metadata

    def save_metadata(self, metadata: Dict[str, Any], output_dir: str = None) -> str:
        """Save metadata to JSON file"""
        if output_dir is None:
            output_dir = config.index_path / "metadata" / config.get('output_subdir', 'stage1')
        else:
            output_dir = Path(output_dir)

        # Create subdirectory based on organization preference
        org_type = config.get('output_organization', 'month')
        now = datetime.now()

        if org_type == 'month':
            subdir = output_dir / now.strftime('%Y-%m')
        elif org_type == 'date':
            subdir = output_dir / now.strftime('%Y-%m-%d')
        elif org_type == 'year':
            subdir = output_dir / now.strftime('%Y')
        else:  # flat
            subdir = output_dir

        subdir.mkdir(parents=True, exist_ok=True)

        # Generate filename from original name
        original_name = Path(metadata['original_name']).stem
        stage = config.get('output_subdir', 'stage1')
        meta_filename = f"{original_name}.{stage}.json"
        meta_path = subdir / meta_filename

        # Save metadata
        with open(meta_path, 'w') as f:
            json.dump(metadata, f, indent=2, default=str)

        self.logger.info(f"Metadata saved to: {meta_path}")

        return str(meta_path)

    def check_if_processed(self, file_hash: str) -> bool:
        """Check if file has already been processed"""
        manifest_path = config.index_path / 'manifest.jsonl'
        if manifest_path.exists():
            with open(manifest_path, 'r') as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())
                        if entry.get('hash') == file_hash:
                            return True
                    except:
                        continue
        return False


def main():
    """Main function for testing"""
    import sys

    processor = MetadataProcessor()

    if len(sys.argv) > 1:
        file_path = sys.argv[1]

        # Process file
        metadata = processor.process_file(file_path)

        # Check for duplicates
        if processor.check_if_processed(metadata['hash']):
            print(f"⚠️ File already processed (hash: {metadata['hash'][:16]}...)")

        # Save metadata
        output_path = processor.save_metadata(metadata)

        # Display summary
        print(f"\n📊 Metadata Extraction Complete")
        print(f"  File: {metadata['original_name']}")
        print(f"  Type: {metadata['file_type']}")
        print(f"  Size: {metadata['basic_metadata']['size_bytes']} bytes")

        if metadata['extracted_content']['full_text']:
            text_len = len(metadata['extracted_content']['full_text'])
            print(f"  Full text extracted: {text_len} characters")
        else:
            print(f"  Full text: Not available (needs LLM processing)")

        print(f"  Status: {metadata['processing_status']['stage']}")
        print(f"  Saved to: {output_path}")

        if metadata['processing_status']['errors']:
            print(f"  ⚠️ Errors: {', '.join(metadata['processing_status']['errors'])}")
    else:
        print("Usage: python metadata_processor.py <file_path>")


if __name__ == "__main__":
    main()
