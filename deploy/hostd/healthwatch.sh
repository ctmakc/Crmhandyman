#!/bin/sh
# HandymanPro CRM — five-minute watchdog for the host cron on hostd.Canada.
#
# One probe, one remedy: if /api/health on the loopback stops answering, restart the
# app container once and record it. Anything the restart does not cure (bad migration,
# full disk, broken volume) keeps failing every five minutes and fills the log — that
# growing log IS the alarm; the watchdog itself never escalates beyond a restart.
#
# Cron (root), see README.md:
#   */5 * * * * /opt/handyman-crm/deploy/hostd/healthwatch.sh
#
# Silent on success on purpose: cron mails any output, and a mail every five minutes
# trains the operator to delete mail from this box unread.
set -u

APP_PORT=3080
CONTAINER=handyman-crm
LOG=/var/log/handyman-healthwatch.log

note() { echo "$(date '+%Y-%m-%d %H:%M:%S') healthwatch: $*" >>"$LOG"; }

# cron runs with a bare environment, so the alert credentials (and anything else
# the deploy put in .env) are absent unless we read them. Same file the compose
# stack and backup-cron.sh source, right next to this script.
ENV_FILE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

# Escalate past the log. The growing log is the alarm ONLY if someone reads it,
# and nobody watches a five-minute cron; a box that stays down through a paying
# week needs to reach a phone. Best-effort by design — this fires precisely when
# the box is already sick, so a failed send (no creds, no network, Telegram down)
# must never take the watchdog itself down with it: every path returns 0.
#
# Silent no-op unless BOTH creds are present, so a box that never set them keeps
# the old log-only behaviour. Throttled to one message per key per
# ALERT_MIN_INTERVAL_MIN (default 60): this cron re-fires every 5 min and a box
# that stays down would otherwise turn the operator's phone into the log it is
# meant to replace. The token rides curl's --config on stdin, never argv, so it
# cannot leak through `ps` or a process listing.
alert() {
  _key=$1; shift
  [ -n "${ALERT_TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${ALERT_TELEGRAM_CHAT_ID:-}" ] || return 0
  _win=${ALERT_MIN_INTERVAL_MIN:-60}
  _stamp="/var/log/handyman-alert-$_key.stamp"
  if [ -e "$_stamp" ] && [ -n "$(find "$_stamp" -mmin -"$_win" 2>/dev/null)" ]; then
    return 0
  fi
  if curl -sS -f -m 10 -o /dev/null \
       --data-urlencode "chat_id=$ALERT_TELEGRAM_CHAT_ID" \
       --data-urlencode "text=$*" \
       --config - <<EOF 2>/dev/null
url = "https://api.telegram.org/bot${ALERT_TELEGRAM_BOT_TOKEN}/sendMessage"
EOF
  then
    touch "$_stamp" 2>/dev/null || true
  fi
  return 0
}

# Healthy: say nothing, touch nothing.
if curl -fsS -m 10 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
  exit 0
fi

BODY=$(curl -sS -m 10 "http://127.0.0.1:$APP_PORT/api/health" 2>&1 | head -c 300)
note "DOWN — probe failed, response/error: ${BODY:-<empty>}"

# The entrypoint runs migrations before serving and the healthcheck allows 40s of
# start_period. A container that started less than 3 minutes ago is most likely still
# booting (or was just restarted — by us, by a deploy, by dockerd): restarting it again
# now would turn one slow start into an endless loop of them.
STARTED=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null || true)
if [ -n "$STARTED" ]; then
  AGE=$(( $(date +%s) - $(date -d "$STARTED" +%s 2>/dev/null || echo 0) ))
  if [ "$AGE" -ge 0 ] && [ "$AGE" -lt 180 ]; then
    note "container started ${AGE}s ago — still booting, skipping restart this round"
    exit 0
  fi
fi

# Reaching here means the probe failed AND the container is past its 3-minute boot
# window — so this is either a long-lived container that just went bad or one our
# previous cycle already restarted 5+ minutes ago without curing it. That is the
# "one restart attempt, still unhealthy" line the operator must hear about, beyond
# the restart we still attempt as the remedy.
note "restarting $CONTAINER"
if docker restart "$CONTAINER" >/dev/null 2>&1; then
  note "restart issued — next probe in 5 min will tell"
  alert healthwatch "🔴 HandymanPro CRM DOWN on hostd — /api/health not answering, container restarted. Watching; check /var/log/handyman-healthwatch.log"
else
  note "RESTART FAILED — docker itself is unwell, operator needed"
  alert healthwatch "🔴 HandymanPro CRM DOWN on hostd — /api/health not answering AND docker restart FAILED. Operator needed now. See /var/log/handyman-healthwatch.log"
fi
