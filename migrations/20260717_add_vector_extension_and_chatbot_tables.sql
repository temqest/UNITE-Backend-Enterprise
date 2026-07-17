-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a table to store the operational manuals, guidelines, and FAQs
CREATE TABLE IF NOT EXISTS chatbot_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  metadata JSONB,
  embedding VECTOR(768),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create an index for faster similarity searches
-- We use hnsw (Hierarchical Navigable Small World) for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS chatbot_documents_embedding_idx ON chatbot_documents USING hnsw (embedding vector_cosine_ops);

-- Create a function to similarity search for documents
CREATE OR REPLACE FUNCTION match_chatbot_documents (
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    chatbot_documents.id,
    chatbot_documents.content,
    chatbot_documents.metadata,
    1 - (chatbot_documents.embedding <=> query_embedding) AS similarity
  FROM chatbot_documents
  WHERE 1 - (chatbot_documents.embedding <=> query_embedding) > match_threshold
  ORDER BY chatbot_documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
