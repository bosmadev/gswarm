# Code Complexity and Quality

## Avoid Complexity

- Don't write functions that exceed a given Cognitive Complexity score
- Don't nest describe() blocks too deeply in test files
- Don't use nested ternary expressions
- Don't use the comma operator
- Use single `if` statements instead of nested `if` clauses
- Use `else if` instead of nested `if` statements in `else` clauses
- Don't use `else` blocks when the `if` block breaks early

## Unnecessary Code

- Don't use unnecessary boolean casts
- Don't use unnecessary callbacks with flatMap
- Don't use unnecessary catch clauses
- Don't use unnecessary constructors
- Don't use unnecessary continue statements
- Don't export empty modules that don't change anything
- Don't use unnecessary escape sequences in regular expression literals
- Don't use unnecessary fragments
- Don't use unnecessary labels
- Don't use unnecessary nested block statements
- Don't rename imports, exports, and destructured assignments to the same name
- Don't use unnecessary string or template literal concatenation
- Don't use `String.raw` in template literals when there are no escape sequences
- Don't use useless case statements in switch statements
- Don't use ternary operators when simpler alternatives exist
- Don't use useless `this` aliasing
- Remove redundant terms from logical expressions

## Prohibited Patterns

- Don't use the `arguments` object
- Don't use primitive type aliases or misleading types
- Don't use empty type parameters in type aliases and interfaces
- Don't create classes that only have static members
- Don't use `this` and `super` in static contexts
- Don't use the void operators
- Don't use bitwise operators
- Don't use global `eval()`
- Don't use the `delete` operator
- Don't use `console`
- Don't use `debugger`
