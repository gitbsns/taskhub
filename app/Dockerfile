# Base image: chhoti (alpine) aur official Node
FROM node:20-alpine

WORKDIR /usr/src/app

# Pehle sirf package files copy karo: agar sirf code badla to
# "npm ci" wala layer cache se aa jata hai, build fast hota hai.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Root ke bajaye normal user se chalao (security best practice)
USER node

EXPOSE 3000
CMD ["node", "server.js"]
