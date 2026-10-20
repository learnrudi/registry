import importlib.util
import copy
import json
from pathlib import Path
import tempfile
import unittest
import sys

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).resolve().parents[1] / 'catalog/skills/compute-task/scripts/generate_shortcuts.py'
spec = importlib.util.spec_from_file_location('shortcuts', SCRIPT)
shortcuts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shortcuts)


class ShortcutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.output = self.root / 'skills'
        self.output.mkdir()
        self.workflow = self.output / 'compute-task' / 'SKILL.md'
        self.workflow.parent.mkdir()
        self.workflow.write_text('Shared workflow')
        self.config = {'schema_version': 1, 'targets': [{
            'identity': 'codex-example', 'provider': 'codex',
            'account': {'id': 'codex-example', 'email': 'operator@example.invalid',
                        'config_directory': '/remote/private/codex-example'},
            'host': {'name': 'Example host', 'transport': 'ssh', 'ssh_alias': 'example-host'},
            'worker': {'root': '/remote/worker', 'python': '/remote/python3.12',
                       'bundle': '/remote/release', 'manifest_sha256': 'a' * 64,
                       'label': 'example.compute'},
        }]}

    def test_renders_a_private_shortcut_bound_to_one_identity_and_shared_workflow(self):
        result = shortcuts.generate(self.config, self.output, self.workflow)
        self.assertEqual(result, ['codex-example'])
        target = self.output / 'codex-example'
        metadata = json.loads((target / 'references/target.json').read_text())
        self.assertEqual(metadata, self.config['targets'][0])
        skill = (target / 'SKILL.md').read_text()
        self.assertIn(str(self.workflow), skill)
        self.assertIn('codex-example', skill)
        self.assertIn('review', skill.lower())

    def test_rejects_mismatched_provider_or_identity_before_writing(self):
        self.config['targets'][0]['account']['id'] = 'codex-different'
        with self.assertRaisesRegex(ValueError, 'identity'):
            shortcuts.generate(self.config, self.output, self.workflow)
        self.assertFalse((self.output / 'codex-example').exists())

    def test_conflict_does_not_create_earlier_shortcuts_or_overwrite_existing_files(self):
        second = copy.deepcopy(self.config['targets'][0])
        second['identity'] = second['account']['id'] = 'codex-existing'
        self.config['targets'].append(second)
        existing = self.output / 'codex-existing'
        existing.mkdir()
        (existing / 'SKILL.md').write_text('User-owned skill')
        with self.assertRaisesRegex(ValueError, 'conflict'):
            shortcuts.generate(self.config, self.output, self.workflow)
        self.assertFalse((self.output / 'codex-example').exists())
        self.assertEqual((existing / 'SKILL.md').read_text(), 'User-owned skill')

    def test_unexpected_account_fields_cannot_be_copied_into_skills(self):
        self.config['targets'][0]['account']['access_token'] = 'synthetic-secret'
        with self.assertRaisesRegex(ValueError, 'account fields'):
            shortcuts.generate(self.config, self.output, self.workflow)
        self.assertFalse((self.output / 'codex-example').exists())

    def test_six_provider_shortcuts_preserve_distinct_account_metadata(self):
        targets = []
        for provider in ('codex', 'claude'):
            for suffix in ('one', 'two', 'three'):
                target = copy.deepcopy(self.config['targets'][0])
                target['provider'] = provider
                target['identity'] = target['account']['id'] = provider + '-' + suffix
                target['account']['email'] = suffix + '@example.invalid'
                if provider == 'claude':
                    target['account'].update(organization_id='example-org', anthropic_directory='/private/anthropic/' + suffix)
                targets.append(target)
        self.config['targets'] = targets
        self.assertEqual(shortcuts.generate(self.config, self.output, self.workflow), [t['identity'] for t in targets])
        for target in targets:
            saved = json.loads((self.output / target['identity'] / 'references/target.json').read_text())
            self.assertEqual(saved, target)

    def test_symlink_destination_is_preserved_and_rejected(self):
        outside = self.root / 'outside'
        outside.mkdir()
        (self.output / 'codex-example').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'conflict'):
            shortcuts.generate(self.config, self.output, self.workflow)
        self.assertEqual(list(outside.iterdir()), [])

    def test_duplicate_json_keys_are_rejected(self):
        config = self.root / 'config.json'
        config.write_text('{"schema_version":1,"schema_version":2,"targets":[]}')
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            shortcuts.read_config(config)


if __name__ == '__main__':
    unittest.main()
