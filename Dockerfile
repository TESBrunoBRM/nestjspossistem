# syntax=docker/dockerfile:1.7

ARG PLAYWRIGHT_VERSION=1.60.0
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    CI=true

RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

WORKDIR /workspace/business-app-sii

FROM base AS build

COPY sii-engine /workspace/sii-engine
COPY business-app-sii/package.json \
     business-app-sii/pnpm-lock.yaml \
     business-app-sii/pnpm-workspace.yaml \
     /workspace/business-app-sii/

RUN --mount=type=cache,id=business-app-sii-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY business-app-sii /workspace/business-app-sii

RUN pnpm run build && test -f dist/main.js

FROM build AS production-deps

RUN pnpm install --prod --offline --frozen-lockfile --ignore-scripts && \
    test -f /workspace/business-app-sii/dist/main.js && \
    test -f /workspace/sii-engine/dist/index.js

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /workspace/business-app-sii

COPY --from=production-deps --chown=pwuser:pwuser /workspace/business-app-sii/package.json ./package.json
COPY --from=production-deps --chown=pwuser:pwuser /workspace/business-app-sii/dist ./dist
COPY --from=production-deps --chown=pwuser:pwuser /workspace/business-app-sii/public ./public
COPY --from=production-deps --chown=pwuser:pwuser /workspace/business-app-sii/node_modules ./node_modules
COPY --from=production-deps --chown=pwuser:pwuser /workspace/sii-engine/package.json /workspace/sii-engine/package.json
COPY --from=production-deps --chown=pwuser:pwuser /workspace/sii-engine/dist /workspace/sii-engine/dist
COPY --from=production-deps --chown=pwuser:pwuser /workspace/sii-engine/node_modules /workspace/sii-engine/node_modules
COPY business-app-sii/docker/entrypoint.sh /usr/local/bin/business-app-sii-entrypoint

RUN chmod 0555 /usr/local/bin/business-app-sii-entrypoint

USER pwuser

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/business-app-sii-entrypoint"]
CMD ["node", "dist/main.js"]

FROM build AS acceptance

ENV NODE_ENV=test \
    SII_PORTAL_HEADLESS=true

RUN mkdir -p /workspace/business-app-sii/secure/real-sii-tests/artifacts && \
    chown -R pwuser:pwuser /workspace/business-app-sii/secure

COPY business-app-sii/docker/entrypoint.sh /usr/local/bin/business-app-sii-entrypoint

RUN chmod 0555 /usr/local/bin/business-app-sii-entrypoint

USER pwuser

ENTRYPOINT ["/usr/local/bin/business-app-sii-entrypoint"]
CMD ["node", "scripts/real-sii/test-existing-caf-factura33.cjs"]
