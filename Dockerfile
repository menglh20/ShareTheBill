FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/sharethebill.db
EXPOSE 3001
CMD ["node", "server/index.mjs"]
