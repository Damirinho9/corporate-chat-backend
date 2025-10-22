# Stage 1
FROM node:18-alpine

WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Копируем всё приложение, включая базу
COPY . .

# Гарантируем, что схема попадёт в образ
RUN mkdir -p database && ls -la database

# Создаём папку для загрузок
RUN mkdir -p uploads

EXPOSE 10000

CMD ["npm", "start"]