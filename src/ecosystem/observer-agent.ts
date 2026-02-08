// Observer Agent - Moltbook Intelligence Parser
// Part of ChiefOS Ecosystem Manager

import type {
    Alert,
    ObserverAgentReport,
    EcosystemEnv
} from './types';

/**
 * Skill harvested from Moltbook
 */
interface MoltbookSkill {
    id: string;
    name: string;
    category: string;
    protocol: string;
    successRate: number;
    lastUpdated: number;
    content: string;
}

/**
 * Security exploit alert from Moltbook
 */
interface ExploitAlert {
    id: string;
    protocol: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description: string;
    affectedContracts: string[];
    mitigation: string;
    timestamp: number;
}

/**
 * Skill PR proposal for Chief review
 */
interface SkillPR {
    skillId: string;
    source: "moltbook";
    name: string;
    category: string;
    content: string;
    proposedPath: string;
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    createdAt: number;
}

/**
 * Observer Agent: Read-only intelligence from Moltbook
 * 
 * Responsibilities:
 * - Extract relevant skills from Moltbook API
 * - Monitor security exploits affecting our protocols
 * - Create skill PRs for Chief review
 * - Track market intelligence
 */
export class ObserverAgent {
    private env: EcosystemEnv;
    private moltbookApiUrl = "https://api.moltbook.com/v1";
    private relevantProtocols = ["layerzero", "base", "stablecoin", "bonding-curve"];
    private skillsHarvested = 0;
    private securityAlerts: ExploitAlert[] = [];
    private marketIntelligence: string[] = [];

    // Rate limiter
    private rateLimiter = {
        requests: 0,
        resetAt: Date.now() + 60000,
        limit: 30
    };

    constructor(env: EcosystemEnv) {
        this.env = env;
    }

    /**
     * Extract relevant skills from Moltbook
     */
    async harvestSkills(): Promise<MoltbookSkill[]> {
        const skills: MoltbookSkill[] = [];

        for (const protocol of this.relevantProtocols) {
            try {
                const protocolSkills = await this.fetchSkillsForProtocol(protocol);
                skills.push(...protocolSkills);
            } catch (error) {
                console.error(`Failed to fetch skills for ${protocol}:`, error);
            }
        }

        this.skillsHarvested += skills.length;

        // Create PRs for new skills
        for (const skill of skills) {
            await this.createSkillPR(skill);
        }

        return skills;
    }

    /**
     * Fetch skills for a specific protocol
     */
    private async fetchSkillsForProtocol(protocol: string): Promise<MoltbookSkill[]> {
        // MVP: Placeholder - implement when Moltbook API is available
        // This would be the actual API call:
        // const response = await this.throttledFetch(
        //   `${this.moltbookApiUrl}/skills?protocol=${protocol}`
        // );
        // return response.json();

        return [];
    }

    /**
     * Check for security exploits
     */
    async checkSecurityExploits(): Promise<ExploitAlert[]> {
        try {
            // MVP: Placeholder - implement when Moltbook API is available
            // const response = await this.throttledFetch(
            //   `${this.moltbookApiUrl}/exploits?since=24h`
            // );
            // const exploits = await response.json();

            const exploits: ExploitAlert[] = [];

            // Filter for relevant protocols
            const relevant = exploits.filter(e =>
                this.relevantProtocols.includes(e.protocol)
            );

            this.securityAlerts = relevant;

            return relevant;
        } catch (error) {
            console.error("Failed to check security exploits:", error);
            return [];
        }
    }

    /**
     * Create skill PR for Chief review
     */
    private async createSkillPR(skill: MoltbookSkill): Promise<SkillPR> {
        const proposedPath = `skills/${skill.category}/${skill.name.toLowerCase().replace(/\s+/g, '-')}.md`;

        const pr: SkillPR = {
            skillId: skill.id,
            source: "moltbook",
            name: skill.name,
            category: skill.category,
            content: this.formatSkillContent(skill),
            proposedPath,
            status: "PENDING_REVIEW",
            createdAt: Date.now()
        };

        // Store PR for review
        await this.env.ECOSYSTEM_BUCKET.put(
            `skill-prs/${Date.now()}-${skill.id}.json`,
            JSON.stringify(pr)
        );

        return pr;
    }

    /**
     * Format skill content as markdown
     */
    private formatSkillContent(skill: MoltbookSkill): string {
        return `---
name: ${skill.name.toLowerCase().replace(/\s+/g, '-')}
description: ${skill.name} from Moltbook
source: moltbook
protocol: ${skill.protocol}
successRate: ${skill.successRate}
---

# ${skill.name}

${skill.content}

---
*Harvested from Moltbook on ${new Date().toISOString()}*
`;
    }

    /**
     * Get pending skill PRs
     */
    async getPendingSkillPRs(): Promise<SkillPR[]> {
        try {
            const listed = await this.env.ECOSYSTEM_BUCKET.list({ prefix: "skill-prs/" });
            const prs: SkillPR[] = [];

            for (const obj of listed.objects) {
                const data = await this.env.ECOSYSTEM_BUCKET.get(obj.key);
                if (data) {
                    const pr: SkillPR = JSON.parse(await data.text());
                    if (pr.status === "PENDING_REVIEW") {
                        prs.push(pr);
                    }
                }
            }

            return prs;
        } catch {
            return [];
        }
    }

    /**
     * Add market intelligence item
     */
    addIntelligence(item: string): void {
        this.marketIntelligence.push(item);
        // Keep last 100 items
        if (this.marketIntelligence.length > 100) {
            this.marketIntelligence.shift();
        }
    }

    /**
     * Throttled fetch for rate limiting
     */
    private async throttledFetch(url: string): Promise<Response> {
        if (this.rateLimiter.requests >= this.rateLimiter.limit) {
            const waitTime = this.rateLimiter.resetAt - Date.now();
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            this.rateLimiter.requests = 0;
            this.rateLimiter.resetAt = Date.now() + 60000;
        }

        this.rateLimiter.requests++;

        const apiKey = this.env.MOLTBOOK_API_KEY;
        return fetch(url, {
            headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
        });
    }

    /**
     * Check for alerts
     */
    async checkAlerts(): Promise<Alert[]> {
        const alerts: Alert[] = [];

        for (const exploit of this.securityAlerts) {
            if (exploit.severity === "CRITICAL" || exploit.severity === "HIGH") {
                alerts.push({
                    id: `OBSERVER-EXPLOIT-${exploit.id}`,
                    type: "SECURITY_EXPLOIT",
                    severity: exploit.severity,
                    message: `${exploit.protocol}: ${exploit.description}`,
                    data: exploit,
                    timestamp: Date.now(),
                    acknowledged: false
                });
            }
        }

        return alerts;
    }

    /**
     * Generate 4-hour report
     */
    async generateReport(): Promise<ObserverAgentReport> {
        // Run intelligence gathering
        await this.harvestSkills();
        await this.checkSecurityExploits();
        const pendingPRs = await this.getPendingSkillPRs();

        return {
            skillsReviewed: this.skillsHarvested,
            skillsHarvested: this.skillsHarvested,
            exploitsDetected: this.securityAlerts.length,
            securityAlerts: this.securityAlerts.length,
            marketIntelUpdated: this.marketIntelligence.length,
            marketIntelligence: this.marketIntelligence.slice(-10), // Last 10 items
            pendingPRs: pendingPRs.length
        };
    }
}

