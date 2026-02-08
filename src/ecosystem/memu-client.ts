// memU Client - Short-Term Memory Integration
// ChiefSOS Ecosystem Manager

export interface MemUConfig {
    apiUrl: string;
    apiKey?: string;
}

export interface MemorizePayload {
    content: Array<{
        role: 'user' | 'assistant' | 'system';
        content: { text: string };
        created_at?: string;
    }>;
    user_id?: string;
    agent_id?: string;
    modality?: 'conversation' | 'document' | 'image';
}

export interface RetrieveQuery {
    query: string;
    user_id?: string;
    agent_id?: string;
    method?: 'rag' | 'llm';
    top_k?: number;
}

export interface MemoryItem {
    id: string;
    content: string;
    category: string;
    score?: number;
    created_at: string;
}

export interface RetrieveResult {
    items: MemoryItem[];
    categories: string[];
    next_step_query?: string;
}

/**
 * memU Client for short-term agent memory
 * Connects Moltworker agents to memU-server
 */
export class MemUClient {
    private apiUrl: string;
    private apiKey?: string;

    constructor(config: MemUConfig) {
        this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
        this.apiKey = config.apiKey;
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.apiUrl}${endpoint}`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        };

        const response = await fetch(url, {
            ...options,
            headers: { ...headers, ...(options.headers || {}) },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`memU API error (${response.status}): ${error}`);
        }

        return response.json();
    }

    /**
     * Store a conversation or document in memory
     */
    async memorize(payload: MemorizePayload): Promise<{
        resource: any;
        items: MemoryItem[];
        categories: string[];
    }> {
        return this.request('/memorize', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }

    /**
     * Retrieve relevant memories for a query
     */
    async retrieve(query: RetrieveQuery): Promise<RetrieveResult> {
        return this.request('/retrieve', {
            method: 'POST',
            body: JSON.stringify(query),
        });
    }

    /**
     * Health check
     */
    async health(): Promise<{ status: string }> {
        return this.request('/health');
    }

    /**
     * Helper: Store agent interaction
     */
    async storeAgentInteraction(
        agentId: string,
        interaction: { role: 'user' | 'assistant' | 'system'; text: string }[]
    ): Promise<void> {
        await this.memorize({
            content: interaction.map(i => ({
                role: i.role,
                content: { text: i.text },
                created_at: new Date().toISOString(),
            })),
            agent_id: agentId,
            modality: 'conversation',
        });
    }

    /**
     * Helper: Get context for agent
     */
    async getAgentContext(agentId: string, query: string): Promise<string> {
        const result = await this.retrieve({
            query,
            agent_id: agentId,
            method: 'rag',
            top_k: 5,
        });

        if (result.items.length === 0) {
            return '';
        }

        return result.items
            .map(item => `[${item.category}] ${item.content}`)
            .join('\n\n');
    }
}

/**
 * Factory function to create memU client from environment
 */
export function createMemUClient(env: { MEMU_API_URL?: string; MEMU_API_KEY?: string }): MemUClient | null {
    if (!env.MEMU_API_URL) {
        console.warn('memU: MEMU_API_URL not configured, short-term memory disabled');
        return null;
    }

    return new MemUClient({
        apiUrl: env.MEMU_API_URL,
        apiKey: env.MEMU_API_KEY,
    });
}
