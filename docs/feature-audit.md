# Feature Flag Audit

Run the following before publishing a feature batch:

```powershell
node tools/audit-feature-flags.js
node --check game.js
```

The audit reads every `FEATURES` key from `config.js` and verifies that the game checks it. Placeholder systems are explicitly exempted inside the audit script; new placeholders must be added there deliberately rather than silently ignored.

This keeps the 1,000-idea catalog safe to expand: a proposed toggle is not considered integrated until it has a game-side check and an ON/OFF browser smoke test.
