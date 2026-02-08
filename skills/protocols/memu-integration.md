---
description: How to use memU for agent short-term memory and context management
---

# memU Integration Skill

This skill enables ChiefSOS agents to use memU for short-term memory management.

## Overview

memU provides:
- **Short-term context**: Working memory during task execution
- **Cross-agent coordination**: Shared memories between GBB, CAMP, Governor agents
- **Token optimization**: Reduces LLM context size by 60-80%

## Architecture

```
Long-Term (R2)          Short-Term (memU)
├── Reports/            ├── preferences/
├── Conversations/      ├── context/
└── Skills/             └── recent_conversations/
```

## Usage

### Store Agent Interaction
```typescript
import { createMemUClient } from './memu-client';

const memu = createMemUClient(env);
if (memu) {
    await memu.storeAgentInteraction('gbb-agent', [
        { role: 'user', text: 'Check gold reserve ratio' },
        { role: 'assistant', text: 'Current ratio: 105.2%' }
    ]);
}
```

### Retrieve Context Before Task
```typescript
const context = await memu.getAgentContext('gbb-agent', 'gold reserve status');
// Returns: "[knowledge] Gold reserve ratio monitoring active..."
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/memorize` | POST | Store new memories |
| `/retrieve` | POST | Query existing memories |
| `/health` | GET | Health check |

## Environment Variables

Set these in `wrangler.jsonc` or via secrets:
- `MEMU_API_URL`: memU server URL (e.g., `https://memu.yourdomain.com`)
- `MEMU_API_KEY`: Optional API key for authentication

## Memory Lifecycle

1. **Intake**: Agent stores interaction after completing task
2. **Categorization**: memU auto-categorizes (preferences, knowledge, context)
3. **Retrieval**: Agent queries before starting new task
4. **Proactive**: memU predicts what context will be needed

## Best Practices

1. Store **outcomes**, not raw conversations
2. Use agent-scoped queries for isolation
3. Combine with R2 for long-term archival
4. Monitor token usage via memU dashboard
