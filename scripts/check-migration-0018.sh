#!/usr/bin/env bash
# Execute migration 0018's trigger against a real Postgres.
#
# WHY THIS EXISTS. 0018 enforces §4.6's rebate rule in plpgsql, and plpgsql that has
# never run is a guess. Nothing else in this repo executes SQL: verify.sh does not touch
# migrations, there is no psql on the box, and the Supabase Preview check on PRs reports
# "skipping" because supabase/config.toml does not exist. So this shipped unrun, and the
# PR said so rather than implying otherwise.
#
# This runs it. Throwaway container, minimal Supabase-shaped scaffolding, the migration
# applied VERBATIM (never a copy - a test against an edited migration tests nothing), and
# assertions on the cases that matter: the derivation the trigger exists to enforce, the
# cap, the provenance requirement on g, brand pinning, currency, the UPDATE path, and
# rounding parity with tools/serve/pricing.holdout_rebate.
#
# Not wired into verify.sh: it needs Docker, and the gate must run without it.
#
#   ./scripts/check-migration-0018.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/0018_holdout_rebate.sql"
CONTAINER="soma-pgtest-$$"
IMAGE="postgres:16-alpine"

command -v docker >/dev/null || { echo "docker not found; cannot execute SQL" >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "docker daemon is not running" >&2; exit 2; }
[ -f "$MIGRATION" ] || { echo "missing $MIGRATION" >&2; exit 2; }

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> starting $IMAGE"
docker run --rm -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=soma "$IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 \
  || { echo "postgres never became ready" >&2; exit 1; }

psql_q() { docker exec -i "$CONTAINER" psql -U postgres -d soma -v ON_ERROR_STOP=1 -q; }
psql_val() { docker exec -i "$CONTAINER" psql -U postgres -d soma -qtA; }

echo "==> scaffolding (only what 0018 references)"
psql_q <<'SQL'
create role authenticated;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.brands (id uuid primary key default gen_random_uuid());
create table public.brand_members (brand_id uuid not null references public.brands(id), user_id uuid not null);
create table public.campaign_quotes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  weekly_spend_micros bigint not null,
  margin_pct numeric not null,
  margin_micros bigint not null,
  weekly_price_micros bigint not null,
  currency text not null default 'USD'
);
SQL

echo "==> applying 0018 verbatim"
psql_q < "$MIGRATION"
echo "==> applying 0018 again (the header claims idempotent)"
psql_q < "$MIGRATION"

psql_q <<'SQL'
insert into public.brands (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333');
insert into public.campaign_quotes
  (id, brand_id, weekly_spend_micros, margin_pct, margin_micros, weekly_price_micros, currency)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
        1000000000, 20.0, 200000000, 1200000000, 'USD');
SQL

fails=0
Q='22222222-2222-2222-2222-222222222222'
B='11111111-1111-1111-1111-111111111111'

# must_reject <label> <sql>
must_reject() {
  local label="$1"; shift
  if printf '%s' "$1" | docker exec -i "$CONTAINER" psql -U postgres -d soma -v ON_ERROR_STOP=1 -q >/dev/null 2>&1; then
    echo "  FAIL  $label -- accepted, should have been rejected"; fails=$((fails + 1))
  else
    echo "  ok    $label rejected"
  fi
}
must_accept() {
  local label="$1"; shift
  if printf '%s' "$1" | docker exec -i "$CONTAINER" psql -U postgres -d soma -v ON_ERROR_STOP=1 -q >/dev/null 2>&1; then
    echo "  ok    $label accepted"
  else
    echo "  FAIL  $label -- rejected, should have been accepted"; fails=$((fails + 1))
  fi
}

echo "==> trigger behaviour"
must_reject "zeroed money against a positive margin (the whole point of the trigger)" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','$B','W32',0.10,0,0,0,false);"
must_accept "honest row h=0.10 g=0" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','$B','W32',0.10,20000000,0,20000000,false);"
must_reject "non-zero g with no calibration_ref" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,holdout_gap_g,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','$B','W33',0.10,0.05,20000000,5000000,25000000,false);"
must_accept "non-zero g with calibration_ref" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,holdout_gap_g,calibration_ref,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','$B','W33',0.10,0.05,'calib/x.json',20000000,5000000,25000000,false);"
must_accept "cap binds: h=0.5 g=2.0 clamps to the margin" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,holdout_gap_g,calibration_ref,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','$B','W34',0.5,2.0,'calib/x.json',100000000,1000000000,200000000,true);"
must_reject "rebate above the margin (cap bypass)" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,holdout_gap_g,calibration_ref,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','$B','W35',0.5,2.0,'calib/x.json',100000000,1000000000,1100000000,false);"
must_reject "wrong brand_id (would leak through the RLS policy)" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','33333333-3333-3333-3333-333333333333','W36',0.10,20000000,0,20000000,false);"
must_reject "currency disagreeing with the quote" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,margin_waiver_micros,gap_term_micros,rebate_micros,currency,capped) values ('$Q','$B','W37',0.10,20000000,0,20000000,'KWD',false);"
must_reject "duplicate period for the same quote" \
  "insert into public.campaign_holdout_rebates (quote_id,brand_id,period,holdout_fraction_h,margin_waiver_micros,gap_term_micros,rebate_micros,capped) values ('$Q','$B','W32',0.10,20000000,0,20000000,false);"
must_reject "UPDATE zeroing a stored rebate after the fact" \
  "update public.campaign_holdout_rebates set rebate_micros=0, margin_waiver_micros=0 where period='W32';"

echo "==> rounding parity with tools/serve/pricing.holdout_rebate"
PY="$ROOT/.venv/bin/python"
if [ ! -x "$PY" ]; then echo "  SKIP  no .venv/bin/python"; else
  for pair in "0.10 0.0" "0.10 0.05" "0.5 2.0" "0.00005 0.0" "0.333 0.017" "0.000000001 0.0" "0.07 0.123"; do
    set -- $pair; h=$1; g=$2
    py=$("$PY" -c "
import sys; sys.path.insert(0,'$ROOT')
from tools.serve.pricing import quote, holdout_rebate
q=quote({'platforms':['meta'],'weekly_spend_micros':1_000_000_000,'goal':'low_cost_testing'})
r=holdout_rebate(q,holdout_fraction=$h,gap_g=$g,calibration_ref='x' if $g else None)
print(f\"{r['margin_waiver_micros']},{r['gap_term_micros']},{r['rebate_micros']}\")")
    pg=$(printf "select ceil(200000000::numeric*%s)::bigint || ',' || ceil(1000000000::numeric*%s*%s)::bigint || ',' || least(ceil(200000000::numeric*%s)::bigint+ceil(1000000000::numeric*%s*%s)::bigint,200000000);" \
          "$h" "$h" "$g" "$h" "$h" "$g" | psql_val)
    if [ "$py" = "$pg" ]; then echo "  ok    h=$h g=$g -> $py"
    else echo "  FAIL  h=$h g=$g python=$py postgres=$pg"; fails=$((fails + 1)); fi
  done
fi

echo
if [ "$fails" -eq 0 ]; then echo "PASS - 0018 applies idempotently, the trigger enforces §4.6, and both languages agree"; exit 0; fi
echo "FAIL - $fails check(s) failed"; exit 1
