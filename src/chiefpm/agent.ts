/**
 * ChiefPM Agent
 * 
 * Autonomous project task manager for ChiefOS.
 * Handles independent projects like Cashflow Trustee with continuous iteration.
 */

import type { ChiefPMEnv, ProjectTask, TaskReport, ChiefPMStatus } from './types';

export class ChiefPMAgent {
    private env: ChiefPMEnv;

    constructor(env: ChiefPMEnv) {
        this.env = env;
    }

    /**
     * Get or initialize the task list from KV
     */
    private async getTasks(): Promise<ProjectTask[]> {
        if (!this.env.CHIEFPM_TASKS_KV) {
            console.log('[ChiefPM] No KV namespace configured, using in-memory');
            return [];
        }

        const tasksJson = await this.env.CHIEFPM_TASKS_KV.get('tasks');
        if (!tasksJson) return [];

        try {
            return JSON.parse(tasksJson);
        } catch (e) {
            console.error('[ChiefPM] Failed to parse tasks:', e);
            return [];
        }
    }

    /**
     * Save tasks to KV
     */
    private async saveTasks(tasks: ProjectTask[]): Promise<void> {
        if (!this.env.CHIEFPM_TASKS_KV) {
            console.log('[ChiefPM] No KV namespace configured, tasks not persisted');
            return;
        }

        await this.env.CHIEFPM_TASKS_KV.put('tasks', JSON.stringify(tasks));
    }

    /**
     * Add a new project task
     */
    async addTask(task: Omit<ProjectTask, 'id' | 'createdAt' | 'updatedAt' | 'iterations' | 'errors' | 'completedCriteria'>): Promise<ProjectTask> {
        const tasks = await this.getTasks();

        const newTask: ProjectTask = {
            ...task,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            iterations: 0,
            errors: [],
            completedCriteria: [],
        };

        tasks.push(newTask);
        await this.saveTasks(tasks);

        console.log(`[ChiefPM] Added task: ${newTask.name} (${newTask.id})`);
        return newTask;
    }

    /**
     * Get current status of all tasks
     */
    async getStatus(): Promise<ChiefPMStatus> {
        const tasks = await this.getTasks();

        const lastReportJson = this.env.CHIEFPM_TASKS_KV
            ? await this.env.CHIEFPM_TASKS_KV.get('lastReport')
            : null;

        return {
            enabled: this.env.CHIEFPM_ENABLED === 'true',
            activeTasks: tasks.filter(t => t.status !== 'completed' && t.status !== 'failed').length,
            completedTasks: tasks.filter(t => t.status === 'completed').length,
            lastReport: lastReportJson ? JSON.parse(lastReportJson).timestamp : null,
            tasks,
        };
    }

    /**
     * Generate a 4-hour status report for all active tasks
     */
    async generate4HourReport(): Promise<TaskReport[]> {
        const tasks = await this.getTasks();
        const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed');

        const reports: TaskReport[] = [];

        for (const task of activeTasks) {
            const report: TaskReport = {
                taskId: task.id,
                taskName: task.name,
                timestamp: new Date().toISOString(),
                status: task.status,
                iteration: task.iterations,
                summary: `Task "${task.name}" is ${task.status}. ${task.completedCriteria.length}/${task.successCriteria.length} criteria completed.`,
                actions: [],
                nextSteps: [],
                blockers: task.errors.slice(-3), // Last 3 errors as blockers
            };

            // Determine next steps based on status
            if (task.status === 'pending') {
                report.nextSteps.push('Start task execution');
            } else if (task.status === 'in_progress') {
                report.nextSteps.push('Continue iteration loop');
                report.nextSteps.push(`Complete remaining ${task.successCriteria.length - task.completedCriteria.length} criteria`);
            } else if (task.status === 'testing') {
                report.nextSteps.push('Run verification tests');
            } else if (task.status === 'blocked') {
                report.nextSteps.push('Resolve blockers and retry');
            }

            reports.push(report);
        }

        // Save the report
        if (this.env.CHIEFPM_TASKS_KV) {
            await this.env.CHIEFPM_TASKS_KV.put('lastReport', JSON.stringify({
                timestamp: new Date().toISOString(),
                reports,
            }));
        }

        return reports;
    }

    /**
     * Update task status
     */
    async updateTaskStatus(
        taskId: string,
        update: Partial<Pick<ProjectTask, 'status' | 'lastReport' | 'errors' | 'completedCriteria'>>
    ): Promise<ProjectTask | null> {
        const tasks = await this.getTasks();
        const taskIndex = tasks.findIndex(t => t.id === taskId);

        if (taskIndex === -1) return null;

        tasks[taskIndex] = {
            ...tasks[taskIndex],
            ...update,
            updatedAt: new Date().toISOString(),
            iterations: tasks[taskIndex].iterations + 1,
        };

        await this.saveTasks(tasks);
        return tasks[taskIndex];
    }

    /**
     * Mark a task as completed
     */
    async completeTask(taskId: string): Promise<ProjectTask | null> {
        return this.updateTaskStatus(taskId, { status: 'completed' });
    }
}
