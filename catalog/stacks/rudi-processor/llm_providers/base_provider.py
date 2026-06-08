"""
Base LLM Provider class for Stage 2 processing
"""
import os
import json
import time
import hashlib
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

# Load .env file if it exists
env_file = Path(__file__).parent.parent / '.env'
if env_file.exists():
    load_dotenv(env_file)


class BaseLLMProvider(ABC):
    """Base class for all LLM providers"""

    def __init__(self, provider_name: str, config: Dict[str, Any]):
        self.provider_name = provider_name
        self.config = config
        self.api_key = self._get_api_key()
        index_dir = Path(os.environ.get(
            "RUDI_INDEX_DIR",
            str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index")
        )).expanduser()
        self.cache_dir = Path(os.environ.get("RUDI_LLM_CACHE_DIR", str(index_dir / "llm_cache"))).expanduser()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_enabled = config.get('cache_responses', True)
        self.cache_ttl_hours = config.get('cache_ttl_hours', 24)

    def _get_api_key(self) -> Optional[str]:
        """Get API key from environment variable"""
        api_key_env = self.config.get('api_key_env')
        if api_key_env:
            return os.environ.get(api_key_env)
        return None

    def _get_cache_key(self, prompt: str, model: str) -> str:
        """Generate cache key for prompt and model"""
        content = f"{self.provider_name}:{model}:{prompt}"
        return hashlib.sha256(content.encode()).hexdigest()

    def _get_cached_response(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get cached response if available and not expired"""
        if not self.cache_enabled:
            return None

        cache_file = self.cache_dir / f"{cache_key}.json"
        if not cache_file.exists():
            return None

        try:
            with open(cache_file, 'r') as f:
                cached = json.load(f)

            # Check if cache is expired
            cached_time = datetime.fromisoformat(cached['timestamp'])
            if datetime.now() - cached_time > timedelta(hours=self.cache_ttl_hours):
                cache_file.unlink()  # Delete expired cache
                return None

            return cached['response']
        except Exception:
            return None

    def _save_to_cache(self, cache_key: str, response: Dict[str, Any]):
        """Save response to cache"""
        if not self.cache_enabled:
            return

        cache_file = self.cache_dir / f"{cache_key}.json"
        try:
            with open(cache_file, 'w') as f:
                json.dump({
                    'timestamp': datetime.now().isoformat(),
                    'response': response
                }, f, indent=2)
        except Exception:
            pass  # Fail silently on cache write errors

    @abstractmethod
    def process(self, prompt: str, system_prompt: str = None,
                model: str = None, **kwargs) -> Dict[str, Any]:
        """Process a prompt and return response"""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if provider is available (has API key)"""
        pass

    def categorize(self, content: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Categorize content using provider"""
        prompt_template = self.config.get('prompts', {}).get('categorization', {})
        system = prompt_template.get('system', '')
        template = prompt_template.get('template', '')

        prompt = template.format(
            content=content[:4000],  # Limit content length
            metadata=json.dumps(metadata, indent=2)
        )

        return self.process(prompt, system_prompt=system)

    def summarize(self, content: str) -> Dict[str, Any]:
        """Summarize content using provider"""
        prompt_template = self.config.get('prompts', {}).get('summarization', {})
        system = prompt_template.get('system', '')
        template = prompt_template.get('template', '')

        prompt = template.format(content=content[:8000])
        return self.process(prompt, system_prompt=system)

    def extract_entities(self, content: str) -> Dict[str, Any]:
        """Extract entities from content"""
        prompt_template = self.config.get('prompts', {}).get('entity_extraction', {})
        system = prompt_template.get('system', '')
        template = prompt_template.get('template', '')

        prompt = template.format(content=content[:6000])
        return self.process(prompt, system_prompt=system)

    def extract_topics(self, content: str) -> Dict[str, Any]:
        """Extract topics from content"""
        prompt_template = self.config.get('prompts', {}).get('topic_modeling', {})
        system = prompt_template.get('system', '')
        template = prompt_template.get('template', '')

        prompt = template.format(content=content[:6000])
        return self.process(prompt, system_prompt=system)

    def process_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Process Stage 1 metadata and enhance with LLM"""
        content = metadata.get('extracted_content', {}).get('full_text', '')
        if not content:
            content = metadata.get('extracted_content', {}).get('ocr_text', '')

        if not content:
            return {
                'error': 'No content to process',
                'provider': self.provider_name
            }

        try:
            # Run all enhancement tasks
            results = {
                'provider': self.provider_name,
                'timestamp': datetime.now().isoformat(),
                'categorization': self.categorize(content, metadata),
                'summary': self.summarize(content),
                'entities': self.extract_entities(content),
                'topics': self.extract_topics(content)
            }

            return results

        except Exception as e:
            return {
                'error': str(e),
                'provider': self.provider_name
            }
