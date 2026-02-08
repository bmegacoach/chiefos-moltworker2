/**
 * ChiefPM Agent Types
 * 
 * Independent project task management for ChiefOS.
 * Runs alongside Ecosystem Manager to handle projects like Cashflow Trustee.
 */

export interface ProjectTask {
    id: string;
    name: string;
    status: 'pending' | 'in_progress' | 'testing' | 'blocked' | 'completed' | 'failed';
    priority: 'critical' | 'high' | 'medium' | 'low';
    projectPath: string;
    taskFile: string;  // Path to AUTONOMOUS_TASK.md or similar
    createdAt: string;
    updatedAt: string;
    lastReport?: string;
    iterations: number;
    errors: string[];
    successCriteria: string[];
    completedCriteria: string[];
}

export interface ChiefPMEnv {
    CHIEFPM_ENABLED?: string;
    ANTHROPIC_API_KEY?: string;
    KIMI_API_KEY?: string;
    AI_GATEWAY_API_KEY?: string;
    AI_GATEWAY_BASE_URL?: string;
    CHIEFPM_TASKS_KV?: KVNamespace;
}

export interface TaskReport {
    taskId: string;
    taskName: string;
    timestamp: string;
    status: ProjectTask['status'];
    iteration: number;
    summary: string;
    actions: string[];
    nextSteps: string[];
    blockers: string[];
}

export interface ChiefPMStatus {
    enabled: boolean;
    activeTasks: number;
    completedTasks: number;
    lastReport: string | null;
    tasks: ProjectTask[];
}
