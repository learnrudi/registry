"""
Google Gemini LLM Provider with Vision Support
"""
import json
import os
from typing import Dict, Any, Optional
from pathlib import Path
from PIL import Image
from .base_provider import BaseLLMProvider


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider implementation with multimodal vision support"""

    def __init__(self, config: Dict[str, Any]):
        super().__init__('gemini', config)
        self.models = config.get('models', {})
        self.default_model = config.get('default_model', 'gemini-1.5-flash')

    def is_available(self) -> bool:
        """Check if Gemini is available"""
        return self.api_key is not None

    def process(self, prompt: str, system_prompt: str = None,
                model: str = None, **kwargs) -> Dict[str, Any]:
        """Process prompt using Gemini API"""
        if not self.is_available():
            return {'error': 'Google API key not configured'}

        # Check cache first
        model_name = model or self.default_model
        cache_key = self._get_cache_key(prompt + (system_prompt or ''), model_name)
        cached = self._get_cached_response(cache_key)
        if cached:
            return cached

        try:
            import google.generativeai as genai
        except ImportError:
            return {'error': 'google-generativeai package not installed. Run: pip install google-generativeai'}

        try:
            # Configure API
            genai.configure(api_key=self.api_key)

            # Get model configuration
            model_config = self.models.get(model_name, {})
            actual_model = model_config.get('name', 'gemini-1.5-flash')
            max_tokens = model_config.get('max_tokens', 8192)
            temperature = model_config.get('temperature', 0.3)

            # Initialize model
            model = genai.GenerativeModel(
                model_name=actual_model,
                generation_config={
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                }
            )

            # Build prompt with system instruction
            full_prompt = prompt
            if system_prompt:
                full_prompt = f"{system_prompt}\n\n{prompt}"

            # Generate response
            response = model.generate_content(full_prompt)

            # Parse response
            result = {
                'success': True,
                'content': response.text if response.text else '',
                'model': actual_model,
                'usage': {
                    'input_tokens': response.usage_metadata.prompt_token_count if hasattr(response, 'usage_metadata') else 0,
                    'output_tokens': response.usage_metadata.candidates_token_count if hasattr(response, 'usage_metadata') else 0,
                    'total_tokens': response.usage_metadata.total_token_count if hasattr(response, 'usage_metadata') else 0
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
                'provider': 'gemini'
            }

    def process_image(self, image_path: str, prompt: str = None) -> Dict[str, Any]:
        """Process an image using Gemini's vision capabilities"""
        if not self.is_available():
            return {'error': 'Google API key not configured'}

        try:
            import google.generativeai as genai
        except ImportError:
            return {'error': 'google-generativeai package not installed'}

        try:
            # Configure API
            genai.configure(api_key=self.api_key)

            # Use vision model
            model = genai.GenerativeModel('gemini-1.5-flash')

            # Load image
            image = Image.open(image_path)

            # Default prompt for image analysis
            if not prompt:
                prompt = """Analyze this image and provide:
                1. A detailed description of what you see
                2. The main subject or focus of the image
                3. Any text visible in the image
                4. The overall mood or purpose of the image
                5. Notable colors, style, or artistic elements

                Respond in JSON format with keys: description, subject, text_found, mood, style"""

            # Generate response with image
            response = model.generate_content([prompt, image])

            # Parse response
            result = {
                'success': True,
                'content': response.text if response.text else '',
                'model': 'gemini-1.5-flash',
                'vision_analysis': True
            }

            # Try to parse JSON if expected
            if 'json' in prompt.lower():
                try:
                    content = result['content']
                    if '```json' in content:
                        content = content.split('```json')[1].split('```')[0].strip()
                    elif '```' in content:
                        content = content.split('```')[1].split('```')[0].strip()
                    result['parsed'] = json.loads(content)
                except:
                    pass

            return result

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'provider': 'gemini'
            }

    def process_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Enhanced metadata processing with image vision support"""
        # Check if this is an image that needs visual analysis
        file_type = metadata.get('file_type')
        file_path = metadata.get('file_path')
        needs_vision = metadata.get('extracted_content', {}).get('needs_visual_analysis', False)

        if file_type == 'images' and file_path and os.path.exists(file_path) and needs_vision:
            # Process the actual image with vision
            print(f"🎨 Using Gemini Vision to analyze image: {Path(file_path).name}")

            vision_result = self.process_image(file_path)

            if vision_result.get('success'):
                # Also run standard text processing if OCR text exists
                text_results = super().process_metadata(metadata)

                # Combine vision and text analysis
                return {
                    'provider': self.provider_name,
                    'timestamp': text_results.get('timestamp'),
                    'vision_analysis': vision_result.get('parsed', {'raw': vision_result.get('content')}),
                    'categorization': text_results.get('categorization'),
                    'summary': {
                        'success': True,
                        'content': vision_result.get('content'),
                        'parsed': vision_result.get('parsed', {})
                    },
                    'entities': text_results.get('entities'),
                    'topics': text_results.get('topics')
                }
            else:
                return vision_result
        else:
            # Standard text processing for non-images
            return super().process_metadata(metadata)
