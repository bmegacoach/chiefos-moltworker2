// Promoter Agent - Isolated Marketing Instance
// Part of ChiefOS Ecosystem Manager (ISOLATED)

/**
 * Promoter Agent Environment (isolated from core)
 * Does NOT have access to treasury data or core ecosystem
 */
interface PromoterEnv {
    // Separate R2 bucket (no core ecosystem access)
    PROMOTER_BUCKET: R2Bucket;

    // Allowed export destinations
    ALLOWED_EXPORTS: string;

    // Manual approval webhook
    APPROVAL_WEBHOOK: string;
}

/**
 * Marketing content for review
 */
interface MarketingContent {
    id: string;
    type: "tweet" | "thread" | "announcement" | "newsletter";
    content: string;
    images?: string[];
    scheduledFor?: number;
    status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PUBLISHED";
    createdAt: number;
    approvedBy?: string;
    approvedAt?: number;
}

/**
 * Export request for external platforms
 */
interface ExportRequest {
    id: string;
    destination: "twitter" | "discord" | "telegram" | "n8n";
    content: MarketingContent;
    status: "PENDING" | "APPROVED" | "REJECTED" | "EXPORTED";
    createdAt: number;
}

/**
 * Promoter Agent: Isolated marketing instance
 * 
 * SECURITY: Runs in separate instance with NO ACCESS to:
 * - Treasury data
 * - Private keys
 * - Core ecosystem agents
 * - Sensitive financial information
 * 
 * All outputs require MANUAL APPROVAL before publication.
 */
export class PromoterAgent {
    private env: PromoterEnv;
    private allowedExports: string[];

    constructor(env: PromoterEnv) {
        this.env = env;
        this.allowedExports = env.ALLOWED_EXPORTS?.split(",") || [];
    }

    /**
     * Create marketing content draft
     */
    async createDraft(
        type: MarketingContent["type"],
        content: string,
        images?: string[]
    ): Promise<MarketingContent> {
        const draft: MarketingContent = {
            id: `PROMO-${Date.now()}`,
            type,
            content: this.sanitizeContent(content),
            images,
            status: "DRAFT",
            createdAt: Date.now()
        };

        await this.storeDraft(draft);

        return draft;
    }

    /**
     * Sanitize content to remove any potentially sensitive data
     */
    private sanitizeContent(content: string): string {
        // Remove any wallet addresses
        let sanitized = content.replace(/0x[a-fA-F0-9]{40}/g, "[ADDRESS]");

        // Remove any private key patterns
        sanitized = sanitized.replace(/0x[a-fA-F0-9]{64}/g, "[REDACTED]");

        // Remove any API keys or secrets
        sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, (match) => {
            // Only redact if it looks like a secret (mixed case, numbers)
            if (/[A-Z]/.test(match) && /[a-z]/.test(match) && /[0-9]/.test(match)) {
                return "[REDACTED]";
            }
            return match;
        });

        return sanitized;
    }

    /**
     * Store draft to R2
     */
    private async storeDraft(draft: MarketingContent): Promise<void> {
        await this.env.PROMOTER_BUCKET.put(
            `drafts/${draft.id}.json`,
            JSON.stringify(draft)
        );
    }

    /**
     * Submit draft for approval
     */
    async submitForApproval(draftId: string): Promise<MarketingContent | null> {
        const draft = await this.getDraft(draftId);
        if (!draft) return null;

        draft.status = "PENDING_APPROVAL";
        await this.storeDraft(draft);

        // Notify approval webhook
        if (this.env.APPROVAL_WEBHOOK) {
            await fetch(this.env.APPROVAL_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "MARKETING_APPROVAL_REQUEST",
                    content: draft
                })
            });
        }

        return draft;
    }

    /**
     * Get draft by ID
     */
    async getDraft(draftId: string): Promise<MarketingContent | null> {
        try {
            const obj = await this.env.PROMOTER_BUCKET.get(`drafts/${draftId}.json`);
            if (!obj) return null;
            return JSON.parse(await obj.text());
        } catch {
            return null;
        }
    }

    /**
     * Get all pending approvals
     */
    async getPendingApprovals(): Promise<MarketingContent[]> {
        try {
            const listed = await this.env.PROMOTER_BUCKET.list({ prefix: "drafts/" });
            const pending: MarketingContent[] = [];

            for (const obj of listed.objects) {
                const data = await this.env.PROMOTER_BUCKET.get(obj.key);
                if (data) {
                    const draft: MarketingContent = JSON.parse(await data.text());
                    if (draft.status === "PENDING_APPROVAL") {
                        pending.push(draft);
                    }
                }
            }

            return pending;
        } catch {
            return [];
        }
    }

    /**
     * Approve content (called by human reviewer)
     */
    async approveContent(
        draftId: string,
        approvedBy: string
    ): Promise<MarketingContent | null> {
        const draft = await this.getDraft(draftId);
        if (!draft || draft.status !== "PENDING_APPROVAL") return null;

        draft.status = "APPROVED";
        draft.approvedBy = approvedBy;
        draft.approvedAt = Date.now();

        await this.storeDraft(draft);

        return draft;
    }

    /**
     * Reject content (called by human reviewer)
     */
    async rejectContent(draftId: string): Promise<MarketingContent | null> {
        const draft = await this.getDraft(draftId);
        if (!draft || draft.status !== "PENDING_APPROVAL") return null;

        draft.status = "REJECTED";
        await this.storeDraft(draft);

        return draft;
    }

    /**
     * Create export request for approved content
     */
    async requestExport(
        draftId: string,
        destination: ExportRequest["destination"]
    ): Promise<ExportRequest | null> {
        // Verify destination is allowed
        if (!this.allowedExports.includes(destination)) {
            console.error(`Export to ${destination} not allowed`);
            return null;
        }

        const draft = await this.getDraft(draftId);
        if (!draft || draft.status !== "APPROVED") return null;

        const request: ExportRequest = {
            id: `EXPORT-${Date.now()}`,
            destination,
            content: draft,
            status: "PENDING",
            createdAt: Date.now()
        };

        await this.env.PROMOTER_BUCKET.put(
            `exports/pending/${request.id}.json`,
            JSON.stringify(request)
        );

        return request;
    }

    /**
     * Get pending export requests
     */
    async getPendingExports(): Promise<ExportRequest[]> {
        try {
            const listed = await this.env.PROMOTER_BUCKET.list({ prefix: "exports/pending/" });
            const pending: ExportRequest[] = [];

            for (const obj of listed.objects) {
                const data = await this.env.PROMOTER_BUCKET.get(obj.key);
                if (data) {
                    pending.push(JSON.parse(await data.text()));
                }
            }

            return pending;
        } catch {
            return [];
        }
    }
}
