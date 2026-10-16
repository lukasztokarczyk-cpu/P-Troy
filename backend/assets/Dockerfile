FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# Folder na logo (assets/logo.png) — tworzony zawsze, żeby build nie padał, gdy logo jeszcze nie wgrano
RUN mkdir -p assets
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/assets ./assets
COPY --from=build /app/package*.json ./
EXPOSE 4000
CMD ["node", "dist/main"]
