FROM node:24-slim

WORKDIR /app

COPY package*.json package-lock*.json ./

ENV NODE_ENV=production

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

USER node

EXPOSE 3000

CMD ["node", "index.js"]