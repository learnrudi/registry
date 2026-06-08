#!/usr/bin/env python3
"""
Test LLM Providers Configuration
Quick script to verify all LLM providers are configured correctly
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from stage2_processor import Stage2Processor


def test_providers():
    """Test all configured LLM providers"""
    print("\n🤖 TESTING LLM PROVIDER CONFIGURATION")
    print("=" * 60)

    # Initialize processor
    processor = Stage2Processor()

    # Check each provider
    providers_status = {
        'anthropic': 'ANTHROPIC_API_KEY',
        'openai': 'OPENAI_API_KEY',
        'google': 'GOOGLE_API_KEY',
        'deepseek': 'DEEPSEEK_API_KEY'
    }

    print("\n📋 Provider Status:")
    print("-" * 40)

    available_count = 0
    for provider, env_var in providers_status.items():
        api_key = os.environ.get(env_var)
        if api_key:
            if provider in processor.providers:
                print(f"✅ {provider:12} - Configured and ready")
                available_count += 1
            else:
                print(f"⚠️  {provider:12} - API key set but provider failed to initialize")
        else:
            print(f"❌ {provider:12} - Missing {env_var}")

    print(f"\n📊 Summary: {available_count}/{len(providers_status)} providers available")

    # Test with sample text if any provider is available
    if available_count > 0:
        print("\n🧪 Testing with sample text...")
        test_metadata = {
            'original_name': 'test.txt',
            'extracted_content': {
                'full_text': """
                This is a test document about artificial intelligence and machine learning.
                It discusses various applications of AI in modern technology, including
                natural language processing, computer vision, and predictive analytics.
                The document was created on January 15, 2025 by the Research Department.
                """
            }
        }

        # Try primary provider
        primary = processor.primary_provider
        if primary in processor.providers:
            print(f"\n🔄 Testing {primary} provider...")
            result = processor.process_with_provider(test_metadata, primary)

            if result and not result.get('error'):
                print(f"✅ {primary} test successful!")

                # Show sample results
                if result.get('categorization'):
                    cat = result['categorization']
                    if cat.get('parsed'):
                        print(f"   Category: {cat['parsed'].get('category', 'N/A')}")

                if result.get('entities'):
                    ent = result['entities']
                    if ent.get('parsed'):
                        print(f"   Found entities: {ent['parsed'].get('dates', [])}")
            else:
                print(f"❌ {primary} test failed: {result.get('error', 'Unknown error')}")

    # Installation instructions if needed
    if available_count == 0:
        print("\n⚠️ No LLM providers configured!")
        print("\n📚 Setup Instructions:")
        print("-" * 40)
        print("\n1. Install required packages:")
        print("   pip3 install anthropic openai google-generativeai")

        print("\n2. Set your API keys:")
        print("   export ANTHROPIC_API_KEY='your-anthropic-key'")
        print("   export OPENAI_API_KEY='your-openai-key'")
        print("   export GOOGLE_API_KEY='your-google-key'")
        print("   export DEEPSEEK_API_KEY='your-deepseek-key'")

        print("\n3. Get API keys from:")
        print("   • Anthropic: https://console.anthropic.com/")
        print("   • OpenAI: https://platform.openai.com/api-keys")
        print("   • Google: https://makersuite.google.com/app/apikey")
        print("   • DeepSeek: https://platform.deepseek.com/")

        print("\n💡 Tip: Add these to your ~/.zshrc or ~/.bashrc for persistence")

    return available_count > 0


if __name__ == "__main__":
    success = test_providers()
    sys.exit(0 if success else 1)
