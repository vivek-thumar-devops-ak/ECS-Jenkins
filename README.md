# Jenkins-Task — Backend Node Service

This repository contains a small Node.js backend service intended to be built and deployed (for example via Jenkins to Docker/ECS). The service provides a minimal HTTP API including a health endpoint and is packaged with a Dockerfile for containerized runs.

---

## Repository layout

- `index.js` — main Express application (server).
- `Dockerfile` — container build steps for production images.
- `package.json` — Node.js manifest and dependency list.
- `Jenkinsfile` — CI/CD pipeline

---

## Project overview and purpose

This project is a tiny HTTP API meant to run on port `3000`. It exposes:

- `GET /` — lightweight landing text for quick validation.
- `GET /health` — JSON health/status response (used for monitoring checks).

The app uses Express and `cors` middleware to allow cross-origin requests from separate frontends. The `Dockerfile` packages the app for production using the official Node.js 24 slim image and runs the server as a non-root `node` user.

---

## Detailed file descriptions and flow

### `index.js`

Key parts and what they do:

- `const express = require('express');` — imports the Express framework for routing and HTTP handling.
- `const cors = require('cors');` — imports CORS middleware to enable cross-origin requests.
- `const app = express();` — creates the Express app instance.
- `const PORT = 3000;` — port constant used by the app (note: the app listens on port `3000`).
- `app.use(cors());` — registers the CORS middleware globally, allowing the backend to accept browser requests from different origins (important when frontend is hosted separately).

- Route `GET /`:
  - Responds with a small HTML string confirming the backend is running and points users to `/health` for machine readable status.

- Route `GET /health`:
  - Responds with JSON: `{ status: 'UP', uptime: process.uptime(), source: 'Jenkins-ECS-Backend-Production' }`.
  - `status: 'UP'` is a simple indicator used by orchestration health checks.
  - `uptime` gives the node process uptime in seconds.
  - `source` is an identifying string included for logging/monitoring clarity.

- `app.listen(3000, '0.0.0.0', ...)` — starts the HTTP server bound to all interfaces (`0.0.0.0`) so it accepts external connections inside a container or VM. The callback logs that the server is running.

Flow at runtime:

1. Process starts (via `node index.js` or Docker `CMD`).
2. Express is initialized and CORS middleware enabled.
3. Routes are registered for `/` and `/health`.
4. Server listens on `0.0.0.0:3000`.
5. Client requests hit the registered routes and receive the corresponding responses.

### `Dockerfile`

Step-by-step breakdown:

1. `FROM node:24-slim` — base image using Node.js 24 (slim variant) for smaller size.
2. `WORKDIR /app` — sets the working directory inside the container.
3. `COPY package*.json package-lock*.json ./` — copies manifest files first to leverage Docker layer caching for dependency installation.
4. `ENV NODE_ENV=production` — sets production environment for the build.
5. `RUN npm ci --omit=dev && npm cache clean --force` — installs production dependencies deterministically using `npm ci`, omitting dev dependencies, then clears npm cache to reduce image size.
6. `COPY . .` — copies application source into the image.
7. `USER node` — switches to the non-root `node` user for safer runtime security posture.
8. `EXPOSE 3000` — documents the listening port (no runtime effect by itself).
9. `CMD ["node", "index.js"]` — default command to start the server when the container runs.

Notes:
- Running as `USER node` means the container process does not run as root. Ensure any directories that need write access are owned by the `node` user (current layout is read-only for the app files, which is fine for this app).
- The `--omit=dev` flag and `NODE_ENV=production` keep the image smaller by skipping dev deps.

### `package.json`

- `dependencies`: includes `express` (v5.x) and `cors`.
- `scripts.test` is a placeholder and exits with an error by default — no unit tests configured.
- `type: "commonjs"` ensures `require()`/`module.exports` semantics.

---

### `Jenkinsfile`

This repository also contains a `Jenkinsfile` that implements a CI/CD pipeline used to build, push, and deploy the Docker image to AWS ECR/ECS. Key points:

- Stages:
  - `Initialize`: reads branch context and sets environment variables (for example `TARGET_ENV`, `ECR_REPO`, `ECS_SERVICE`) based on `env.BRANCH_NAME`. It loads AWS-related credentials from Jenkins credentials using `withCredentials`.
  - `Build & Push Image`: runs on `develop` or `production`. Uses an OIDC token to assume an AWS role via `aws sts assume-role-with-web-identity`, logs into ECR, builds a Docker image, tags it as `${BRANCH_NAME}-${BUILD_NUMBER}`, and pushes to the ECR repository. The pushed image URI is stored in `env.IMAGE_URI` for later stages.
  - `Deploy to ECS`: runs on `develop` and `production`. For `production` there is an additional check to only run on merge commits (the pipeline checks if the last commit has multiple parents). The stage assumes an AWS role, fetches the current ECS task definition, updates the container image in the task definition JSON using `jq`, registers a new task definition, and updates the ECS service to use the new task definition.

- Credentials and security:
  - The pipeline avoids long-lived AWS credentials by using an OIDC token (`jenkins-oidc-token`) and `aws sts assume-role-with-web-identity` to obtain short-lived credentials. It also uses Jenkins-stored strings for `aws-account-id` and `aws-role-arn`.

- Deployment behavior and notes:
  - Image tagging uses branch and build number for traceability.\
  - The pipeline updates `containerDefinitions[0].image` in the task definition; if the task has multiple containers, adjust the `jq` expression to target the correct container by `name`.
  - The service's health checks should point to `/health` (the app exposes this endpoint).

## How to run locally (development)

Prerequisites: Node.js (v18+ recommended), npm.

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
node index.js
```

3. Verify:

- Visit `http://localhost:3000/` to see the landing HTML.\
- Visit `http://localhost:3000/health` to get JSON health data.

If you want to run with `npm` scripts, you can add a `start` script to `package.json` such as `"start": "node index.js"`.

## Build and run with Docker (production-like)

Build the image (from repo root):

```bash
docker build -t jenkins-task-backend:latest .
```

Run the container mapping port 3000:

```bash
docker run --rm -p 3000:3000 jenkins-task-backend:latest
```

Visit the same endpoints on `http://localhost:3000`.

---

## Environment variables and configuration

- `NODE_ENV` — used in the `Dockerfile` build stage to produce production builds. The code itself does not inspect environment variables, but you can set `NODE_ENV=production` when running to signal production mode.
- `PORT` — the code uses a hardcoded `3000` in both the `PORT` constant and `listen()` call. To make the port configurable, update `index.js` to read from `process.env.PORT || 3000`.

Example change (optional):

```js
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend running on port ${PORT}`));
```

---

## Security and operational notes

- CORS is open by default (`app.use(cors())`). In production, restrict allowed origins by providing `cors()` options.
- Running as non-root (`USER node`) in the Docker image is a recommended best practice.
- The app does not implement request logging, rate limiting, authentication, or structured metrics; consider adding these for production readiness.

## Troubleshooting

- If `docker build` fails while running `npm ci`, ensure `package-lock.json` matches `package.json`.\
- If you cannot bind to port 3000 in a container, confirm the host port is free and `docker run -p` mapping is correct.

---