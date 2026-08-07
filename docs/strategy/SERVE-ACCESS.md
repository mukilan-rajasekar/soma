# Serve access checklist

Read with `STRATEGY-FULL-SERVICE.md` and `BUILD-PLAN-FULL-SERVICE.md`. This file tracks
access and legal gates only; it is not evidence that Serve is live.

| Gate | Pending | Done | Notes |
|---|---:|---:|---|
| Meta Business Verification | yes | no | Required before broad Marketing API access. |
| F1 partner `ANALYZE` grants | yes | no | Need five real partner ad-account grants, counted as access, not conversations. |
| Counsel on CC BY-NC pilot | yes | no | Need a legal answer before quoting fees or treating an unpaid pilot as cleared. |
| Full-tier heartbeat | yes | no | `tools/serve/heartbeat.py` exists; production timer and credentials still need setup. |
| App Review for write access | yes | no | Required before Soma creates or edits ads through the API. |
| TikTok developer app + Marketing API access | yes | no | `tools/serve/tiktok_client.py` exists (dry-run only, DISABLE-first); endpoint shapes must be re-verified against the sandbox when access lands. |
