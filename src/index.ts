/**
 * Moltbot + Cloudflare Sandbox
 *
 * This Worker runs Moltbot personal AI assistant in a Cloudflare Sandbox container.
 * It proxies all requests to the Moltbot Gateway's web UI and WebSocket endpoint.
 *
 * Features:
 * - Web UI (Control Dashboard + WebChat) at /
 * - WebSocket support for real-time communication
 * - Admin UI at /_admin/ for device management
 * - Configuration via environment secrets
 *
 * Required secrets (set via `wrangler secret put`):
 * - ANTHROPIC_API_KEY: Your Anthropic API key
 *
 * Optional secrets:
 * - MOLTBOT_GATEWAY_TOKEN: Token to protect gateway access
 * - TELEGRAM_BOT_TOKEN: Telegram bot token
 * - DISCORD_BOT_TOKEN: Discord bot token
 * - SLACK_BOT_TOKEN + SLACK_APP_TOKEN: Slack tokens
 */

import { Hono } from 'hono';
import { getSandbox, Sandbox, type SandboxOptions } from '@cloudflare/sandbox';

import type { AppEnv, MoltbotEnv } from './types';
import { MOLTBOT_PORT } from './config';
import { createAccessMiddleware } from './auth';
import { ensureMoltbotGateway, findExistingMoltbotProcess, syncToR2 } from './gateway';
import { publicRoutes, api, adminUi, debug, cdp } from './routes';
import loadingPageHtml from './assets/loading.html';
import configErrorHtml from './assets/config-error.html';

// Ecosystem Manager imports
import { handleEcosystemRequest } from './ecosystem/routes';
import { handleScheduled as handleEcosystemScheduled } from './ecosystem/scheduled';
import type { EcosystemEnv } from './ecosystem/types';

// ChiefPM Task Manager imports
import { handleChiefPMRequest, handleChiefPMScheduled } from './chiefpm';
import type { ChiefPMEnv } from './chiefpm';

/**
 * Transform error messages from the gateway to be more user-friendly.
 */
function transformErrorMessage(message: string, host: string): string {
  if (message.includes('gateway token missing') || message.includes('gateway token mismatch')) {
    return `Invalid or missing token. Visit https://${host}?token={REPLACE_WITH_YOUR_TOKEN}`;
  }

  if (message.includes('pairing required')) {
    return `Pairing required. Visit https://${host}/_admin/`;
  }

  return message;
}

export { Sandbox };

/**
 * Validate required environment variables.
 * Returns an array of missing variable descriptions, or empty array if all are set.
 */
function validateRequiredEnv(env: MoltbotEnv): string[] {
  const missing: string[] = [];

  if (!env.MOLTBOT_GATEWAY_TOKEN) {
    missing.push('MOLTBOT_GATEWAY_TOKEN');
  }

  if (!env.CF_ACCESS_TEAM_DOMAIN) {
    missing.push('CF_ACCESS_TEAM_DOMAIN');
  }

  if (!env.CF_ACCESS_AUD) {
    missing.push('CF_ACCESS_AUD');
  }

  // Check for AI Gateway, Anthropic, or Kimi configuration
  if (env.AI_GATEWAY_API_KEY) {
    // AI Gateway requires both API key and base URL
    if (!env.AI_GATEWAY_BASE_URL) {
      missing.push('AI_GATEWAY_BASE_URL (required when using AI_GATEWAY_API_KEY)');
    }
  } else if (!env.ANTHROPIC_API_KEY && !env.KIMI_API_KEY) {
    // Direct access requires at least one API key
    missing.push('ANTHROPIC_API_KEY or KIMI_API_KEY or AI_GATEWAY_API_KEY');
  }

  return missing;
}

/**
 * Build sandbox options based on environment configuration.
 * 
 * SANDBOX_SLEEP_AFTER controls how long the container stays alive after inactivity:
 * - 'never' (default): Container stays alive indefinitely (recommended due to long cold starts)
 * - Duration string: e.g., '10m', '1h', '30s' - container sleeps after this period of inactivity
 * 
 * To reduce costs at the expense of cold start latency, set SANDBOX_SLEEP_AFTER to a duration:
 *   npx wrangler secret put SANDBOX_SLEEP_AFTER
 *   # Enter: 10m (or 1h, 30m, etc.)
 */
