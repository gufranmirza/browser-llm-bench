#!/bin/zsh
set -eu -o pipefail
bench_root="${0:A:h:h:h:h}"
cd "$bench_root"
if [[ "${1:-}" == "--no-power" ]]; then
  exec /usr/bin/python3 -m harness.controller.capture
fi
session_path="${1:-$bench_root/artifacts/current-session.json}"
function ordinary_user() {
  if (( EUID == 0 )) && [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]]; then
    /usr/bin/sudo -u "$SUDO_USER" -- "$@"
  else
    "$@"
  fi
}
capture_dir="$(ordinary_user /usr/bin/python3 -m harness.collectors.macos.prepare_native_capture --session "$session_path")"
echo "Fresh capture: $capture_dir"
echo 'Read-only host power capture; one-hour limit. Enter your administrator password in this Terminal only if prompted.'
if (( EUID == 0 )); then
  /usr/bin/powermetrics --samplers cpu_power,gpu_power,ane_power,thermal -i 1000 -n 3600 -b 1 -f text |
    ordinary_user /usr/bin/python3 -m harness.collectors.macos.power_capture --session "$capture_dir/session.json" --output "$capture_dir" --max-seconds 3600
else
  /usr/bin/sudo /usr/bin/powermetrics --samplers cpu_power,gpu_power,ane_power,thermal -i 1000 -n 3600 -b 1 -f text |
    ordinary_user /usr/bin/python3 -m harness.collectors.macos.power_capture --session "$capture_dir/session.json" --output "$capture_dir" --max-seconds 3600
fi
