# Use an official Node.js runtime as a parent image
# Alpine version is lightweight
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first
# This allows Docker to cache the dependencies layer
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit

# Copy the rest of the application code
COPY . .

# Expose port 3000 for the Vite development server
EXPOSE 3000

# Start the development server with install check
# --host ensures it listens on all network interfaces inside the container
CMD ["sh", "-c", "npm install && npm run dev -- --host"]