import { spawn } from 'child_process';

export function runCommand(command, args, options = {}) {
  const capture = options.capture === true;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });

    let stdout = '';
    let stderr = '';
    let capturedBytes = 0;
    let limitError;
    const deadline = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      limitError = new Error(`${command} timed out`);
      child.kill('SIGKILL');
    }, options.timeoutMs);
    const append = (chunk, stream) => {
      if (limitError) return;
      capturedBytes += chunk.length;
      if (options.maxBuffer !== undefined && capturedBytes > options.maxBuffer) {
        limitError = new Error(`${command} exceeded output limit`);
        child.kill('SIGKILL');
        return;
      }
      if (stream === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
    };

    if (capture) {
      child.stdout.on('data', (chunk) => {
        append(chunk, 'stdout');
      });
      child.stderr.on('data', (chunk) => {
        append(chunk, 'stderr');
      });
    }

    child.on('error', (error) => {
      clearTimeout(deadline);
      reject(new Error(`${command} failed to start: ${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(deadline);
      if (limitError) { reject(limitError); return; }
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
