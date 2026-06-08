#!/usr/bin/env python3
"""
RUDI Intelligent Processor - Responsible Use of Digital Intelligence
Implements smart file naming, categorization, and metadata generation
"""

import os
import re
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import logging

class IntelligentProcessor:
    """Process files with intelligence - rename, categorize, and generate rich metadata"""

    def __init__(self, config_path: str = None):
        self.config = self._load_config(config_path)
        self.setup_logging()
        self.categories = self._load_categories()

    def _load_config(self, config_path: str = None) -> Dict:
        """Load configuration from JSON file"""
        if config_path is None:
            # Fix path to use tools directory
            config_path = Path(os.environ.get("RUDI_TOOLS_DIR", str(Path(__file__).resolve().parents[1]))) / "config" / "rudi-config.json"

        with open(config_path, 'r') as f:
            return json.load(f)

    def _load_categories(self) -> Dict:
        """Define category structure"""
        return {
            "Education": ["AI-Literacy", "Curriculum", "Research", "Training"],
            "Professional": ["RealEstate", "PropertyScope", "Projects", "Consulting"],
            "Creative": ["Writing", "Media", "Ideas", "Design"],
            "Technical": ["Code", "Documentation", "Architecture", "DevOps"],
            "Personal": ["Notes", "Voice-Memos", "Reflections", "Journal"],
            "Resources": ["References", "Templates", "Examples", "Guides"]
        }

    def setup_logging(self):
        """Setup logging configuration"""
        log_dir = Path(self.config.get('index_path', os.environ.get("RUDI_INDEX_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index")))) / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)

        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_dir / f'intelligent_{datetime.now().strftime("%Y%m%d")}.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)

    def calculate_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash - do this early for efficiency"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def extract_content_sample(self, file_path: str, max_chars: int = 1000) -> Optional[str]:
        """Extract sample content for classification - efficiency first"""
        ext = Path(file_path).suffix.lower()

        if ext in ['.txt', '.md', '.json', '.yaml', '.yml', '.csv']:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return f.read(max_chars)
            except:
                return None

        # TODO: Add PDF, DOCX sampling
        return None

    def classify_content(self, file_path: str, content_sample: Optional[str]) -> Tuple[str, str, float]:
        """
        Classify content into category/subcategory with confidence
        Returns: (category, subcategory, confidence)
        """
        filename = Path(file_path).name.lower()
        ext = Path(file_path).suffix.lower()

        # Pattern matching for classification
        patterns = {
            "Education": {
                "keywords": ["curriculum", "lesson", "teaching", "education", "literacy", "learning"],
                "AI-Literacy": ["ai", "artificial intelligence", "machine learning", "chatgpt", "claude"],
                "Curriculum": ["syllabus", "course", "module", "assignment"],
            },
            "Technical": {
                "keywords": ["code", "function", "class", "api", "database", "server"],
                "Code": [".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".cpp"],
                "Documentation": ["readme", "docs", "documentation", "guide", "tutorial"],
            },
            "Professional": {
                "keywords": ["property", "real estate", "business", "project", "client"],
                "RealEstate": ["property", "listing", "mls", "broker", "tenant"],
                "PropertyScope": ["propertyscope", "scope", "analysis"],
            },
            "Creative": {
                "keywords": ["story", "article", "blog", "creative", "design", "media"],
                "Writing": ["draft", "essay", "post", "article", "story"],
                "Media": ["video", "audio", "image", "podcast", "youtube"],
            },
            "Personal": {
                "keywords": ["personal", "note", "thoughts", "journal", "memo"],
                "Notes": ["note", "notes", "thoughts", "ideas"],
                "Voice-Memos": ["recording", "audio", "voice", "memo"],
            }
        }

        scores = {}

        # Check filename and content against patterns
        for category, subcats in patterns.items():
            score = 0
            matched_subcat = "General"

            # Check main keywords
            for keyword in subcats.get("keywords", []):
                if keyword in filename:
                    score += 2
                if content_sample and keyword in content_sample.lower():
                    score += 1

            # Check subcategory patterns
            for subcat, subcat_patterns in subcats.items():
                if subcat == "keywords":
                    continue
                for pattern in subcat_patterns:
                    if pattern in filename or ext == pattern:
                        score += 3
                        matched_subcat = subcat
                    if content_sample and pattern in content_sample.lower():
                        score += 2
                        matched_subcat = subcat

            if score > 0:
                scores[category] = (score, matched_subcat)

        # Find best match
        if scores:
            best_category = max(scores, key=lambda k: scores[k][0])
            confidence = min(scores[best_category][0] / 10, 1.0)  # Normalize confidence
            return best_category, scores[best_category][1], confidence

        # Default fallback
        return "Resources", "General", 0.3

    def generate_semantic_filename(self, file_path: str, category: str, subcategory: str,
                                  content_sample: Optional[str]) -> str:
        """
        Generate intelligent filename: YYYY-MM-DD-category-descriptive-title.ext
        """
        original_path = Path(file_path)
        ext = original_path.suffix.lower()
        original_name = original_path.stem

        # Date prefix
        date_prefix = datetime.now().strftime("%Y-%m-%d")

        # Category part (lowercase, hyphenated)
        category_part = category.lower().replace(" ", "-")

        # Generate descriptive title
        descriptive_parts = []

        # Clean up original filename
        clean_name = re.sub(r'[_\-\s]+', ' ', original_name)
        clean_name = re.sub(r'\d{4,}', '', clean_name)  # Remove long numbers
        clean_name = re.sub(r'(IMG|DSC|PHOTO|FILE|SCAN|DOC)', '', clean_name, flags=re.IGNORECASE)
        clean_name = clean_name.strip()

        if clean_name and len(clean_name) > 3:
            descriptive_parts.append(clean_name)

        # Add subcategory if meaningful
        if subcategory != "General":
            descriptive_parts.append(subcategory.lower())

        # Extract key terms from content
        if content_sample:
            # Look for title-like content
            lines = content_sample.split('\n')
            for line in lines[:5]:  # Check first 5 lines
                line = line.strip()
                if line.startswith('#'):  # Markdown header
                    title = line.lstrip('#').strip()[:30]
                    if title:
                        descriptive_parts.append(title)
                        break

        # Combine parts
        if descriptive_parts:
            description = '-'.join(descriptive_parts[:3])  # Limit to 3 parts
        else:
            description = f"{subcategory.lower()}-file"

        # Clean up description
        description = re.sub(r'[^a-z0-9\-]', '-', description.lower())
        description = re.sub(r'-+', '-', description)
        description = description.strip('-')[:50]  # Limit length

        # Combine all parts
        new_filename = f"{date_prefix}-{category_part}-{description}{ext}"

        return new_filename

    def generate_rich_metadata(self, file_path: str, content_sample: Optional[str],
                              category: str, subcategory: str, confidence: float,
                              new_filename: str) -> Dict[str, Any]:
        """Generate comprehensive metadata following agent instructions"""
        path = Path(file_path)
        stat = path.stat()

        metadata = {
            # File info
            "original_name": path.name,
            "new_name": new_filename,
            "path": str(path.absolute()),
            "hash": self.calculate_hash(file_path),

            # Classification
            "category": category,
            "subcategory": subcategory,
            "confidence": round(confidence, 2),

            # Timestamps
            "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "processed_at": datetime.now().isoformat(),

            # File details
            "size_bytes": stat.st_size,
            "extension": path.suffix.lower(),

            # Content analysis
            "has_content": content_sample is not None,
            "content_preview": content_sample[:500] if content_sample else None,

            # Processing info
            "processed_by": "RUDI-intelligent-v1",
            "needs_review": confidence < 0.7
        }

        # Generate summary based on content
        if content_sample:
            # Simple summary extraction
            first_line = content_sample.split('\n')[0][:100]
            metadata["summary"] = f"{category}/{subcategory}: {first_line}"

            # Extract topics (simple keyword extraction)
            topics = []
            topic_keywords = ["ai", "education", "data", "policy", "technology", "research",
                            "development", "analysis", "system", "design", "management"]
            for keyword in topic_keywords:
                if keyword in content_sample.lower():
                    topics.append(keyword)
            if topics:
                metadata["topics"] = topics[:5]  # Limit to 5 topics

        return metadata

    def process_intelligently(self, file_path: str) -> Dict[str, Any]:
        """
        Main intelligent processing pipeline following agent instructions
        Efficient order: type → hash → metadata → content → classify → rename
        """
        self.logger.info(f"Intelligently processing: {file_path}")

        # 1. Quick type check
        ext = Path(file_path).suffix.lower()
        if not self._is_supported_type(ext):
            self.logger.warning(f"Unsupported file type: {ext}")
            return {"status": "unsupported", "file": file_path}

        # 2. Calculate hash (for deduplication)
        file_hash = self.calculate_hash(file_path)
        if self._is_duplicate(file_hash):
            self.logger.info(f"Duplicate file detected: {file_hash[:16]}...")
            return {"status": "duplicate", "hash": file_hash}

        # 3. Extract content sample (efficient - only what's needed)
        content_sample = self.extract_content_sample(file_path)

        # 4. Classify content
        category, subcategory, confidence = self.classify_content(file_path, content_sample)
        self.logger.info(f"Classification: {category}/{subcategory} (confidence: {confidence:.2f})")

        # 5. Generate semantic filename
        new_filename = self.generate_semantic_filename(file_path, category, subcategory, content_sample)
        self.logger.info(f"New filename: {new_filename}")

        # 6. Generate rich metadata
        metadata = self.generate_rich_metadata(
            file_path, content_sample, category, subcategory, confidence, new_filename
        )

        # 7. Save metadata
        self.save_metadata(metadata)

        # 8. Log if needs review
        if metadata["needs_review"]:
            self.logger.warning(f"Low confidence ({confidence:.2f}) - needs human review")

        return metadata

    def _is_supported_type(self, ext: str) -> bool:
        """Check if file type is supported"""
        for category in self.config['supported_extensions'].values():
            if ext in category:
                return True
        return False

    def _is_duplicate(self, file_hash: str) -> bool:
        """Check if file has been processed before"""
        manifest_path = Path(self.config['index_path']) / 'manifest.jsonl'
        if manifest_path.exists():
            with open(manifest_path, 'r') as f:
                for line in f:
                    entry = json.loads(line.strip())
                    if entry.get('hash') == file_hash:
                        return True
        return False

    def save_metadata(self, metadata: Dict[str, Any]):
        """Save metadata and update manifest"""
        # Create metadata directory
        index_path = Path(self.config['index_path'])
        metadata_dir = index_path / 'metadata' / datetime.now().strftime('%Y-%m')
        metadata_dir.mkdir(parents=True, exist_ok=True)

        # Save metadata file
        meta_filename = f"{Path(metadata['new_name']).stem}.meta.json"
        meta_path = metadata_dir / meta_filename

        with open(meta_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        # Update manifest
        manifest_path = index_path / 'manifest.jsonl'
        manifest_entry = {
            "original_file": metadata['path'],
            "new_name": metadata['new_name'],
            "category": f"{metadata['category']}/{metadata['subcategory']}",
            "meta_path": str(meta_path),
            "hash": metadata['hash'],
            "confidence": metadata['confidence'],
            "processed_at": metadata['processed_at']
        }

        with open(manifest_path, 'a') as f:
            f.write(json.dumps(manifest_entry) + '\n')

        self.logger.info(f"Metadata saved to: {meta_path}")


if __name__ == "__main__":
    # Test the intelligent processor
    import sys

    processor = IntelligentProcessor()

    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        result = processor.process_intelligently(file_path)

        print(f"\n📊 Processing Result:")
        print(f"  Original: {result.get('original_name', 'N/A')}")
        print(f"  New Name: {result.get('new_name', 'N/A')}")
        print(f"  Category: {result.get('category', 'N/A')}/{result.get('subcategory', 'N/A')}")
        print(f"  Confidence: {result.get('confidence', 0):.2%}")
        if result.get('needs_review'):
            print(f"  ⚠️ Needs Review: Low confidence")
    else:
        print("Usage: python intelligent_processor.py <file_path>")