function buildSandboxOptions(env: MoltbotEnv): SandboxOptions {
  const sleepAfter = env.SANDBOX_SLEEP_AFTER?.toLowerCase() || 'never';

  // 'never' means keep the container alive indefinitely
  if (sleepAfter === 'never') {
    return { keepAlive: true };
  }

  // Otherwise, use the specified duration
  return { sleepAfter };
}

// Main app
const app = new Hono<AppEnv>();

// =============================================================================
// MIDDLEWARE: Applied to ALL routes
// =============================================================================

// Middleware: Log every request
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  console.log(`[REQ] ${c.req.method} ${url.pathname}${url.search}`);
  console.log(`[REQ] Has ANTHROPIC_API_KEY: ${!!c.env.ANTHROPIC_API_KEY}`);
  console.log(`[REQ] DEV_MODE: ${c.env.DEV_MODE}`);
  console.log(`[REQ] DEBUG_ROUTES: ${c.env.DEBUG_ROUTES}`);
  await next();
});

// Middleware: Initialize sandbox for all requests
app.use('*', async (c, next) => {
  if (c.env.Sandbox) {
    const options = buildSandboxOptions(c.env);
    const sandbox = getSandbox(c.env.Sandbox, 'moltbot', options);
    c.set('sandbox', sandbox);
  } else {
    // console.warn('[MIDDLEWARE] Sandbox binding missing - skipping sandbox init');
  }
  await next();
});

// =============================================================================
// PUBLIC ROUTES: No Cloudflare Access authentication required
// =============================================================================

// Mount public routes first (before auth middleware)
// Includes: /sandbox-health, /logo.png, /logo-small.png, /api/status, /_admin/assets/*
app.route('/', publicRoutes);

// Mount CDP routes (uses shared secret auth via query param, not CF Access)
app.route('/cdp', cdp);

// =============================================================================
// PROTECTED ROUTES: Cloudflare Access authentication required
// =============================================================================

// Middleware: Validate required environment variables (skip in dev mode and for debug routes)
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);

  // Skip validation for debug routes (they have their own enable check)
  if (url.pathname.startsWith('/debug')) {
    return next();
  }

  // Skip validation in dev mode or lightweight mode
  if (c.env.DEV_MODE === 'true' || c.env.LIGHTWEIGHT_MODE === 'true') {
    return next();
  }

  const missingVars = validateRequiredEnv(c.env);
  if (missingVars.length > 0) {
    console.error('[CONFIG] Missing required environment variables:', missingVars.join(', '));

    const acceptsHtml = c.req.header('Accept')?.includes('text/html');
    if (acceptsHtml) {
      // Return a user-friendly HTML error page
      const html = configErrorHtml.replace('{{MISSING_VARS}}', missingVars.join(', '));
      return c.html(html, 503);
    }

    // Return JSON error for API requests
    return c.json({
      error: 'Configuration error',
      message: 'Required environment variables are not configured',
      missing: missingVars,
      hint: 'Set these using: wrangler secret put <VARIABLE_NAME>',
    }, 503);
  }

  return next();
});

// Middleware: Cloudflare Access authentication for protected routes
app.use('*', async (c, next) => {
  // Bypassed in dev mode or lightweight mode
  if (c.env.DEV_MODE === 'true' || c.env.LIGHTWEIGHT_MODE === 'true') {
    return next();
  }
  // Determine response type based on Accept header
  const acceptsHtml = c.req.header('Accept')?.includes('text/html');
  const middleware = createAccessMiddleware({
    type: acceptsHtml ? 'html' : 'json',
    redirectOnMissing: acceptsHtml
  });

  return middleware(c, next);
});

// Mount API routes (protected by Cloudflare Access)
app.route('/api', api);

// Mount Admin UI routes (protected by Cloudflare Access)
app.route('/_admin', adminUi);

