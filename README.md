# TaskHub: Two-Tier App, Docker, Jenkins CI/CD, Kubernetes

Ek chhota lekin real two-tier application jis par hum poora DevOps flow practice karte hain.

## Application kya hai

Login wala task manager, jisme **roles** hain:

| Role  | Kya kar sakta hai |
|-------|--------------------|
| user  | Sirf apne tasks dekh, bana, badal aur hata sakta hai |
| admin | Sab ke tasks dekh sakta hai, users ke role badal aur delete kar sakta hai |

Permissions har API request pe **server par** check hoti hain (sirf button chhupana kaafi nahi hota).

## Architecture

```
 Browser
    |  HTTP
    v
+-----------------------+        +----------------------+
| Tier 1: App (Node.js) | -----> | Tier 2: PostgreSQL   |
| - web page serve      |  SQL   | - users table        |
| - REST API            |        | - tasks table        |
| - login (JWT)         |        | - data volume (PVC)  |
| - role checks         |        +----------------------+
+-----------------------+
```

## Files

```
taskhub/
├── app/
│   ├── server.js         # API + auth + roles + DB connection
│   ├── public/index.html # simple web UI
│   ├── package.json
│   ├── Dockerfile        # app ka image recipe
│   └── .dockerignore
├── docker-compose.yml    # dono tiers ek command se
├── .env.example          # secrets ka template (asal .env commit nahi hoti)
├── .gitignore
└── README.md
```

## Roadmap (phases)

| Phase | Kaam | Kyun |
|-------|------|------|
| 0 | Lab setup: WSL, Docker, kubectl, minikube, Git | Sab tools ek jagah tayyar |
| 1 | Docker Compose se app local chalana | App aur uski dependencies samajhna |
| 2 | Fresh GitHub repo, secrets ka sahi handling | Code aur secrets alag rakhna |
| 3 | Jenkins install + CI pipeline (build, image, push) | Automation ka pehla hissa |
| 4 | Kubernetes par manual deploy (DB + App) | K8s objects samajhna |
| 5 | Jenkins se K8s deploy (limited RBAC) | Automation ka doosra hissa |
| 6 | Security aur exposure control | Kam se kam cheez public |
| 7 | Docs, screenshots, LinkedIn | Kaam ko proof mein badalna |

## Quick start (Phase 1)

```bash
cp .env.example .env         # phir .env mein apni values daalo
docker compose up --build
# browser: http://localhost:3000   (login: admin / jo ADMIN_PASSWORD rakha)
```
