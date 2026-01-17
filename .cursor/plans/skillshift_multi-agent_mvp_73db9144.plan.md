---
name: SkillShift Multi-Agent MVP
overview: Implement a 3-agent pipeline (Clarifier → Generator → Validator/Repair) using Cerebras via Vercel AI SDK v6, with Clerk auth, Convex persistence, and a multi-round clarifying UI flow.
todos:
  - id: auth-clerk
    content: Add Clerk auth scaffolding (middleware, providers, sign-in/up routes).
    status: pending
  - id: convex-schema
    content: Create Convex schema with `skillSessions` + `skills` tables and implement queries/mutations.
    status: pending
    dependencies:
      - auth-clerk
  - id: convex-client
    content: Wire Convex React provider in Next.js so UI can call Convex functions.
    status: pending
    dependencies:
      - convex-schema
  - id: api-agents
    content: Implement Next.js API routes for Clarifier (multi-round), Generator, and Validator/Repair using `@ai-sdk/cerebras` (default `llama3.1-8b`).
    status: pending
  - id: ui-flow
    content: "Replace demo with guided UI: intent → clarifier Q&A → generated SKILL.md → save + My Skills library."
    status: pending
    dependencies:
      - api-agents
      - convex-client
  - id: validation
    content: Add deterministic SKILL.md parsing checks + validator + auto-repair loop (max 2 attempts).
    status: pending
    dependencies:
      - api-agents
      - ui-flow
---

# SkillShift Multi-Agent MVP (Clarify → Generate → Validate)

## Goal

Turn messy product intent into a **valid Agent Skills `SKILL.md`** using a **multi-agent pipeline**:

- **Clarifier agent**: asks for missing context (multi-round, max 3 turns)
- **Generator agent**: produces `SKILL.md` (YAML frontmatter + Markdown body)
- **Validator agent**: validates against (a) Agent Skills spec and (b) the user’s provided context (original prompt + clarifier Q&A); on failure, **auto-repair** and re-validate

## Product scope (MVP)

- Auth: **Clerk** (skills stored per user)
- Persistence: **Convex** (save skill drafts + clarifier sessions)
- Output format: **Markdown** `SKILL.md`
- Model/provider: **Cerebras** via `@ai-sdk/cerebras`, default model **`llama3.1-8b`**

## Repo reality check (what we’ll build on)

- App currently shows a demo component (`app/page.tsx` → `components/component-example.tsx`).
- Convex is installed but there is **no schema or functions yet** (`convex/_generated/dataModel.d.ts` indicates missing `schema.ts`).
- No existing AI SDK or Convex React wiring found in `app/` or `components/`.

## Architecture

### Data flow

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Nextjs_UI
  participant API as Nextjs_API
  participant LLM as Cerebras
  participant CX as Convex

  U->>UI: Paste intent
  UI->>API: startSession(intent)
  API->>LLM: ClarifierAgent
  LLM-->>API: questions
  API-->>UI: show questions

  loop upTo3Turns
    U->>UI: Answer questions
    UI->>API: submitAnswers
    API->>LLM: ClarifierAgent (with Q&A)
    LLM-->>API: moreQuestions OR ready
    API-->>UI: update
  end

  UI->>API: generateSkill
  API->>LLM: GeneratorAgent
  LLM-->>API: draftSkillMd

  loop autoRepair
    API->>LLM: ValidatorAgent
    LLM-->>API: valid OR issues
    alt issues
      API->>LLM: RepairAgent (can be same validator prompt in "fix" mode)
      LLM-->>API: revisedSkillMd
    end
  end

  UI->>CX: saveSkill(draft)
  CX-->>UI: skillId
```



### Agent roles (prompt-level contracts)

- **Clarifier agent**
- Input: user intent + prior Q&A
- Output: either `{"status":"need_more_info","questions":[...]} `or `{"status":"ready"}`
- Guardrails: ask only what’s necessary; prefer multiple-choice when possible
- **Generator agent**
- Input: intent + Q&A
- Output: `SKILL.md` with **required YAML frontmatter** (`name`, `description`) + Markdown instructions
- **Validator agent**
- Input: intent + Q&A + candidate `SKILL.md`
- Output: `{"valid":true}` OR `{"valid":false,"issues":[...],"fix_suggestion":...}`
- Checks:
    - Agent Skills spec: YAML frontmatter present; `name`/`description` exist; naming conventions
    - Alignment: skill doesn’t contradict user intent/Q&A
- On failure: triggers repair pass and re-validates

## Implementation steps

### 1) Auth (Clerk)

- Add Clerk integration for user identity.
- Files:
- `middleware.ts`
- `app/layout.tsx`
- `app/sign-in/[[...sign-in]]/page.tsx`
- `app/sign-up/[[...sign-up]]/page.tsx`
- Env:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

### 2) Convex schema + tables

- Add `convex/schema.ts` with tables:
- `skillSessions`: `{ userId, intent, turn, qa: [{q,a}], status, createdAt, updatedAt }`
- `skills`: `{ userId, name, description, skillMarkdown, sourceIntent, qaSnapshot, createdAt, updatedAt }`
- Add `convex/skills.ts` queries/mutations:
- `createSession`, `appendAnswers`, `setSessionStatus`
- `createSkill`, `listMine`, `getMine`, `deleteMine`

### 3) Convex React provider wiring

- Add client provider wrapper and hook up `NEXT_PUBLIC_CONVEX_URL`.
- Files:
- `app/providers.tsx` (new)
- `app/layout.tsx` (wrap children)

### 4) API routes for multi-agent orchestration (Next.js)

Implement endpoints (server-side) that call Cerebras via AI SDK:

- `POST /api/skills/session/start` → run ClarifierAgent turn 1
- `POST /api/skills/session/answer` → append answers, run ClarifierAgent again
- `POST /api/skills/generate` → run GeneratorAgent, then Validator/Repair loop

Provider details:

- Use `@ai-sdk/cerebras` and `CEREBRAS_API_KEY`
- Default model: `llama3.1-8b`

### 5) UI flow (shadcn)

use existing elements in componenets/ai-elements when possibleReplace demo UI with a guided experience

- Step 1: Paste intent
- Step 2: Clarifier chat-style Q&A (multi-round up to 3)
- Step 3: Show generated `SKILL.md` + validation status + copy button
- Step 4: Save to Convex and show in **My Skills** list

Files:

- `app/page.tsx`
- `components/SkillComposer.tsx` (intent input)
- `components/ClarifierPanel.tsx` (questions + answers)
- `components/SkillPreview.tsx` (markdown + copy)
- `components/SkillLibrary.tsx` (list/detail)

### 6) Validation + repair mechanics

- Add deterministic checks on the server in addition to LLM validation:
- frontmatter extraction
- required keys present
- slug-safe `name`
- Validator agent also checks alignment with user Q&A.
- Auto-repair attempts: start with **2 repair attempts** (configurable).

## Out of scope (MVP)

- Downloading full skill folders/zip
- Executing bundled scripts / sandboxing
- Skill versioning, tags, org/team sharing

## Todos

- `auth-clerk`: Add Clerk auth scaffolding.
- `convex-schema`: Create schema + session/skills tables + functions.
- `convex-client`: Add Convex provider wiring.