// Mount debug routes (protected by Cloudflare Access, only when DEBUG_ROUTES is enabled)
app.use('/debug/*', async (c, next) => {
  if (c.env.DEBUG_ROUTES !== 'true') {
    return c.json({ error: 'Debug routes are disabled' }, 404);
  }
  return next();
});
app.route('/debug', debug);

// =============================================================================
// ECOSYSTEM MANAGER ROUTES (independent of sandbox - works in lightweight mode)
// =============================================================================

// Handle ecosystem API requests (USDGB, USDca, Marketplace monitoring)
// These routes work independently of the Moltbot sandbox
app.all('/ecosystem/*', async (c) => {
  try {
    console.log('[ECOSYSTEM] Handling:', c.req.url);
    const ecosystemEnv = c.env as unknown as EcosystemEnv;
    return await handleEcosystemRequest(c.req.raw, ecosystemEnv);
    // return c.json({ status: "disabled", message: "Ecosystem imports commented out for debugging" });
  } catch (err) {
    console.error('[ECOSYSTEM] Crash:', err);
    return c.json({ error: 'Ecosystem Crash', details: String(err), stack: err instanceof Error ? err.stack : undefined }, 200);
  }
});

app.get('/ecosystem', async (c) => {
  console.log('[ECOSYSTEM] Handling root:', c.req.url);
  const ecosystemEnv = c.env as unknown as EcosystemEnv;
  return handleEcosystemRequest(c.req.raw, ecosystemEnv);
  // return c.json({ status: "disabled", message: "Ecosystem imports commented out for debugging" });
});

// =============================================================================
// CHIEFPM TASK MANAGER ROUTES (independent project tasks - works in lightweight mode)
// =============================================================================

// Handle ChiefPM API requests (project task management)
// These routes work independently of the Moltbot sandbox
app.all('/chiefpm/*', async (c) => {
  console.log('[CHIEFPM] Handling:', c.req.url);
  const chiefpmEnv = c.env as unknown as ChiefPMEnv;
  return handleChiefPMRequest(c.req.raw, chiefpmEnv);
  // return c.json({ status: "disabled", message: "ChiefPM imports commented out for debugging" });
});

app.get('/chiefpm', async (c) => {
  console.log('[CHIEFPM] Handling root:', c.req.url);
  const chiefpmEnv = c.env as unknown as ChiefPMEnv;
  return handleChiefPMRequest(c.req.raw, chiefpmEnv);
  // return c.json({ status: "disabled", message: "ChiefPM imports commented out for debugging" });

});

// =============================================================================
// CATCH-ALL: Proxy to Moltbot gateway
// =============================================================================

