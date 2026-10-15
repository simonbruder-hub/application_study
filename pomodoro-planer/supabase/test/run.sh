#!/usr/bin/env bash
# =============================================================================
# Lokaler Test des Supabase-Schemas gegen eine wegwerfbare PostgreSQL-16-Instanz.
#
#   bash supabase/test/run.sh        (oder: npm run db:test)
#
# Ablauf: temporären Cluster anlegen (nur Unix-Socket, kein TCP) → stubs.sql
# (Supabase-Nachbildung) → schema.sql ZWEIMAL (Idempotenz) → tests.sql.
# Der Cluster wird am Ende in jedem Fall gestoppt und gelöscht.
#
# Umgebungsvariablen (optional):
#   PG_BIN       Verzeichnis der PostgreSQL-Programme (Standard /usr/lib/postgresql/16/bin)
#   PGTEST_PORT  Port-Nummer für den Socket-Namen (Standard 54329)
#   KEEP_LOG=1   Server-Log bei Fehlern vollständig ausgeben
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="$(dirname "$HERE")"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGTEST_PORT:-54329}"

for prog in initdb pg_ctl postgres psql; do
  if [[ ! -x "$PG_BIN/$prog" ]]; then
    echo "Fehler: $PG_BIN/$prog nicht gefunden (PostgreSQL 16 installieren oder PG_BIN setzen)." >&2
    exit 1
  fi
done

# Als root dürfen initdb/pg_ctl nicht laufen → über den Benutzer postgres ausführen.
if [[ "$(id -u)" -eq 0 ]]; then
  if ! id postgres >/dev/null 2>&1; then
    echo "Fehler: Als root wird der Systembenutzer 'postgres' benötigt." >&2
    exit 1
  fi
  as_pg() { runuser -u postgres -- "$@"; }
else
  as_pg() { "$@"; }
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/supabase-schematest.XXXXXX")"
if [[ "$(id -u)" -eq 0 ]]; then
  chown postgres:postgres "$WORK"
  # Liegt TMPDIR unter einem Verzeichnis, das postgres nicht betreten darf (z. B. Modus
  # 700 von root), könnte initdb dort nichts anlegen → Arbeitsverzeichnis unter /tmp.
  if ! as_pg test -w "$WORK"; then
    rm -rf "$WORK"
    WORK="$(mktemp -d /tmp/supabase-schematest.XXXXXX)"
  fi
fi
DATA="$WORK/data"
SOCK="$WORK/socket"
LOG="$WORK/postgres.log"
mkdir -p "$SOCK"
chmod 755 "$WORK"
if [[ "$(id -u)" -eq 0 ]]; then
  chown -R postgres:postgres "$WORK"
fi

cleanup() {
  local rc=$?
  trap - EXIT
  if [[ -f "$DATA/postmaster.pid" ]]; then
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  if [[ $rc -ne 0 && -f "$LOG" ]]; then
    echo "--- Server-Log (Ende) ---" >&2
    if [[ "${KEEP_LOG:-}" == "1" ]]; then cat "$LOG" >&2; else tail -n 20 "$LOG" >&2; fi
  fi
  rm -rf "$WORK"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "▶ Temporären PostgreSQL-Cluster anlegen ($WORK)"
# Linguistische ICU-Sortierung (wie viele gehostete Datenbanken), damit der Test
# beweist, dass der LWW-Vergleich von updated_by unabhängig davon bytweise erfolgt.
if ! as_pg "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 \
      --locale=C.UTF-8 --locale-provider=icu --icu-locale=en-US >"$WORK/initdb.log" 2>&1; then
  echo "  (ICU nicht verfügbar – verwende Standard-Locale)"
  rm -rf "$DATA"
  if ! as_pg "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 >"$WORK/initdb.log" 2>&1; then
    cat "$WORK/initdb.log" >&2
    exit 1
  fi
fi

echo "▶ Server starten (Socket $SOCK, Port $PORT)"
as_pg "$PG_BIN/pg_ctl" -D "$DATA" -l "$LOG" -w -t 30 \
  -o "-c listen_addresses='' -k $SOCK -p $PORT -c wal_level=logical -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
  start >/dev/null

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d postgres)

# Setup-Skripte: nur Warnungen und Fehler anzeigen (keine "already exists, skipping")
run_setup() {
  echo "▶ $1"
  PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$2" "${@:3}"
}

# Tests: NOTICE-Präfix "psql:datei:zeile: NOTICE:" entfernen, Fehler bleiben mit Zeilenangabe
run_tests() {
  echo "▶ $1"
  "${PSQL[@]}" -f "$2" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  //'
}

run_setup "Supabase-Nachbildung laden (stubs.sql)" "$HERE/stubs.sql"
# Wie im Supabase-SQL-Editor: das ganze Skript als ein Block in einer Transaktion
run_setup "Schema laden (schema.sql, 1. Durchlauf)" "$SUPABASE_DIR/schema.sql" --single-transaction
run_setup "Schema erneut laden (schema.sql, 2. Durchlauf – Idempotenz)" "$SUPABASE_DIR/schema.sql" --single-transaction
run_tests "Tests ausführen (tests.sql)" "$HERE/tests.sql"

echo "✔ Datenbank-Tests erfolgreich"
