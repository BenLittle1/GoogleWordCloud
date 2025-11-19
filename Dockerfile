FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Expose the port Railway uses (default 3000)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
