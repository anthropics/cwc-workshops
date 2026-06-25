FROM node:22-alpine AS builder
WORKDIR /srv/research-desk
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /srv/research-desk
ENV NODE_ENV=production
COPY --from=builder /srv/research-desk/.next ./.next
COPY --from=builder /srv/research-desk/node_modules ./node_modules
COPY --from=builder /srv/research-desk/package.json ./package.json
COPY --from=builder /srv/research-desk/next.config.mjs ./next.config.mjs
COPY prompts ./prompts
COPY skills ./skills
COPY watchlists ./watchlists

# desk.json and outputs/ live here; mount a volume to persist them across restarts.
VOLUME ["/srv/research-desk/data"]
ENV DESK_DATA_DIR=/srv/research-desk/data

EXPOSE 3100
CMD ["npm", "run", "start"]
