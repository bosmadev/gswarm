---
name: code-quality
description: Code quality standards including Biome linting, Knip dead-code detection, correctness rules, and style consistency. Use when reviewing code quality, fixing lint errors, or cleaning up unused code.
---

# Code Quality

## Scope

This skill covers:
- Correctness and safety rules
- Code complexity management
- Style and consistency
- Biome linting enforcement
- Knip dead-code detection

## Quick Reference

### Biome (JS/TS)

- If code isn't Biome compliant, it isn't finished
- Enforce strict linting - if Biome complains, the code is wrong
- Sort imports automatically using Biome's organization rules
- **PROHIBIT** `eslint` or `prettier` configurations

### Knip (Dead Code)

- Assume aggressive dead code stripping - export only what is used
- Proactively identify unused files
- If a file is not imported by `entry` or `tests`, suggest deletion
- Keep the `ignore` in `package.json` at bare-minimum

### Key Correctness Rules

- Don't reassign const variables or function parameters
- Don't write unreachable code
- Don't use await inside loops
- Don't use async functions as Promise executors
- Don't hardcode sensitive data like API keys

### Key Style Rules

- Use arrow functions instead of function expressions
- Use `for...of` instead of `Array.forEach`
- Use template literals over string concatenation
- Use `const` for variables only assigned once
- Use `===` and `!==`

## Detailed Rules

- For correctness rules, see [correctness.md](correctness.md)
- For complexity rules, see [complexity.md](complexity.md)
- For style rules, see [style.md](style.md)

## Testing Best Practices

- **Frontend:** `vitest` (colocated `*.test.tsx`)
- **E2E:** Use Chrome browser for full-stack flows
- Don't use focused tests (`.only`) or disabled tests (`.skip`) in committed code
- Make sure assertions are inside `it()` function calls
- Don't use callbacks in asynchronous tests and hooks

## Error Handling Example

```typescript
// Good: Comprehensive error handling
try {
  const result = await fetchData();
  return { success: true, data: result };
} catch (error) {
  console.error('API call failed:', error);
  return { success: false, error: error.message };
}

// Bad: Swallowing errors
try {
  return await fetchData();
} catch (e) {
  console.log(e);
}
```
