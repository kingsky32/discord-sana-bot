FROM node:16-alpine
WORKDIR /app
COPY package.json ./
RUN yarn install --frozen-lockfile
RUN yarn build

EXPOSE 3000
ENV PORT 3000

CMD ["node", "./dist"]
