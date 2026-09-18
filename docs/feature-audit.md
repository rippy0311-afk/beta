# Feature Flag Audit

Run the following before publishing a feature batch:

```powershell
node tools/audit-feature-flags.js
node --check game.js
```

The audit reads every `FEATURES` key from `systems/gameplay-options.js` and verifies that the game checks it. New options must be deliberate gameplay groupings rather than placeholders.

This keeps the 1,000-idea catalog safe to expand: a proposed toggle is not considered integrated until it has a game-side check and an ON/OFF browser smoke test.
