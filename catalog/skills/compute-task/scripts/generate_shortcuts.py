"""Generate private identity shortcuts; never run or activate Compute tasks."""
from pathlib import Path, PurePosixPath
import argparse
import json
import os
import re
import stat
import sys


def fields(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ValueError(f'invalid {label} fields')


def text(value, label, maximum=4096):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum
            or any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise ValueError(f'invalid {label}')
    return value


def absolute(value, label):
    text(value, label)
    path = PurePosixPath(value)
    if not path.is_absolute() or str(path) != value or '..' in path.parts:
        raise ValueError(f'{label} must be a normalized absolute host path')


def validate(config: dict) -> None:
    fields(config, ('schema_version', 'targets'), 'configuration')
    if type(config['schema_version']) is not int or config['schema_version'] != 1:
        raise ValueError('unsupported configuration version')
    if not isinstance(config['targets'], list) or not 1 <= len(config['targets']) <= 32:
        raise ValueError('configuration requires 1..32 targets')
    identities = set()
    for target in config['targets']:
        fields(target, ('identity', 'provider', 'account', 'host', 'worker'), 'target')
        identity = target['identity']
        provider = target['provider']
        account_fields = ['id', 'email', 'config_directory']
        if provider == 'claude':
            account_fields += ['organization_id', 'anthropic_directory']
        fields(target['account'], account_fields, 'account')
        if (provider not in ('codex', 'claude') or not isinstance(identity, str)
                or not re.fullmatch(provider + r'-[a-z0-9][a-z0-9-]{0,47}', identity)
                or target['account']['id'] != identity):
            raise ValueError('shortcut provider and account identity must match')
        if identity in identities:
            raise ValueError('duplicate identity')
        identities.add(identity)
        account = target['account']
        if not re.fullmatch(r'[^\s@]+@[^\s@]+', text(account['email'], 'email', 254)):
            raise ValueError('invalid email')
        absolute(account['config_directory'], 'account directory')
        if provider == 'claude':
            text(account['organization_id'], 'organization id', 128)
            absolute(account['anthropic_directory'], 'anthropic directory')
        host = target['host']
        if not isinstance(host, dict) or host.get('transport') not in ('local', 'ssh'):
            raise ValueError('unsupported host transport')
        fields(host, ['name', 'transport'] + (['ssh_alias'] if host['transport'] == 'ssh' else []), 'host')
        text(host['name'], 'host name', 128)
        if host['transport'] == 'ssh' and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}', host['ssh_alias']):
            raise ValueError('invalid SSH alias')
        worker = target['worker']
        fields(worker, ('root', 'python', 'bundle', 'manifest_sha256', 'label'), 'worker')
        for key in ('root', 'python', 'bundle'):
            absolute(worker[key], 'worker ' + key)
        if not re.fullmatch(r'[a-f0-9]{64}', text(worker['manifest_sha256'], 'manifest hash', 64)):
            raise ValueError('invalid manifest hash')
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}', text(worker['label'], 'worker label', 200)):
            raise ValueError('invalid worker label')


def render(target: dict, workflow: Path) -> dict[str, str]:
    identity = target['identity']
    provider = target['provider']
    description = f'Prepare a Compute task using {identity}; review model, effort, workspace, outputs and schedule before activation.'
    return {
        'SKILL.md': f'''---
name: {identity}
description: {json.dumps(description)}
version: 1.0.0
category: agents
tags:
  - capability:schedule
  - provider:{provider}
---

# {identity}

Use the {provider} identity **{identity}** for this Compute task.
Read [target metadata](references/target.json) and the shared
[Compute task workflow](<{workflow}>) before preparing the job.
The target metadata pins this identity; do not substitute a default login or
another account. If the user chooses another identity, invoke its shortcut.

Collect the model, reasoning effort, task, schedule/timezone, project and output,
plus missing permissions and timeout. Prepare and validate an inactive task.
Present its concrete review and wait for approval of that review before any
activation or run. Invoking this shortcut alone does not approve execution.
''',
        'references/target.json': json.dumps(target, indent=2) + '\n',
        'agents/openai.yaml': f'''interface:
  display_name: "{identity}"
  short_description: "Review an identity-selected Compute job"
  default_prompt: "Use ${identity} to prepare my Compute task and show it for review before activation."
''',
    }


def generate(config: dict, output: Path, workflow: Path) -> list[str]:
    validate(config)
    if not output.is_dir() or output.resolve() != output:
        raise ValueError('output must be an existing canonical directory')
    if not workflow.is_file() or workflow.resolve() != workflow:
        raise ValueError('workflow must be an installed canonical skill file')
    # Preflight every target before writing; do not replace managed or user files.
    for target in config['targets']:
        destination = output / target['identity']
        if destination.exists() or destination.is_symlink():
            raise ValueError('shortcut destination conflict; existing content preserved')
    names = []
    for target in config['targets']:
        destination = output / target['identity']
        destination.mkdir(mode=0o700)
        for relative, content in render(target, workflow).items():
            path = destination / relative
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with path.open('x') as stream:
                stream.write(content)
            path.chmod(0o600)
        names.append(target['identity'])
    return names


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def read_config(path: Path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 131072:
            raise ValueError('configuration must be a bounded regular JSON file')
        raw = stream.read(131073)
        if len(raw) > 131072:
            raise ValueError('configuration exceeds size limit')
    return json.loads(raw, object_pairs_hook=unique_pairs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--workflow', type=Path, required=True)
    args = parser.parse_args()
    try:
        names = generate(read_config(args.config), args.output, args.workflow)
    except (ValueError, OSError, TypeError, KeyError):
        # Do not echo configuration values; config must contain metadata only.
        print(json.dumps({'error': 'Invalid configuration or destination conflict; inspect targets and preserve any created folders before retrying.'}), file=sys.stderr)
        return 1
    print(json.dumps({'created': names, 'jobs_started': 0, 'schedules_activated': 0}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
