#!/usr/bin/env bash
# Runs a command inside the headless box: Linux node_modules into the container's own volume, a
# virtual display with a window manager, then the command. The host checkout is mounted at /work;
# its macOS node_modules are hidden behind the volume and never touched.
set -euo pipefail

# Reinstalled only when package-lock.json changed since the volume was filled.
LOCK_HASH="$(sha1sum package-lock.json | cut -d' ' -f1)"
if [ "$(cat node_modules/.box-lock 2>/dev/null || true)" != "$LOCK_HASH" ]; then
  npm ci --no-audit --no-fund >/tmp/npm-ci.log 2>&1 || {
    cat /tmp/npm-ci.log
    exit 1
  }
  printf '%s' "$LOCK_HASH" >node_modules/.box-lock
fi

mkdir -p -m 1777 /tmp/.X11-unix
Xvfb "$DISPLAY" -screen 0 "${SE_BOX_SCREEN:-1920x1080x24}" -nolisten tcp >/tmp/xvfb.log 2>&1 &
for _ in $(seq 1 100); do
  [ -S "/tmp/.X11-unix/X${DISPLAY#:}" ] && break
  sleep 0.1
done
[ -S "/tmp/.X11-unix/X${DISPLAY#:}" ] || {
  cat /tmp/xvfb.log
  exit 1
}
openbox >/tmp/openbox.log 2>&1 &

# The local-testing driver waits for this before it sends commands into a long-running box.
touch /tmp/box-ready
exec "$@"
