# DocMind — Enterprise AI Document Intelligence Platform

> A production-grade, multi-tenant AI platform for document ingestion, semantic search, RAG-powered chat, and natural language SQL queries.

```
╔══════════════════════════════════════════════════════════════════╗
║                      DocMind Architecture                        ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   Client  ──►  API Gateway (:3000)                              ║
║                 │ auth middleware + rate limiting + proxy        ║
║                 ├──► Auth Service     (:3001)  JWT/RBAC         ║
║                 ├──► Doc Service      (:3002)  S3 + pgvector    ║
║                 ├──► AI Service       (:3003)  RAG + cache      ║
║                 ├──► Query Service    (:3004)  NL→SQL           ║
║                 └──► Analytics Svc   (:3005)  metrics/costs     ║
║                                                                  ║
║  Infrastructure:                                                 ║
║   PostgreSQL + pgvector  │  Redis (semantic cache)  │  S3       ║
║   Bull (job queues)      │  OpenAI API              │           ║
╚══════════════════════════════════════════════════════════════════╝
```

## Features

- 🔐 **Multi-Tenant Auth** — JWT + refresh tokens, RBAC (Owner/Admin/Member)
- 📄 **Document Ingestion** — S3 upload, async chunking (512 tokens, 50 overlap), OpenAI embeddings
- 🔍 **Hybrid Retrieval** — pgvector cosine similarity + PostgreSQL full-text (tsvector), weighted reranking
- 🤖 **RAG Pipeline** — Context window construction, source attribution, confidence scores
- 💬 **AI Chat** — Regular + SSE streaming, session history, explainability
- 🗄️ **NL→SQL Engine** — Schema-aware SQL generation, safety validation (blocks DML), result explanation
- 📊 **Analytics** — Token usage, cost tracking (OpenAI pricing), P50/P95/P99 latency, cache hit rate
- 🚀 **Semantic Cache** — SHA-256 exact match + cosine similarity (>0.95 threshold) via Redis
- 🛡️ **API Gateway** — Helmet, CORS, ThrottlerGuard (100 req/min), correlation IDs, structured logging

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- OpenAI API key
- AWS S3 bucket

### Run with Docker Compose

```bash
# Clone and configure
cd infrastructure
cp .env.example .env
# Edit .env with your secrets (JWT_SECRET, OPENAI_API_KEY, AWS credentials)

# Start all services
docker-compose up -d

# Check health
curl http://localhost:3000/health
```

### Run Locally (Development)

```bash
# Install dependencies
npm install

# Start services (each in separate terminal)
npm run start:dev:auth      # :3001
npm run start:dev:doc       # :3002
npm run start:dev:ai        # :3003
npm run start:dev:query     # :3004
npm run start:dev:analytics # :3005
npm run start:dev:gateway   # :3000
```

## API Documentation

| Service | Method | Path | Description |
|---------|--------|------|-------------|
| Auth | POST | `/auth/register` | Register user + create tenant |
| Auth | POST | `/auth/login` | Login, get JWT + refresh token |
| Auth | POST | `/auth/refresh` | Refresh access token |
| Auth | POST | `/auth/logout` | Invalidate refresh token |
| Auth | GET | `/auth/me` | Get current user profile |
| Documents | POST | `/documents/upload` | Upload document (multipart) |
| Documents | GET | `/documents` | List documents (paginated) |
| Documents | GET | `/documents/:id` | Get document details |
| Documents | GET | `/documents/:id/download-url` | Get pre-signed S3 URL |
| Documents | DELETE | `/documents/:id` | Delete document |
| AI | POST | `/ai/chat` | Chat with documents (RAG) |
| AI | POST | `/ai/chat/stream` | SSE streaming chat |
| AI | GET | `/ai/history/:sessionId` | Get chat session history |
| Query | POST | `/query/natural-language` | Natural language → SQL |
| Query | GET | `/query/history` | Query execution history |
| Analytics | GET | `/analytics/usage` | Token usage stats |
| Analytics | GET | `/analytics/cost` | Cost breakdown + projection |
| Analytics | GET | `/analytics/latency` | P50/P95/P99 latency metrics |
| Analytics | GET | `/analytics/cache-stats` | Semantic cache hit rates |

### Example: Register and Chat

```bash
# 1. Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass","tenantName":"MyOrg"}'

# 2. Upload document
curl -X POST http://localhost:3000/documents/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.txt"

# 3. Chat with documents
curl -X POST http://localhost:3000/ai/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"What are the key points in this document?"}'

# 4. Natural language SQL
curl -X POST http://localhost:3000/query/natural-language \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"question":"How many documents were uploaded last week?"}'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | **required** |
| `JWT_REFRESH_SECRET` | Refresh token secret | **required** |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USERNAME` | DB username | `docmind` |
| `DB_PASSWORD` | DB password | **required** |
| `DB_DATABASE` | Database name | `docmind` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `OPENAI_API_KEY` | OpenAI API key | **required** |
| `OPENAI_CHAT_MODEL` | Chat model | `gpt-4o` |
| `OPENAI_EMBEDDING_MODEL` | Embedding model | `text-embedding-3-small` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS access key | **required** |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | **required** |
| `S3_BUCKET_NAME` | S3 bucket for docs | **required** |
| `THROTTLE_TTL` | Rate limit window (ms) | `60000` |
| `THROTTLE_LIMIT` | Max requests per window | `100` |
| `CHUNK_SIZE_TOKENS` | Chunk size for splitting | `512` |
| `CHUNK_OVERLAP_TOKENS` | Overlap between chunks | `50` |
| `CACHE_SIMILARITY_THRESHOLD` | Semantic cache threshold | `0.95` |
| `RETRIEVAL_TOP_K` | Max chunks to retrieve | `10` |
| `RETRIEVAL_VECTOR_WEIGHT` | Vector score weight | `0.7` |
| `RETRIEVAL_KEYWORD_WEIGHT` | Keyword score weight | `0.3` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10 (TypeScript) |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 + ioredis |
| ORM | TypeORM 0.3 |
| Auth | JWT (passport-jwt) + bcrypt |
| AI | OpenAI API (gpt-4o, text-embedding-3-small) |
| Queue | Bull (Redis-backed) |
| Storage | AWS S3 (@aws-sdk/client-s3) |
| Gateway | NestJS + Helmet + Throttler |
| Containers | Docker + Docker Compose |

## Architecture Deep Dive

### RAG Pipeline
```
Question → Embed → Hybrid Search (vector + keyword) → Rerank
        → Build Context Window → LLM Prompt → Answer + Sources
```

### Semantic Cache
```
Prompt → SHA-256 hash → Exact match check
       → Cosine similarity on stored embeddings (>0.95)
       → Cache hit: return stored response
       → Cache miss: execute RAG → store result
```

### Document Ingestion
```
Upload → S3 → Bull Queue → Download → Split (512 tok, 50 overlap)
      → Batch Embed (OpenAI) → pgvector INSERT → Status: ready
```

### NL→SQL Safety
- Schema fetched from `information_schema`
- LLM generates SELECT-only SQL
- Regex blocks: DROP, DELETE, TRUNCATE, ALTER, INSERT, UPDATE, CREATE, GRANT, REVOKE
- Results limited to 500 rows
