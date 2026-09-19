FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY schema.sql README.md .env.example ./
ENV NODE_ENV=production
EXPOSE 8788
CMD ["node", "src/index.js"]
