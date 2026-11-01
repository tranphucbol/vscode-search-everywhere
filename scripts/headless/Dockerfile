# The Linux box `npm test` and the local-testing driver run VS Code in, so a run never opens a
# window on the developer's screen or takes the keyboard (decision 010). Native arch, so Apple
# silicon runs the arm64 VS Code build without emulation; Node 22 as on CI.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    TZ=UTC \
    DISPLAY=:99 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    SE_IN_BOX=1

# Xvfb is the display; openbox gives windows focus the way a desktop does, which keybindings and
# the quick pick need. The libraries are what VS Code's Electron asks for on Debian.
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb xauth openbox x11-utils \
      libgtk-3-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 \
      libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxss1 libxtst6 \
      libxkbcommon0 libxkbfile1 libgbm1 libdrm2 libasound2 libcups2 libsecret-1-0 \
      locales fonts-dejavu-core fonts-liberation ca-certificates \
  && sed -i 's/^# *\(en_US.UTF-8 UTF-8\)/\1/' /etc/locale.gen && locale-gen \
  && rm -rf /var/lib/apt/lists/* \
  && git config --system --add safe.directory '*'

COPY entrypoint.sh /usr/local/bin/box-entrypoint
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/box-entrypoint"]
