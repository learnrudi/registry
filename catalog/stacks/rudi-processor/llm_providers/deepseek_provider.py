"""
DeepSeek LLM Provider
"""
import json
from typing import Dict, Any, Optional
from .base_provider import BaseLLMProvider


class DeepSeekProvider(BaseLLMProvider):
    """DeepSeek provider implementation (OpenAI-compatible API)"""

    def __init__(self, config: Dict[str, Any]):
        super().__init__('deepseek', config)
        self.base_url = config.get('base_url', 'https://api.deepseek.com/v1')
        self.models = config.get('models', {})
        self.default_model = config.get('default_model', 'deepseek-chat')

    def is_available(self) -> bool:
        """Check if DeepSeek is available"""
        return self.api_key is not None

    def process(self, prompt: str, system_prompt: str = None,
                model: str = None, **kwargs) -> Dict[str, Any]:
        """Process prompt using DeepSeek API (OpenAI-compatible)"""
        if not self.is_available():
            return {'error': 'DeepSeek API key not configured'}

        # Check cache first
        model_name = model or self.default_model
        cache_key = self._get_cache_key(prompt + (system_prompt or ''), model_name)
        cached = self._get_cached_response(cache_key)
        if cached:
            return cached

        try:
            import openai
        except ImportError:
            return {'error': 'openai package not installed. Run: pip install openai'}

        try:
            # Get model configuration
            model_config = self.models.get(model_name, {})
            actual_model = model_config.get('name', 'deepseek-chat')
            max_tokens = model_config.get('max_tokens', 4096)
            temperature = model_config.get('temperature', 0.3)

            # Initialize client with DeepSeek base URL
            client = openai.OpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )

            # Build messages
            messages = []
            if system_prompt:
                messages.append({
                    "role": "system",
                    "content": system_prompt
                })
            messages.append({
                "role": "user",
                "content": prompt
            })

            # Make API call
            completion = client.chat.completions.create(
                model=actual_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=False
            )

            # Parse response
            result = {
                'success': True,
                'content': completion.choices[0].message.content,
                'model': actual_model,
                'usage': {
                    'input_tokens': completion.usage.prompt_tokens if completion.usage else 0,
                    'output_tokens': completion.usage.completion_tokens if completion.usage else 0,
                    'total_tokens': completion.usage.total_tokens if completion.usage else 0
                }
            }

            # Try to parse JSON response if expected
            if 'json' in prompt.lower() or 'json' in (system_prompt or '').lower():
                try:
                    # Clean up potential markdown code blocks
                    content = result['content']
                    if '```json' in content:
                        content = content.split('```json')[1].split('```')[0].strip()
                    elif '```' in content:
                        content = content.split('```')[1].split('```')[0].strip()
                    result['parsed'] = json.loads(content)
                except:
                    pass

            # Save to cache
            self._save_to_cache(cache_key, result)

            return result

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'provider': 'deepseek'
            }
