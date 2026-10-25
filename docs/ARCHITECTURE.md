# Architecture

CareerLog is a static HTML/CSS/JavaScript app with Supabase Auth and PostgreSQL. There is no custom application server. `server.mjs` serves local development files.

```text
index.html → bootstrap.js → app.js
                            ├── auth.js → Supabase Auth
                            └── workspace.js → repository.js → Data API → PostgreSQL RLS
                                      └── applications.js (pure rules)
```

## Decisions

- Keep the current design and plain JavaScript to finish a focused project.
- Use one applications table. A follow-up is an optional date; Done clears it. There are no scheduled notifications or completion history.
- Authorize requests in PostgreSQL ownership policies, independently of interface controls. UPDATE uses both USING and WITH CHECK.
- Update the interface from the confirmed write response. A later failed refresh cannot masquerade as a failed write.
- Ignore responses from previous sessions and block duplicate writes while pending.
- Fetch in batches, then filter/count locally. This suits personal datasets; high-volume use would need server filtering and aggregation.
- Keep only public URL/publishable-key configuration in the browser. Secret/service-role keys are never needed here.
- Pin the external SDK version and show a reload message if modules fail to load.

## Tradeoffs

There is no change history, offline write queue, concurrent-edit resolution, or AI. Edits from another tab require Refresh. An interrupted request after a server commit can be ambiguous; refresh before retrying to avoid duplicates. Supabase, esm.sh, and optional Google Fonts require network access.
