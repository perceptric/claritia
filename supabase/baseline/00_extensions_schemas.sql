-- claritia: extensions schemas. Built from the running database. Unused objects were removed in the move (see README.md).
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- extension: pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- extension: pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- schema: partitions
CREATE SCHEMA partitions;

ALTER SCHEMA partitions OWNER TO postgres;

-- extension: pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

-- extension: pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- extension: pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- extension: supabase_vault
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- extension: uuid-ossp
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
