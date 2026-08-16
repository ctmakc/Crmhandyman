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

note "restarting $CONTAINER"
if docker restart "$CONTAINER" >/dev/null 2>&1; then
  note "restart issued — next probe in 5 min will tell"
else
  note "RESTART FAILED — docker itself is unwell, operator needed"
fi
