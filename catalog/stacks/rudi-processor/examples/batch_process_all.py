#!/usr/bin/env python3
"""
Batch process all files in RUDI directory using the new metadata processor
"""

import os
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from metadata_processor import MetadataProcessor
from stage2_processor import Stage2Processor

def batch_process():
    """Process all files in RUDI directory"""

    # Override with RUDI_BASE_DIR env var or edit path for your setup
    rudi_path = Path(os.environ.get("RUDI_BASE_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"))
    processor = MetadataProcessor()

    # Get all files
    files = []
    for item in rudi_path.iterdir():
        if item.is_file() and not item.name.startswith('.'):
            files.append(item)

    print(f"🚀 BATCH PROCESSING {len(files)} FILES")
    print("=" * 60)

    results = {
        'success': [],
        'errors': [],
        'total_text_extracted': 0
    }

    for i, file_path in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {file_path.name}")

        try:
            # Process file
            metadata = processor.process_file(str(file_path))

            # Save metadata
            output_path = processor.save_metadata(metadata)

            # Track results
            if metadata['processing_status'].get('errors'):
                results['errors'].append({
                    'file': file_path.name,
                    'errors': metadata['processing_status']['errors']
                })
                print(f"  ⚠️  Processed with errors: {metadata['processing_status']['errors'][0]}")
            else:
                results['success'].append(file_path.name)
                print(f"  ✅ Success - Stage: {metadata['processing_status']['stage']}")

            # Check if text was extracted
            if metadata['extracted_content'].get('full_text'):
                results['total_text_extracted'] += 1
                text_len = len(metadata['extracted_content']['full_text'])
                print(f"  📝 Text extracted: {text_len} characters")
            else:
                print(f"  📄 No text extracted (binary/complex file)")

            print(f"  💾 Saved to: {Path(output_path).name}")

        except Exception as e:
            results['errors'].append({
                'file': file_path.name,
                'errors': [str(e)]
            })
            print(f"  ❌ Failed: {e}")

    # Print summary
    print("\n" + "=" * 60)
    print("📊 BATCH PROCESSING SUMMARY")
    print("=" * 60)
    print(f"✅ Successfully processed: {len(results['success'])} files")
    print(f"📝 Text extracted from: {results['total_text_extracted']} files")
    print(f"⚠️  Errors encountered: {len(results['errors'])} files")

    if results['errors']:
        print("\n❌ Files with errors:")
        for error in results['errors']:
            print(f"  • {error['file']}: {error['errors'][0]}")

    index_dir = Path(os.environ.get("RUDI_INDEX_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index")))
    print(f"\n💾 All metadata saved to: {index_dir / 'metadata' / 'stage1'}")

    return results

if __name__ == "__main__":
    batch_process()
