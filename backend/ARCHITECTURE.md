# CodeSentinel Architecture

## AI & Title System Architecture

### Overview
CodeSentinel uses a **centralized AI service architecture** with strict rules for vulnerability title generation and optional AI-powered explanations.

### Core Principles

#### 1. Deterministic Title Generation
**Rule:** Every vulnerability must have a clean, scannable title.

**Constraints:**
- 5-12 words
- ≤ 120 characters
- Plain English
- NO file paths, line numbers, or code snippets
- NO "Found", "Detected", or scanner boilerplate
- NO remediation steps

**Implementation:**
```
Scanner Output → Title Normalizer → Title Validator → Database
                      ↓ (if needed)
                  AI Title Generator
```

#### 2. Data Model Separation
**CRITICAL:** Strict separation between machine identifiers and human-readable content.

```typescript
// ✅ CORRECT
rule_id: "javascript.lang.security.audit.xss"  // Machine identifier
title: "Cross-Site Scripting (XSS)"            // Human-readable
description: "User input is rendered..."        // Full explanation

// ❌ WRONG
title: "javascript.lang.security.audit.xss"    // Machine ID as title
title: "Found XSS in file.ts at line 42..."    // File path in title
title: "Fix by sanitizing input..."            // Remediation in title
```

#### 3. AI Usage Rules

**When AI is Used:**
- Title generation for high-severity issues (critical/high)
- On-demand explanations (user-triggered)

**When AI is NOT Used:**
- Deduplication (rule-based is faster and cheaper)
- Severity classification (scanners are accurate)
- During scan execution (adds latency)

**Cost Controls:**
- Free tier rate limiting (Gemini: 15 RPM, Claude: 5 RPM)
- Hard token limits (50 tokens per title)
- Caching by rule_id + severity
- Auto-disable after 10 failures

### Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Services Layer                        │
│  /src/services/ai/                                          │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  AIClientService │  │ TitleGenerator   │                │
│  │                  │  │    Service       │                │
│  │  - Gemini/Claude │  │                  │                │
│  │  - Rate limiting │  │ - Validation     │                │
│  │  - Cost tracking │  │ - Normalization  │                │
│  │  - Observability │  │ - AI fallback    │                │
│  └──────────────────┘  └──────────────────┘                │
│           ↑                     ↑                            │
└───────────┼─────────────────────┼────────────────────────────┘
            │                     │
┌───────────┼─────────────────────┼────────────────────────────┐
│           │    Scan Pipeline    │                            │
│  /src/modules/scans/            │                            │
│                                 │                            │
│  Scanner → Deduplication ───────┘                            │
│  Output    Processor                                         │
│                ↓                                              │
│         vulnerabilities_unified                              │
│         (title, description, rule_id)                        │
└──────────────────────────────────────────────────────────────┘
```

### Title Generation Flow

```
1. Scanner produces raw finding
   ↓
2. Title Normalizer receives:
   - rule_id: "sql-injection"
   - raw_title: "Found SQL injection in user.ts at line 42"
   - description: "Unsafe SQL query construction..."
   ↓
3. Title Normalizer cleans:
   - Removes "Found" prefix
   - Removes file path
   - Removes line number
   ↓
4. Title Validator checks:
   - Length: ✓ (< 120 chars)
   - Word count: ✓ (5-12 words)
   - No forbidden patterns: ✓
   ↓
5. If validation fails:
   - Try AI generation (if high severity)
   - Fallback to rule_id extraction
   ↓
