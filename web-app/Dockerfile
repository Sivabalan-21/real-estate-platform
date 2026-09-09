FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV HOST=0.0.0.0
ENV CHOKIDAR_USEPOLLING=true

CMD ["npm", "start"]