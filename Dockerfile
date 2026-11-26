FROM node:24-bookworm-slim
WORKDIR /app
COPY game/*.mjs ./game/
COPY game/public ./game/public
COPY 迷案回声_网页剧本杀完整方案.md ./
RUN mkdir -p /state && chown node:node /state
USER node
ENV HOST=0.0.0.0 PORT=8787 GAME_DATA=/state/rooms.json GAME_PUBLIC=1
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","game/server.mjs"]
