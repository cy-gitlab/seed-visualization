FROM node:22-slim AS frontend-builder

RUN npm install -g pnpm@9.15.9
WORKDIR /build/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm i
COPY frontend ./
RUN pnpm run build

WORKDIR /build/satellite-emulator-frontend
COPY satellite-emulator/frontend/package.json satellite-emulator/frontend/pnpm-lock.yaml* ./
RUN pnpm i
COPY satellite-emulator/frontend/ .
RUN pnpm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /build/frontend/dist/frontend /usr/share/nginx/html
COPY --from=frontend-builder /build/satellite-emulator-frontend/dist/frontend /usr/share/nginx/html/satellite