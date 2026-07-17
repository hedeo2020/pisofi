FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY apps ./apps
COPY docs ./docs
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/src/main.js"]
