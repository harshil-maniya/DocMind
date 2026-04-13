-- DocMind Database Initialization
-- Run this script to set up the PostgreSQL database with pgvector

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  is_active BOOLEAN DEFAULT TRUE,
  max_documents INT DEFAULT 100,
  max_users INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  refresh_token_hash VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  s3_key VARCHAR(1000) NOT NULL,
  s3_bucket VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  mime_type VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_by UUID,
  error_message TEXT,
  chunk_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);

-- Create chunks table with vector support
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INT NOT NULL,
  token_count INT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_tenant_id ON chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id);

-- Create IVFFlat index for approximate nearest neighbor search
-- Note: This index will be created automatically once enough data is inserted
-- CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) NOT NULL,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INT DEFAULT 0,
  model_used VARCHAR(100),
  sources JSONB,
  confidence FLOAT,
  cache_hit BOOLEAN DEFAULT FALSE,
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_id ON chat_sessions (tenant_id);

-- Create query metrics table
CREATE TABLE IF NOT EXISTS query_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  query_type VARCHAR(50) DEFAULT 'chat' CHECK (query_type IN ('chat', 'nl-sql')),
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  tokens_total INT DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  latency_ms INT DEFAULT 0,
  cache_hit BOOLEAN DEFAULT FALSE,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
  session_id VARCHAR(255),
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_metrics_tenant_id ON query_metrics (tenant_id);
CREATE INDEX IF NOT EXISTS idx_query_metrics_created_at ON query_metrics (created_at);

-- Create query history table
CREATE TABLE IF NOT EXISTS query_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  question TEXT,
  generated_sql TEXT,
  row_count INT,
  execution_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_history_tenant_id ON query_history (tenant_id);

COMMENT ON TABLE chunks IS 'Document chunks with vector embeddings for semantic search';
COMMENT ON COLUMN chunks.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
