import { spawn } from 'child_process';

export function runCommand(command, args, options = {}) {
  const capture = options.capture === true;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });

    let stdout = '';
    let stderr = '';

    if (capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const details = stderr.trim() || stdout.trim();
      reject(new Error(`${command} exited with code ${code}${details ? `\n${details}` : ''}`));
    });
  });
}

export async function assertCommandsAvailable(commands) {
  const failures = [];

  for (const command of commands) {
    try {
      await runCommand(command, ['-version'], { capture: true });
    } catch (error) {
      const detail = String(error.message || error).split('\n')[0];
      failures.push(`${command}: ${detail}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Missing required command(s):\n- ${failures.join('\n- ')}`);
  }
}
