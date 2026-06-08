#!/usr/bin/env python3
"""
RUDI Intelligent Processing - Responsible Use of Digital Intelligence
Smart file processing with renaming and categorization
"""

import sys
import os
import argparse
from pathlib import Path
import json

# Add parent directory to path for imports
script_dir = Path(__file__).parent.absolute()
parent_dir = script_dir.parent
sys.path.insert(0, str(parent_dir))

# Import from processors directory
from processors.intelligent_processor import IntelligentProcessor

def main():
    parser = argparse.ArgumentParser(
        description='RUDI - Responsible Use of Digital Intelligence\nIntelligently process, rename, and categorize files',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument('path', nargs='?',
                       default=os.environ.get("RUDI_BASE_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox")),
                       help='File or directory to process')
    parser.add_argument('--review', action='store_true',
                       help='Show files needing review')
    parser.add_argument('--dry-run', action='store_true',
                       help='Preview changes without processing')
    parser.add_argument('--confidence', type=float, default=0.7,
                       help='Minimum confidence threshold (0-1)')

    args = parser.parse_args()

    processor = IntelligentProcessor()
    path = Path(args.path)

    if path.is_file():
        # Process single file
        print(f"\n🤖 RUDI Processing: {path.name}")
        print("-" * 50)

        if args.dry_run:
            # Preview mode
            content = processor.extract_content_sample(str(path))
            category, subcategory, confidence = processor.classify_content(str(path), content)
            new_name = processor.generate_semantic_filename(str(path), category, subcategory, content)

            print(f"📁 Current: {path.name}")
            print(f"✨ Suggested: {new_name}")
            print(f"📂 Category: {category}/{subcategory}")
            print(f"📊 Confidence: {confidence:.1%}")

            if confidence < args.confidence:
                print(f"⚠️  Low confidence - needs review")
        else:
            # Actual processing
            result = processor.process_intelligently(str(path))

            if result.get('status') == 'duplicate':
                print(f"⏭️  Skipped: Duplicate file")
            elif result.get('status') == 'unsupported':
                print(f"❌ Unsupported file type")
            else:
                print(f"✅ Processed Successfully!")
                print(f"📁 Original: {result['original_name']}")
                print(f"✨ Renamed: {result['new_name']}")
                print(f"📂 Filed as: {result['category']}/{result['subcategory']}")
                print(f"📊 Confidence: {result['confidence']:.1%}")

                if result.get('needs_review'):
                    print(f"⚠️  Flagged for review (low confidence)")

                if result.get('summary'):
                    print(f"📝 Summary: {result['summary'][:100]}...")

    elif path.is_dir():
        # Process directory
        files = list(path.glob('*'))
        files = [f for f in files if f.is_file() and not f.name.startswith('.')]

        print(f"\n🤖 RUDI Batch Processing: {len(files)} files")
        print("=" * 50)

        results = {
            'processed': [],
            'duplicates': [],
            'unsupported': [],
            'needs_review': []
        }

        for file_path in files:
            print(f"\n📄 {file_path.name}")

            if args.dry_run:
                content = processor.extract_content_sample(str(file_path))
                category, subcategory, confidence = processor.classify_content(str(file_path), content)
                new_name = processor.generate_semantic_filename(str(file_path), category, subcategory, content)

                print(f"  → {new_name}")
                print(f"  📂 {category}/{subcategory} ({confidence:.0%})")

                if confidence < args.confidence:
                    results['needs_review'].append(file_path.name)
            else:
                result = processor.process_intelligently(str(file_path))

                if result.get('status') == 'duplicate':
                    print(f"  ⏭️  Duplicate")
                    results['duplicates'].append(file_path.name)
                elif result.get('status') == 'unsupported':
                    print(f"  ❌ Unsupported")
                    results['unsupported'].append(file_path.name)
                else:
                    print(f"  ✅ → {result['new_name']}")
                    print(f"  📂 {result['category']}/{result['subcategory']}")
                    results['processed'].append(result['new_name'])

                    if result.get('needs_review'):
                        results['needs_review'].append(result['new_name'])

        # Summary
        print("\n" + "=" * 50)
        print("📊 Processing Summary:")
        print(f"  ✅ Processed: {len(results['processed'])}")
        print(f"  ⏭️  Duplicates: {len(results['duplicates'])}")
        print(f"  ❌ Unsupported: {len(results['unsupported'])}")
        print(f"  ⚠️  Need Review: {len(results['needs_review'])}")

        if results['needs_review'] and not args.dry_run:
            print(f"\n⚠️  Files needing review:")
            for fname in results['needs_review']:
                print(f"  - {fname}")

    elif args.review:
        # Show files needing review
        manifest_path = Path(processor.config['index_path']) / 'manifest.jsonl'
        if manifest_path.exists():
            needs_review = []
            with open(manifest_path, 'r') as f:
                for line in f:
                    entry = json.loads(line.strip())
                    if entry.get('confidence', 1) < args.confidence:
                        needs_review.append(entry)

            if needs_review:
                print(f"\n⚠️  Files needing review (confidence < {args.confidence:.0%}):")
                for entry in needs_review:
                    print(f"\n📄 {entry.get('new_name', 'Unknown')}")
                    print(f"  Original: {Path(entry['original_file']).name}")
                    print(f"  Category: {entry['category']}")
                    print(f"  Confidence: {entry['confidence']:.1%}")
            else:
                print(f"✅ No files need review!")
    else:
        print(f"❌ Path not found: {path}")

if __name__ == "__main__":
    main()
