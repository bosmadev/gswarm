# Accessibility Rules (WCAG AAA Strict)

## Semantic & ARIA Rules

- Use semantic elements instead of role attributes in JSX
- Don't add ARIA roles, states, and properties to elements that don't support them
- Don't assign non-interactive ARIA roles to interactive HTML elements (and vice versa)
- Don't use explicit `role` property that's the same as the implicit/default role
- Include all required ARIA attributes for elements with ARIA roles
- Ensure all ARIA properties (`aria-*`) are valid with valid values
- Use valid, non-abstract ARIA roles

## Focus & Keyboard Navigation

- Don't set `aria-hidden="true"` on focusable elements
- Don't use `accessKey` attribute on any HTML element
- Don't assign `tabIndex` to non-interactive HTML elements (unless with `aria-activedescendant`)
- Don't use positive integers for `tabIndex` property
- Make elements with interactive roles and handlers focusable
- Accompany `onClick` with at least one of: `onKeyUp`, `onKeyDown`, or `onKeyPress`
- Accompany `onMouseOver`/`onMouseOut` with `onFocus`/`onBlur`
- Make static elements with click handlers use a valid role attribute

## Content & Labels

- Make sure label elements have text content and are associated with an input
- Give all elements requiring alt text meaningful information for screen readers
- Don't include "image", "picture", or "photo" in img alt prop
- Make sure anchors have content accessible to screen readers
- Make sure all anchors are valid and navigable
- Give heading elements content accessible to screen readers (not hidden with `aria-hidden`)
- Always include a `title` element for SVG elements
- Always include a `title` attribute for iframe elements
- Include caption tracks for audio and video elements

## Element-Specific Rules

- Always include a `type` attribute for button elements
- Only use the `scope` prop on `<th>` elements
- Always include a `lang` attribute on the html element
- Use correct ISO language/country codes for the `lang` attribute
- Use valid values for the `autocomplete` attribute on input elements
- Don't use distracting elements like `<marquee>` or `<blink>`
