#!/usr/bin/env bash
# Dump/restore a stand's Postgres + MinIO (DB, accounts, blobs) as one snapshot.
#
#   ./stand-snapshot.sh dump    [dir] [label]     # -> <dir>/pg-<label>-<stamp>.dump + minio-...tar.gz
#   ./stand-snapshot.sh restore [dir|file]        # picks newest pg-*.dump + its matching minio tar
#
# Stand selection:
#   STAND=sanity (default)  tests/ stand,    -p sanity, PG on 5433
#   STAND=ws-tests          ws-tests/ stand, -p sanity, PG on 5433
#   STAND=dev               dev/ stand,      PG on 5432
#   DB_URL=postgres://...   remote/any instance via local pg_dump/pg_restore (DB only, no files)
#
# Defaults: dir = $BENCH_BACKUPS (~/Develop/private/bench-backups), label = $STAND.
set -euo pipefail
cd "$(dirname "$0")"

CMD="${1:?usage: $0 dump|restore [dir|file] [label]}"
BENCH="${BENCH_BACKUPS:-$HOME/Develop/private/bench-backups}"
PATH_ARG="${2:-$BENCH}"
STAND="${STAND:-sanity}"

# Explicit -f everywhere: this script runs from dev/, which has its own compose file.
case "$STAND" in
  dev)      COMPOSE=(-f docker-compose.yaml); PGPORT=5432 ;;
  ws-tests) COMPOSE=(-f ../ws-tests/docker-compose.yaml -p sanity); PGPORT=5433 ;;
  sanity)   COMPOSE=(-f ../tests/docker-compose.yaml -p sanity); PGPORT=5433 ;;
  *) echo "unknown STAND: $STAND (dev|sanity|ws-tests)"; exit 1 ;;
esac

# --- DB_URL mode: no docker, no files. Parallel restore since it is the slow half.
if [ -n "${DB_URL:-}" ]; then
  case "$CMD" in
    dump) pg_dump "$DB_URL" -Fc -Z3 -f "$PATH_ARG"; ls -lh "$PATH_ARG" ;;
    restore) pg_restore -d "$DB_URL" --clean --if-exists --no-owner -j "${SNAPSHOT_JOBS:-4}" "$PATH_ARG" || true
             echo "Done. Restart platform services to drop cached workspace state." ;;
    *) echo "unknown command: $CMD"; exit 1 ;;
  esac
  exit 0
fi

PG=$(docker compose "${COMPOSE[@]}" ps -q postgres)
MINIO=$(docker compose "${COMPOSE[@]}" ps -q minio || true)
[ -n "$PG" ] || { echo "postgres container not found - is the $STAND stand up?"; exit 1; }

case "$CMD" in
dump)
  STAMP="${3:-$STAND}-$(date +%Y%m%d-%H%M)"
  mkdir -p "$PATH_ARG"
  docker exec "$PG" pg_dump -p $PGPORT -U postgres -d postgres -Fc -f /tmp/snapshot.dump
  docker cp "$PG":/tmp/snapshot.dump "$PATH_ARG/pg-$STAMP.dump"
  docker exec "$PG" rm -f /tmp/snapshot.dump
  if [ -n "$MINIO" ]; then
    # docker cp stream, not `docker exec tar`: the minio image ships no tar.
    docker cp "$MINIO":/data/. - | gzip > "$PATH_ARG/minio-$STAMP.tar.gz"
  else
    echo "WARN: no minio container - DB dumped without files"
  fi
  ls -lhS "$PATH_ARG"/*"$STAMP"*
  ;;
restore)
  if [ -f "$PATH_ARG" ]; then
    DUMP="$PATH_ARG"
  else
    DUMP="${BENCH_DUMP:-$(ls -t "$PATH_ARG"/pg-*.dump 2>/dev/null | head -1)}"
  fi
  [ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "no pg-*.dump found in $PATH_ARG"; exit 1; }
  # Files archive shares the dump's stamp; fall back to the largest one.
  STAMP="$(basename "$DUMP" .dump)"; STAMP="${STAMP#pg-}"
  DIR="$(dirname "$DUMP")"
  ARCH="${BENCH_MINIO:-$(ls "$DIR/minio-$STAMP.tar.gz" 2>/dev/null || ls -S "$DIR"/minio-*.tar.gz 2>/dev/null | head -1)}"

  echo "=== restore Postgres from $DUMP ==="
  docker cp "$DUMP" "$PG":/tmp/restore.dump
  docker exec "$PG" pg_restore -p $PGPORT -U postgres -d postgres --clean --if-exists --no-owner /tmp/restore.dump || true
  docker exec "$PG" rm -f /tmp/restore.dump

  if [ -n "${ARCH:-}" ] && [ -f "$ARCH" ] && [ -n "$MINIO" ]; then
    echo "=== restore MinIO from $ARCH ==="
    docker stop "$MINIO" >/dev/null 2>&1 || true
    gzip -dc "$ARCH" | docker cp - "$MINIO":/data
    docker start "$MINIO" >/dev/null 2>&1 || true
  else
    echo "no minio archive - DB restored without files"
  fi

  # Services cache workspace/account state. nginx goes LAST: it resolves upstream
  # container IPs at config load and must re-resolve after the others get new ones.
  SVCS=$(docker compose "${COMPOSE[@]}" ps --services \
    | grep -vxE 'postgres|cockroach|minio|elastic|elastic-plugins|redpanda|redpanda_console|db-migrator|nginx' | tr '\n' ' ')
  echo "=== restart services ==="
  # shellcheck disable=SC2086
  docker compose "${COMPOSE[@]}" restart $SVCS 2>/dev/null || true
  docker compose "${COMPOSE[@]}" restart nginx 2>/dev/null || true
  ;;
*) echo "unknown command: $CMD (dump|restore)"; exit 1 ;;
esac
