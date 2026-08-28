# ─────────────────────────────────────────────────────────────────────────────
# QR Studio — Docker deployment
#   Stage 1: install workspace deps + build the Vite app (index.html)
#   Stage 2: serve the static build with nginx
# Run: docker compose up --build   →  http://localhost:5173
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS build
WORKDIR /app

# Install workspace dependencies (package-lock.json covers all workspaces)
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --no-audit --no-fund

# Build the full QR Studio app (qrlayout-core is bundled from source via alias)
RUN npm --workspace packages/ui run build:app

# ── Serve with nginx ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/ui/dist/app /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
