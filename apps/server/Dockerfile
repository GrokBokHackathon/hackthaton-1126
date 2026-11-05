FROM docker.io/library/node:22-alpine

WORKDIR /app

COPY apps/server/package.json apps/server/package-lock.json ./
RUN npm ci --omit=dev

COPY apps/server/server.js apps/server/game.js apps/server/path.js apps/server/autopilot.js apps/server/fog.js apps/server/commands.js apps/server/match-lifecycle.js ./
COPY apps/web ./web
COPY apps/web/command-panel.css ./web/command-panel.css

ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
