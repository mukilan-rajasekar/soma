# Pre-registration - Serve campaign outcome calibration

**Draft locked on: TBD, before any campaign using this rule launches.** Do not treat this
stub as permission to promote a serving signal. The dated, campaign-specific version must
exist before spend begins.

## Question

Do frozen Soma prediction scores rank creative variants in the same direction as the
client's paid-media outcome?

## Primary feature / ROI

TBD. The ROI or summary score must be named here before the campaign starts. It may not be
chosen after looking at platform outcomes.

## Primary label

Client business outcome, chosen before launch:

- CPA when conversion tracking is available, lower is better.
- ThruPlay rate when CPA is not available, higher is better.

The fixture scaffold reports CTR only for software plumbing. CTR is not promoted to the
primary label by this stub.

## Test

Freeze the prediction at launch in `served_ads.prediction`. After the pre-declared outcome
window, compare the frozen score against the realized label with a rank statistic and a
trivial baseline. Report nulls plainly.

## Promotion rule

No serving rule may be promoted without a dated calibration artifact whose `signal` field
is `true`. `tools/serve/check_promotion.py` enforces this fail-closed behavior for fixture
mode.

See `docs/strategy/BUILD-PLAN-FULL-SERVICE.md` Stage 6 for the broader flywheel sequence.
