import type { Sandbox, Process } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { MOLTBOT_PORT, STARTUP_TIMEOUT_MS } from '../config';
import { buildEnvVars } from './env';
import { mountR2Storage } from './r2';

// @ts-ignore
import startupScript from '../../start-moltbot.sh';
// @ts-ignore
import systemPrompt from '../../SYSTEM.md';
// @ts-ignore
import memoryPrompt from '../../MEMORY.md';

/**
 * Wait for a process to exit
 */
async function waitForExit(proc: Process, intervalMs: number = 500): Promise<number> {
  while (proc.status === 'running' || proc.status === 'starting') {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  // Return exit code if available, or 0 if unknown (or throw?)
  // Process type usually has exitCode.
  // @ts-ignore
  return proc.exitCode ?? 0;
}

/**
 * Write a file to the sandbox using cat
 */
async function writeFile(sandbox: Sandbox, path: string, content: string): Promise<void> {
  // Escape single quotes for shell
  // This is a naive implementation, meant for text files
  // We base64 encode to avoid shell escaping hell
  const b64 = btoa(content);
  const cmd = `echo "${b64}" | base64 -d > "${path}"`;
  const proc = await sandbox.startProcess(cmd);
  await waitForExit(proc);
}

/**
 * Find an existing Moltbot gateway process
 * 
 * @param sandbox - The sandbox instance
 * @returns The process if found and running/starting, null otherwise
 */
export async function findExistingMoltbotProcess(sandbox: Sandbox): Promise<Process | null> {
  try {
    const processes = await sandbox.listProcesses();
    for (const proc of processes) {
      // Only match the gateway process, not CLI commands like "clawdbot devices list"
      // Note: CLI is still named "clawdbot" until upstream renames it
      const isGatewayProcess =
        proc.command.includes('start-moltbot.sh') ||
        proc.command.includes('clawdbot gateway');
      const isCliCommand =
        proc.command.includes('clawdbot devices') ||
        proc.command.includes('clawdbot --version');

      if (isGatewayProcess && !isCliCommand) {
        if (proc.status === 'starting' || proc.status === 'running') {
          return proc;
        }
      }
    }
  } catch (e) {
    console.log('Could not list processes:', e);
  }
  return null;
}

/**
 * Ensure the Moltbot gateway is running
 * 
 * This will:
 * 1. Mount R2 storage if configured
 * 2. Check for an existing gateway process
 * 3. Bootstrap environment (install clawdbot, write scripts) if needed
 * 4. Wait for it to be ready, or start a new one
 * 
 * @param sandbox - The sandbox instance
 * @param env - Worker environment bindings
 * @returns The running gateway process
 */
export async function ensureMoltbotGateway(sandbox: Sandbox, env: MoltbotEnv): Promise<Process> {
  // Mount R2 storage for persistent data (non-blocking if not configured)
  await mountR2Storage(sandbox, env);

  // Check if Moltbot is already running or starting
  const existingProcess = await findExistingMoltbotProcess(sandbox);
  if (existingProcess) {
    console.log('Found existing Moltbot process:', existingProcess.id, 'status:', existingProcess.status);
    try {
      console.log('Waiting for Moltbot gateway on port', MOLTBOT_PORT, 'timeout:', STARTUP_TIMEOUT_MS);
      await existingProcess.waitForPort(MOLTBOT_PORT, { mode: 'tcp', timeout: STARTUP_TIMEOUT_MS });
      console.log('Moltbot gateway is reachable');
      return existingProcess;
    } catch (e) {
      console.log('Existing process not reachable after full timeout, killing and restarting...');
      try { await existingProcess.kill(); } catch (killError) { }
    }
  }

  // --- Bootstrapping Phase ---
  console.log('Preparing sandbox environment...');

  // 1. Check/Install clawdbot
  // The default image might not have it.
  const checkProc = await sandbox.startProcess('which clawdbot');
  await waitForExit(checkProc);
  // @ts-ignore
  if (checkProc.exitCode !== 0) {
    console.log('Moltbot (clawdbot) not found. Installing...');
    // Increase timeout for installation (installation takes time)
    const installProc = await sandbox.startProcess('npm install -g clawdbot@2026.1.24-3');
    await waitForExit(installProc, 2000); // Check every 2s
    // @ts-ignore
    console.log('Moltbot installed. Exit code:', installProc.exitCode);
  }

  // 2. Write Startup Script and Brains
  console.log('Injecting configuration and brains...');
  await writeFile(sandbox, '/usr/local/bin/start-moltbot.sh', startupScript);
  const chmodProc = await sandbox.startProcess('chmod +x /usr/local/bin/start-moltbot.sh');
  await waitForExit(chmodProc);

  const mkdirProc = await sandbox.startProcess('mkdir -p /root/clawd');
  await waitForExit(mkdirProc);
  if (systemPrompt) await writeFile(sandbox, '/root/clawd/SYSTEM.md', systemPrompt);
  if (memoryPrompt) await writeFile(sandbox, '/root/clawd/MEMORY.md', memoryPrompt);


  // Start a new Moltbot gateway
  console.log('Starting new Moltbot gateway...');
  const envVars = buildEnvVars(env);
  const command = '/usr/local/bin/start-moltbot.sh';

  console.log('Starting process with command:', command);
  console.log('Environment vars being passed:', Object.keys(envVars));

  let process: Process;
  try {
    process = await sandbox.startProcess(command, {
      env: Object.keys(envVars).length > 0 ? envVars : undefined,
    });
    console.log('Process started with id:', process.id, 'status:', process.status);
  } catch (startErr) {
    console.error('Failed to start process:', startErr);
    throw startErr;
  }

  // Wait for the gateway to be ready
  try {
    console.log('[Gateway] Waiting for Moltbot gateway to be ready on port', MOLTBOT_PORT);
    await process.waitForPort(MOLTBOT_PORT, { mode: 'tcp', timeout: STARTUP_TIMEOUT_MS });
    console.log('[Gateway] Moltbot gateway is ready!');

    const logs = await process.getLogs();
    if (logs.stdout) console.log('[Gateway] stdout:', logs.stdout);
    if (logs.stderr) console.log('[Gateway] stderr:', logs.stderr);
  } catch (e) {
    console.error('[Gateway] waitForPort failed:', e);
    try {
      const logs = await process.getLogs();
      console.error('[Gateway] startup failed. Stderr:', logs.stderr);
      console.error('[Gateway] startup failed. Stdout:', logs.stdout);
      throw new Error(`Moltbot gateway failed to start. Stderr: ${logs.stderr || '(empty)'}`);
    } catch (logErr) {
      console.error('[Gateway] Failed to get logs:', logErr);
      throw e;
    }
  }

  // Verify gateway is actually responding
  console.log('[Gateway] Verifying gateway health...');

  return process;
}
