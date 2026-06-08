#!/usr/bin/env python3
"""
Full batch processor for RUDI files - Stage 1 + Stage 2
Processes all files in RUDI directory with complete extraction and LLM enhancement
"""

import os
import sys
import time
from pathlib import Path
from datetime import datetime

from metadata_processor import MetadataProcessor
from stage2_processor import Stage2Processor

class BatchProcessor:
    """Batch processor for RUDI files with configurable options"""

    def __init__(self, input_directory=None, use_smart_routing=True):
        self.input_directory = input_directory or os.environ.get("RUDI_BASE_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"))
        self.use_smart_routing = use_smart_routing
        self.stage1 = MetadataProcessor()
        self.stage2 = Stage2Processor()

    def process_all(self):
        """Process all files in the directory"""
        return batch_process_full(self.input_directory, self.use_smart_routing)

def batch_process_full(input_directory=None, use_smart_routing=True):
    """Process all files with both Stage 1 and Stage 2

    Args:
        input_directory: Directory to process (default: RUDI)
        use_smart_routing: Whether to use smart routing for providers
    """

    print("\n" + "="*80)
    print("🚀 RUDI FULL BATCH PROCESSOR - STAGE 1 + STAGE 2")
    print("="*80)
    print(f"📅 Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Initialize processors
    stage1 = MetadataProcessor()
    stage2 = Stage2Processor()

    # Get input path
    rudi_path = Path(input_directory or os.environ.get("RUDI_BASE_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox")))

    # Get all files
    files = []
    for item in rudi_path.iterdir():
        if item.is_file() and not item.name.startswith('.'):
            files.append(item)

    files.sort()  # Sort for consistent ordering

    print(f"\n📁 Found {len(files)} files in RUDI directory")
    print(f"🤖 Available LLM providers: {', '.join(stage2.get_available_providers())}")
    print("\n" + "-"*80)

    # Track statistics
    stats = {
        'total_files': len(files),
        'stage1_success': 0,
        'stage2_success': 0,
        'vision_processed': 0,
        'text_extracted': 0,
        'errors': [],
        'by_type': {},
        'total_time': 0,
        'total_cost': 0
    }

    start_time = time.time()

    # Process each file
    for i, file_path in enumerate(files, 1):
        file_start = time.time()
        print(f"\n[{i}/{len(files)}] 📄 {file_path.name}")
        print(f"       Size: {file_path.stat().st_size:,} bytes")

        try:
            # Stage 1: Python extraction
            print("       ⚙️  Stage 1: Extracting...")
            metadata = stage1.process_file(str(file_path))

            # Save Stage 1 metadata
            stage1_path = stage1.save_metadata(metadata)
            stats['stage1_success'] += 1

            # Track file type
            file_type = metadata.get('file_type', 'unknown')
            stats['by_type'][file_type] = stats['by_type'].get(file_type, 0) + 1

            # Check what was extracted
            has_text = bool(metadata['extracted_content'].get('full_text'))
            has_ocr = bool(metadata['extracted_content'].get('ocr_text'))
            needs_vision = metadata['extracted_content'].get('needs_visual_analysis', False)

            if has_text:
                text_len = len(metadata['extracted_content']['full_text'])
                print(f"       📝 Text: {text_len:,} characters")
                stats['text_extracted'] += 1
            elif has_ocr:
                ocr_len = len(metadata['extracted_content']['ocr_text'])
                print(f"       👁️  OCR: {ocr_len:,} characters")

            # Stage 2: LLM enhancement
            if has_text or has_ocr or needs_vision:
                print("       🤖 Stage 2: Enhancing with LLM...")

                # Process with Stage 2
                enhanced = stage2.process_metadata(metadata)

                if enhanced and not enhanced.get('error'):
                    # Update metadata with LLM enhancements
                    metadata['llm_enhanced'] = enhanced
                    metadata['processing_status']['llm_processed'] = True
                    metadata['processing_status']['stage'] = 'completed'
                    metadata['processing_status']['llm_provider'] = enhanced.get('provider')
                    metadata['processing_status']['llm_timestamp'] = enhanced.get('timestamp')

                    # Save enhanced metadata
                    stage2_path = stage2.save_enhanced_metadata(metadata)
                    stats['stage2_success'] += 1

                    # Track vision processing
                    if needs_vision and enhanced.get('vision_analysis'):
                        stats['vision_processed'] += 1
                        print(f"       🎨 Vision analysis completed")

                    print(f"       ✅ Enhanced with {enhanced.get('provider')}")
                else:
                    print(f"       ⚠️  Stage 2 skipped: {enhanced.get('error', 'No enhancement needed')}")
            else:
                print("       ℹ️  No content to enhance")

            # Calculate time
            file_time = time.time() - file_start
            print(f"       ⏱️  Processed in {file_time:.2f}s")

        except Exception as e:
            print(f"       ❌ Error: {str(e)}")
            stats['errors'].append({
                'file': file_path.name,
                'error': str(e)
            })

    # Calculate totals
    stats['total_time'] = time.time() - start_time

    # Print summary
    print("\n" + "="*80)
    print("📊 BATCH PROCESSING COMPLETE")
    print("="*80)

    print(f"\n📈 Results:")
    print(f"   • Total files: {stats['total_files']}")
    print(f"   • Stage 1 successful: {stats['stage1_success']}")
    print(f"   • Stage 2 successful: {stats['stage2_success']}")
    print(f"   • Vision analyzed: {stats['vision_processed']}")
    print(f"   • Text extracted: {stats['text_extracted']}")
    print(f"   • Errors: {len(stats['errors'])}")

    print(f"\n📁 By file type:")
    for ftype, count in sorted(stats['by_type'].items()):
        print(f"   • {ftype}: {count} files")

    if stats['errors']:
        print(f"\n⚠️  Files with errors:")
        for error in stats['errors'][:5]:  # Show first 5 errors
            print(f"   • {error['file']}: {error['error'][:50]}...")

    print(f"\n⏱️  Total time: {stats['total_time']:.2f} seconds")
    print(f"📍 Metadata saved to: ~/.rudi/workspaces/rudi-processor/index/metadata/")
    print(f"📅 Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    return stats

if __name__ == "__main__":
    batch_process_full()
