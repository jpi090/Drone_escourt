FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /app/data
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/escorts.db
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/server.js"]
