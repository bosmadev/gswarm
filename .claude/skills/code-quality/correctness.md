# Correctness and Safety Rules

## Variable & Assignment

- Don't assign a value to itself
- Don't reassign const variables
- Don't reassign function parameters
- Don't have unused function parameters, imports, labels, private class members, or variables
- Don't use variables that haven't been declared in the document
- Don't use variables and function parameters before they're declared
- Don't let variable declarations shadow variables from outer scopes
- Don't initialize variables to undefined

## Control Flow

- Don't write unreachable code
- Don't use control flow statements in finally blocks
- Make sure super() is called exactly once on every code path in a class constructor before `this` is accessed
- Don't use lexical declarations in switch clauses
- Don't use optional chaining where undefined values aren't allowed
- Make sure "for" loop update clauses move the counter in the right direction
- Make sure generator functions contain yield

## Error Handling

- Make sure void (self-closing) elements don't have children
- Don't return a value from a function with the return type 'void'
- Don't return a value from a setter or constructor
- Use `isNaN()` when checking for NaN
- Make sure typeof expressions are compared to valid values

## Async & Promises

- Don't use await inside loops
- Make sure Promise-like statements are handled appropriately
- Don't use async functions as Promise executors

## Security

- Don't hardcode sensitive data like API keys and tokens
- Don't use `target="_blank"` without `rel="noopener"`
- Don't use the TypeScript directive @ts-ignore
- Prevent import cycles
- Prevent duplicate polyfills from Polyfill.io
