# Studio MCP capability matrix

The MCP tool catalog is intentionally stable at **38 tools**. A tool remains discoverable even when its MCP-internal credential is not configured; the call then fails with an explicit capability error. ChatGPT may use separately connected GitHub, Railway and Supabase connectors for infrastructure operations instead of duplicating broad credentials inside the MCP service.

## Credential policy

- **GitHub:** do not add an account-wide token. Prefer the connected GitHub connector. Only add `GITHUB_TOKEN` later if an MCP-internal repo/CI action is proven necessary; if added, use a fine-grained credential scoped to `annetbg-wq/aicorn-ai-studio` only.
- **Railway:** privileged MCP deploy operations use `RAILWAY_PROJECT_TOKEN`, a project token scoped to the production environment. Never use an account-wide Railway token.
- **Supabase:** diagnostic-run lifecycle tools require `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; direct SQL administration requires `SUPABASE_DB_URL`. These secrets are not returned by the connected Supabase OAuth connector and must never be committed.
- **Render:** no Render API credential is used. `RENDER_EXTERNAL_URL` is recognized only as a passive hosting fallback for old deployments.

## Tool-by-tool matrix

| Tool | MCP-internal requirement | Current production state before credential wiring | Preferred path |
|---|---|---|---|
| `repo_read_file` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_search_code` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_git_status` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_git_diff` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_git_log` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_create_branch` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_write_files` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_delete_branch` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_open_pr` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_read_pr` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_list_prs` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `repo_merge_pr` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `ci_run` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `ci_get_run_status` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `ci_get_run_logs` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `deploy_trigger_backend` | Railway deploy capability | unavailable until project token is wired | MCP after scoped token; Railway connector meanwhile |
| `deploy_get_backend_status` | Railway deploy capability | unavailable until project token is wired | MCP after scoped token; Railway connector meanwhile |
| `deploy_get_backend_logs` | Railway deploy capability | unavailable until project token is wired | MCP after scoped token; Railway connector meanwhile |
| `deploy_get_pages_status` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `deploy_get_health` | none | available | MCP |
| `config_list_backend_env_keys` | Railway deploy capability | unavailable until project token is wired | MCP after scoped token; Railway connector meanwhile |
| `supabase_get_schema` | `SUPABASE_DB_URL` | unavailable | Supabase connector |
| `supabase_list_migrations` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `supabase_run_migration` | `GITHUB_TOKEN` + `SUPABASE_DB_URL` | unavailable | GitHub + Supabase connectors |
| `supabase_query` | `SUPABASE_DB_URL` | unavailable | Supabase connector |
| `pipeline_list_generation_paths` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `pipeline_list_fixtures` | `GITHUB_TOKEN` | unavailable | GitHub connector |
| `pipeline_create_diagnostic_run` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_get_run_state` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_get_next_step` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_submit_step_result` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_validate_step_result` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_continue_run` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_stop_run` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_get_artifacts` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_get_errors` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_compare_runs` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |
| `pipeline_find_divergence` | Supabase API capability | unavailable until service-role wiring | MCP after Supabase runtime wiring |

### Capability definitions

- **Railway deploy capability:** `RAILWAY_PROJECT_TOKEN` + `RAILWAY_PROJECT_ID` + `RAILWAY_ENVIRONMENT_ID` + `RAILWAY_BACKEND_SERVICE_ID`.
- **Supabase API capability:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- **Full pipeline diagnostics capability:** GitHub source introspection plus Supabase diagnostic-run lifecycle, i.e. `GITHUB_TOKEN` + Supabase API capability. The lifecycle itself does not need GitHub.

## Live infrastructure facts (2026-08-29)

- Active backend: Railway service `aicorn-ai-studio-backend`.
- Active MCP: Railway service `aicorn-ai-studio-mcp`.
- MCP start command resolves through `npm start` to `tsx src/index.ts`; the old suspicious `npx tsx src index.ts` string is not the active production command.
- Active Supabase project: `AICRG-studio` (`zdzuaodphrlpvorutpyc`).
- Diagnostic schema migration `20260826_diagnostic_runs.sql` has been applied to the active project; tables `diagnostic_runs` and `diagnostic_run_steps` exist.
