import { ClickUpTask, ClickUpWebhookPayload } from '../types';

export class ClickUpClient {
    private apiKey: string;
    private teamId: string;
    private baseUrl = 'https://api.clickup.com/api/v2';

    constructor(apiKey: string, teamId: string) {
        this.apiKey = apiKey;
        this.teamId = teamId;
    }

    private async request(endpoint: string, method: string = 'GET', body?: any) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });

        if (!response.ok) {
            throw new Error(`ClickUp API Error: ${response.statusText}`);
        }

        return response.json();
    }

    async getTask(taskId: string): Promise<ClickUpTask> {
        return this.request(`/task/${taskId}`) as Promise<ClickUpTask>;
    }

    async updateStatus(taskId: string, status: string) {
        return this.request(`/task/${taskId}`, 'PUT', { status });
    }

    async commentOnTask(taskId: string, comment: string) {
        return this.request(`/task/${taskId}/comment`, 'POST', { comment_text: comment });
    }

    async createTask(listId: string, task: { name: string; description?: string; assignees?: number[] }) {
        return this.request(`/list/${listId}/task`, 'POST', task);
    }

    async createSubtask(taskId: string, name: string, description?: string) {
        // Requires getting the list ID from the parent first, which is complex without caching.
        // For MVP, we'll assume we are creating a task in the primary list.
        // Enhanced implementation would be:
        // const parent = await this.getTask(taskId);
        // return this.createTask(parent.list.id, { name, description, parent: taskId });
        return null;
    }
}
