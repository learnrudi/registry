#!/usr/bin/env python3
"""
Stage 2 LLM Processing Pipeline
Enhances Stage 1 metadata with AI-powered analysis
"""
import os
import sys
import json
import time
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))

from config import config
from llm_providers import (
    AnthropicProvider,
    OpenAIProvider,
    GeminiProvider,
    DeepSeekProvider
)


class Stage2Processor:
    """Stage 2 LLM processing coordinator"""

    def __init__(self, llm_config_path: str = None):
        """Initialize Stage 2 processor with LLM configuration"""
        self.logger = self._setup_logging()
        self.llm_config = self._load_llm_config(llm_config_path)
        self.providers = self._initialize_providers()
        self.primary_provider = self.llm_config['stage2_settings']['primary_provider']
        self.fallback_providers = self.llm_config['stage2_settings']['fallback_providers']

    def _setup_logging(self) -> logging.Logger:
        """Setup logging for Stage 2 processing"""
        logger = logging.getLogger('stage2_processor')
        logger.setLevel(logging.INFO)

        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)

        # File handler
        log_dir = config.index_path / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(
            log_dir / f"stage2_{datetime.now().strftime('%Y%m%d')}.log"
        )
        file_handler.setLevel(logging.DEBUG)

        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(formatter)
        file_handler.setFormatter(formatter)

        logger.addHandler(console_handler)
        logger.addHandler(file_handler)

        return logger

    def _load_llm_config(self, config_path: str = None) -> Dict[str, Any]:
        """Load LLM configuration"""
        if config_path is None:
            config_path = Path(__file__).parent / "config" / "llm-config.json"

        try:
            with open(config_path, 'r') as f:
                llm_config = json.load(f)

            # Also load prompts into provider configs
            prompts = llm_config.get('prompts', {})
            for provider_name, provider_config in llm_config.get('providers', {}).items():
                provider_config['prompts'] = prompts
                provider_config['cache_responses'] = llm_config['stage2_settings'].get('cache_responses', True)
                provider_config['cache_ttl_hours'] = llm_config['stage2_settings'].get('cache_ttl_hours', 24)

            return llm_config
        except Exception as e:
            self.logger.error(f"Error loading LLM config: {e}")
            return {}

    def _initialize_providers(self) -> Dict[str, Any]:
        """Initialize all configured LLM providers"""
        providers = {}

        provider_classes = {
            'anthropic': AnthropicProvider,
            'openai': OpenAIProvider,
            'google': GeminiProvider,
            'deepseek': DeepSeekProvider
        }

        for name, config in self.llm_config.get('providers', {}).items():
            if config.get('enabled', False):
                try:
                    provider_class = provider_classes.get(name)
                    if provider_class:
                        provider = provider_class(config)
                        if provider.is_available():
                            providers[name] = provider
                            self.logger.info(f"✅ Initialized {name} provider")
                        else:
                            self.logger.warning(f"⚠️ {name} provider not available (missing API key)")
                except Exception as e:
                    self.logger.error(f"❌ Error initializing {name} provider: {e}")

        return providers

    def get_available_providers(self) -> List[str]:
        """Get list of available providers"""
        return list(self.providers.keys())

    def process_with_provider(self, metadata: Dict[str, Any],
                              provider_name: str) -> Dict[str, Any]:
        """Process metadata with a specific provider"""
        provider = self.providers.get(provider_name)
        if not provider or not provider.is_available():
            return {'error': f'Provider {provider_name} not available'}

        try:
            self.logger.info(f"Processing with {provider_name}...")
            result = provider.process_metadata(metadata)
            return result
        except Exception as e:
            self.logger.error(f"Error with {provider_name}: {e}")
            return {'error': str(e)}

    def process_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Process Stage 1 metadata with LLM enhancement"""
        # Smart routing: Force Google for images that need vision
        file_type = metadata.get('file_type')
        needs_vision = metadata.get('extracted_content', {}).get('needs_visual_analysis', False)

        # If it's an image that needs vision, force Google (only provider with vision)
        if file_type == 'images' and needs_vision:
            if 'google' in self.providers and self.providers['google'].is_available():
                result = self.process_with_provider(metadata, 'google')
                if result and not result.get('error'):
                    return self._format_stage2_result(metadata, result)

        # Otherwise use normal provider selection
        # Try primary provider first
        if self.primary_provider in self.providers:
            result = self.process_with_provider(metadata, self.primary_provider)
            if result and not result.get('error'):
                return self._format_stage2_result(metadata, result)

        # Try fallback providers
        for provider_name in self.fallback_providers:
            if provider_name in self.providers:
                result = self.process_with_provider(metadata, provider_name)
                if result and not result.get('error'):
                    return self._format_stage2_result(metadata, result)

        return {
            'error': 'No providers available or all failed',
            'attempted_providers': [self.primary_provider] + self.fallback_providers
        }

    def _format_stage2_result(self, original_metadata: Dict[str, Any],
                              llm_result: Dict[str, Any]) -> Dict[str, Any]:
        """Format the Stage 2 enhanced metadata"""
        # Start with original metadata
        enhanced = original_metadata.copy()

        # Add LLM enhancements
        enhanced['llm_enhanced'] = {
            'provider': llm_result.get('provider'),
            'timestamp': llm_result.get('timestamp'),
            'categorization': llm_result.get('categorization', {}),
            'summary': llm_result.get('summary', {}),
            'entities': llm_result.get('entities', {}),
            'topics': llm_result.get('topics', {})
        }

        # Update processing status
        enhanced['processing_status'] = {
            'python_processed': True,
            'llm_processed': True,
            'stage': 'completed',
            'llm_provider': llm_result.get('provider'),
            'llm_timestamp': llm_result.get('timestamp')
        }

        return enhanced

    def process_file(self, stage1_metadata_path: str) -> Dict[str, Any]:
        """Process a Stage 1 metadata file"""
        try:
            # Load Stage 1 metadata
            with open(stage1_metadata_path, 'r') as f:
                metadata = json.load(f)

            # Check if already processed
            if metadata.get('processing_status', {}).get('llm_processed'):
                self.logger.info(f"Already processed: {stage1_metadata_path}")
                return metadata

            # Process with LLM
            enhanced = self.process_metadata(metadata)

            # Save enhanced metadata
            output_path = self._get_output_path(stage1_metadata_path)
            with open(output_path, 'w') as f:
                json.dump(enhanced, f, indent=2, default=str)

            self.logger.info(f"✅ Saved enhanced metadata to: {output_path}")
            return enhanced

        except Exception as e:
            self.logger.error(f"Error processing file {stage1_metadata_path}: {e}")
            return {'error': str(e)}

    def save_enhanced_metadata(self, metadata: Dict[str, Any]) -> str:
        """Save Stage 2 enhanced metadata"""
        # Get original filename
        original_name = metadata.get('original_name', 'unknown')
        base_name = Path(original_name).stem

        # Create output path
        date_folder = datetime.now().strftime('%Y-%m')
        output_dir = config.index_path / "metadata" / "stage1" / "stage2" / date_folder
        output_dir.mkdir(parents=True, exist_ok=True)

        # Save with .stage2.json extension
        output_path = output_dir / f"{base_name}.stage2.json"

        with open(output_path, 'w') as f:
            json.dump(metadata, f, indent=2, default=str)

        self.logger.info(f"Stage 2 metadata saved to: {output_path}")
        return str(output_path)

    def _get_output_path(self, stage1_path: str) -> Path:
        """Get output path for Stage 2 metadata"""
        stage1_path = Path(stage1_path)

        # Replace stage1 with stage2 in path
        stage2_dir = stage1_path.parent.parent / "stage2" / stage1_path.parent.name
        stage2_dir.mkdir(parents=True, exist_ok=True)

        # Change extension from .stage1.json to .stage2.json
        filename = stage1_path.name.replace('.stage1.json', '.stage2.json')

        return stage2_dir / filename

    def batch_process(self, stage1_dir: str = None, limit: int = None) -> Dict[str, Any]:
        """Batch process Stage 1 metadata files"""
        if stage1_dir is None:
            stage1_dir = config.index_path / "metadata" / "stage1"

        stage1_files = list(Path(stage1_dir).rglob("*.stage1.json"))

        if limit:
            stage1_files = stage1_files[:limit]

        results = {
            'total': len(stage1_files),
            'processed': 0,
            'skipped': 0,
            'errors': 0,
            'files': []
        }

        for i, file_path in enumerate(stage1_files, 1):
            self.logger.info(f"[{i}/{len(stage1_files)}] Processing: {file_path.name}")

            result = self.process_file(str(file_path))

            if result.get('error'):
                results['errors'] += 1
            elif result.get('processing_status', {}).get('llm_processed'):
                results['processed'] += 1
            else:
                results['skipped'] += 1

            results['files'].append({
                'path': str(file_path),
                'status': 'error' if result.get('error') else 'processed'
            })

            # Rate limiting
            if i < len(stage1_files):
                time.sleep(1)  # 1 second between requests

        return results


def main():
    """Main entry point for Stage 2 processing"""
    import argparse

    parser = argparse.ArgumentParser(description='Stage 2 LLM Processing')
    parser.add_argument('file_or_dir', nargs='?', help='Stage 1 metadata file or directory')
    parser.add_argument('--batch', action='store_true', help='Batch process all Stage 1 files')
    parser.add_argument('--limit', type=int, help='Limit number of files to process')
    parser.add_argument('--provider', help='Specific provider to use')
    parser.add_argument('--list-providers', action='store_true', help='List available providers')

    args = parser.parse_args()

    # Initialize processor
    processor = Stage2Processor()

    if args.list_providers:
        print("\n🤖 Available LLM Providers:")
        for provider in processor.get_available_providers():
            print(f"  ✅ {provider}")
        return

    if args.batch:
        print("\n🚀 Starting batch Stage 2 processing...")
        results = processor.batch_process(limit=args.limit)

        print(f"\n📊 Batch Processing Results:")
        print(f"  Total files: {results['total']}")
        print(f"  Processed: {results['processed']}")
        print(f"  Skipped: {results['skipped']}")
        print(f"  Errors: {results['errors']}")

    elif args.file_or_dir:
        path = Path(args.file_or_dir)
        if path.is_file():
            print(f"\n🔄 Processing single file: {path}")
            result = processor.process_file(str(path))
            if result.get('error'):
                print(f"❌ Error: {result['error']}")
            else:
                print(f"✅ Successfully processed!")
        elif path.is_dir():
            print(f"\n🔄 Processing directory: {path}")
            results = processor.batch_process(str(path), limit=args.limit)
            print(f"\n📊 Results: {results['processed']}/{results['total']} processed")
    else:
        print("\n📋 Stage 2 LLM Processor")
        print("\nUsage:")
        print("  python3 stage2_processor.py <file>  # Process single file")
        print("  python3 stage2_processor.py --batch  # Process all Stage 1 files")
        print("  python3 stage2_processor.py --list-providers  # List available providers")

        providers = processor.get_available_providers()
        if providers:
            print(f"\n✅ Available providers: {', '.join(providers)}")
        else:
            print("\n⚠️ No providers available. Please set API keys:")
            print("  export ANTHROPIC_API_KEY=your_key")
            print("  export OPENAI_API_KEY=your_key")
            print("  export GOOGLE_API_KEY=your_key")
            print("  export DEEPSEEK_API_KEY=your_key")


if __name__ == "__main__":
    main()
