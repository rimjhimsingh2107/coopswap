# Load tests

k6 scripts that run against a real stack (two api replicas behind nginx, postgres, redis).
Everything here is **simulated load from k6 virtual users**, not real people.

| script | what it measures |
| --- | --- |
| `search.js` | listing search latency under a ramping arrival rate (city, bbox, date + price filters) |
| `booking-race.js` | many owners approving competing requests at the same moment; checks that exactly one wins per listing |
| `realtime.js` | socket.io connections held open + message fan-out latency across replicas |

## Running

The `load-test` GitHub workflow does all of this on a GitHub runner and uploads the
k6 summaries as an artifact. To run it yourself somewhere with Docker:

```bash
docker compose --profile app up -d --build
pnpm --filter @coopswap/api db:seed            # optional, gives search something to chew on
DATABASE_URL=postgres://coopswap:coopswap@localhost:5440/coopswap node apps/api/scripts/load-test-users.mjs 200 > tests/load/users.json
k6 run -e BASE=http://localhost:8080 tests/load/search.js --summary-export tests/load/results/search.json
```

## Results

Raw `--summary-export` JSON goes in `results/<date>-<commit>/`. Numbers in the main README
are copied from those files; if there's no file, there's no number.
