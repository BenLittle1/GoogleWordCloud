FROM node:18-alpine

# Install dependencies for Puppeteer + dumb-init to reap zombie processes
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      dumb-init

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Expose the port Railway uses (default 3000)
EXPOSE 3000

# Use dumb-init to properly reap zombie Chromium processes
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
