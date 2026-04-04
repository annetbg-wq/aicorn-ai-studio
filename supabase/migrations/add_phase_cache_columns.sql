-- Phase-cache columns: persist SpecAgent + ClarifyAgent results for session restart
-- Run this in Supabase SQL Editor

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS spec_result       JSONB,   -- SpecAgent output (AgentSpec)
  ADD COLUMN IF NOT EXISTS clarify_questions JSONB,   -- ClarifyAgent questions (string[])
  ADD COLUMN IF NOT EXISTS clarify_answers   JSONB;   -- user answers to clarify_questions (string[])
