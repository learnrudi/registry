#!/usr/bin/env python3
"""
Enhance all Stage 1 files with LLM metadata including suggested filenames
"""

import json
import os
from pathlib import Path
from datetime import datetime

def generate_suggested_filename(data):
    """Generate a descriptive filename based on file content and metadata"""
    original_name = data.get('original_name', 'unknown')
    file_type = data.get('file_type', 'unknown')
    ext = data.get('basic_metadata', {}).get('extension', '')

    # Extract key information
    extracted = data.get('extracted_content', {})

    # Generate base name based on file type
    if file_type == 'documents':
        if 'W-9' in extracted.get('full_text', ''):
            base = 'w9_tax_form'
        elif 'AWS' in original_name:
            base = 'aws_legal_document'
        elif 'contract' in original_name.lower():
            base = 'contract_agreement'
        else:
            base = 'document'
    elif file_type == 'images':
        if extracted.get('camera_model'):
            base = f"{extracted['camera_model'].replace(' ', '_').lower()}_photo"
        else:
            base = 'image'
    elif file_type == 'video':
        duration = extracted.get('duration_seconds', 0)
        base = f"video_{int(duration)}sec"
    elif file_type == 'audio':
        duration = extracted.get('duration_seconds', 0)
        base = f"audio_{int(duration/60)}min"
    elif file_type == 'text':
        # Use first meaningful words from content
        text = extracted.get('full_text', '')
        if 'AI' in text and 'literacy' in text.lower():
            base = 'ai_literacy_document'
        elif 'terminal' in text.lower():
            base = 'terminal_instructions'
        elif 'agent' in text.lower():
            base = 'agent_instructions'
        else:
            base = 'text_document'
    else:
        base = file_type

    # Add date if available
    date_str = ""
    if 'date_taken' in extracted:
        date_str = "_" + extracted['date_taken'][:10].replace(':', '')
    elif 'created' in data.get('basic_metadata', {}):
        date_str = "_" + data['basic_metadata']['created'][:10].replace('-', '')

    return f"{base}{date_str}{ext}".lower()

def enhance_stage1_file(filepath):
    """Add LLM enhancement to a Stage 1 file"""
    with open(filepath, 'r') as f:
        data = json.load(f)

    # Skip if already enhanced
    if data.get('llm_enhanced', {}).get('summary'):
        return False

    # Generate enhancement
    original_name = data.get('original_name', 'unknown')
    file_type = data.get('file_type', 'unknown')
    extracted = data.get('extracted_content', {})

    # Create enhanced metadata
    enhancement = {
        "suggested_filename": generate_suggested_filename(data),
        "description": f"File type: {file_type}. Original name: {original_name}",
        "category": "uncategorized",
        "subcategory": "pending_analysis",
        "summary": f"File '{original_name}' of type {file_type} awaiting full LLM analysis",
        "topics": [file_type, "unprocessed"],
        "entities": {
            "original_name": original_name,
            "file_type": file_type
        },
        "searchable_keywords": [original_name.replace('.', ' ').replace('_', ' ').replace('-', ' ')],
        "confidence": 0.3,
        "needs_llm_processing": True
    }

    # Enhance based on file type
    if file_type == 'text' and extracted.get('full_text'):
        text = extracted['full_text'][:500]
        enhancement['description'] = f"Text document containing: {text[:100]}..."
        enhancement['category'] = 'documents'
        enhancement['subcategory'] = 'text_files'
        enhancement['confidence'] = 0.7

    elif file_type == 'images':
        enhancement['category'] = 'media'
        enhancement['subcategory'] = 'images'
        if extracted.get('camera_model'):
            enhancement['description'] = f"Photo taken with {extracted['camera_model']}"
            enhancement['entities']['device'] = extracted['camera_model']

    elif file_type == 'video':
        enhancement['category'] = 'media'
        enhancement['subcategory'] = 'videos'
        duration = extracted.get('duration_seconds', 0)
        enhancement['description'] = f"Video file, duration: {duration:.1f} seconds"

    elif file_type == 'documents':
        enhancement['category'] = 'documents'
        if '.pdf' in original_name.lower():
            enhancement['subcategory'] = 'pdf_files'
        elif '.docx' in original_name.lower():
            enhancement['subcategory'] = 'word_documents'

    # Update the data
    data['llm_enhanced'] = enhancement

    # Write back
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

    return True

def main():
    # Override with RUDI_STAGE1_DIR env var or edit path for your setup
    stage1_dir = Path(os.environ.get("RUDI_STAGE1_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index" / "metadata" / "stage1" / "2025-08"))

    print("🚀 Enhancing all Stage 1 files with LLM metadata...")
    print("=" * 60)

    files = list(stage1_dir.glob('*.stage1.json'))
    enhanced_count = 0

    for filepath in files:
        if enhance_stage1_file(filepath):
            enhanced_count += 1
            print(f"✅ Enhanced: {filepath.name}")
        else:
            print(f"⏭️  Skipped (already enhanced): {filepath.name}")

    print("\n" + "=" * 60)
    print(f"✨ Enhanced {enhanced_count}/{len(files)} files")
    print("🎯 All files now have suggested filenames and basic metadata!")

if __name__ == "__main__":
    main()
