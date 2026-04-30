# Agent Instructions — Zombie Outbreak Simulator

## When I ask you to make changes, you MUST follow these rules:

### README.md MUST stay in sync
- Every time you make a **visual change**, update `screenshot-v*.png` reference in README.md
- Every time you add/remove/modify a **feature**, update the Features section
- Every time you change **controls**, update the Controls table
- Every time you change **entity behavior**, update the Entity Types table
- Every time you change **building types/colors**, update the Building Types table
- Every time you change **balance**, update the Phase table or balance notes
- Delete the old screenshot from the repo when replacing it

### Legend MUST stay in sync
- Every time you add/remove a **building type**, update the legend in `src/main.ts` (innerHTML string)
- Every time you change a **building roof color**, sync the color swatch in the legend
- Every time you change **entity visuals**, update the entity descriptions in the legend
- Every time you change **controls**, update the legend hint text

### Screenshot must be updated for major visual changes
- Run `cd /home/openclaw/.openclaw/workspace/zombie-sim && timeout 15 node /tmp/ss-v13c.cjs 2>&1` (or equivalent) to capture a screenshot
- Save as `screenshot-v<N>.png` where N is the latest version number
- Update README.md to reference the new screenshot
- Delete old screenshot PNG from git if no longer referenced
- Add `!screenshot-v<N>.png` exception to .gitignore

### Always verify your work
- Run `npm run build` and fix any TypeScript errors
- Run `npm test` and make sure all tests pass (aim for 90%+ coverage)
- Test the dev server starts: `npm run dev` (background)
- Verify with: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`
- If screenshot fails (common Playwright/WebGL headless issue), note it but don't block the commit

### CI/CD monitoring
- After every push, check the GitHub Actions workflow status:
  ```bash
  cd /home/openclaw/.openclaw/workspace/zombie-sim && gh run view --branch master --status in_progress 2>/dev/null || echo "No running workflow"
  gh run list --branch master --limit 3 --json conclusion,headBranch,displayTitle
  ```
- If CI fails, investigate and fix the issue before doing anything else
- Common CI failures: test failures, build errors, TypeScript type errors

### Code style
- `src/simulation.ts` — all gameplay logic
- `src/renderer.ts` — all Three.js rendering
- `src/main.ts` — UI, HUD, controls, legend
- `src/style.css` — all styling
- `src/world.ts` — procedural generation
- `index.html` — shell only
- `src/__tests__/` — Vitest unit tests

### Git workflow
- Commit messages should be descriptive
- Push to `origin master` after each feature batch
- Keep `node_modules` and `dist` in .gitignore
- Keep `screenshot*.png` in .gitignore (with per-version exceptions)
