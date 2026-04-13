FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY apps/doc-service ./apps/doc-service
COPY libs ./libs

RUN npm install --ignore-scripts
RUN npx nest build doc-service

FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/dist/apps/doc-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production

CMD ["node", "dist/main"]
