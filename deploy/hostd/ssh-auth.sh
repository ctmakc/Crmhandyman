#!/usr/bin/env bash
# Shared operator-side SSH setup for status/deploy scripts.
#
# Default remains normal SSH/key-agent behaviour. For legacy password-only hosts use:
#   HANDYCRM_DEPLOY_AUTH=password deploy/hostd/status.sh
#   HANDYCRM_DEPLOY_AUTH=password deploy/hostd/deploy.sh
#
# Password mode prompts once and gives the password to sshpass through SSHPASS. The
# password is never placed in argv, printed, written to disk or copied to the server.
# A parent rollout script may already have SSHPASS exported; child status/deploy scripts
# deliberately reuse it instead of prompting again.

handycrm_init_ssh() {
  local box="$1"
  local port="$2"
  local auth="${HANDYCRM_DEPLOY_AUTH:-key}"
  local common=(-o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -p "$port")

  case "$auth" in
    key)
      SSH=(ssh "${common[@]}" "$box")
      RSYNC_SSH="ssh -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -p $port"
      ;;
    password)
      if ! command -v sshpass >/dev/null 2>&1; then
        cat >&2 <<'EOF'
Password SSH mode requires sshpass on the operator workstation.
On Ubuntu/Kubuntu/Linux Mint:
  sudo apt-get update && sudo apt-get install -y sshpass
EOF
        return 4
      fi

      # HANDYCRM_DEPLOY_PASSWORD is an optional non-interactive override. An already-set
      # SSHPASS belongs to a parent rollout process and is intentionally reusable by child
      # status/deploy scripts so the operator only types the password once.
      local password="${HANDYCRM_DEPLOY_PASSWORD:-${SSHPASS:-}}"
      if [ -z "$password" ]; then
        if [ ! -t 0 ] && [ ! -t 1 ]; then
          echo "Password SSH mode needs an interactive terminal or HANDYCRM_DEPLOY_PASSWORD." >&2
          return 4
        fi
        printf 'SSH password for %s: ' "$box" >&2
        IFS= read -r -s password
        printf '\n' >&2
      fi
      if [ -z "$password" ]; then
        echo "Empty SSH password; stopping." >&2
        return 4
      fi

      # sshpass -e reads SSHPASS. argv/process listings never contain the password.
      export SSHPASS="$password"
      unset HANDYCRM_DEPLOY_PASSWORD
      password=''
      trap 'unset SSHPASS' EXIT HUP INT TERM

      SSH=(
        sshpass -e ssh
        -o ConnectTimeout=8
        -o StrictHostKeyChecking=accept-new
        -o PreferredAuthentications=password,keyboard-interactive
        -o PubkeyAuthentication=no
        -p "$port"
        "$box"
      )
      RSYNC_SSH="sshpass -e ssh -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no -p $port"
      ;;
    *)
      echo "Unknown HANDYCRM_DEPLOY_AUTH=$auth (expected key or password)." >&2
      return 4
      ;;
  esac
}
