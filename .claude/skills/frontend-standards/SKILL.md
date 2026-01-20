---
name: frontend-standards
description: Frontend code standards including WCAG AAA accessibility, TypeScript type safety, and React/JSX patterns. Use when writing or reviewing React components, TypeScript code, or checking accessibility.
---

# Frontend Standards

## Scope

This skill covers:
- WCAG AAA accessibility compliance
- TypeScript type safety rules
- React component and hooks patterns
- Next.js specific patterns

## Quick Reference

### Accessibility (a11y)

- Use semantic elements instead of ARIA roles where possible
- Include proper ARIA attributes when semantic elements aren't sufficient
- Ensure keyboard navigation for all interactive elements
- Provide meaningful alt text for images (never include "image", "picture", "photo")
- Always include `type` attribute for buttons
- Include `lang` attribute on html element

### TypeScript

- Never use `any` or `unknown` as type constraints
- Use `as const` instead of enums
- Use `export type` and `import type` for types
- No `@ts-ignore` or non-null assertions (`!`)
- No TypeScript namespaces (use ES modules)
- No parameter properties in class constructors

### React/JSX

- Don't define components inside other components
- Specify all dependencies in hooks
- Use `<>...</>` instead of `<Fragment>`
- No Array index as keys
- Don't pass children as props
- Accompany `onClick` with keyboard handlers (`onKeyUp`, `onKeyDown`, `onKeyPress`)

### Next.js 16+

- Use `next/image` instead of `<img>`
- Use metadata API instead of `<head>`
- Use `useActionState` from `react` (NOT `react-dom`)
- Use `use cache` directive for function-level caching
- Prohibit `useEffect` for data fetching (use Server Components or TanStack Query)

## Detailed Rules

- For complete accessibility rules, see [a11y-rules.md](a11y-rules.md)
- For TypeScript patterns, see [typescript-rules.md](typescript-rules.md)
- For React best practices, see [react-patterns.md](react-patterns.md)

## Examples

### Good

```tsx
// Semantic HTML with proper accessibility
<button type="button" onClick={handleClick} onKeyDown={handleKeyDown}>
  Submit
</button>

// Proper typing
type UserID = string;
const users: readonly User[] = [];

// Fragment shorthand
<>
  <Header />
  <Main />
</>
```

### Bad

```tsx
// Missing type attribute
<button onClick={handleClick}>Submit</button>

// Using any
const data: any = fetchData();

// Using enums
enum Status { Active, Inactive }

// Array index as key
items.map((item, i) => <Item key={i} />)
```
