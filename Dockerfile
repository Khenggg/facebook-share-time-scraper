# Apify Actor official image with Playwright & Chromium
FROM apify/actor-node-playwright:20

# Copy package definitions
COPY package*.json ./

# Install production and dev dependencies for building
RUN npm --quiet set progress=false \
    && npm install --omit=optional

# Copy source code and config
COPY . ./

# Build TypeScript
RUN npm run build

# Default execution command
CMD ["npm", "start"]
