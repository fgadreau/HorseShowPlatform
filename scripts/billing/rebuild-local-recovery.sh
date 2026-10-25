#!/usr/bin/env bash
# Local disposable database only. No remote credentials or Supabase link used.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ $# == 0 ]]; then
  exec npm run test:billing:rebuild
fi
if [[ $# != 1 || $1 != --legacy-forwarding ]]; then
  echo 'Usage: bash scripts/billing/rebuild-local-recovery.sh [--legacy-forwarding]' >&2
  exit 2
fi

# Opt-in workaround for Codespaces with Docker nft rules and legacy FORWARD DROP.
[[ $(docker context inspect --format '{{.Endpoints.docker.Host}}') == unix://* ]]
[[ ${DOCKER_HOST:-unix://local} == unix://* ]]
sudo -n iptables-legacy -S FORWARD > /dev/null
billing_test_network="hsp-billing-test-recovery-$$"
billing_test_bridge="hspbill$$"
billing_rule_installed=false
docker network create --driver bridge \
  --opt "com.docker.network.bridge.name=$billing_test_bridge" \
  "$billing_test_network" > /dev/null
cleanup_billing_test() {
  billing_exit=$?
  trap - EXIT
  if [[ $billing_rule_installed == true ]]; then
    sudo -n iptables-legacy -D FORWARD -i "$billing_test_bridge" -o "$billing_test_bridge" -j ACCEPT || billing_exit=1
  fi
  if ! docker network rm "$billing_test_network" > /dev/null; then
    echo "Test network retained: $billing_test_network; inspect any retained diagnostic database." >&2
    billing_exit=1
  fi
  exit "$billing_exit"
}
trap cleanup_billing_test EXIT
sudo -n iptables-legacy -I FORWARD 1 -i "$billing_test_bridge" -o "$billing_test_bridge" -j ACCEPT
billing_rule_installed=true
BILLING_TEST_DOCKER_NETWORK="$billing_test_network" npm run test:billing:rebuild