app.all('*', async (c) => {
  const request = c.req.raw;
  const url = new URL(request.url);

  console.log('[PROXY] Handling request:', url.pathname);

  // LIGHTWEIGHT_MODE: Skip sandbox when containers are disabled
  if (c.env.LIGHTWEIGHT_MODE === 'true') {
    const acceptsHtml = request.headers.get('Accept')?.includes('text/html');
    if (acceptsHtml) {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ChiefSOS Moltworker</title>
          <style>
            body { font-family: system-ui; background: #1a1a2e; color: #eee; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: #16213e; padding: 2rem; border-radius: 12px; text-align: center; max-width: 500px; }
            h1 { color: #4ecca3; }
            .status { background: #0f3460; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
            code { background: #1a1a2e; padding: 0.2rem 0.5rem; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🚀 ChiefSOS Moltworker</h1>
            <p>Deployed successfully in <strong>Lightweight Mode</strong></p>
            <div class="status">
              <p>✅ Worker: Online</p>
              <p>✅ Kimi API: Configured</p>
              <p>✅ Claude API: Configured</p>
              <p>⏸️ Sandbox: Disabled (Docker required)</p>
            </div>
            <p>To enable full sandbox mode, start Docker Desktop and redeploy.</p>
          </div>
        </body>
        </html>
      `);
    }
    return c.json({
      status: 'online',
      mode: 'lightweight',
      message: 'ChiefSOS Moltworker deployed. Sandbox disabled (Docker required).',
      apis: { kimi: true, claude: true },
    });
  }

  const sandbox = c.get('sandbox');

  // Check if gateway is already running
  const existingProcess = await findExistingMoltbotProcess(sandbox);
  const isGatewayReady = existingProcess !== null && existingProcess.status === 'running';

  // For browser requests (non-WebSocket, non-API), show loading page if gateway isn't ready
  const isWebSocketRequest = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  const acceptsHtml = request.headers.get('Accept')?.includes('text/html');

  if (!isGatewayReady && !isWebSocketRequest && acceptsHtml) {
    console.log('[PROXY] Gateway not ready, serving loading page');

    // Start the gateway in the background (don't await)
    c.executionCtx.waitUntil(
      ensureMoltbotGateway(sandbox, c.env).catch((err: Error) => {
        console.error('[PROXY] Background gateway start failed:', err);
      })
    );

    // Return the loading page immediately
    return c.html(loadingPageHtml);
  }

  // Ensure moltbot is running (this will wait for startup)
  try {
    await ensureMoltbotGateway(sandbox, c.env);
  } catch (error) {
    console.error('[PROXY] Failed to start Moltbot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    let hint = 'Check worker logs with: wrangler tail';
    if (!c.env.ANTHROPIC_API_KEY) {
      hint = 'ANTHROPIC_API_KEY is not set. Run: wrangler secret put ANTHROPIC_API_KEY';
    } else if (errorMessage.includes('heap out of memory') || errorMessage.includes('OOM')) {
      hint = 'Gateway ran out of memory. Try again or check for memory leaks.';
    }

    return c.json({
      error: 'Moltbot gateway failed to start',
      details: errorMessage,
      hint,
    }, 503);
  }

  // Proxy to Moltbot with WebSocket message interception
  if (isWebSocketRequest) {
    console.log('[WS] Proxying WebSocket connection to Moltbot');
    console.log('[WS] URL:', request.url);
    console.log('[WS] Search params:', url.search);

    // Get WebSocket connection to the container
    const containerResponse = await sandbox.wsConnect(request, MOLTBOT_PORT);
    console.log('[WS] wsConnect response status:', containerResponse.status);

    // Get the container-side WebSocket
    const containerWs = containerResponse.webSocket;
    if (!containerWs) {
      console.error('[WS] No WebSocket in container response - falling back to direct proxy');
      return containerResponse;
    }

    console.log('[WS] Got container WebSocket, setting up interception');

    // Create a WebSocket pair for the client
    const [clientWs, serverWs] = Object.values(new WebSocketPair());

    // Accept both WebSockets
    serverWs.accept();
    containerWs.accept();

    console.log('[WS] Both WebSockets accepted');
    console.log('[WS] containerWs.readyState:', containerWs.readyState);
    console.log('[WS] serverWs.readyState:', serverWs.readyState);

    // Relay messages from client to container
    serverWs.addEventListener('message', (event) => {
      console.log('[WS] Client -> Container:', typeof event.data, typeof event.data === 'string' ? event.data.slice(0, 200) : '(binary)');
      if (containerWs.readyState === WebSocket.OPEN) {
        containerWs.send(event.data);
      } else {
        console.log('[WS] Container not open, readyState:', containerWs.readyState);
      }
    });

    // Relay messages from container to client, with error transformation
    containerWs.addEventListener('message', (event) => {
      console.log('[WS] Container -> Client (raw):', typeof event.data, typeof event.data === 'string' ? event.data.slice(0, 500) : '(binary)');
      let data = event.data;

      // Try to intercept and transform error messages
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          console.log('[WS] Parsed JSON, has error.message:', !!parsed.error?.message);
          if (parsed.error?.message) {
            console.log('[WS] Original error.message:', parsed.error.message);
            parsed.error.message = transformErrorMessage(parsed.error.message, url.host);
            console.log('[WS] Transformed error.message:', parsed.error.message);
            data = JSON.stringify(parsed);
          }
        } catch (e) {
          console.log('[WS] Not JSON or parse error:', e);
        }
      }

      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.send(data);
      } else {
        console.log('[WS] Server not open, readyState:', serverWs.readyState);
      }
    });

    // Handle close events
    serverWs.addEventListener('close', (event) => {
      console.log('[WS] Client closed:', event.code, event.reason);
      containerWs.close(event.code, event.reason);
    });

    containerWs.addEventListener('close', (event) => {
      console.log('[WS] Container closed:', event.code, event.reason);
      // Transform the close reason (truncate to 123 bytes max for WebSocket spec)
      let reason = transformErrorMessage(event.reason, url.host);
      if (reason.length > 123) {
        reason = reason.slice(0, 120) + '...';
      }
      console.log('[WS] Transformed close reason:', reason);
      serverWs.close(event.code, reason);
    });

    // Handle errors
    serverWs.addEventListener('error', (event) => {
      console.error('[WS] Client error:', event);
      containerWs.close(1011, 'Client error');
    });

    containerWs.addEventListener('error', (event) => {
      console.error('[WS] Container error:', event);
      serverWs.close(1011, 'Container error');
    });

    console.log('[WS] Returning intercepted WebSocket response');
    return new Response(null, {
      status: 101,
      webSocket: clientWs,
    });
  }

  console.log('[HTTP] Proxying:', url.pathname + url.search);
  const httpResponse = await sandbox.containerFetch(request, MOLTBOT_PORT);
  console.log('[HTTP] Response status:', httpResponse.status);

  // Add debug header to verify worker handled the request
  const newHeaders = new Headers(httpResponse.headers);
  newHeaders.set('X-Worker-Debug', 'proxy-to-moltbot');
  newHeaders.set('X-Debug-Path', url.pathname);

  return new Response(httpResponse.body, {
    status: httpResponse.status,
    statusText: httpResponse.statusText,
    headers: newHeaders,
  });
});

/**
 * Scheduled handler for cron triggers.
 * Syncs moltbot config/state from container to R2 for persistence.
 * Also runs Ecosystem Manager 4-hour reports.
 */
async function scheduled(
  event: ScheduledEvent,
  env: MoltbotEnv,
  ctx: ExecutionContext
): Promise<void> {
  // Check if this is for ecosystem manager (every 4 hours)
  const ecosystemEnv = env as unknown as EcosystemEnv;
  if (ecosystemEnv.ECOSYSTEM_ENABLED === 'true') {
    console.log('[cron] Running Ecosystem Manager 4-hour report...');
    try {
      // Cast to the correct type for the scheduler controller
      const controller = { scheduledTime: event.scheduledTime, cron: event.cron } as import('@cloudflare/workers-types').ScheduledController;
      await handleEcosystemScheduled(controller, ecosystemEnv, ctx);
      console.log('[cron] Ecosystem report generated successfully');
    } catch (err) {
      console.error('[cron] Ecosystem report failed:', err);
    }
  }

  // ChiefPM Task Manager 4-hour report
  const chiefpmEnv = env as unknown as ChiefPMEnv;
  if (chiefpmEnv.CHIEFPM_ENABLED === 'true') {
    console.log('[cron] Running ChiefPM 4-hour report...');
    try {
      await handleChiefPMScheduled(chiefpmEnv);
      console.log('[cron] ChiefPM report generated successfully');
    } catch (err) {
      console.error('[cron] ChiefPM report failed:', err);
    }
  }

  // Existing sandbox sync logic
  const options = buildSandboxOptions(env);
  const sandbox = getSandbox(env.Sandbox, 'moltbot', options);

  console.log('[cron] Starting backup sync to R2...');
  const result = await syncToR2(sandbox, env);

  if (result.success) {
    console.log('[cron] Backup sync completed successfully at', result.lastSync);
  } else {
    console.error('[cron] Backup sync failed:', result.error, result.details || '');
  }
}

export default {
  fetch: async (request: Request, env: MoltbotEnv, ctx: ExecutionContext) => {
    try {
      return await app.fetch(request, env, ctx);
    } catch (e: any) {
      return new Response(`Crash: ${e.message}\n${e.stack}`, { status: 500 });
    }
  },
  scheduled,
};
