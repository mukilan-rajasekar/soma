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
| Google Ads developer token + OAuth | yes | no | `tools/serve/google_ads_client.py` exists (dry-run only, PAUSED-first); shapes must be re-verified against a test account when the token lands. `pricing.PLATFORMS` does not include google yet, so funded activation refuses for this platform by design. |
| Counsel: prepaid-week media structure | yes | no | §0.6 decided the structure (prepaid, funded-media caps via `pricing.funded_caps()`, disclosed margin); counsel still owns gross-vs-net, money transmission, and platform ToS on managed spend. Same pass as the licence question. |

**Founder direction, 2026-08-07 (recorded, not yet a gate resolution):** the encoder is
deemed usable for pilots, and an in-house TRIBE-v2-class encoder is planned. That
in-house model IS the "named fallback backbone" PLAN.md gate 4 asks for — the gate
flips when PLAN.md names it **with a cost estimate** (training compute + data + time),
not before. Until that line lands, the licence gate keeps blocking invoices and
`renewals.py --execute`, which is the correct failure mode: direction is not evidence.
