# TypeScript Best Practices

## Type Safety

- Don't use the `any` type
- Don't use implicit any type on variable declarations
- Don't let variables evolve into any type through reassignments
- Don't use any or unknown as type constraints
- Use `as const` instead of literal types and type annotations

## Prohibited Patterns

- Don't use TypeScript enums (use `as const` objects)
- Don't use TypeScript const enum
- Don't use TypeScript namespaces (use ES modules)
- Don't use non-null assertions with the `!` postfix operator
- Don't misuse the non-null assertion operator (!) in TypeScript files
- Don't use the TypeScript directive `@ts-ignore`
- Don't use parameter properties in class constructors

## Best Practices

- Use `export type` for types
- Use `import type` for types
- Use either `T[]` or `Array<T>` consistently
- Initialize each enum member value explicitly
- Make sure all enum members are literal values
- Don't declare empty interfaces
- Don't merge interfaces and classes unsafely
- Don't use overload signatures that aren't next to each other
- Don't add type annotations to variables, parameters, and class properties initialized with literal expressions
- Use the namespace keyword instead of the module keyword to declare TypeScript namespaces
- Don't export imported variables (use re-exports)
- Don't use user-defined types (Type Guards)

## Examples

### Good

```typescript
// as const instead of enum
const Status = {
  Active: 'active',
  Inactive: 'inactive',
} as const;
type Status = typeof Status[keyof typeof Status];

// Export type
export type { User, Profile };

// Import type
import type { Config } from './types';
```

### Bad

```typescript
// Using enum
enum Status { Active, Inactive }

// Using any
const data: any = fetchData();

// Non-null assertion
const name = user!.name;

// @ts-ignore
// @ts-ignore
const broken = something;
```
