#!/usr/bin/env bash
# Run the API (:8001, what frontend/.env.local points at) and the site (:3000).
# Ctrl-C stops both; so does either one exiting.
set -e
cd "$(dirname "$0")"

# SIGINT rather than kill 0's SIGTERM: Next gets to close its Turbopack cache
# cleanly, and a hard stop mid-write is what corrupts frontend/.next.
stop() { trap - EXIT INT TERM; kill -INT $(jobs -p) 2>/dev/null; wait; }
trap stop EXIT INT TERM

.venv/bin/uvicorn api.main:app --reload --port 8001 &
(cd frontend && exec npm run dev) &

wait -n
