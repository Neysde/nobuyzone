FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package.json from backend folder (context is now root)
COPY backend/package*.json ./

RUN npm install

# Copy backend code to /usr/src/app
COPY backend/ .

# Copy sibling directories
# We copy them to /usr/src/views matching the ../views structure expected by index.mjs
COPY views/ /usr/src/views/

# Create uploads folder explicitly to avoid permission issues
RUN mkdir -p public/uploads

EXPOSE 3000

CMD ["node", "index.mjs"]
