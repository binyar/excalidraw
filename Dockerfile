FROM node:24-bookworm-slim AS build

WORKDIR /opt/excalidraw

COPY package.json yarn.lock ./
COPY excalidraw-app/package.json ./excalidraw-app/package.json
COPY packages/common/package.json ./packages/common/package.json
COPY packages/element/package.json ./packages/element/package.json
COPY packages/excalidraw/package.json ./packages/excalidraw/package.json
COPY packages/fractional-indexing/package.json ./packages/fractional-indexing/package.json
COPY packages/laser-pointer/package.json ./packages/laser-pointer/package.json
COPY packages/math/package.json ./packages/math/package.json
COPY packages/utils/package.json ./packages/utils/package.json

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --network-timeout 600000

COPY . .

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

RUN yarn build:app:docker

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8088 \
    EXCALIDRAW_WORKSPACE_DIR=/opt/excalidraw/workspace

WORKDIR /opt/excalidraw

COPY --from=build --chown=node:node /opt/excalidraw/excalidraw-app/build ./excalidraw-app/build
COPY --from=build --chown=node:node /opt/excalidraw/excalidraw-app/workspace/server.mjs ./excalidraw-app/workspace/server.mjs

RUN mkdir -p /opt/excalidraw/workspace && chown node:node /opt/excalidraw/workspace

VOLUME ["/opt/excalidraw/workspace"]
EXPOSE 8088

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8088/api/auth/session').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "./excalidraw-app/workspace/server.mjs"]
