/**
 * ChiefPM Routes
 * 
 * API routes for ChiefPM project task management.
 * Mounted at /chiefpm/* in the main worker.
 */

import { ChiefPMAgent } from './agent';
import type { ChiefPMEnv, ProjectTask } from './types';

export async function handleChiefPMRequest(request: Request, env: ChiefPMEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace('/chiefpm', '') || '/';

    console.log(`[ChiefPM] Handling: ${request.method} ${path}`);

    // Check if ChiefPM is enabled
    if (env.CHIEFPM_ENABLED !== 'true') {
        return new Response(JSON.stringify({
            error: 'ChiefPM is not enabled',
            hint: 'Set CHIEFPM_ENABLED=true in wrangler.toml or secrets',
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const agent = new ChiefPMAgent(env);

    try {
        // GET /chiefpm - Status overview
        if (path === '/' && request.method === 'GET') {
            const status = await agent.getStatus();
            return new Response(JSON.stringify(status, null, 2), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // GET /chiefpm/tasks - List all tasks
        if (path === '/tasks' && request.method === 'GET') {
            const status = await agent.getStatus();
            return new Response(JSON.stringify(status.tasks, null, 2), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // POST /chiefpm/tasks - Add a new task
        if (path === '/tasks' && request.method === 'POST') {
            const body = await request.json() as Partial<ProjectTask>;

            if (!body.name || !body.projectPath || !body.taskFile) {
                return new Response(JSON.stringify({
                    error: 'Missing required fields: name, projectPath, taskFile',
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const task = await agent.addTask({
                name: body.name,
                projectPath: body.projectPath,
                taskFile: body.taskFile,
                status: 'pending',
                priority: body.priority || 'medium',
                successCriteria: body.successCriteria || [],
            });

            return new Response(JSON.stringify(task, null, 2), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // GET /chiefpm/report - Generate 4-hour report
        if (path === '/report' && request.method === 'GET') {
            const reports = await agent.generate4HourReport();
            return new Response(JSON.stringify({
                timestamp: new Date().toISOString(),
                reports,
            }, null, 2), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // PATCH /chiefpm/tasks/:id - Update task status
        const taskIdMatch = path.match(/^\/tasks\/([a-f0-9-]+)$/);
        if (taskIdMatch && request.method === 'PATCH') {
            const taskId = taskIdMatch[1];
            const body = await request.json() as Partial<ProjectTask>;

            const task = await agent.updateTaskStatus(taskId, {
                status: body.status,
                lastReport: body.lastReport,
                errors: body.errors,
                completedCriteria: body.completedCriteria,
            });

            if (!task) {
                return new Response(JSON.stringify({ error: 'Task not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify(task, null, 2), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // POST /chiefpm/tasks/:id/complete - Mark task as completed
        const completeMatch = path.match(/^\/tasks\/([a-f0-9-]+)\/complete$/);
        if (completeMatch && request.method === 'POST') {
            const taskId = completeMatch[1];
            const task = await agent.completeTask(taskId);

            if (!task) {
                return new Response(JSON.stringify({ error: 'Task not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify(task, null, 2), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('[ChiefPM] Error:', error);
        return new Response(JSON.stringify({
            error: 'Internal error',
            message: error instanceof Error ? error.message : 'Unknown error',
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

/**
 * Scheduled handler for ChiefPM 4-hour reports
 */
export async function handleChiefPMScheduled(env: ChiefPMEnv): Promise<void> {
    if (env.CHIEFPM_ENABLED !== 'true') {
        console.log('[ChiefPM] Not enabled, skipping scheduled run');
        return;
    }

    console.log('[ChiefPM] Running scheduled 4-hour report...');
    const agent = new ChiefPMAgent(env);
    const reports = await agent.generate4HourReport();

    console.log(`[ChiefPM] Generated ${reports.length} task reports`);

    for (const report of reports) {
        console.log(`[ChiefPM] - ${report.taskName}: ${report.status} (iteration ${report.iteration})`);
    }
}
