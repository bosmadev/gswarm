---
name: launch
description: Run debug mode and browser testing for visual verification. Manual invocation only - use /launch to run.
---

# Launch Workflow

**Note:** This skill requires manual invocation (`/launch`). It does not auto-trigger.

## Purpose

Run the application in debug mode and perform visual verification in the browser.

## Instructions

1. **Run debug mode**
   ```bash
   pnpm launch
   ```

2. **Monitor output**
   - Watch console for errors
   - Check Antigravity browser
   - Review network debug log

3. **Click around** - Test interactive elements and verify behavior

4. **Check for issues**
   - Console errors
   - Network failures
   - UI glitches
   - Performance issues

5. **Research improvements**
   - Scout the internet using model tools
   - Based on current context (brain, tasks, implementation plans)
   - Make proposals for improvements

## What to Check

### Console
- JavaScript errors
- Warning messages
- Failed network requests

### Network
- API response times
- Failed requests
- Unexpected payloads

### UI
- Layout issues
- Responsive behavior
- Interactive element feedback
- Accessibility issues

### Performance
- Slow renders
- Memory leaks
- Large bundle sizes

## Output Format

```
## Launch Results

### Console Issues
- [List any console errors/warnings]

### Network Issues
- [List any network problems]

### UI Issues
- [List any visual problems]

### Improvement Proposals
1. [Proposal based on research]
   - Rationale: ...
   - Impact: ...
```
