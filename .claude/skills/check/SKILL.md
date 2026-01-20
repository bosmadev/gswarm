---
name: check
description: Investigation, debugging, build validation, and code review. Use when debugging issues, researching problems, validating implementations, or reviewing code quality.
---

# Check Workflow

## Purpose

Investigate problems, validate implementations, and ensure code quality.

## Phase 1: Investigation (If Needed)

### Fetch Provided URLs
- If user provides a URL, fetch and review it
- Recursively gather relevant information from linked pages

### Understand the Problem
- Read the issue carefully and think critically
- What is the expected behavior?
- What are edge cases and potential pitfalls?
- How does this fit into the larger codebase?

### Codebase Investigation
- Explore relevant files and directories
- Search for key functions, classes, or variables
- Read and understand relevant code snippets (200+ lines of context)
- Identify the root cause

### Research
- Search for framework/library documentation
- Verify understanding of third-party dependencies
- Don't rely on training data for package usage

### Debugging
- Determine root cause rather than addressing symptoms
- Use print statements/logs to inspect state
- Test hypotheses with test statements or functions
- Revisit assumptions if unexpected behavior occurs

## Phase 2: Validation

### Build Integrity
- [ ] Run `pnpm build`
- [ ] Zero warnings
- [ ] Zero errors
- [ ] All tests pass

### Code Review
- [ ] No logical bugs
- [ ] No security issues
- [ ] No unused imports or variables
- [ ] No `@ts-ignore` or `any` types
- [ ] Proper error handling

### Implementation Review
- [ ] All tasks from implementation plan completed
- [ ] All tasks from older plan versions completed
- [ ] No missed edge cases
- [ ] Documentation updated if needed

### Quality Checks
- [ ] Biome linting passes
- [ ] Knip dead-code check passes
- [ ] TypeScript strict mode passes
- [ ] Accessibility requirements met

## Phase 3: Improvements

- Review uncommitted changes for logical bugs and security issues
- Look through older implementation plans for missed items
- Look for ways to improve README structurally and visually

## Key Principles

### Fix the Root Cause, Not the Symptom
- NEVER apply band-aid fixes (`@ts-ignore`, `any`, `unknown`, suppressing warnings)
- If a fix requires a suppression, explain *why* the architecture failed
- Refactor upstream interfaces rather than casting downstream values

### If Issues Found

When `pnpm build` returns warnings or errors:
1. List all issues found
2. Propose **2-4 options** for fixing each issue
3. Include pros/cons for each option
4. Recommend the best approach
5. Execute the fix after approval
