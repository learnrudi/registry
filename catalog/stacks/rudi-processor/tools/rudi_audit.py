#!/usr/bin/env python3
"""
RUDI Audit - Check processing status of all files
Verifies which files have metadata and which don't
"""

import json
import os
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import sys

class RUDIAuditor:
    """Audit RUDI files and their metadata status"""

    def __init__(self):
        # Override with RUDI_BASE_DIR / RUDI_INDEX_DIR env vars
        self.rudi_path = Path(os.environ.get("RUDI_BASE_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"))
        self.index_path = Path(os.environ.get("RUDI_INDEX_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index"))
        self.manifest_path = self.index_path / "manifest.jsonl"
        self.metadata_path = self.index_path / "metadata"

    def get_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of a file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def load_manifest(self) -> Dict[str, Dict]:
        """Load all entries from manifest indexed by hash"""
        manifest_data = {}

        if self.manifest_path.exists():
            with open(self.manifest_path, 'r') as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())
                        file_hash = entry.get('hash')
                        if file_hash:
                            # Keep the most recent entry for each hash
                            if file_hash not in manifest_data:
                                manifest_data[file_hash] = entry
                            else:
                                # Compare timestamps and keep newer
                                existing_time = manifest_data[file_hash].get('processed_at', '')
                                new_time = entry.get('processed_at', '')
                                if new_time > existing_time:
                                    manifest_data[file_hash] = entry
                    except:
                        continue

        return manifest_data

    def check_metadata_exists(self, meta_path: str) -> bool:
        """Check if metadata file actually exists"""
        if meta_path:
            return Path(meta_path).exists()
        return False

    def get_metadata_info(self, meta_path: str) -> Optional[Dict]:
        """Load metadata from file if it exists"""
        if meta_path and Path(meta_path).exists():
            try:
                with open(meta_path, 'r') as f:
                    return json.load(f)
            except:
                pass
        return None

    def audit_files(self) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """
        Audit all files in RUDI
        Returns: (processed_files, unprocessed_files, missing_metadata_files)
        """
        processed = []
        unprocessed = []
        missing_metadata = []

        # Load manifest
        manifest = self.load_manifest()

        # Check all files in RUDI
        rudi_files = [f for f in self.rudi_path.iterdir()
                     if f.is_file() and not f.name.startswith('.')]

        print(f"\n🔍 Auditing {len(rudi_files)} files in RUDI...")

        for file_path in rudi_files:
            # Calculate hash
            file_hash = self.get_file_hash(file_path)

            # Check if in manifest
            if file_hash in manifest:
                entry = manifest[file_hash]
                meta_path = entry.get('meta_path')

                # Check if metadata file actually exists
                if self.check_metadata_exists(meta_path):
                    # Load metadata for additional info
                    metadata = self.get_metadata_info(meta_path)

                    # Get category from either manifest or metadata
                    category = entry.get('category')
                    if not category and metadata:
                        category = metadata.get('category')
                        if metadata.get('subcategory'):
                            category = f"{category}/{metadata.get('subcategory')}"
                    if not category:
                        category = 'Unknown'

                    processed.append({
                        'file': file_path.name,
                        'path': str(file_path),
                        'hash': file_hash[:16] + '...',
                        'meta_path': meta_path,
                        'processed_at': entry.get('processed_at', 'Unknown'),
                        'category': category,
                        'confidence': entry.get('confidence', metadata.get('confidence') if metadata else 0),
                        'new_name': entry.get('new_name', entry.get('suggested_name', metadata.get('new_name') if metadata else 'Unknown'))
                    })
                else:
                    # Manifest entry exists but metadata file is missing
                    missing_metadata.append({
                        'file': file_path.name,
                        'path': str(file_path),
                        'hash': file_hash[:16] + '...',
                        'expected_meta': meta_path,
                        'manifest_entry': entry.get('processed_at', 'Unknown')
                    })
            else:
                # Not in manifest at all
                unprocessed.append({
                    'file': file_path.name,
                    'path': str(file_path),
                    'hash': file_hash[:16] + '...',
                    'size': file_path.stat().st_size,
                    'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                })

        return processed, unprocessed, missing_metadata

    def print_report(self, processed: List[Dict], unprocessed: List[Dict],
                    missing: List[Dict], detailed: bool = False):
        """Print audit report"""
        total = len(processed) + len(unprocessed) + len(missing)

        print("\n" + "="*70)
        print("📊 RUDI AUDIT REPORT")
        print("="*70)

        # Summary
        print(f"\n📈 Summary:")
        print(f"  Total files in RUDI: {total}")
        print(f"  ✅ Fully processed: {len(processed)} ({len(processed)*100//total if total else 0}%)")
        print(f"  ❌ Not processed: {len(unprocessed)} ({len(unprocessed)*100//total if total else 0}%)")
        print(f"  ⚠️  Missing metadata: {len(missing)} ({len(missing)*100//total if total else 0}%)")

        # Processed files
        if processed:
            print(f"\n✅ PROCESSED FILES ({len(processed)}):")
            print("-" * 70)

            if detailed:
                for p in processed:
                    print(f"\n  📄 {p['file']}")
                    print(f"     Category: {p['category']}")
                    print(f"     New name: {p['new_name']}")
                    print(f"     Confidence: {p['confidence']:.0%}" if isinstance(p['confidence'], (int, float)) else f"     Confidence: {p['confidence']}")
                    print(f"     Processed: {p['processed_at'][:19] if p['processed_at'] != 'Unknown' else 'Unknown'}")
            else:
                # Compact view
                for p in sorted(processed, key=lambda x: x.get('category', 'Unknown')):
                    confidence = f"{p['confidence']:.0%}" if isinstance(p['confidence'], (int, float)) else str(p['confidence'])
                    category = p.get('category', 'Unknown')
                    print(f"  ✓ {p['file']:<40} → {category:<25} ({confidence})")

        # Unprocessed files
        if unprocessed:
            print(f"\n❌ UNPROCESSED FILES ({len(unprocessed)}):")
            print("-" * 70)
            for u in unprocessed:
                size_kb = u['size'] / 1024
                print(f"  ✗ {u['file']:<40} ({size_kb:.1f} KB)")

        # Missing metadata files
        if missing:
            print(f"\n⚠️  MISSING METADATA FILES ({len(missing)}):")
            print("-" * 70)
            for m in missing:
                print(f"  ! {m['file']:<40}")
                print(f"    Expected at: {m['expected_meta']}")

        # Recommendations
        if unprocessed or missing:
            print("\n💡 RECOMMENDATIONS:")
            print("-" * 70)

            if unprocessed:
                print(f"\n  To process unprocessed files:")
                stack_dir = os.environ.get("RUDI_STACK_DIR", str(Path(__file__).resolve().parents[1]))
                print(f"    cd {stack_dir}")
                print(f"    python3 tools/rudi_intelligent.py")

            if missing:
                print(f"\n  To fix missing metadata:")
                print(f"    # Reprocess files with missing metadata")
                print(f"    python3 tools/rudi_intelligent.py --reprocess")
        else:
            print("\n✨ All files are fully processed with metadata!")

    def export_audit(self, output_file: str = None):
        """Export audit results to JSON file"""
        if output_file is None:
            output_file = str(Path(os.environ.get("RUDI_INDEX_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index"))) / f"audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")

        processed, unprocessed, missing = self.audit_files()

        audit_data = {
            'audit_timestamp': datetime.now().isoformat(),
            'summary': {
                'total_files': len(processed) + len(unprocessed) + len(missing),
                'processed': len(processed),
                'unprocessed': len(unprocessed),
                'missing_metadata': len(missing)
            },
            'processed_files': processed,
            'unprocessed_files': unprocessed,
            'missing_metadata_files': missing
        }

        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(audit_data, f, indent=2)

        print(f"\n📁 Audit exported to: {output_path}")
        return output_path


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description='RUDI Audit - Check processing status of all files'
    )

    parser.add_argument('--detailed', '-d', action='store_true',
                       help='Show detailed information for each file')
    parser.add_argument('--export', '-e', action='store_true',
                       help='Export audit results to JSON')
    parser.add_argument('--output', '-o', type=str,
                       help='Output file for export (default: Index/audit_TIMESTAMP.json)')
    parser.add_argument('--unprocessed-only', action='store_true',
                       help='Only show unprocessed files')
    parser.add_argument('--stats-only', action='store_true',
                       help='Only show statistics')

    args = parser.parse_args()

    auditor = RUDIAuditor()

    # Perform audit
    processed, unprocessed, missing = auditor.audit_files()

    if args.stats_only:
        # Just show stats
        total = len(processed) + len(unprocessed) + len(missing)
        print(f"\n📊 Quick Stats:")
        print(f"  ✅ Processed: {len(processed)}/{total}")
        print(f"  ❌ Unprocessed: {len(unprocessed)}/{total}")
        print(f"  ⚠️  Missing: {len(missing)}/{total}")

    elif args.unprocessed_only:
        # Only show unprocessed
        if unprocessed:
            print(f"\n❌ Unprocessed files ({len(unprocessed)}):")
            for u in unprocessed:
                print(f"  {u['file']}")
        else:
            print("\n✅ All files are processed!")
    else:
        # Full report
        auditor.print_report(processed, unprocessed, missing, detailed=args.detailed)

    # Export if requested
    if args.export:
        auditor.export_audit(args.output)


if __name__ == "__main__":
    main()
