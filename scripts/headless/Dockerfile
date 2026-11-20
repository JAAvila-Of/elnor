FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9

ARG VSCODE_VERSION=1.145.3
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xvfb xauth dbus-x11 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 \
    libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxfixes3 libxkbcommon0 libxkbfile1 libxrandr2 libxss1 libxtst6 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location --retry 3 \
    "https://update.code.visualstudio.com/${VSCODE_VERSION}/linux-x64/stable" -o /tmp/code.tar.gz \
    && mkdir -p /opt/vscode \
    && tar -xzf /tmp/code.tar.gz --strip-components=1 -C /opt/vscode \
    && rm /tmp/code.tar.gz \
    && chown root:root /opt/vscode/chrome-sandbox \
    && chmod 4755 /opt/vscode/chrome-sandbox

WORKDIR /work/elnor
RUN chown node:node /work /work/elnor && mkdir -p /work/elnor/.elnor && chown node:node /work/elnor/.elnor
COPY --chown=node:node package.json package-lock.json ./
USER node
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm install --prefix /home/node/automation --ignore-scripts --no-audit --no-fund @playwright/cli@0.1.24
COPY --chown=node:node src/ src/
COPY --chown=node:node scripts/ scripts/
COPY --chown=node:node tests/ tests/
COPY --chown=node:node examples/ examples/
COPY --chown=node:node editors/ editors/
COPY --chown=node:node benchmarks/ benchmarks/
ENV VSCODE_EXECUTABLE=/opt/vscode/code
ENV ELNOR_EDITOR_DEBUG_PORT=9222
ENV npm_execpath=/usr/local/lib/node_modules/npm/bin/npm-cli.js
ENV PATH="/home/node/automation/node_modules/.bin:${PATH}"
CMD ["xvfb-run", "-a", "node", "scripts/verify-mvp.mjs"]
