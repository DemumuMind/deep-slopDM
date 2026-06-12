# Applied Memories

| Memory | How it shaped the plan |
|--------|----------------------|
| "Главное правило — Не ошибайся" | Every phase includes verification commands; SARIF will be tested against schema |
| Russian language preference | CLI output and help text in English (standard), but error messages clear |
| Full automation — no manual routing | All phases executable by agent; no "ask user to run" steps |
| read_file line number corruption | All write operations use mcp_filesystem or write_file, never raw read_file content |
| WSL DNS SSRF block | Web_extract calls will fail; use GitHub MCP API instead |
| aislop URL template literal bug | Our config URL handling uses string concatenation, not template literals |
| User wants MAX quality scores | Scoring upgrade is Phase 1 — highest priority |
