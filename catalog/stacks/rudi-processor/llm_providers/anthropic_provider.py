"""
Anthropic (Claude) LLM Provider
"""
import json
from typing import Dict, Any, Optional
from .base_provider import BaseLLMProvider


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider implementation"""

    def __init__(self, config: Dict[str, Any]):
        super().__init__('anthropic', config)
        self.base_url = "https://api.anthropic.com/v1/messages"
        self.models = config.get('models', {})
        self.default_model = config.get('default_model', 'claude-3-5-haiku')

    def is_available(self) -> bool:
        """Check if Anthropic is available"""
        return self.api_key is not None

    def process(self, prompt: str, system_prompt: str = None,
                model: str = None, **kwargs) -> Dict[str, Any]:
        """Process prompt using Anthropic API"""
        if not self.is_available():
            return {'error': 'Anthropic API key not configured'}

        # Check cache first
        model_name = model or self.default_model
        cache_key = self._get_cache_key(prompt + (system_prompt or ''), model_name)
        cached = self._get_cached_response(cache_key)
        if cached:
            return cached

        try:
            import anthropic
        except ImportError:
            return {'error': 'anthropic package not installed. Run: pip install anthropic'}

        try:
            # Get model configuration
            model_config = self.models.get(model_name, {})
            actual_model = model_config.get('name', 'claude-3-5-haiku-20241022')
            max_tokens = model_config.get('max_tokens', 4096)
            temperature = model_config.get('temperature', 0.3)

            # Initialize client
            client = anthropic.Anthropic(api_key=self.api_key)

            # Build messages
            messages = [
                {
                    "role": "user",
                    "content": prompt
                }
            ]

            # Make API call
            response = client.messages.create(
                model=actual_model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt if system_prompt else None,
                messages=messages
            )

            # Parse response
            result = {
                'success': True,
                'content': response.content[0].text if response.content else '',
                'model': actual_model,
                'usage': {
                    'input_tokens': response.usage.input_tokens if hasattr(response, 'usage') else 0,
                    'output_tokens': response.usage.output_tokens if hasattr(response, 'usage') else 0
                }
            }

            # Try to parse JSON response if expected
            if 'json' in prompt.lower() or 'json' in (system_prompt or '').lower():
                try:
                    result['parsed'] = json.loads(result['content'])
                except:
                    pass

            # Save to cache
            self._save_to_cache(cache_key, result)

            return result

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'provider': 'anthropic'
            }
