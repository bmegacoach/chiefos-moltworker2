---
name: moltbook-parser
description: Extract intelligence from Moltbook API (read-only)
---

# Moltbook Parser

## Overview
Read-only intelligence extraction from Moltbook for skills and market data.

## API Configuration

```typescript
// Moltbook API (read-only access)
const MOLTBOOK_API = "https://api.moltbook.com/v1";

interface MoltbookConfig {
  apiKey: string;           // Read-only key
  rateLimit: number;        // Requests per minute
  endpoints: string[];      // Allowed endpoints
}

const READ_ONLY_ENDPOINTS = [
  "/skills",
  "/exploits",
  "/market-intelligence",
  "/protocols"
];
```

## Skill Extraction

```typescript
interface MoltbookSkill {
  id: string;
  name: string;
  category: string;
  protocol: string;
  successRate: number;
  lastUpdated: number;
  content: string;
}

async function extractSkills(
  category: string
): Promise<MoltbookSkill[]> {
  const response = await fetch(`${MOLTBOOK_API}/skills?category=${category}`, {
    headers: { "Authorization": `Bearer ${MOLTBOOK_API_KEY}` }
  });
  
  const skills = await response.json();
  
  // Filter for ecosystem-relevant skills
  return skills.filter(skill => 
    skill.protocol.includes("layerzero") ||
    skill.protocol.includes("base") ||
    skill.category === "treasury"
  );
}
```

## Security Intelligence

```typescript
interface ExploitAlert {
  id: string;
  protocol: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  affectedContracts: string[];
  mitigation: string;
  timestamp: number;
}

async function getRecentExploits(): Promise<ExploitAlert[]> {
  const response = await fetch(`${MOLTBOOK_API}/exploits?since=24h`);
  const exploits = await response.json();
  
  // Alert Governor if any affect our protocols
  const relevant = exploits.filter(e => 
    e.protocol === "layerzero" ||
    e.protocol === "base" ||
    e.affectedContracts.some(c => OUR_CONTRACTS.includes(c))
  );
  
  if (relevant.length > 0) {
    await alertGovernor(relevant);
  }
  
  return relevant;
}
```

## Skill PR Workflow

```typescript
interface SkillPR {
  skillId: string;
  source: "moltbook";
  content: string;
  proposedPath: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
}

async function proposeSkillPR(skill: MoltbookSkill): Promise<SkillPR> {
  // 1. Validate skill content
  const validated = await validateSkillContent(skill);
  
  // 2. Determine target path
  const path = `skills/${skill.category}/${skill.name}.md`;
  
  // 3. Create PR proposal for Chief review
  const pr: SkillPR = {
    skillId: skill.id,
    source: "moltbook",
    content: validated.content,
    proposedPath: path,
    status: "PENDING_REVIEW"
  };
  
  await R2.put(`skill-prs/${Date.now()}-${skill.id}.json`, JSON.stringify(pr));
  
  return pr;
}
```

## Rate Limiting

```typescript
// Respect Moltbook API limits
const rateLimiter = {
  requests: 0,
  resetAt: Date.now() + 60000,
  limit: 30 // 30 requests per minute
};

async function throttledFetch(url: string): Promise<Response> {
  if (rateLimiter.requests >= rateLimiter.limit) {
    const waitTime = rateLimiter.resetAt - Date.now();
    if (waitTime > 0) await sleep(waitTime);
    rateLimiter.requests = 0;
    rateLimiter.resetAt = Date.now() + 60000;
  }
  
  rateLimiter.requests++;
  return fetch(url);
}
```