6. Final title: "SQL Injection Vulnerability"
```

### Vulnerability Data Model

#### Single Source of Truth: `vulnerabilities_unified`
```sql
CREATE TABLE vulnerabilities_unified (
  id UUID PRIMARY KEY,
  fingerprint TEXT UNIQUE NOT NULL,  -- Deduplication key
  
  -- Human-readable fields
  title TEXT NOT NULL,               -- 5-12 words, ≤120 chars
  description TEXT NOT NULL,         -- Full explanation
  
  -- Machine identifiers
  rule_id TEXT NOT NULL,             -- Scanner rule ID
  cwe TEXT,                          -- CWE identifier
  
  -- Metadata
  severity TEXT NOT NULL,
  scanner_type TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  
  -- First occurrence (informational)
  file_path TEXT,
  line_start INTEGER,
  
  -- Timestamps
  first_detected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
);
```

#### Instance Tracking: `vulnerability_instances`
```sql
CREATE TABLE vulnerability_instances (
  id UUID PRIMARY KEY,
  vulnerability_id UUID REFERENCES vulnerabilities_unified(id),
  scan_id UUID REFERENCES scans(id),
  
  -- Location details
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  
  -- For SCA/Container
  package_name TEXT,
  package_version TEXT,
  
  -- Raw finding
  raw_finding JSONB,
  detected_at TIMESTAMPTZ
);
```

### Frontend Display Rules

#### Global Vulnerabilities List
```tsx
// ✅ CORRECT: Show title only
<VulnerabilityRow>
  <Title>{vuln.title}</Title>
  <Severity>{vuln.severity}</Severity>
  <InstanceCount>{vuln.instance_count} locations</InstanceCount>
</VulnerabilityRow>

// ❌ WRONG: Don't show description in list
<VulnerabilityRow>
  <Title>{vuln.description}</Title>  // Too long!
</VulnerabilityRow>
```

#### Vulnerability Detail Page
```tsx
// ✅ CORRECT: Show full details
<VulnerabilityDetail>
  <h1>{vuln.title}</h1>
  <Description>{vuln.description}</Description>
  <Instances>
    {instances.map(inst => (
      <Instance>
        {inst.file_path}:{inst.line_start}
      </Instance>
    ))}
  </Instances>
</VulnerabilityDetail>
```

### AI Observability

#### Logging
Every AI call is logged:
```typescript
fastify.log.debug({
  operation: 'generate_title',
  model: 'gemini-2.0-flash-exp',
  input_tokens: 100,
  output_tokens: 20,
  cost_usd: 0.000014,
  duration_ms: 234,
  success: true
}, 'AI invocation successful');
```

#### Metrics
```typescript
const stats = aiClient.getUsageStats();
// {
//   total_invocations: 150,
//   successful: 145,
//   failed: 5,
//   total_cost_usd: 0.0021,
//   cache_size: 42,
//   auto_disabled: false
// }
```

### Migration Guide

#### Old Architecture (Deprecated)
```typescript
// ❌ OLD: Scattered AI calls
import { AIService } from '../ai/client';
const ai = new AIService(fastify);
await ai.enrichVulnerability(vuln);
```

#### New Architecture (Current)
```typescript
// ✅ NEW: Centralized services
import { getTitleGenerator } from '../services/ai';
const titleGen = getTitleGenerator(fastify);
const title = await titleGen.generateTitle(context);
```

### Testing Guidelines

#### Title Validation Tests
```typescript
describe('Title Validation', () => {
  it('should reject titles with file paths', () => {
    const result = titleGen.validateTitle('XSS in /app/user.ts');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Contains forbidden pattern');
  });

  it('should enforce word count limits', () => {
    const longTitle = 'This is a very long title with way too many words that exceeds the limit';
    const result = titleGen.validateTitle(longTitle);
    expect(result.valid).toBe(false);
  });
});
```

### Performance Considerations

#### Title Generation
- **Cached**: ~0ms (cache hit)
- **Rule-based**: ~1ms (fallback)
- **AI-generated**: ~200-500ms (rate-limited)

#### Best Practices
1. Cache aggressively (by rule_id + severity)
2. Use AI only for high-severity issues
3. Always have rule-based fallback
4. Never block scans on AI failures

### Security Considerations

#### API Key Management
```bash
# Required for AI features
GEMINI_API_KEY=your-key-here
# OR
ANTHROPIC_API_KEY=your-key-here
```

#### Rate Limiting
- Enforced at service level
- Prevents API quota exhaustion
- Auto-disables on repeated failures

#### Cost Protection
- Hard token limits
- Timeout enforcement
- Usage monitoring
- Free tier optimization

## Summary

The AI architecture in CodeSentinel is designed to be:
- **Deterministic**: Predictable, testable behavior
- **Observable**: Full logging and metrics
- **Cost-effective**: Free tier safe with caching
- **Reliable**: Never blocks scans, always has fallbacks
- **Clean**: Single source of truth, no scattered calls

All AI operations go through `/src/services/ai/` with strict validation and monitoring.
