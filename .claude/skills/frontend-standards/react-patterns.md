# React and JSX Best Practices

## Component Rules

- Don't define React components inside other components
- Don't use the return value of `React.render`
- Don't assign to React component props
- Don't destructure props inside JSX components in Solid projects

## Hooks

- Make sure all dependencies are correctly specified in React hooks
- Make sure all React hooks are called from the top level of component functions

## JSX Patterns

- Don't use Array index in keys
- Don't pass children as props
- Don't forget key props in iterators and collection literals
- Don't use both `children` and `dangerouslySetInnerHTML` props on the same element
- Don't use dangerous JSX props
- Use `<>...</>` instead of `<Fragment>...</Fragment>`
- Don't add extra closing tags for components without children
- Don't assign JSX properties multiple times
- Don't insert comments as text nodes
- Watch out for possible "wrong" semicolons inside JSX elements
- Don't use event handlers on non-interactive elements

## Next.js Specific Rules

- Don't use `<img>` elements (use `next/image`)
- Don't use `<head>` elements (use `next/head` or metadata API)
- Don't import `next/document` outside of `pages/_document.jsx`
- Don't use the `next/head` module in `pages/_document.js`

## Next.js 16.1 & React 19

- **Caching:** Use the `use cache` directive for function-level caching
- Avoid `revalidatePath` if `updateTag` is applicable
- **PROHIBIT** `useEffect` for data fetching - use Server Components with `await` or `useQuery` (TanStack)
- **Server Actions:** Use `useActionState` from `react` (NOT `react-dom`)
- Validate all inputs using **Zod** schemas immediately
- Return flattened error structures: `{ success: boolean, errors?: Record<string, string> }`

## Examples

### Good

```tsx
// Fragment shorthand
<>
  <Header />
  <Main />
</>

// Proper key usage
{items.map(item => <Item key={item.id} data={item} />)}

// Server component data fetching
async function UserList() {
  const users = await getUsers();
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

### Bad

```tsx
// Component inside component
function Parent() {
  function Child() { return <div />; } // Bad!
  return <Child />;
}

// Array index as key
{items.map((item, i) => <Item key={i} />)}

// useEffect for data fetching
useEffect(() => {
  fetchData().then(setData);
}, []);
```
