export function runCommand(command: string, args: string[], options?: { capture?: boolean; cwd?: string; maxBuffer?: number; timeoutMs?: number }): Promise<{ stdout: string; stderr: string }>;
export function assertCommandsAvailable(commands: string[]): Promise<void>;
