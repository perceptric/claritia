# Claritia for Make

The Make custom app on the Forms API (docs/integrations-plan.md, Next step 1). Each file is one block of Make's
app editor (Make › Custom apps): copy it into the block of the same name, or push the folder with Make's Apps SDK
for VS Code. The connection signs in with OAuth (client id `make`, secret = the server's `OAUTH_MAKE_SECRET`).

| Block | File |
|---|---|
| Base | `base.json` |
| Connection | `connections/claritia.json` |
| Webhooks (one per event) | `webhooks/*.json` |
| Instant triggers | `modules/watch*.json` |
| Search | `modules/findFill.json` |
| Action | `modules/addToWorkflow.json` |
| Lists for pickers | `rpcs/*.json` |
