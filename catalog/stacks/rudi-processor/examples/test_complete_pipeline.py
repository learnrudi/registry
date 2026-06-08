#!/usr/bin/env python3
"""
Test Complete Pipeline: Stage 1 (Python Extraction) + Stage 2 (LLM Enhancement)
This demonstrates the full RUDI processing pipeline
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from metadata_processor import MetadataProcessor
from stage2_processor import Stage2Processor


def test_complete_pipeline():
    """Test the complete Stage 1 + Stage 2 pipeline"""
    print("\n" + "="*60)
    print("🚀 TESTING COMPLETE RUDI PIPELINE")
    print("Stage 1: Python Extraction → Stage 2: LLM Enhancement")
    print("="*60)

    # Initialize processors
    print("\n📦 Initializing processors...")
    stage1_processor = MetadataProcessor()
    stage2_processor = Stage2Processor()

    # Show available LLM providers
    providers = stage2_processor.get_available_providers()
    print(f"✅ Stage 1: Python extractors ready")
    print(f"✅ Stage 2: {len(providers)} LLM providers available: {', '.join(providers)}")

    # Find test files in RUDI directory
    rudi_path = Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"
    test_files = []

    # Look for different file types
    file_patterns = {
        'PDF': '*.pdf',
        'Image': '*.png',
        'HEIC': '*.HEIC',
        'Text': '*.txt',
        'CSV': '*.csv',
        'Audio': '*.m4a'
    }

    print(f"\n🔍 Looking for test files in {rudi_path}...")
    for file_type, pattern in file_patterns.items():
        files = list(rudi_path.glob(pattern))[:1]  # Get first file of each type
        if files:
            test_files.append((file_type, files[0]))
            print(f"  Found {file_type}: {files[0].name}")

    if not test_files:
        print("❌ No test files found in RUDI directory")
        return

    # Process each test file
    results = []
    for file_type, file_path in test_files[:3]:  # Limit to 3 files for demo
        print(f"\n{'='*60}")
        print(f"📄 Processing: {file_path.name}")
        print(f"   Type: {file_type}")
        print(f"   Size: {file_path.stat().st_size:,} bytes")

        # Stage 1: Python Extraction
        print("\n⚙️  Stage 1: Python Extraction...")
        stage1_start = datetime.now()

        try:
            stage1_metadata = stage1_processor.process_file(str(file_path))
            stage1_time = (datetime.now() - stage1_start).total_seconds()

            # Save Stage 1 output
            stage1_output = stage1_processor.save_metadata(stage1_metadata)

            print(f"   ✅ Extraction complete in {stage1_time:.2f}s")
            print(f"   📊 Metadata fields: {len(stage1_metadata)}")

            # Show extracted content preview
            extracted = stage1_metadata.get('extracted_content', {})
            if extracted.get('full_text'):
                text_len = len(extracted['full_text'])
                print(f"   📝 Extracted text: {text_len:,} characters")
                preview = extracted['full_text'][:100].replace('\n', ' ')
                print(f"   Preview: {preview}...")
            elif extracted.get('ocr_text'):
                text_len = len(extracted['ocr_text'])
                print(f"   🔍 OCR text: {text_len:,} characters")
            else:
                print(f"   ℹ️  No text content extracted")

            # Stage 2: LLM Enhancement (if text available)
            if extracted.get('full_text') or extracted.get('ocr_text'):
                print("\n🤖 Stage 2: LLM Enhancement...")

                # Select provider based on file type
                if file_type == 'Image' or file_type == 'HEIC':
                    provider = 'google' if 'google' in providers else providers[0]
                    print(f"   Using {provider} (best for images)")
                elif file_type == 'Audio':
                    provider = 'openai' if 'openai' in providers else providers[0]
                    print(f"   Using {provider} (has Whisper)")
                else:
                    provider = 'deepseek' if 'deepseek' in providers else providers[0]
                    print(f"   Using {provider} (cost-optimized)")

                stage2_start = datetime.now()

                try:
                    # Process with selected provider
                    stage2_result = stage2_processor.process_with_provider(
                        stage1_metadata, provider
                    )
                    stage2_time = (datetime.now() - stage2_start).total_seconds()

                    if stage2_result and not stage2_result.get('error'):
                        print(f"   ✅ Enhancement complete in {stage2_time:.2f}s")

                        # Show LLM results
                        if stage2_result.get('categorization'):
                            cat = stage2_result['categorization']
                            if cat.get('content'):
                                print(f"   📂 Category analysis received")

                        if stage2_result.get('summary'):
                            summ = stage2_result['summary']
                            if summ.get('content'):
                                print(f"   📋 Summary generated")

                        if stage2_result.get('entities'):
                            ent = stage2_result['entities']
                            if ent.get('content'):
                                print(f"   🏷️  Entities extracted")

                        # Combine results
                        complete_metadata = stage2_processor._format_stage2_result(
                            stage1_metadata, stage2_result
                        )

                        # Save complete metadata
                        output_path = stage2_processor._get_output_path(stage1_output)
                        with open(output_path, 'w') as f:
                            json.dump(complete_metadata, f, indent=2, default=str)

                        print(f"   💾 Saved to: {output_path.name}")

                        results.append({
                            'file': file_path.name,
                            'type': file_type,
                            'stage1_time': stage1_time,
                            'stage2_time': stage2_time,
                            'total_time': stage1_time + stage2_time,
                            'provider': provider,
                            'success': True
                        })
                    else:
                        print(f"   ⚠️ Enhancement failed: {stage2_result.get('error', 'Unknown')}")
                        results.append({
                            'file': file_path.name,
                            'type': file_type,
                            'stage1_time': stage1_time,
                            'stage2_time': 0,
                            'total_time': stage1_time,
                            'provider': provider,
                            'success': False
                        })

                except Exception as e:
                    print(f"   ❌ Stage 2 error: {e}")
            else:
                print("\n   ℹ️ Skipping Stage 2 (no text content)")
                results.append({
                    'file': file_path.name,
                    'type': file_type,
                    'stage1_time': stage1_time,
                    'stage2_time': 0,
                    'total_time': stage1_time,
                    'provider': None,
                    'success': True
                })

        except Exception as e:
            print(f"   ❌ Stage 1 error: {e}")
            results.append({
                'file': file_path.name,
                'type': file_type,
                'stage1_time': 0,
                'stage2_time': 0,
                'total_time': 0,
                'provider': None,
                'success': False
            })

    # Summary
    print(f"\n{'='*60}")
    print("📊 PIPELINE TEST SUMMARY")
    print("="*60)

    if results:
        successful = sum(1 for r in results if r['success'])
        print(f"\n✅ Successfully processed: {successful}/{len(results)} files")

        print("\n📈 Performance Metrics:")
        for result in results:
            status = "✅" if result['success'] else "❌"
            print(f"\n{status} {result['file']}")
            print(f"   Type: {result['type']}")
            print(f"   Stage 1: {result['stage1_time']:.2f}s")
            if result['stage2_time'] > 0:
                print(f"   Stage 2: {result['stage2_time']:.2f}s ({result['provider']})")
            print(f"   Total: {result['total_time']:.2f}s")

        # Cost estimate (rough)
        total_tokens = sum(r.get('stage2_time', 0) * 1000 for r in results)  # Rough estimate
        if 'deepseek' in providers:
            cost = total_tokens * 0.00000027  # DeepSeek pricing
            print(f"\n💰 Estimated cost: ${cost:.4f} (using DeepSeek)")

    print("\n✨ Pipeline test complete!")
    print("\nNext steps:")
    print("1. Check metadata in: ~/.rudi/workspaces/rudi-processor/index/metadata/")
    print("2. Run batch processing: python3 examples/batch_process_all.py")
    print("3. Enable watcher: python3 tools/rudi_watcher.py")

    return results


if __name__ == "__main__":
    test_complete_pipeline()
