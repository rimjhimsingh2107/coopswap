# Operations

## Environments

| | where | how it's deployed |
| --- | --- | --- |
| local | your machine / Codespaces | `docker compose up -d` + `pnpm dev`, or the full `--profile app` stack |
| CI | GitHub Actions | service containers, nothing persists |
| staging / production | AWS (see `infrastructure/`) | `Deploy` workflow, manual dispatch, GitHub environment approvals |

Config is env vars only, validated by `apps/api/src/config/env.ts` at boot.
The api refuses to start with a missing or malformed variable and names it
(never prints the value).

## Shipping a schema change

Migrations run **before** the new code rolls out, while the old code is still
serving. So every migration must work with both the old and the new code:

1. **expand**: add nullable columns / new tables / new indexes
   (`create index concurrently` goes in its own migration file, since it can't
   run inside a transaction; the runner would need a small tweak to support
   that, not needed yet).
2. deploy code that writes both / reads new.
3. backfill if needed (a script or a migration, batched).
4. **contract**: drop the old column in a later release.

Never edit an applied migration (the runner checks checksums). To undo
something, write a new migration.

The runner takes `pg_advisory_lock('coopswap:migrations')` so two deploys at
once can't both migrate.

## Deploy

`Deploy` workflow:

1. build + push the api image to ECR (tag = commit sha, repo is immutable)
2. register new api + migrate task definitions with that image
3. run the migrate task, fail the deploy if it exits non-zero
4. update the ECS service; the deployment circuit breaker rolls back
   automatically if new tasks fail health checks
5. sync the web build to S3 (hashed assets first, `index.html` last), invalidate
   CloudFront
6. curl `/api/readyz`

Rolling restarts are safe because the api is stateless: sessions, bookings,
messages live in Postgres; presence entries expire; sockets reconnect to
another task and catch up over REST.

## Rollback

* **Code**: re-run `Deploy` on the previous commit, or point the ECS service at
  the previous task definition revision (`aws ecs update-service --task-definition coopswap-production-api:<n>`).
  Because migrations are backwards compatible, rolling code back doesn't need a
  schema rollback.
* **Web**: re-run deploy for the old commit (assets are content-hashed, old
  ones are still in the bucket unless pruned).
* **Schema**: write a new forward migration that reverses the change. If a
  migration failed, it ran in a transaction and nothing was applied.

## Recovery

* **Postgres**: RDS automated backups with 7 day point in time restore. Restore
  to a new instance, check it, swap `DATABASE_URL` in Secrets Manager, roll the
  service.
* **Redis**: nothing durable lives there. If it's lost: rate limits reset,
  presence shows everyone offline for up to a minute, cross-instance socket
  pushes pause (clients catch up over REST), geocoder cache refills. The api
  keeps serving.
* **A stuck outbox**: rows past 10 attempts stay unpublished with `last_error`.
  After fixing the cause:
  `update outbox_events set attempts = 0, available_at = now() where published_at is null;`
* **Expired requests piling up**: the sweeper runs every minute under an
  advisory lock; if no instance holds it, check job logs (`job failed`) and
  the `job_failures_total` metric.

## Health and monitoring

* `/healthz` liveness (process up, no dependency checks), `/readyz` readiness
  (Postgres + Redis, 503 if Postgres is down).
* Prometheus metrics on a separate port (9464), not exposed publicly.
* Dashboards and alert rules in `monitoring/` (Grafana dashboard
  "CoopSwap API": latency by route, error rate, booking transitions and
  conflicts, transaction times, pool usage, socket counts, delivery latency,
  outbox, jobs, Redis errors, event loop lag).
* Traces via OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
