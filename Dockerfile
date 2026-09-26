# Apify Actor official image with Playwright & Chromium
FROM apify/actor-node-playwright:20

# Copy package definitions with proper user ownership
COPY --chown=myuser:myuser package*.json ./

# Install dependencies for building
RUN npm --quiet set progress=false \
    && npm install --omit=optional

# Copy source code and config with proper user ownership
COPY --chown=myuser:myuser . ./

# Build TypeScript
RUN npm run build

# Default execution command
CMD ["npm", "start"]
