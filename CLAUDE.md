# Claude Code Configuration
> v7.0 - Modular Skills Architecture

## 0. Stack & Build

**Stack:** Next.js 16.1+, React 19+, Node.js 25+, Python 3.14+, FastAPI, TypeScript 5.9.3+, Tailwind CSS v4+, Shadcn UI, Radix, Playwright, Vitest, Biome 2.3.10+, Knip 5.77.1+, uv 0.9.18+, pnpm 10.26.2+.

**Build Command:** `pnpm build`

## 1. Core Rules (CRITICAL)

- **Artifacts First:** NEVER start coding without generating an Implementation Plan Artifact
- **Build Integrity:** Run `pnpm validate` before confirming completion, resolving ALL warnings/errors
- **Browser:** Use Chrome Browser to visually verify UI changes
- **Root Cause:** NEVER apply band-aid fixes (`@ts-ignore`, `any`, `unknown`, suppressing warnings). Fix upstream interfaces, not downstream casts
- **Knip/Biome Agent:** Scan for unused imports, dead variables, unreachable exports - remove immediately
- **Question:** Always ask questions and provide detailed explanations with recommendations and options

## 2. Behavioral Rules

### Verbosity

Match response length to query complexity. Default to MINIMAL.

```
user: 2 + 2
assistant: 4

user: what command lists files?
assistant: ls
```

**Expand when:** User asks for detail, complex multi-step task, or ULTRATHINK mode active.

**Avoid:** "The answer is...", "Here is what I will do next...", post-action summaries.

### Proactiveness

**DO:** Execute clear requests, take obvious follow-ups, fix related issues.

**DON'T:** Surprise with unexpected changes, jump into action on "how should I...", add code explanations after edits, commit without explicit request.

### Professional Objectivity

Prioritize technical accuracy over validation. Focus on facts. Disagree when necessary. Objective guidance over false agreement.

## 3. Design Philosophy

- **Anti-Generic:** Reject bootstrapped layouts. If it looks like a template, it's wrong
- **Uniqueness:** Bespoke layouts, asymmetry, distinctive typography
- **Purpose:** Before placing any element, calculate its purpose. No purpose = delete
- **Minimalism:** Reduction is sophistication
- **Library Discipline:** If Shadcn UI/Radix/MUI detected, USE IT. Don't build custom components from scratch
- **Tailwind v4:** Prefer `@theme` in CSS for design tokens. Use `tailwind.config.ts` for plugins/dynamic logic

## 4. Framework Security

### Next.js 16+

- Server Components can access secrets safely
- Filter sensitive data before passing to Client Components
- Use Server Actions for mutations (built-in CSRF protection)
- Use `taintObjectReference` for sensitive server data

### Node.js

- Input validation with Zod at API boundaries
- Rate limiting on auth endpoints (`express-rate-limit`, `@upstash/ratelimit`)
- Security headers with Helmet.js
- Never hardcode secrets - use `.env.local`
- Run as non-root user

### Content Security Policy

```javascript
const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-{NONCE}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
`
```

## 5. Python 3.14+

- **Package Manager:** `uv` ONLY (`uv add`, `uv sync`). PROHIBIT `pip install` or `poetry`
- **Typing (PEP 695):** `type UserID = int`, `list[str]` (not `List[str]`)
- **Pydantic v2:** `model_config = ConfigDict(...)`, `model_validate()` / `model_dump()`

## 6. Infrastructure

### Hooks

Treat feedback from hooks (including `<user-prompt-submit-hook>`) as coming from the user. If blocked by a hook, adjust actions or ask user to check configuration.

### Artifact Context

- Path: `<appDataDir>/brain/<conversation-id>/`
- Key files: `implementation_plan.md`, `task.md`, `walkthrough.md`
- On "resume"/"continue": check `task.md` for next incomplete step

### Progress Updates

For longer tasks, provide updates at reasonable intervals:
- Concise (8-10 words max)
- Recap progress, indicate next step
- Example: "Fixed 3 of 10 type errors. Moving to API layer next."

### Code References

Use `file_path:line_number` format: `src/services/process.ts:712`

## 7. Trigger Modes

### YOLO Mode

**Trigger:** "YOLO", "Fix it", "Debug", Build Errors

- Assume consent - execute the fix
- Aggressive refactor upstream interfaces
- Self-correct Biome errors before output
- Fix silently, don't output broken code

### PLAN Mode

**Trigger:** "PLAN"

- READ-ONLY: No file edits, modifications, or system changes
- Launch up to 3 exploration searches in parallel
- End with clarifying question OR readiness to proceed

## 8. Skills Reference

### Domain Skills (Auto-triggered)

| Skill | Triggers | Description |
|-------|----------|-------------|
| `frontend-standards` | a11y, wcag, typescript, react, jsx, hooks | WCAG AAA + TypeScript + React/JSX patterns |
| `code-quality` | lint, quality, biome, knip, correctness | Linting + Biome/Knip enforcement |
| `security-audit` | security, owasp, vulnerability, audit | OWASP Top 10:2025 + security tools |

### Workflow Skills

| Skill | Auto-trigger | Description |
|-------|--------------|-------------|
| `/start` | YES | ULTRATHINK mode, propose 2-4 options |
| `/check` | YES | Investigation, debugging, validation, code review |
| `/launch` | NO | Debug mode, browser testing (manual only) |

## 9. Output Format

- Use `##` for top-level, `###` for subsections
- Use 4 backticks for code containing 3-backtick fences
- Add `// filepath: /path/to/file` for file edits
- Use `-` for bullets (4-6 max per list)
- Structure: Actions -> Artifacts -> How to Run -> Notes

## 10. Task Management

Use TodoWrite frequently:
- Mark `in_progress` when starting
- Mark `completed` immediately when done
- ONE `in_progress` at a time
- On "resume"/"continue", check todo list for next step
