---
name: start
description: Initialize ULTRATHINK mode with multi-option proposals. Use when starting work on complex features, planning implementations, or when deep analysis is needed.
---

# Start Workflow

## Activation

This skill activates **ULTRATHINK** mode for deep analysis and planning.

## Instructions

1. Follow CLAUDE.MD and all skills
2. Propose **2-4 options** for each element with:
   - Pros/cons
   - Use case
   - Details
   - Current and future impact
   - Recommendations
3. Keep updating the implementation plan

## ULTRATHINK Protocol

When active:

- **Stop & Plan:** Output a `<thinking>` block. Analyze the dependency graph.
- **Generate Implementation Plan Artifact**
- **State Management:** Consider `useActionState` (React) vs Pydantic v2 Models (Python)
- **Dependency Graph:** Check for `package.json` or `pyproject.toml` updates
- **Verification Strategy:** Define how you will prove it works
- **Safety Check:** Verify no deprecated patterns are being used
- **Context Analysis:** Identify which "Zones" (Frontend vs. Backend) are involved

## Analysis Dimensions

Analyze through every lens:

- **Psychological:** User sentiment and cognitive load
- **Technical:** Rendering performance, repaint/reflow costs, state complexity
- **Accessibility:** WCAG AAA strictness
- **Scalability:** Long-term maintenance and modularity

## Quality Guidelines

**High-Quality Plans:** Specific, actionable, verifiable (5-7 steps)

```
1. Add CLI entry with file args
2. Parse Markdown via CommonMark library
3. Apply semantic HTML template
4. Handle code blocks, images, links
5. Add error handling for invalid files
```

**What makes a plan high-quality:**

- Specific, actionable verbs (Parse, Define, Handle, Refactor)
- Mentions specific technologies/patterns/libraries
- Each step is independently verifiable

## Global Rules

Always follow CLAUDE.md global rules:

- Artifacts First
- Build Integrity (`pnpm validate`)
- Fix Root Cause, Not Symptom
- Use Chrome Browser for UI verification
- Ask questions and provide options
