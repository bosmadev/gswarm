# Style and Consistency

## Modern JavaScript

- Use arrow functions instead of function expressions
- Use `Date.now()` to get milliseconds since the Unix Epoch
- Use `.flatMap()` instead of `map().flat()` when possible
- Use `for...of` statements instead of `Array.forEach`
- Use while loops instead of for loops when you don't need initializer and update expressions
- Use `for-of` loops when you need the index to extract an item from the iterated array
- Use literal property access instead of computed property access
- Don't use `parseInt()` or `Number.parseInt()` when binary, octal, or hexadecimal literals work
- Use concise optional chaining instead of chained logical expressions
- Use regular expression literals instead of the RegExp constructor when possible
- Use template literals over string concatenation
- Use `String.slice()` instead of `String.substr()` and `String.substring()`
- Use `String.trimStart()` and `String.trimEnd()` over `String.trimLeft()` and `String.trimRight()`
- Use `at()` instead of integer index access
- Use the `**` operator instead of `Math.pow`
- Use assignment operator shorthand where possible
- Use `const` declarations for variables that are only assigned once
- Use `===` and `!==`

## Node & Built-ins

- Use the `node:` protocol for Node.js builtin modules
- Use `node:assert/strict` over `node:assert`
- Use Number properties instead of global ones (`Number.isFinite`, `Number.isNaN`)
- Use `new` for all builtins except `String`, `Number`, and `Boolean`
- Use `new` when throwing an error
- Don't throw non-Error values
- Use static Response methods instead of `new Response()` constructor when possible
- Use `Array.isArray()` instead of `instanceof Array`
- Use `with { type: "json" }` for JSON module imports
- Use numeric separators in numeric literals
- Use object spread instead of `Object.assign()` when constructing new objects
- Always use the radix argument when using `parseInt()`
- Include a description parameter for `Symbol()`

## Regular Expressions

- Don't use consecutive spaces in regular expression literals
- Don't use empty character classes in regular expression literals
- Don't use control characters and escape sequences in regular expression literals
- Don't use useless backreferences in regular expressions
- Don't use unnecessary escapes in string literals
- Declare regex literals at the top level

## Declarations & Scope

- Don't declare functions and vars that are accessible outside their block
- Don't redeclare variables, functions, classes, and types in the same scope
- Put default function parameters and optional function parameters last
- Include a `default` clause in switch statements
- Make sure default clauses in switch statements come last
- Make sure switch-case statements are exhaustive
- Don't use var
- Don't use with statements
- Make sure to use the "use strict" directive in script files

## Object & Class Patterns

- Make sure getters and setters for the same property are next to each other
- Make sure object literals are declared consistently
- Make sure get methods always return a value
- Use consistent accessibility modifiers on class properties and methods
- Use function types instead of object types with call signatures
- Don't use shorthand assign when the variable appears on both sides
- Don't access namespace imports dynamically
- Don't use namespace imports

## String Patterns

- Don't use template literals if you don't need interpolation
- Don't use constants whose value is the upper-case version of their name
- Don't use yoda expressions
- Don't assign values in expressions

## Misc

- Don't use 8 and 9 escape sequences in string literals
- Don't use octal escape sequences in string literals
- Don't use literal numbers that lose precision
- Don't use number literal object member names that aren't base 10 or use underscore separators
- Use standard constants instead of approximated literals
- Don't compare against -0
- Don't use the `then` property
- Make sure to use the digits argument with `Number#toFixed()`
- Don't spread (`...`) syntax on accumulators
- Make sure JSDoc comment lines start with a single asterisk
- Make sure the `preconnect` attribute is used when using Google Fonts
- Use a recommended display strategy with Google Fonts
