DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    CREATE ROLE sessions_api LOGIN PASSWORD 'sessions_api' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    CREATE ROLE sessions_worker LOGIN PASSWORD 'sessions_worker' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE sessions TO sessions_api, sessions_worker;
GRANT USAGE ON SCHEMA public TO sessions_api, sessions_worker;
