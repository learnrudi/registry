#!/usr/bin/env python3
"""
Batch test Stage 1 processing on all files in RUDI
Tests the metadata extraction for different file types
"""

import os
import json
from pathlib import Path
from metadata_processor import MetadataProcessor
from datetime import datetime


def test_all_files():
    """Process all files in RUDI with Stage 1"""
    # Override with RUDI_BASE_DIR env var or edit path for your setup
    rudi_path = Path(os.environ.get("RUDI_BASE_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"))
    processor = MetadataProcessor()

    # Get all files
    files = [f for f in rudi_path.iterdir() if f.is_file() and not f.name.startswith('.')]

    print(f"\n{'='*60}")
    print(f"STAGE 1 BATCH TEST - {len(files)} files")
    print(f"{'='*60}\n")

    results = {
        'text': [],
        'pdf': [],
        'images': [],
        'video': [],
        'audio': [],
        'csv': [],
        'json': [],
        'docx': [],
        'unsupported': [],
        'errors': []
    }

    for file_path in sorted(files):
        print(f"Processing: {file_path.name}")

        try:
            # Process file
            metadata = processor.process_file(str(file_path))

            # Categorize results
            ext = file_path.suffix.lower()
            file_info = {
                'name': file_path.name,
                'extension': ext,
                'size': metadata['basic_metadata']['size_bytes'],
                'has_full_text': metadata['extracted_content']['full_text'] is not None,
                'stage': metadata['processing_status']['stage']
            }

            # Add type-specific info
            if ext in ['.txt', '.md']:
                file_info['text_length'] = len(metadata['extracted_content']['full_text']) if metadata['extracted_content']['full_text'] else 0
                results['text'].append(file_info)

            elif ext == '.pdf':
                file_info['page_count'] = metadata['extracted_content'].get('page_count')
                file_info['has_text'] = metadata['extracted_content']['full_text'] is not None
                results['pdf'].append(file_info)

            elif ext in ['.png', '.jpg', '.jpeg', '.heic']:
                file_info['dimensions'] = metadata['extracted_content'].get('dimensions')
                file_info['has_ocr'] = metadata['extracted_content'].get('ocr_text') is not None
                results['images'].append(file_info)

            elif ext in ['.mp4', '.mov', '.avi']:
                file_info['duration'] = metadata['extracted_content'].get('duration_seconds')
                file_info['resolution'] = metadata['extracted_content'].get('dimensions')
                results['video'].append(file_info)

            elif ext in ['.mp3', '.m4a', '.wav']:
                file_info['duration'] = metadata['extracted_content'].get('duration_seconds')
                file_info['bitrate'] = metadata['extracted_content'].get('bitrate')
                results['audio'].append(file_info)

            elif ext == '.csv':
                file_info['row_count'] = metadata['extracted_content'].get('row_count')
                results['csv'].append(file_info)

            elif ext == '.json':
                file_info['valid_json'] = metadata['extracted_content'].get('is_valid_json')
                results['json'].append(file_info)

            elif ext in ['.docx', '.xlsx']:
                results['docx'].append(file_info)

            else:
                results['unsupported'].append(file_info)

            # Save metadata
            output_path = processor.save_metadata(metadata)
            print(f"  ✓ Saved: {Path(output_path).name}")

        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
            results['errors'].append({
                'name': file_path.name,
                'error': str(e)
            })

    # Print summary
    print(f"\n{'='*60}")
    print("RESULTS SUMMARY")
    print(f"{'='*60}")

    print(f"\n📄 TEXT FILES ({len(results['text'])} files)")
    for f in results['text']:
        print(f"  • {f['name']}: {f['text_length']} chars extracted")

    print(f"\n📑 PDF FILES ({len(results['pdf'])} files)")
    for f in results['pdf']:
        status = "✓ Text extracted" if f['has_text'] else "✗ No text"
        print(f"  • {f['name']}: {f.get('page_count', '?')} pages, {status}")

    print(f"\n🖼️ IMAGE FILES ({len(results['images'])} files)")
    for f in results['images']:
        dims = f.get('dimensions')
        if dims:
            print(f"  • {f['name']}: {dims['width']}x{dims['height']}, OCR: {f['has_ocr']}")
        else:
            print(f"  • {f['name']}: No dimensions extracted")

    print(f"\n🎥 VIDEO FILES ({len(results['video'])} files)")
    for f in results['video']:
        dur = f.get('duration', 0)
        res = f.get('resolution')
        if res:
            print(f"  • {f['name']}: {dur:.1f}s, {res['width']}x{res['height']}")
        else:
            print(f"  • {f['name']}: {dur:.1f}s")

    print(f"\n🎵 AUDIO FILES ({len(results['audio'])} files)")
    for f in results['audio']:
        dur = f.get('duration', 0)
        print(f"  • {f['name']}: {dur:.1f}s, {f.get('bitrate', 'N/A')} bps")

    print(f"\n📊 CSV FILES ({len(results['csv'])} files)")
    for f in results['csv']:
        print(f"  • {f['name']}: {f.get('row_count', '?')} rows, Text: {f['has_full_text']}")

    print(f"\n📋 JSON FILES ({len(results['json'])} files)")
    for f in results['json']:
        print(f"  • {f['name']}: Valid: {f.get('valid_json', '?')}, Text: {f['has_full_text']}")

    print(f"\n📝 OFFICE FILES ({len(results['docx'])} files)")
    for f in results['docx']:
        print(f"  • {f['name']}: Stage: {f['stage']}")

    if results['unsupported']:
        print(f"\n❌ UNSUPPORTED ({len(results['unsupported'])} files)")
        for f in results['unsupported']:
            print(f"  • {f['name']} ({f['extension']})")

    if results['errors']:
        print(f"\n⚠️ ERRORS ({len(results['errors'])} files)")
        for f in results['errors']:
            print(f"  • {f['name']}: {f['error']}")

    # Summary stats
    total_processed = sum(len(v) for k, v in results.items() if k != 'errors')
    with_text = sum(1 for k, v in results.items() for f in v if isinstance(f, dict) and f.get('has_full_text'))

    print(f"\n{'='*60}")
    print("STATISTICS")
    print(f"{'='*60}")
    print(f"Total files: {len(files)}")
    print(f"Successfully processed: {total_processed}")
    print(f"Files with extracted text: {with_text}")
    print(f"Files needing LLM processing: {total_processed - with_text}")
    print(f"Errors: {len(results['errors'])}")


if __name__ == "__main__":
    test_all_files()
