-- claritia: tables. Built from the running database. Unused objects were removed in the move (see README.md).
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

-- account_alert_log -----------------------------------------------------
CREATE TABLE public.account_alert_log (
    rule_id uuid NOT NULL,
    account_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.account_alert_log OWNER TO postgres;

ALTER TABLE ONLY public.account_alert_log
    ADD CONSTRAINT account_alert_log_pkey PRIMARY KEY (rule_id, account_id, sent_at);

-- account_daily ---------------------------------------------------------
CREATE TABLE public.account_daily (
    workspace_id uuid NOT NULL,
    account_id uuid NOT NULL,
    day date NOT NULL,
    sessions integer DEFAULT 0 NOT NULL,
    people integer DEFAULT 0 NOT NULL,
    devices integer DEFAULT 0 NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    engaged_s integer DEFAULT 0 NOT NULL,
    high_views integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.account_daily OWNER TO postgres;

ALTER TABLE ONLY public.account_daily
    ADD CONSTRAINT account_daily_pkey PRIMARY KEY (workspace_id, account_id, day);

-- account_domains -------------------------------------------------------
CREATE TABLE public.account_domains (
    workspace_id uuid NOT NULL,
    domain text NOT NULL,
    account_id uuid NOT NULL,
    source text NOT NULL,
    confidence integer DEFAULT 100 NOT NULL,
    CONSTRAINT account_domains_source_check CHECK ((source = ANY (ARRAY['primary'::text, 'alias'::text, 'crm'::text, 'manual'::text])))
);

ALTER TABLE public.account_domains OWNER TO postgres;

ALTER TABLE ONLY public.account_domains
    ADD CONSTRAINT account_domains_pkey PRIMARY KEY (workspace_id, domain);

-- account_feedback ------------------------------------------------------
CREATE TABLE public.account_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_feedback_kind_check CHECK ((kind = ANY (ARRAY['good'::text, 'bad'::text, 'not_icp'::text, 'customer'::text, 'competitor'::text]))),
    CONSTRAINT account_feedback_note_check CHECK ((length(note) <= 1000))
);

ALTER TABLE public.account_feedback OWNER TO postgres;

ALTER TABLE ONLY public.account_feedback
    ADD CONSTRAINT account_feedback_pkey PRIMARY KEY (id);

-- account_scores --------------------------------------------------------
CREATE TABLE public.account_scores (
    account_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    fit integer,
    intent integer,
    priority numeric,
    stage text,
    temperature text,
    why_now jsonb,
    reasons jsonb,
    score_version integer DEFAULT 1 NOT NULL,
    inputs_hash text
);

ALTER TABLE public.account_scores OWNER TO postgres;

ALTER TABLE ONLY public.account_scores
    ADD CONSTRAINT account_scores_pkey PRIMARY KEY (account_id, at);

-- accounts --------------------------------------------------------------
CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    domain text NOT NULL,
    name text,
    logo_url text,
    firmo jsonb,
    firmo_at timestamp with time zone,
    owner_user_id uuid,
    omniscient_account_id text,
    hubspot_company_id text,
    fit integer,
    intent integer,
    priority numeric,
    stage text,
    stage_since timestamp with time zone,
    temperature text,
    why_now text,
    last_signal_at timestamp with time zone,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    flags text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT accounts_fit_check CHECK (((fit >= 0) AND (fit <= 100))),
    CONSTRAINT accounts_intent_check CHECK (((intent >= 0) AND (intent <= 100))),
    CONSTRAINT accounts_stage_check CHECK ((stage = ANY (ARRAY['unknown'::text, 'engaged'::text, 'researching'::text, 'evaluating'::text]))),
    CONSTRAINT accounts_temperature_check CHECK ((temperature = ANY (ARRAY['cold'::text, 'cooling'::text, 'steady'::text, 'warming'::text, 'hot'::text])))
);

ALTER TABLE public.accounts OWNER TO postgres;

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_workspace_id_domain_key UNIQUE (workspace_id, domain);

-- activity_out ----------------------------------------------------------
CREATE TABLE public.activity_out (
    workspace_id uuid NOT NULL,
    source_id uuid NOT NULL,
    event_id uuid NOT NULL,
    kind text NOT NULL,
    contact_id uuid,
    status text DEFAULT 'sending'::text NOT NULL,
    external_id text,
    error text,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_out_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT activity_out_external_id_check CHECK ((length(external_id) <= 200)),
    CONSTRAINT activity_out_kind_check CHECK ((length(kind) <= 60)),
    CONSTRAINT activity_out_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'sent'::text, 'failed'::text, 'unknown'::text])))
);

ALTER TABLE public.activity_out OWNER TO postgres;

ALTER TABLE ONLY public.activity_out
    ADD CONSTRAINT activity_out_pkey PRIMARY KEY (source_id, event_id);

-- ai_cache --------------------------------------------------------------
CREATE TABLE public.ai_cache (
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    key text NOT NULL,
    output jsonb NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_cache_key_check CHECK ((key ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT ai_cache_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_]{1,40}$'::text)),
    CONSTRAINT ai_cache_model_check CHECK ((length(model) <= 80))
);

ALTER TABLE public.ai_cache OWNER TO postgres;

ALTER TABLE ONLY public.ai_cache
    ADD CONSTRAINT ai_cache_pkey PRIMARY KEY (workspace_id, kind, key);

-- ai_calls --------------------------------------------------------------
CREATE TABLE public.ai_calls (
    id bigint NOT NULL,
    workspace_id uuid,
    kind text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_read_tokens integer DEFAULT 0 NOT NULL,
    cache_write_tokens integer DEFAULT 0 NOT NULL,
    web_searches integer DEFAULT 0 NOT NULL,
    cost_usd numeric(10,5) DEFAULT 0 NOT NULL,
    cached boolean DEFAULT false NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_calls_kind_check CHECK ((kind ~ '^[a-z_]{2,40}$'::text)),
    CONSTRAINT ai_calls_model_check CHECK ((length(model) <= 60))
);

ALTER TABLE public.ai_calls OWNER TO postgres;

ALTER TABLE public.ai_calls ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ai_calls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.ai_calls
    ADD CONSTRAINT ai_calls_pkey PRIMARY KEY (id);

-- alert_events ----------------------------------------------------------
CREATE TABLE public.alert_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    kind text NOT NULL,
    run_id uuid,
    heal_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    sent_at timestamp with time zone,
    error text,
    CONSTRAINT alert_events_kind_check CHECK ((kind = ANY (ARRAY['failure'::text, 'heal'::text])))
);

ALTER TABLE public.alert_events OWNER TO postgres;

ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_pkey PRIMARY KEY (id);

-- alert_settings --------------------------------------------------------
CREATE TABLE public.alert_settings (
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    slack_sealed text,
    slack_hint text,
    emails text[] DEFAULT '{}'::text[] NOT NULL,
    on_failure boolean DEFAULT true NOT NULL,
    on_heal boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alert_settings_emails_check CHECK ((cardinality(emails) <= 20))
);

ALTER TABLE public.alert_settings OWNER TO postgres;

ALTER TABLE ONLY public.alert_settings
    ADD CONSTRAINT alert_settings_pkey PRIMARY KEY (project_id);

-- api_keys --------------------------------------------------------------
CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    key_hash text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT api_keys_key_hash_check CHECK ((key_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT api_keys_name_check CHECK (((length(name) >= 1) AND (length(name) <= 60))),
    CONSTRAINT api_keys_prefix_check CHECK (((length(prefix) >= 4) AND (length(prefix) <= 20)))
);

ALTER TABLE public.api_keys OWNER TO postgres;

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

-- app_config ------------------------------------------------------------
CREATE TABLE public.app_config (
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.app_config OWNER TO postgres;

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);

-- app_links -------------------------------------------------------------
CREATE TABLE public.app_links (
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    from_page uuid NOT NULL,
    to_page uuid NOT NULL
);

ALTER TABLE public.app_links OWNER TO postgres;

ALTER TABLE ONLY public.app_links
    ADD CONSTRAINT app_links_pkey PRIMARY KEY (from_page, to_page);

-- app_pages -------------------------------------------------------------
CREATE TABLE public.app_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    exploration_id uuid,
    pattern text NOT NULL,
    sample_url text NOT NULL,
    title text,
    name text,
    purpose text,
    status_code integer,
    elements jsonb DEFAULT '{}'::jsonb NOT NULL,
    screenshot_path text,
    depth integer DEFAULT 0 NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_pages_pattern_check CHECK (((length(pattern) >= 1) AND (length(pattern) <= 500)))
);

ALTER TABLE public.app_pages OWNER TO postgres;

ALTER TABLE ONLY public.app_pages
    ADD CONSTRAINT app_pages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_pages
    ADD CONSTRAINT app_pages_project_id_pattern_key UNIQUE (project_id, pattern);

-- audit_log -------------------------------------------------------------
CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    actor uuid,
    action text NOT NULL,
    target text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_action_check CHECK (((length(action) >= 1) AND (length(action) <= 80))),
    CONSTRAINT audit_log_target_check CHECK ((length(target) <= 200))
);

ALTER TABLE public.audit_log OWNER TO postgres;

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

-- availability ----------------------------------------------------------
CREATE TABLE public.availability (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tz text DEFAULT 'UTC'::text NOT NULL,
    weekly jsonb NOT NULL,
    overrides jsonb DEFAULT '[]'::jsonb NOT NULL,
    holidays text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT availability_holidays_check CHECK ((holidays ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT availability_overrides_check CHECK ((jsonb_typeof(overrides) = 'array'::text)),
    CONSTRAINT availability_tz_check CHECK ((length(tz) <= 60)),
    CONSTRAINT availability_weekly_check CHECK ((jsonb_typeof(weekly) = 'object'::text))
);

ALTER TABLE public.availability OWNER TO postgres;

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_pkey PRIMARY KEY (workspace_id, user_id);

-- availability_schedules ------------------------------------------------
CREATE TABLE public.availability_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    tz text DEFAULT 'UTC'::text NOT NULL,
    weekly jsonb NOT NULL,
    overrides jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT availability_schedules_name_check CHECK (((length(name) >= 1) AND (length(name) <= 60))),
    CONSTRAINT availability_schedules_overrides_check CHECK ((jsonb_typeof(overrides) = 'array'::text)),
    CONSTRAINT availability_schedules_tz_check CHECK ((length(tz) <= 60)),
    CONSTRAINT availability_schedules_weekly_check CHECK ((jsonb_typeof(weekly) = 'object'::text))
);

ALTER TABLE public.availability_schedules OWNER TO postgres;

ALTER TABLE ONLY public.availability_schedules
    ADD CONSTRAINT availability_schedules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.availability_schedules
    ADD CONSTRAINT availability_schedules_workspace_id_user_id_name_key UNIQUE (workspace_id, user_id, name);

-- blocks ----------------------------------------------------------------
CREATE TABLE public.blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blocks_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80))),
    CONSTRAINT blocks_steps_check CHECK (public.valid_steps(steps, false))
);

ALTER TABLE public.blocks OWNER TO postgres;

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_project_id_name_key UNIQUE (project_id, name);

-- booking_profiles ------------------------------------------------------
CREATE TABLE public.booking_profiles (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    headline text,
    photo_url text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    handle text,
    page jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT booking_profiles_handle_check CHECK ((handle ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'::text)),
    CONSTRAINT booking_profiles_headline_check CHECK ((length(headline) <= 200)),
    CONSTRAINT booking_profiles_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT booking_profiles_page_check CHECK (((jsonb_typeof(page) = 'object'::text) AND (length((page)::text) <= 8000))),
    CONSTRAINT booking_profiles_photo_url_check CHECK (((photo_url ~ '^https://'::text) AND (length(photo_url) <= 1000))),
    CONSTRAINT booking_profiles_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'::text))
);

ALTER TABLE public.booking_profiles OWNER TO postgres;

ALTER TABLE ONLY public.booking_profiles
    ADD CONSTRAINT booking_profiles_pkey PRIMARY KEY (workspace_id, user_id);

ALTER TABLE ONLY public.booking_profiles
    ADD CONSTRAINT booking_profiles_workspace_id_slug_key UNIQUE (workspace_id, slug);

-- brand_kits ------------------------------------------------------------
CREATE TABLE public.brand_kits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid,
    name text NOT NULL,
    tokens jsonb DEFAULT '{}'::jsonb NOT NULL,
    logo_url text,
    source_url text,
    notes text[] DEFAULT '{}'::text[] NOT NULL,
    scanned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scan_status text,
    scan_error text,
    site_forms jsonb DEFAULT '[]'::jsonb NOT NULL,
    design jsonb DEFAULT '{}'::jsonb NOT NULL,
    design_live jsonb DEFAULT '{}'::jsonb NOT NULL,
    design_rev integer DEFAULT 0 NOT NULL,
    design_published_at timestamp with time zone,
    social jsonb DEFAULT '[]'::jsonb NOT NULL,
    address text,
    brief text,
    quick_at timestamp with time zone,
    book jsonb,
    faces jsonb DEFAULT '[]'::jsonb NOT NULL,
    logo_svg text,
    book_status text,
    book_at timestamp with time zone,
    studio_css text,
    studio_profile jsonb,
    skin jsonb,
    CONSTRAINT brand_kits_address_check CHECK ((length(address) <= 300)),
    CONSTRAINT brand_kits_book_check CHECK (((book IS NULL) OR ((jsonb_typeof(book) = 'object'::text) AND (length((book)::text) <= 20000)))),
    CONSTRAINT brand_kits_book_status_check CHECK ((book_status = ANY (ARRAY['reading'::text, 'done'::text, 'failed'::text]))),
    CONSTRAINT brand_kits_brief_check CHECK ((length(brief) <= 2000)),
    CONSTRAINT brand_kits_design_check CHECK (((jsonb_typeof(design) = 'object'::text) AND (length((design)::text) <= 400000))),
    CONSTRAINT brand_kits_design_live_check CHECK (((jsonb_typeof(design_live) = 'object'::text) AND (length((design_live)::text) <= 400000))),
    CONSTRAINT brand_kits_faces_check CHECK (((jsonb_typeof(faces) = 'array'::text) AND (length((faces)::text) <= 20000))),
    CONSTRAINT brand_kits_logo_svg_check CHECK ((length(logo_svg) <= 60000)),
    CONSTRAINT brand_kits_logo_url_check CHECK ((length(logo_url) <= 1000)),
    CONSTRAINT brand_kits_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT brand_kits_notes_check CHECK ((cardinality(notes) <= 20)),
    CONSTRAINT brand_kits_scan_error_check CHECK ((length(scan_error) <= 500)),
    CONSTRAINT brand_kits_scan_status_check CHECK ((scan_status = ANY (ARRAY['scanning'::text, 'done'::text, 'failed'::text]))),
    CONSTRAINT brand_kits_site_forms_check CHECK (((jsonb_typeof(site_forms) = 'array'::text) AND (length((site_forms)::text) <= 20000))),
    CONSTRAINT brand_kits_skin_check CHECK (((skin IS NULL) OR ((jsonb_typeof(skin) = 'object'::text) AND (length((skin)::text) <= 60000)))),
    CONSTRAINT brand_kits_social_check CHECK (((jsonb_typeof(social) = 'array'::text) AND (length((social)::text) <= 4000))),
    CONSTRAINT brand_kits_source_url_check CHECK ((length(source_url) <= 1000)),
    CONSTRAINT brand_kits_studio_css_check CHECK (((studio_css IS NULL) OR (length(studio_css) <= 200000))),
    CONSTRAINT brand_kits_studio_profile_check CHECK (((studio_profile IS NULL) OR ((jsonb_typeof(studio_profile) = 'object'::text) AND (length((studio_profile)::text) <= 2000)))),
    CONSTRAINT brand_kits_tokens_check CHECK (((jsonb_typeof(tokens) = 'object'::text) AND (length((tokens)::text) <= 8000)))
);

ALTER TABLE public.brand_kits OWNER TO postgres;

ALTER TABLE ONLY public.brand_kits
    ADD CONSTRAINT brand_kits_pkey PRIMARY KEY (id);

-- busy_blocks -----------------------------------------------------------
CREATE TABLE public.busy_blocks (
    account_id uuid NOT NULL,
    calendar_id text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    ooo boolean DEFAULT false NOT NULL,
    CONSTRAINT busy_blocks_check CHECK ((end_at > start_at))
);

ALTER TABLE public.busy_blocks OWNER TO postgres;

-- calendar_accounts -----------------------------------------------------
CREATE TABLE public.calendar_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    account_email text NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    channels jsonb DEFAULT '{}'::jsonb NOT NULL,
    refreshed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    watch_due timestamp with time zone,
    reconnect_at timestamp with time zone,
    reconnect_reason text,
    CONSTRAINT calendar_accounts_account_email_check CHECK ((length(account_email) <= 320)),
    CONSTRAINT calendar_accounts_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'microsoft'::text, 'zoom'::text, 'fake'::text]))),
    CONSTRAINT calendar_accounts_reconnect_reason_check CHECK ((length(reconnect_reason) <= 300)),
    CONSTRAINT calendar_accounts_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'reconnect'::text])))
);

ALTER TABLE public.calendar_accounts OWNER TO postgres;

ALTER TABLE ONLY public.calendar_accounts
    ADD CONSTRAINT calendar_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_accounts
    ADD CONSTRAINT calendar_accounts_workspace_id_user_id_provider_account_ema_key UNIQUE (workspace_id, user_id, provider, account_email);

-- calendar_lists --------------------------------------------------------
CREATE TABLE public.calendar_lists (
    account_id uuid NOT NULL,
    calendar_id text NOT NULL,
    name text NOT NULL,
    busy boolean DEFAULT true NOT NULL,
    write boolean DEFAULT false NOT NULL,
    CONSTRAINT calendar_lists_calendar_id_check CHECK ((length(calendar_id) <= 500)),
    CONSTRAINT calendar_lists_name_check CHECK ((length(name) <= 300))
);

ALTER TABLE public.calendar_lists OWNER TO postgres;

ALTER TABLE ONLY public.calendar_lists
    ADD CONSTRAINT calendar_lists_pkey PRIMARY KEY (account_id, calendar_id);

-- calendar_tokens -------------------------------------------------------
CREATE TABLE public.calendar_tokens (
    account_id uuid NOT NULL,
    sealed text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.calendar_tokens OWNER TO postgres;

ALTER TABLE ONLY public.calendar_tokens
    ADD CONSTRAINT calendar_tokens_pkey PRIMARY KEY (account_id);

-- companies -------------------------------------------------------------
CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid,
    domain text,
    name text,
    industry text,
    size text,
    country text,
    owner_crm_id text,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    field_sources jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner_user_id uuid,
    merged_into uuid,
    deleted_at timestamp with time zone,
    employees integer,
    founded integer,
    CONSTRAINT companies_check CHECK (((domain IS NOT NULL) OR (name IS NOT NULL))),
    CONSTRAINT companies_country_check CHECK ((country ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT companies_domain_check CHECK ((domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'::text)),
    CONSTRAINT companies_employees_check CHECK ((employees >= 0)),
    CONSTRAINT companies_fields_check CHECK ((jsonb_typeof(fields) = 'object'::text)),
    CONSTRAINT companies_founded_check CHECK (((founded >= 1600) AND (founded <= 2100))),
    CONSTRAINT companies_industry_check CHECK ((length(industry) <= 120)),
    CONSTRAINT companies_name_check CHECK ((length(name) <= 200)),
    CONSTRAINT companies_owner_crm_id_check CHECK ((length(owner_crm_id) <= 100)),
    CONSTRAINT companies_size_check CHECK ((length(size) <= 40))
);

ALTER TABLE public.companies OWNER TO postgres;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

-- company_cache ---------------------------------------------------------
CREATE TABLE public.company_cache (
    domain text NOT NULL,
    data jsonb NOT NULL,
    vendor text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.company_cache OWNER TO postgres;

ALTER TABLE ONLY public.company_cache
    ADD CONSTRAINT company_cache_pkey PRIMARY KEY (domain);

-- consents --------------------------------------------------------------
CREATE TABLE public.consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    channel text NOT NULL,
    basis text NOT NULL,
    status text NOT NULL,
    source text NOT NULL,
    wording text,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT consents_basis_check CHECK ((basis = ANY (ARRAY['opt_in'::text, 'soft_opt_in'::text, 'legitimate_interest'::text, 'none'::text]))),
    CONSTRAINT consents_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text]))),
    CONSTRAINT consents_check CHECK (((basis = 'none'::text) = (status = 'none'::text))),
    CONSTRAINT consents_source_check CHECK ((length(source) <= 60)),
    CONSTRAINT consents_status_check CHECK ((status = ANY (ARRAY['granted'::text, 'withdrawn'::text, 'none'::text]))),
    CONSTRAINT consents_wording_check CHECK ((length(wording) <= 2000))
);

ALTER TABLE public.consents OWNER TO postgres;

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_pkey PRIMARY KEY (id);

-- contact_events --------------------------------------------------------
CREATE TABLE public.contact_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
)
PARTITION BY RANGE (at);

ALTER TABLE public.contact_events OWNER TO postgres;

ALTER TABLE ONLY public.contact_events
    ADD CONSTRAINT contact_events_pkey PRIMARY KEY (id, at);

-- contact_events_2025_10 ------------------------------------------------
CREATE TABLE partitions.contact_events_2025_10 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2025_10 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2025_10 FOR VALUES FROM ('2025-10-01 00:00:00+00') TO ('2025-11-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2025_10
    ADD CONSTRAINT contact_events_2025_10_pkey PRIMARY KEY (id, at);

-- contact_events_2025_11 ------------------------------------------------
CREATE TABLE partitions.contact_events_2025_11 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2025_11 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2025_11 FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('2025-12-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2025_11
    ADD CONSTRAINT contact_events_2025_11_pkey PRIMARY KEY (id, at);

-- contact_events_2025_12 ------------------------------------------------
CREATE TABLE partitions.contact_events_2025_12 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2025_12 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2025_12 FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2025_12
    ADD CONSTRAINT contact_events_2025_12_pkey PRIMARY KEY (id, at);

-- contact_events_2026_01 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_01 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_01 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_01 FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_01
    ADD CONSTRAINT contact_events_2026_01_pkey PRIMARY KEY (id, at);

-- contact_events_2026_02 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_02 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_02 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_02 FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_02
    ADD CONSTRAINT contact_events_2026_02_pkey PRIMARY KEY (id, at);

-- contact_events_2026_03 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_03 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_03 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_03 FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_03
    ADD CONSTRAINT contact_events_2026_03_pkey PRIMARY KEY (id, at);

-- contact_events_2026_04 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_04 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_04 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_04
    ADD CONSTRAINT contact_events_2026_04_pkey PRIMARY KEY (id, at);

-- contact_events_2026_05 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_05 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_05 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_05
    ADD CONSTRAINT contact_events_2026_05_pkey PRIMARY KEY (id, at);

-- contact_events_2026_06 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_06 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_06 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_06
    ADD CONSTRAINT contact_events_2026_06_pkey PRIMARY KEY (id, at);

-- contact_events_2026_07 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_07 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_07 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_07
    ADD CONSTRAINT contact_events_2026_07_pkey PRIMARY KEY (id, at);

-- contact_events_2026_08 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_08 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_08 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_08
    ADD CONSTRAINT contact_events_2026_08_pkey PRIMARY KEY (id, at);

-- contact_events_2026_09 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_09 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_09 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_09
    ADD CONSTRAINT contact_events_2026_09_pkey PRIMARY KEY (id, at);

-- contact_events_2026_10 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_10 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_10 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_10
    ADD CONSTRAINT contact_events_2026_10_pkey PRIMARY KEY (id, at);

-- contact_events_2026_11 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_11 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_11 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_11
    ADD CONSTRAINT contact_events_2026_11_pkey PRIMARY KEY (id, at);

-- contact_events_2026_12 ------------------------------------------------
CREATE TABLE partitions.contact_events_2026_12 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2026_12 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2026_12
    ADD CONSTRAINT contact_events_2026_12_pkey PRIMARY KEY (id, at);

-- contact_events_2027_01 ------------------------------------------------
CREATE TABLE partitions.contact_events_2027_01 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2027_01 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2027_01
    ADD CONSTRAINT contact_events_2027_01_pkey PRIMARY KEY (id, at);

-- contact_events_2027_02 ------------------------------------------------
CREATE TABLE partitions.contact_events_2027_02 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    import_id uuid,
    CONSTRAINT contact_events_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_.]{1,60}$'::text)),
    CONSTRAINT contact_events_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE partitions.contact_events_2027_02 OWNER TO postgres;

ALTER TABLE ONLY public.contact_events ATTACH PARTITION partitions.contact_events_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');

ALTER TABLE ONLY partitions.contact_events_2027_02
    ADD CONSTRAINT contact_events_2027_02_pkey PRIMARY KEY (id, at);

-- contacts --------------------------------------------------------------
CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    person_id uuid,
    email text,
    email_clean text,
    email_class text,
    first_name text,
    last_name text,
    title text,
    phone text,
    company_id uuid,
    country text,
    region text,
    timezone text,
    lifecycle text,
    lead_status text,
    owner_user_id uuid,
    owner_crm_id text,
    source text DEFAULT 'manual'::text NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    score integer,
    score_band text,
    score_reasons jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    field_sources jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    merged_into uuid,
    import_id uuid,
    fit_score integer,
    engagement_score integer,
    scored_at timestamp with time zone,
    qualified_at timestamp with time zone,
    route_status text,
    seniority text,
    department text,
    linkedin_url text,
    qualify_outcome text,
    qualify_reason text,
    qualify_by text,
    qualify_at timestamp with time zone,
    first_touch jsonb,
    score_grade text,
    score_model uuid,
    CONSTRAINT contacts_check CHECK (((email IS NULL) OR (email_clean IS NOT NULL))),
    CONSTRAINT contacts_country_check CHECK ((country ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT contacts_department_check CHECK ((department = ANY (ARRAY['Marketing'::text, 'Sales'::text, 'Engineering'::text, 'Product'::text, 'Finance'::text, 'HR'::text, 'Operations'::text, 'Other'::text]))),
    CONSTRAINT contacts_email_check CHECK ((length(email) <= 320)),
    CONSTRAINT contacts_email_class_check CHECK ((email_class = ANY (ARRAY['work'::text, 'free'::text, 'role'::text, 'own'::text, 'partner'::text]))),
    CONSTRAINT contacts_email_clean_check CHECK ((length(email_clean) <= 254)),
    CONSTRAINT contacts_engagement_score_check CHECK (((engagement_score >= 0) AND (engagement_score <= 100))),
    CONSTRAINT contacts_fields_check CHECK ((jsonb_typeof(fields) = 'object'::text)),
    CONSTRAINT contacts_first_name_check CHECK ((length(first_name) <= 100)),
    CONSTRAINT contacts_fit_score_check CHECK (((fit_score >= 0) AND (fit_score <= 100))),
    CONSTRAINT contacts_last_name_check CHECK ((length(last_name) <= 100)),
    CONSTRAINT contacts_lead_status_check CHECK ((length(lead_status) <= 60)),
    CONSTRAINT contacts_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['subscriber'::text, 'lead'::text, 'mql'::text, 'sql'::text, 'opportunity'::text, 'customer'::text, 'evangelist'::text, 'other'::text]))),
    CONSTRAINT contacts_linkedin_url_check CHECK (((linkedin_url ~ '^https://'::text) AND (length(linkedin_url) <= 300))),
    CONSTRAINT contacts_owner_crm_id_check CHECK ((length(owner_crm_id) <= 100)),
    CONSTRAINT contacts_phone_check CHECK ((length(phone) <= 50)),
    CONSTRAINT contacts_qualify_by_check CHECK ((length(qualify_by) <= 40)),
    CONSTRAINT contacts_qualify_outcome_check CHECK ((length(qualify_outcome) <= 40)),
    CONSTRAINT contacts_qualify_reason_check CHECK ((length(qualify_reason) <= 300)),
    CONSTRAINT contacts_region_check CHECK ((length(region) <= 100)),
    CONSTRAINT contacts_route_status_check CHECK ((route_status = ANY (ARRAY['held'::text, 'spam'::text, 'unassigned'::text]))),
    CONSTRAINT contacts_score_band_check CHECK ((length(score_band) <= 20)),
    CONSTRAINT contacts_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT contacts_score_grade_check CHECK ((length(score_grade) <= 4)),
    CONSTRAINT contacts_seniority_check CHECK ((seniority = ANY (ARRAY['C-level'::text, 'VP'::text, 'Director'::text, 'Manager'::text, 'Individual'::text]))),
    CONSTRAINT contacts_source_check CHECK ((source ~ '^[a-z][a-z0-9_]{1,40}$'::text)),
    CONSTRAINT contacts_timezone_check CHECK ((length(timezone) <= 60)),
    CONSTRAINT contacts_title_check CHECK ((length(title) <= 200))
);

ALTER TABLE public.contacts OWNER TO postgres;

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

-- crm_owner_links -------------------------------------------------------
CREATE TABLE public.crm_owner_links (
    workspace_id uuid NOT NULL,
    source_id uuid NOT NULL,
    crm_owner_id text NOT NULL,
    label text,
    user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_owner_links_crm_owner_id_check CHECK ((length(crm_owner_id) <= 100)),
    CONSTRAINT crm_owner_links_label_check CHECK ((length(label) <= 200))
);

ALTER TABLE public.crm_owner_links OWNER TO postgres;

ALTER TABLE ONLY public.crm_owner_links
    ADD CONSTRAINT crm_owner_links_pkey PRIMARY KEY (source_id, crm_owner_id);

-- deliveries ------------------------------------------------------------
CREATE TABLE public.deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    submission_id uuid NOT NULL,
    destination_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    external_id text,
    external_url text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    done_at timestamp with time zone,
    allow_duplicate boolean DEFAULT false NOT NULL,
    CONSTRAINT deliveries_error_check CHECK ((length(error) <= 1000)),
    CONSTRAINT deliveries_external_id_check CHECK ((length(external_id) <= 200)),
    CONSTRAINT deliveries_external_url_check CHECK ((length(external_url) <= 1000)),
    CONSTRAINT deliveries_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'retrying'::text, 'done'::text, 'failed'::text, 'held'::text, 'skipped'::text])))
);

ALTER TABLE public.deliveries OWNER TO postgres;

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_submission_id_destination_id_key UNIQUE (submission_id, destination_id);

-- design_assets ---------------------------------------------------------
CREATE TABLE public.design_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    path text NOT NULL,
    url text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    kind text DEFAULT 'image'::text NOT NULL,
    type text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    bytes integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sizes integer[] DEFAULT '{}'::integer[] NOT NULL,
    CONSTRAINT design_assets_bytes_check CHECK (((bytes > 0) AND (bytes <= 5242880))),
    CONSTRAINT design_assets_height_check CHECK ((height > 0)),
    CONSTRAINT design_assets_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'logo'::text]))),
    CONSTRAINT design_assets_name_check CHECK ((length(name) <= 200)),
    CONSTRAINT design_assets_path_check CHECK ((length(path) <= 200)),
    CONSTRAINT design_assets_sizes_ok CHECK ((sizes <@ ARRAY[640, 1280, 1920])),
    CONSTRAINT design_assets_type_check CHECK ((type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/gif'::text, 'image/webp'::text]))),
    CONSTRAINT design_assets_url_check CHECK ((length(url) <= 1000)),
    CONSTRAINT design_assets_width_check CHECK ((width > 0))
);

ALTER TABLE public.design_assets OWNER TO postgres;

ALTER TABLE ONLY public.design_assets
    ADD CONSTRAINT design_assets_pkey PRIMARY KEY (id);

-- device_links ----------------------------------------------------------
CREATE TABLE public.device_links (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    device_id uuid NOT NULL,
    person_id uuid NOT NULL,
    level text NOT NULL,
    from_at timestamp with time zone NOT NULL,
    to_at timestamp with time zone,
    evidence_id uuid NOT NULL,
    CONSTRAINT device_links_level_check CHECK ((level = ANY (ARRAY['verified'::text, 'asserted'::text, 'probable'::text])))
);

ALTER TABLE public.device_links OWNER TO postgres;

ALTER TABLE ONLY public.device_links
    ADD CONSTRAINT device_links_pkey PRIMARY KEY (id);

-- devices ---------------------------------------------------------------
CREATE TABLE public.devices (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid NOT NULL,
    state text DEFAULT 'fresh'::text NOT NULL,
    state_since timestamp with time zone DEFAULT now() NOT NULL,
    tainted_until timestamp with time zone,
    no_backfill boolean DEFAULT false NOT NULL,
    consent text,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    sessions integer DEFAULT 0 NOT NULL,
    CONSTRAINT devices_consent_check CHECK ((consent = ANY (ARRAY['granted'::text, 'denied'::text, 'unknown'::text]))),
    CONSTRAINT devices_state_check CHECK ((state = ANY (ARRAY['fresh'::text, 'probable'::text, 'linked'::text, 'shared'::text, 'tainted'::text, 'internal'::text, 'opted_out'::text])))
);

ALTER TABLE public.devices OWNER TO postgres;

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);

-- domain_aliases --------------------------------------------------------
CREATE TABLE public.domain_aliases (
    domain text NOT NULL,
    canonical text NOT NULL,
    source text DEFAULT 'redirect'::text NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.domain_aliases OWNER TO postgres;

ALTER TABLE ONLY public.domain_aliases
    ADD CONSTRAINT domain_aliases_pkey PRIMARY KEY (domain);

-- email_events ----------------------------------------------------------
CREATE TABLE public.email_events (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    message_id uuid,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    event_id text,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_events_event_id_check CHECK ((length(event_id) <= 100)),
    CONSTRAINT email_events_kind_check CHECK ((kind = ANY (ARRAY['delivered'::text, 'bounced'::text, 'complained'::text, 'rejected'::text, 'delayed'::text, 'clicked'::text, 'unsubscribed'::text])))
);

ALTER TABLE public.email_events OWNER TO postgres;

ALTER TABLE public.email_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.email_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_event_id_key UNIQUE (event_id);

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);

-- email_messages --------------------------------------------------------
CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email_id uuid NOT NULL,
    contact_id uuid,
    to_email text NOT NULL,
    dedupe text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    skip_reason text,
    error text,
    attempts integer DEFAULT 0 NOT NULL,
    send_after timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    provider_id text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    bounced text,
    complained_at timestamp with time zone,
    first_click_at timestamp with time zone,
    unsubscribed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vars jsonb,
    from_name text,
    reply_to text,
    sender_user uuid,
    CONSTRAINT email_messages_bounced_check CHECK ((bounced = ANY (ARRAY['hard'::text, 'soft'::text]))),
    CONSTRAINT email_messages_dedupe_check CHECK ((length(dedupe) <= 300)),
    CONSTRAINT email_messages_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT email_messages_from_name_check CHECK ((length(from_name) <= 80)),
    CONSTRAINT email_messages_reply_to_check CHECK ((length(reply_to) <= 254)),
    CONSTRAINT email_messages_skip_reason_check CHECK ((length(skip_reason) <= 40)),
    CONSTRAINT email_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'complained'::text, 'rejected'::text, 'skipped'::text, 'failed'::text, 'unknown'::text]))),
    CONSTRAINT email_messages_to_email_check CHECK ((length(to_email) <= 254))
);

ALTER TABLE public.email_messages OWNER TO postgres;

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_provider_id_key UNIQUE (provider_id);

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_workspace_id_dedupe_key UNIQUE (workspace_id, dedupe);

-- email_templates -------------------------------------------------------
CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    body jsonb NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_templates_body_check CHECK (((jsonb_typeof(body) = 'object'::text) AND (length((body)::text) <= 400000))),
    CONSTRAINT email_templates_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120)))
);

ALTER TABLE public.email_templates OWNER TO postgres;

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);

-- email_tokens ----------------------------------------------------------
CREATE TABLE public.email_tokens (
    token_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id text,
    email_id uuid,
    sent_at timestamp with time zone,
    claimed_device uuid,
    claimed_at timestamp with time zone,
    forwarded boolean DEFAULT false NOT NULL
);

ALTER TABLE public.email_tokens OWNER TO postgres;

ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_pkey PRIMARY KEY (token_id);

-- email_versions --------------------------------------------------------
CREATE TABLE public.email_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    ref text NOT NULL,
    doc jsonb NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    by_ai boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_versions_doc_check CHECK (((jsonb_typeof(doc) = 'object'::text) AND (length((doc)::text) <= 400000))),
    CONSTRAINT email_versions_note_check CHECK ((length(note) <= 300)),
    CONSTRAINT email_versions_ref_check CHECK (((length(ref) >= 1) AND (length(ref) <= 120))),
    CONSTRAINT email_versions_subject_check CHECK ((length(subject) <= 200))
);

ALTER TABLE public.email_versions OWNER TO postgres;

ALTER TABLE ONLY public.email_versions
    ADD CONSTRAINT email_versions_pkey PRIMARY KEY (id);

-- emails ----------------------------------------------------------------
CREATE TABLE public.emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    subject text NOT NULL,
    preheader text,
    html text NOT NULL,
    text text NOT NULL,
    links text[] DEFAULT '{}'::text[] NOT NULL,
    from_name text,
    from_email text,
    topic_id uuid,
    marketing boolean DEFAULT true NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    form_id uuid,
    CONSTRAINT emails_from_email_check CHECK ((length(from_email) <= 254)),
    CONSTRAINT emails_from_name_check CHECK ((length(from_name) <= 80)),
    CONSTRAINT emails_html_check CHECK ((length(html) <= 500000)),
    CONSTRAINT emails_kind_check CHECK ((kind = ANY (ARRAY['broadcast'::text, 'journey'::text, 'one_to_one'::text, 'test'::text]))),
    CONSTRAINT emails_links_check CHECK ((cardinality(links) <= 500)),
    CONSTRAINT emails_name_check CHECK (((length(name) >= 1) AND (length(name) <= 200))),
    CONSTRAINT emails_preheader_check CHECK ((length(preheader) <= 300)),
    CONSTRAINT emails_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'archived'::text]))),
    CONSTRAINT emails_subject_check CHECK (((length(subject) >= 1) AND (length(subject) <= 300))),
    CONSTRAINT emails_text_check CHECK ((length(text) <= 200000))
);

ALTER TABLE public.emails OWNER TO postgres;

ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_pkey PRIMARY KEY (id);

-- enrich_keys -----------------------------------------------------------
CREATE TABLE public.enrich_keys (
    workspace_id uuid NOT NULL,
    step text NOT NULL,
    sealed text NOT NULL,
    CONSTRAINT enrich_keys_sealed_check CHECK ((length(sealed) <= 2000)),
    CONSTRAINT enrich_keys_step_check CHECK ((step = ANY (ARRAY['coresignal'::text, 'pdl'::text])))
);

ALTER TABLE public.enrich_keys OWNER TO postgres;

ALTER TABLE ONLY public.enrich_keys
    ADD CONSTRAINT enrich_keys_pkey PRIMARY KEY (workspace_id, step);

-- enrich_runs -----------------------------------------------------------
CREATE TABLE public.enrich_runs (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid,
    company_id uuid,
    trigger text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    fields text[] DEFAULT '{}'::text[] NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    ms integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enrich_runs_steps_check CHECK ((jsonb_typeof(steps) = 'array'::text)),
    CONSTRAINT enrich_runs_trigger_check CHECK ((trigger = ANY (ARRAY['new'::text, 'form'::text, 'backfill'::text, 'try'::text, 'workflow'::text, 'again'::text])))
);

ALTER TABLE public.enrich_runs OWNER TO postgres;

ALTER TABLE public.enrich_runs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.enrich_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.enrich_runs
    ADD CONSTRAINT enrich_runs_pkey PRIMARY KEY (id);

-- enrich_settings -------------------------------------------------------
CREATE TABLE public.enrich_settings (
    workspace_id uuid NOT NULL,
    "on" boolean DEFAULT true NOT NULL,
    sources text[] DEFAULT '{form,booking,api,manual}'::text[] NOT NULL,
    skip_free boolean DEFAULT true NOT NULL,
    rescan_days integer DEFAULT 90 NOT NULL,
    credit_cap integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enrich_settings_credit_cap_check CHECK ((credit_cap >= 0)),
    CONSTRAINT enrich_settings_rescan_days_check CHECK (((rescan_days >= 30) AND (rescan_days <= 365)))
);

ALTER TABLE public.enrich_settings OWNER TO postgres;

ALTER TABLE ONLY public.enrich_settings
    ADD CONSTRAINT enrich_settings_pkey PRIMARY KEY (workspace_id);

-- enrich_sources --------------------------------------------------------
CREATE TABLE public.enrich_sources (
    workspace_id uuid NOT NULL,
    step text NOT NULL,
    "on" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    timeout_ms integer DEFAULT 4000 NOT NULL,
    has_key boolean DEFAULT false NOT NULL,
    CONSTRAINT enrich_sources_step_check CHECK ((step = ANY (ARRAY['email_check'::text, 'coresignal'::text, 'pdl'::text]))),
    CONSTRAINT enrich_sources_timeout_ms_check CHECK (((timeout_ms >= 300) AND (timeout_ms <= 10000)))
);

ALTER TABLE public.enrich_sources OWNER TO postgres;

ALTER TABLE ONLY public.enrich_sources
    ADD CONSTRAINT enrich_sources_pkey PRIMARY KEY (workspace_id, step);

-- enrich_usage ----------------------------------------------------------
CREATE TABLE public.enrich_usage (
    workspace_id uuid NOT NULL,
    month date NOT NULL,
    lookups integer DEFAULT 0 NOT NULL,
    matches integer DEFAULT 0 NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    alerted integer DEFAULT 0 NOT NULL,
    CONSTRAINT enrich_usage_credits_check CHECK ((credits >= 0))
);

ALTER TABLE public.enrich_usage OWNER TO postgres;

ALTER TABLE ONLY public.enrich_usage
    ADD CONSTRAINT enrich_usage_pkey PRIMARY KEY (workspace_id, month);

-- env_secret_values -----------------------------------------------------
CREATE TABLE public.env_secret_values (
    secret_id uuid NOT NULL,
    sealed text NOT NULL
);

ALTER TABLE public.env_secret_values OWNER TO postgres;

ALTER TABLE ONLY public.env_secret_values
    ADD CONSTRAINT env_secret_values_pkey PRIMARY KEY (secret_id);

-- env_secrets -----------------------------------------------------------
CREATE TABLE public.env_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    environment_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT env_secrets_name_check CHECK ((name ~ '^[A-Z][A-Z0-9_]{0,63}$'::text))
);

ALTER TABLE public.env_secrets OWNER TO postgres;

ALTER TABLE ONLY public.env_secrets
    ADD CONSTRAINT env_secrets_environment_id_name_key UNIQUE (environment_id, name);

ALTER TABLE ONLY public.env_secrets
    ADD CONSTRAINT env_secrets_pkey PRIMARY KEY (id);

-- environments ----------------------------------------------------------
CREATE TABLE public.environments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT environments_base_url_check CHECK ((base_url ~ '^https?://[^\s/]+'::text)),
    CONSTRAINT environments_name_check CHECK (((length(name) >= 1) AND (length(name) <= 40)))
);

ALTER TABLE public.environments OWNER TO postgres;

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_project_id_name_key UNIQUE (project_id, name);

-- erasures --------------------------------------------------------------
CREATE TABLE public.erasures (
    workspace_id uuid NOT NULL,
    value_hash bytea NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.erasures OWNER TO postgres;

ALTER TABLE ONLY public.erasures
    ADD CONSTRAINT erasures_pkey PRIMARY KEY (workspace_id, value_hash);

-- events ----------------------------------------------------------------
CREATE TABLE public.events (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
)
PARTITION BY RANGE (day);

ALTER TABLE public.events OWNER TO postgres;

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (day, id);

-- events_20261014 -------------------------------------------------------
CREATE TABLE public.events_20261014 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261014 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261014 FOR VALUES FROM ('2026-10-14') TO ('2026-10-15');

ALTER TABLE ONLY public.events_20261014
    ADD CONSTRAINT events_20261014_pkey PRIMARY KEY (day, id);

-- events_20261015 -------------------------------------------------------
CREATE TABLE public.events_20261015 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261015 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261015 FOR VALUES FROM ('2026-10-15') TO ('2026-10-16');

ALTER TABLE ONLY public.events_20261015
    ADD CONSTRAINT events_20261015_pkey PRIMARY KEY (day, id);

-- events_20261016 -------------------------------------------------------
CREATE TABLE public.events_20261016 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261016 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261016 FOR VALUES FROM ('2026-10-16') TO ('2026-10-17');

ALTER TABLE ONLY public.events_20261016
    ADD CONSTRAINT events_20261016_pkey PRIMARY KEY (day, id);

-- events_20261017 -------------------------------------------------------
CREATE TABLE public.events_20261017 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261017 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261017 FOR VALUES FROM ('2026-10-17') TO ('2026-10-18');

ALTER TABLE ONLY public.events_20261017
    ADD CONSTRAINT events_20261017_pkey PRIMARY KEY (day, id);

-- events_20261018 -------------------------------------------------------
CREATE TABLE public.events_20261018 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261018 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261018 FOR VALUES FROM ('2026-10-18') TO ('2026-10-19');

ALTER TABLE ONLY public.events_20261018
    ADD CONSTRAINT events_20261018_pkey PRIMARY KEY (day, id);

-- events_20261019 -------------------------------------------------------
CREATE TABLE public.events_20261019 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261019 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261019 FOR VALUES FROM ('2026-10-19') TO ('2026-10-20');

ALTER TABLE ONLY public.events_20261019
    ADD CONSTRAINT events_20261019_pkey PRIMARY KEY (day, id);

-- events_20261020 -------------------------------------------------------
CREATE TABLE public.events_20261020 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261020 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261020 FOR VALUES FROM ('2026-10-20') TO ('2026-10-21');

ALTER TABLE ONLY public.events_20261020
    ADD CONSTRAINT events_20261020_pkey PRIMARY KEY (day, id);

-- events_20261021 -------------------------------------------------------
CREATE TABLE public.events_20261021 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261021 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261021 FOR VALUES FROM ('2026-10-21') TO ('2026-10-22');

ALTER TABLE ONLY public.events_20261021
    ADD CONSTRAINT events_20261021_pkey PRIMARY KEY (day, id);

-- events_20261022 -------------------------------------------------------
CREATE TABLE public.events_20261022 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261022 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261022 FOR VALUES FROM ('2026-10-22') TO ('2026-10-23');

ALTER TABLE ONLY public.events_20261022
    ADD CONSTRAINT events_20261022_pkey PRIMARY KEY (day, id);

-- events_20261023 -------------------------------------------------------
CREATE TABLE public.events_20261023 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261023 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261023 FOR VALUES FROM ('2026-10-23') TO ('2026-10-24');

ALTER TABLE ONLY public.events_20261023
    ADD CONSTRAINT events_20261023_pkey PRIMARY KEY (day, id);

-- events_20261024 -------------------------------------------------------
CREATE TABLE public.events_20261024 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261024 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261024 FOR VALUES FROM ('2026-10-24') TO ('2026-10-25');

ALTER TABLE ONLY public.events_20261024
    ADD CONSTRAINT events_20261024_pkey PRIMARY KEY (day, id);

-- events_20261025 -------------------------------------------------------
CREATE TABLE public.events_20261025 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261025 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261025 FOR VALUES FROM ('2026-10-25') TO ('2026-10-26');

ALTER TABLE ONLY public.events_20261025
    ADD CONSTRAINT events_20261025_pkey PRIMARY KEY (day, id);

-- events_20261026 -------------------------------------------------------
CREATE TABLE public.events_20261026 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261026 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261026 FOR VALUES FROM ('2026-10-26') TO ('2026-10-27');

ALTER TABLE ONLY public.events_20261026
    ADD CONSTRAINT events_20261026_pkey PRIMARY KEY (day, id);

-- events_20261027 -------------------------------------------------------
CREATE TABLE public.events_20261027 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261027 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261027 FOR VALUES FROM ('2026-10-27') TO ('2026-10-28');

ALTER TABLE ONLY public.events_20261027
    ADD CONSTRAINT events_20261027_pkey PRIMARY KEY (day, id);

-- events_20261028 -------------------------------------------------------
CREATE TABLE public.events_20261028 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261028 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261028 FOR VALUES FROM ('2026-10-28') TO ('2026-10-29');

ALTER TABLE ONLY public.events_20261028
    ADD CONSTRAINT events_20261028_pkey PRIMARY KEY (day, id);

-- events_20261029 -------------------------------------------------------
CREATE TABLE public.events_20261029 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261029 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261029 FOR VALUES FROM ('2026-10-29') TO ('2026-10-30');

ALTER TABLE ONLY public.events_20261029
    ADD CONSTRAINT events_20261029_pkey PRIMARY KEY (day, id);

-- events_20261030 -------------------------------------------------------
CREATE TABLE public.events_20261030 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261030 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261030 FOR VALUES FROM ('2026-10-30') TO ('2026-10-31');

ALTER TABLE ONLY public.events_20261030
    ADD CONSTRAINT events_20261030_pkey PRIMARY KEY (day, id);

-- events_20261031 -------------------------------------------------------
CREATE TABLE public.events_20261031 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261031 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261031 FOR VALUES FROM ('2026-10-31') TO ('2026-11-01');

ALTER TABLE ONLY public.events_20261031
    ADD CONSTRAINT events_20261031_pkey PRIMARY KEY (day, id);

-- events_20261101 -------------------------------------------------------
CREATE TABLE public.events_20261101 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261101 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261101 FOR VALUES FROM ('2026-11-01') TO ('2026-11-02');

ALTER TABLE ONLY public.events_20261101
    ADD CONSTRAINT events_20261101_pkey PRIMARY KEY (day, id);

-- events_20261102 -------------------------------------------------------
CREATE TABLE public.events_20261102 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261102 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261102 FOR VALUES FROM ('2026-11-02') TO ('2026-11-03');

ALTER TABLE ONLY public.events_20261102
    ADD CONSTRAINT events_20261102_pkey PRIMARY KEY (day, id);

-- events_20261103 -------------------------------------------------------
CREATE TABLE public.events_20261103 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261103 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261103 FOR VALUES FROM ('2026-11-03') TO ('2026-11-04');

ALTER TABLE ONLY public.events_20261103
    ADD CONSTRAINT events_20261103_pkey PRIMARY KEY (day, id);

-- events_20261104 -------------------------------------------------------
CREATE TABLE public.events_20261104 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261104 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261104 FOR VALUES FROM ('2026-11-04') TO ('2026-11-05');

ALTER TABLE ONLY public.events_20261104
    ADD CONSTRAINT events_20261104_pkey PRIMARY KEY (day, id);

-- events_20261105 -------------------------------------------------------
CREATE TABLE public.events_20261105 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261105 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261105 FOR VALUES FROM ('2026-11-05') TO ('2026-11-06');

ALTER TABLE ONLY public.events_20261105
    ADD CONSTRAINT events_20261105_pkey PRIMARY KEY (day, id);

-- events_20261106 -------------------------------------------------------
CREATE TABLE public.events_20261106 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261106 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261106 FOR VALUES FROM ('2026-11-06') TO ('2026-11-07');

ALTER TABLE ONLY public.events_20261106
    ADD CONSTRAINT events_20261106_pkey PRIMARY KEY (day, id);

-- events_20261107 -------------------------------------------------------
CREATE TABLE public.events_20261107 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261107 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261107 FOR VALUES FROM ('2026-11-07') TO ('2026-11-08');

ALTER TABLE ONLY public.events_20261107
    ADD CONSTRAINT events_20261107_pkey PRIMARY KEY (day, id);

-- events_20261108 -------------------------------------------------------
CREATE TABLE public.events_20261108 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261108 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261108 FOR VALUES FROM ('2026-11-08') TO ('2026-11-09');

ALTER TABLE ONLY public.events_20261108
    ADD CONSTRAINT events_20261108_pkey PRIMARY KEY (day, id);

-- events_20261109 -------------------------------------------------------
CREATE TABLE public.events_20261109 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261109 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261109 FOR VALUES FROM ('2026-11-09') TO ('2026-11-10');

ALTER TABLE ONLY public.events_20261109
    ADD CONSTRAINT events_20261109_pkey PRIMARY KEY (day, id);

-- events_20261110 -------------------------------------------------------
CREATE TABLE public.events_20261110 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261110 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261110 FOR VALUES FROM ('2026-11-10') TO ('2026-11-11');

ALTER TABLE ONLY public.events_20261110
    ADD CONSTRAINT events_20261110_pkey PRIMARY KEY (day, id);

-- events_20261111 -------------------------------------------------------
CREATE TABLE public.events_20261111 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261111 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261111 FOR VALUES FROM ('2026-11-11') TO ('2026-11-12');

ALTER TABLE ONLY public.events_20261111
    ADD CONSTRAINT events_20261111_pkey PRIMARY KEY (day, id);

-- events_20261112 -------------------------------------------------------
CREATE TABLE public.events_20261112 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261112 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261112 FOR VALUES FROM ('2026-11-12') TO ('2026-11-13');

ALTER TABLE ONLY public.events_20261112
    ADD CONSTRAINT events_20261112_pkey PRIMARY KEY (day, id);

-- events_20261113 -------------------------------------------------------
CREATE TABLE public.events_20261113 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261113 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261113 FOR VALUES FROM ('2026-11-13') TO ('2026-11-14');

ALTER TABLE ONLY public.events_20261113
    ADD CONSTRAINT events_20261113_pkey PRIMARY KEY (day, id);

-- events_20261114 -------------------------------------------------------
CREATE TABLE public.events_20261114 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261114 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261114 FOR VALUES FROM ('2026-11-14') TO ('2026-11-15');

ALTER TABLE ONLY public.events_20261114
    ADD CONSTRAINT events_20261114_pkey PRIMARY KEY (day, id);

-- events_20261115 -------------------------------------------------------
CREATE TABLE public.events_20261115 (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    session_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    path text,
    title text,
    data jsonb,
    client_at timestamp with time zone,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'engage'::text, 'click'::text, 'form'::text, 'identify'::text, 'custom'::text]))),
    CONSTRAINT events_path_check CHECK ((length(path) <= 2048)),
    CONSTRAINT events_title_check CHECK ((length(title) <= 300))
);

ALTER TABLE public.events_20261115 OWNER TO postgres;

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_20261115 FOR VALUES FROM ('2026-11-15') TO ('2026-11-16');

ALTER TABLE ONLY public.events_20261115
    ADD CONSTRAINT events_20261115_pkey PRIMARY KEY (day, id);

-- explorations ----------------------------------------------------------
CREATE TABLE public.explorations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    environment_id uuid,
    environment_name text NOT NULL,
    base_url text NOT NULL,
    sign_in_test_id uuid,
    max_pages integer DEFAULT 50 NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    pages_found integer DEFAULT 0 NOT NULL,
    error text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    duration_ms integer,
    ai_calls integer DEFAULT 0 NOT NULL,
    ai_input_tokens integer DEFAULT 0 NOT NULL,
    ai_output_tokens integer DEFAULT 0 NOT NULL,
    locked_by text,
    locked_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT explorations_max_pages_check CHECK (((max_pages >= 1) AND (max_pages <= 200))),
    CONSTRAINT explorations_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'error'::text, 'canceled'::text])))
);

ALTER TABLE public.explorations OWNER TO postgres;

ALTER TABLE ONLY public.explorations
    ADD CONSTRAINT explorations_pkey PRIMARY KEY (id);

-- field_history ---------------------------------------------------------
CREATE TABLE public.field_history (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    object text NOT NULL,
    record_id uuid NOT NULL,
    key text NOT NULL,
    old jsonb,
    new jsonb,
    old_source jsonb,
    source text NOT NULL,
    by uuid,
    import_id uuid,
    at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.field_history OWNER TO postgres;

ALTER TABLE public.field_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.field_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.field_history
    ADD CONSTRAINT field_history_pkey PRIMARY KEY (id);

-- field_order -----------------------------------------------------------
CREATE TABLE public.field_order (
    workspace_id uuid NOT NULL,
    object text DEFAULT 'contact'::text NOT NULL,
    key text NOT NULL,
    classes text[] NOT NULL,
    CONSTRAINT field_order_classes_check CHECK (((classes <@ ARRAY['manual'::text, 'crm'::text, 'form'::text, 'product'::text, 'import'::text, 'vendor'::text, 'ai'::text]) AND ((cardinality(classes) >= 1) AND (cardinality(classes) <= 7)))),
    CONSTRAINT field_order_key_check CHECK ((length(key) <= 42)),
    CONSTRAINT field_order_object_check CHECK ((object ~ '^[a-z][a-z0-9_]{0,39}$'::text))
);

ALTER TABLE public.field_order OWNER TO postgres;

ALTER TABLE ONLY public.field_order
    ADD CONSTRAINT field_order_pkey PRIMARY KEY (workspace_id, object, key);

-- field_settings --------------------------------------------------------
CREATE TABLE public.field_settings (
    workspace_id uuid NOT NULL,
    object text NOT NULL,
    key text NOT NULL,
    label text,
    hidden boolean DEFAULT false NOT NULL,
    options jsonb,
    CONSTRAINT field_settings_key_check CHECK ((length(key) <= 40)),
    CONSTRAINT field_settings_label_check CHECK (((length(label) >= 1) AND (length(label) <= 80))),
    CONSTRAINT field_settings_object_check CHECK ((object ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT field_settings_options_check CHECK (((options IS NULL) OR ((jsonb_typeof(options) = 'array'::text) AND (jsonb_array_length(options) <= 100))))
);

ALTER TABLE public.field_settings OWNER TO postgres;

ALTER TABLE ONLY public.field_settings
    ADD CONSTRAINT field_settings_pkey PRIMARY KEY (workspace_id, object, key);

-- field_writes ----------------------------------------------------------
CREATE TABLE public.field_writes (
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb,
    source text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT field_writes_key_check CHECK ((length(key) <= 41)),
    CONSTRAINT field_writes_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE public.field_writes OWNER TO postgres;

ALTER TABLE ONLY public.field_writes
    ADD CONSTRAINT field_writes_pkey PRIMARY KEY (contact_id, key, source);

-- fields ----------------------------------------------------------------
CREATE TABLE public.fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    object text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    type text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    crm_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    required boolean DEFAULT false NOT NULL,
    group_name text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    system boolean DEFAULT false NOT NULL,
    CONSTRAINT fields_config_check CHECK ((jsonb_typeof(config) = 'object'::text)),
    CONSTRAINT fields_crm_map_check CHECK ((jsonb_typeof(crm_map) = 'object'::text)),
    CONSTRAINT fields_group_name_check CHECK ((length(group_name) <= 60)),
    CONSTRAINT fields_key_check CHECK ((key ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT fields_label_check CHECK (((length(label) >= 1) AND (length(label) <= 80))),
    CONSTRAINT fields_object_check CHECK ((object ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT fields_options_check CHECK (((jsonb_typeof(options) = 'array'::text) AND (jsonb_array_length(options) <= 100))),
    CONSTRAINT fields_type_check CHECK ((type = ANY (ARRAY['text'::text, 'long_text'::text, 'number'::text, 'currency'::text, 'percent'::text, 'date'::text, 'datetime'::text, 'select'::text, 'multi_select'::text, 'checkbox'::text, 'url'::text, 'email'::text, 'phone'::text, 'user'::text, 'relation'::text, 'rating'::text])))
);

ALTER TABLE public.fields OWNER TO postgres;

ALTER TABLE ONLY public.fields
    ADD CONSTRAINT fields_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fields
    ADD CONSTRAINT fields_workspace_id_object_key_key UNIQUE (workspace_id, object, key);

-- form_bookings ---------------------------------------------------------
CREATE TABLE public.form_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    submission_id uuid,
    contact_id uuid,
    source_id uuid,
    tool text NOT NULL,
    external_id text NOT NULL,
    start_at timestamp with time zone,
    linked text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_bookings_external_id_check CHECK (((length(external_id) >= 1) AND (length(external_id) <= 300))),
    CONSTRAINT form_bookings_linked_check CHECK ((linked = ANY (ARRAY['tracking'::text, 'email'::text, 'none'::text]))),
    CONSTRAINT form_bookings_tool_check CHECK ((length(tool) <= 40))
);

ALTER TABLE public.form_bookings OWNER TO postgres;

ALTER TABLE ONLY public.form_bookings
    ADD CONSTRAINT form_bookings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.form_bookings
    ADD CONSTRAINT form_bookings_workspace_id_tool_external_id_key UNIQUE (workspace_id, tool, external_id);

-- form_chats ------------------------------------------------------------
CREATE TABLE public.form_chats (
    form_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_chats_messages_check CHECK ((jsonb_typeof(messages) = 'array'::text))
);

ALTER TABLE public.form_chats OWNER TO postgres;

ALTER TABLE ONLY public.form_chats
    ADD CONSTRAINT form_chats_pkey PRIMARY KEY (form_id);

-- form_checks -----------------------------------------------------------
CREATE TABLE public.form_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    form_id uuid NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    submission_id uuid,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT form_checks_error_check CHECK ((length(error) <= 1000)),
    CONSTRAINT form_checks_status_check CHECK ((status = ANY (ARRAY['running'::text, 'passed'::text, 'failed'::text]))),
    CONSTRAINT form_checks_steps_check CHECK ((jsonb_typeof(steps) = 'array'::text))
);

ALTER TABLE public.form_checks OWNER TO postgres;

ALTER TABLE ONLY public.form_checks
    ADD CONSTRAINT form_checks_pkey PRIMARY KEY (id);

-- form_daily ------------------------------------------------------------
CREATE TABLE public.form_daily (
    form_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    day date NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    starts integer DEFAULT 0 NOT NULL,
    results integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.form_daily OWNER TO postgres;

ALTER TABLE ONLY public.form_daily
    ADD CONSTRAINT form_daily_pkey PRIMARY KEY (form_id, day);

-- form_destination_secrets ----------------------------------------------
CREATE TABLE public.form_destination_secrets (
    destination_id uuid NOT NULL,
    sealed text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.form_destination_secrets OWNER TO postgres;

ALTER TABLE ONLY public.form_destination_secrets
    ADD CONSTRAINT form_destination_secrets_pkey PRIMARY KEY (destination_id);

-- form_destinations -----------------------------------------------------
CREATE TABLE public.form_destinations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    form_id uuid NOT NULL,
    kind text NOT NULL,
    source_id uuid,
    name text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    mode text DEFAULT 'upsert'::text NOT NULL,
    paused boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_destinations_check CHECK (((kind = 'source'::text) = (source_id IS NOT NULL))),
    CONSTRAINT form_destinations_config_check CHECK (((jsonb_typeof(config) = 'object'::text) AND (length((config)::text) <= 4000))),
    CONSTRAINT form_destinations_kind_check CHECK ((kind = ANY (ARRAY['source'::text, 'slack'::text, 'webhook'::text]))),
    CONSTRAINT form_destinations_mode_check CHECK ((mode = ANY (ARRAY['upsert'::text, 'create'::text, 'update'::text]))),
    CONSTRAINT form_destinations_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120)))
);

ALTER TABLE public.form_destinations OWNER TO postgres;

ALTER TABLE ONLY public.form_destinations
    ADD CONSTRAINT form_destinations_pkey PRIMARY KEY (id);

-- form_drafts -----------------------------------------------------------
CREATE TABLE public.form_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    form_id uuid NOT NULL,
    token text NOT NULL,
    email text NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    step integer DEFAULT 0 NOT NULL,
    page text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    CONSTRAINT form_drafts_answers_check CHECK ((jsonb_typeof(answers) = 'object'::text)),
    CONSTRAINT form_drafts_email_check CHECK (((length(email) >= 3) AND (length(email) <= 320))),
    CONSTRAINT form_drafts_page_check CHECK ((length(page) <= 1000)),
    CONSTRAINT form_drafts_step_check CHECK (((step >= 0) AND (step <= 100))),
    CONSTRAINT form_drafts_token_check CHECK ((token ~ '^[A-Za-z0-9_-]{24,64}$'::text))
);

ALTER TABLE public.form_drafts OWNER TO postgres;

ALTER TABLE ONLY public.form_drafts
    ADD CONSTRAINT form_drafts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.form_drafts
    ADD CONSTRAINT form_drafts_token_key UNIQUE (token);

-- form_field_sessions ---------------------------------------------------
CREATE TABLE public.form_field_sessions (
    form_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    vid text NOT NULL,
    version integer NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    day date NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    left_field text,
    step integer DEFAULT 0 NOT NULL,
    sent boolean DEFAULT false NOT NULL,
    CONSTRAINT form_field_sessions_fields_check CHECK (((jsonb_typeof(fields) = 'object'::text) AND (length((fields)::text) <= 8000))),
    CONSTRAINT form_field_sessions_left_field_check CHECK ((left_field ~ '^[a-z0-9]{1,24}$'::text)),
    CONSTRAINT form_field_sessions_step_check CHECK (((step >= 0) AND (step <= 20))),
    CONSTRAINT form_field_sessions_vid_check CHECK ((vid ~ '^[A-Za-z0-9_-]{8,64}$'::text))
);

ALTER TABLE public.form_field_sessions OWNER TO postgres;

ALTER TABLE ONLY public.form_field_sessions
    ADD CONSTRAINT form_field_sessions_pkey PRIMARY KEY (form_id, vid, started_at);

-- form_folders ----------------------------------------------------------
CREATE TABLE public.form_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_folders_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60)))
);

ALTER TABLE public.form_folders OWNER TO postgres;

ALTER TABLE ONLY public.form_folders
    ADD CONSTRAINT form_folders_pkey PRIMARY KEY (id);

-- form_notify_sent ------------------------------------------------------
CREATE TABLE public.form_notify_sent (
    submission_id uuid NOT NULL,
    part text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_notify_sent_part_check CHECK ((part ~ '^(alert:[^\s]{3,254}|slack|reply)$'::text))
);

ALTER TABLE public.form_notify_sent OWNER TO postgres;

ALTER TABLE ONLY public.form_notify_sent
    ADD CONSTRAINT form_notify_sent_pkey PRIMARY KEY (submission_id, part);

-- form_seen -------------------------------------------------------------
CREATE TABLE public.form_seen (
    form_id uuid NOT NULL,
    vid text NOT NULL,
    kind text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_seen_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'start'::text, 'result'::text]))),
    CONSTRAINT form_seen_vid_check CHECK (((length(vid) >= 8) AND (length(vid) <= 64)))
);

ALTER TABLE public.form_seen OWNER TO postgres;

ALTER TABLE ONLY public.form_seen
    ADD CONSTRAINT form_seen_pkey PRIMARY KEY (form_id, vid, kind);

-- form_slug_moves -------------------------------------------------------
CREATE TABLE public.form_slug_moves (
    workspace_id uuid NOT NULL,
    slug text NOT NULL,
    form_id uuid NOT NULL,
    until timestamp with time zone NOT NULL
);

ALTER TABLE public.form_slug_moves OWNER TO postgres;

ALTER TABLE ONLY public.form_slug_moves
    ADD CONSTRAINT form_slug_moves_pkey PRIMARY KEY (workspace_id, slug);

-- form_submissions ------------------------------------------------------
CREATE TABLE public.form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    form_id uuid NOT NULL,
    contact_id uuid,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    utm jsonb DEFAULT '{}'::jsonb NOT NULL,
    page_url text,
    referrer text,
    basis text,
    spam text,
    ip_hash text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_submissions_answers_check CHECK ((jsonb_typeof(answers) = 'object'::text)),
    CONSTRAINT form_submissions_basis_check CHECK ((basis = ANY (ARRAY['opt_in'::text, 'legitimate_interest'::text, 'none'::text]))),
    CONSTRAINT form_submissions_ip_hash_check CHECK ((length(ip_hash) <= 64)),
    CONSTRAINT form_submissions_page_url_check CHECK ((length(page_url) <= 2000)),
    CONSTRAINT form_submissions_referrer_check CHECK ((length(referrer) <= 2000)),
    CONSTRAINT form_submissions_spam_check CHECK ((spam = ANY (ARRAY['honeypot'::text, 'too_fast'::text, 'rate'::text, 'captcha'::text]))),
    CONSTRAINT form_submissions_user_agent_check CHECK ((length(user_agent) <= 300)),
    CONSTRAINT form_submissions_utm_check CHECK ((jsonb_typeof(utm) = 'object'::text))
);

ALTER TABLE public.form_submissions OWNER TO postgres;

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);

-- form_uploads ----------------------------------------------------------
CREATE TABLE public.form_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    form_id uuid NOT NULL,
    field_id text NOT NULL,
    submission_id uuid,
    path text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    bytes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_uploads_bytes_check CHECK (((bytes > 0) AND (bytes <= 20971520))),
    CONSTRAINT form_uploads_field_id_check CHECK ((field_id ~ '^[a-z0-9]{1,24}$'::text)),
    CONSTRAINT form_uploads_kind_check CHECK ((length(kind) <= 100)),
    CONSTRAINT form_uploads_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT form_uploads_path_check CHECK ((length(path) <= 400))
);

ALTER TABLE public.form_uploads OWNER TO postgres;

ALTER TABLE ONLY public.form_uploads
    ADD CONSTRAINT form_uploads_pkey PRIMARY KEY (id);

-- form_versions ---------------------------------------------------------
CREATE TABLE public.form_versions (
    form_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    version integer NOT NULL,
    body jsonb NOT NULL,
    published_by uuid,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_versions_body_check CHECK (((jsonb_typeof(body) = 'object'::text) AND (length((body)::text) <= 1000000)))
);

ALTER TABLE public.form_versions OWNER TO postgres;

ALTER TABLE ONLY public.form_versions
    ADD CONSTRAINT form_versions_pkey PRIMARY KEY (form_id, version);

-- forms -----------------------------------------------------------------
CREATE TABLE public.forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    draft jsonb DEFAULT '{}'::jsonb NOT NULL,
    draft_rev integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    brand_kit_id uuid,
    published_at timestamp with time zone,
    kind text DEFAULT 'built'::text NOT NULL,
    results_columns text[],
    live_kit_id uuid,
    slug text,
    folder_id uuid,
    CONSTRAINT forms_draft_check CHECK (((jsonb_typeof(draft) = 'object'::text) AND (length((draft)::text) <= 1000000))),
    CONSTRAINT forms_fields_check CHECK (((jsonb_typeof(fields) = 'array'::text) AND (jsonb_array_length(fields) <= 50))),
    CONSTRAINT forms_kind_check CHECK ((kind = ANY (ARRAY['built'::text, 'captured'::text]))),
    CONSTRAINT forms_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT forms_results_columns_check CHECK ((cardinality(results_columns) <= 40)),
    CONSTRAINT forms_settings_check CHECK ((jsonb_typeof(settings) = 'object'::text)),
    CONSTRAINT forms_slug_check CHECK ((slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'::text)),
    CONSTRAINT forms_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'paused'::text])))
);

ALTER TABLE public.forms OWNER TO postgres;

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (id);

-- github_checks ---------------------------------------------------------
CREATE TABLE public.github_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    link_id uuid NOT NULL,
    installation_id bigint NOT NULL,
    repo_full_name text NOT NULL,
    head_sha text NOT NULL,
    pr_number integer,
    base_url text NOT NULL,
    run_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    check_run_id bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    conclusion text,
    finished_count integer DEFAULT 0 NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone,
    selection jsonb,
    ai_calls integer DEFAULT 0 NOT NULL,
    CONSTRAINT github_checks_head_sha_check CHECK ((head_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT github_checks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text])))
);

ALTER TABLE public.github_checks OWNER TO postgres;

ALTER TABLE ONLY public.github_checks
    ADD CONSTRAINT github_checks_pkey PRIMARY KEY (id);

-- github_installations --------------------------------------------------
CREATE TABLE public.github_installations (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    account_login text NOT NULL,
    account_type text DEFAULT 'User'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.github_installations OWNER TO postgres;

ALTER TABLE ONLY public.github_installations
    ADD CONSTRAINT github_installations_pkey PRIMARY KEY (id);

-- github_links ----------------------------------------------------------
CREATE TABLE public.github_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    installation_id bigint NOT NULL,
    repo_id bigint NOT NULL,
    repo_full_name text NOT NULL,
    run_on text DEFAULT 'pull_request'::text NOT NULL,
    environment_id uuid NOT NULL,
    scope text DEFAULT 'all'::text NOT NULL,
    use_case text,
    enabled boolean DEFAULT true NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pick_tests boolean DEFAULT true NOT NULL,
    CONSTRAINT github_links_repo_full_name_check CHECK ((repo_full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'::text)),
    CONSTRAINT github_links_run_on_check CHECK ((run_on = ANY (ARRAY['pull_request'::text, 'preview'::text]))),
    CONSTRAINT github_links_scope_check CHECK ((scope = ANY (ARRAY['all'::text, 'use_case'::text])))
);

ALTER TABLE public.github_links OWNER TO postgres;

ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT github_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT github_links_project_id_repo_id_run_on_key UNIQUE (project_id, repo_id, run_on);

-- heals -----------------------------------------------------------------
CREATE TABLE public.heals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    test_id uuid NOT NULL,
    run_id uuid,
    test_version integer NOT NULL,
    "position" integer NOT NULL,
    step_label text NOT NULL,
    old_code text NOT NULL,
    new_code text NOT NULL,
    error text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    CONSTRAINT heals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'stale'::text])))
);

ALTER TABLE public.heals OWNER TO postgres;

ALTER TABLE ONLY public.heals
    ADD CONSTRAINT heals_pkey PRIMARY KEY (id);

-- hook_events -----------------------------------------------------------
CREATE TABLE public.hook_events (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    source_id uuid NOT NULL,
    dedupe text NOT NULL,
    body jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    done_at timestamp with time zone,
    CONSTRAINT hook_events_dedupe_check CHECK ((length(dedupe) <= 300))
);

ALTER TABLE public.hook_events OWNER TO postgres;

ALTER TABLE public.hook_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.hook_events
    ADD CONSTRAINT hook_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.hook_events
    ADD CONSTRAINT hook_events_source_id_dedupe_key UNIQUE (source_id, dedupe);

-- hop_nonces ------------------------------------------------------------
CREATE TABLE public.hop_nonces (
    nonce bytea NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.hop_nonces OWNER TO postgres;

ALTER TABLE ONLY public.hop_nonces
    ADD CONSTRAINT hop_nonces_pkey PRIMARY KEY (nonce);

-- icp -------------------------------------------------------------------
CREATE TABLE public.icp (
    workspace_id uuid NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.icp OWNER TO postgres;

ALTER TABLE ONLY public.icp
    ADD CONSTRAINT icp_pkey PRIMARY KEY (workspace_id);

-- identifiers -----------------------------------------------------------
CREATE TABLE public.identifiers (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    person_id uuid,
    kind text NOT NULL,
    value_raw text,
    value_clean text NOT NULL,
    value_hash bytea NOT NULL,
    class text,
    domain text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT identifiers_class_check CHECK ((class = ANY (ARRAY['work'::text, 'free'::text, 'role'::text, 'own'::text, 'partner'::text]))),
    CONSTRAINT identifiers_kind_check CHECK ((kind = ANY (ARRAY['email'::text, 'user'::text, 'hubspot'::text])))
);

ALTER TABLE public.identifiers OWNER TO postgres;

ALTER TABLE ONLY public.identifiers
    ADD CONSTRAINT identifiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.identifiers
    ADD CONSTRAINT identifiers_workspace_id_kind_value_clean_key UNIQUE (workspace_id, kind, value_clean);

-- identity_evidence -----------------------------------------------------
CREATE TABLE public.identity_evidence (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid,
    device_id uuid,
    session_id uuid,
    source text NOT NULL,
    level text NOT NULL,
    identifiers jsonb NOT NULL,
    hard_edge boolean DEFAULT false NOT NULL,
    extra jsonb,
    server_at timestamp with time zone DEFAULT now() NOT NULL,
    stitched_at timestamp with time zone,
    ignored text,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revoke_reason text,
    CONSTRAINT identity_evidence_identifiers_check CHECK (((jsonb_typeof(identifiers) = 'array'::text) AND ((jsonb_array_length(identifiers) >= 1) AND (jsonb_array_length(identifiers) <= 4)))),
    CONSTRAINT identity_evidence_level_check CHECK ((level = ANY (ARRAY['verified'::text, 'asserted'::text, 'inferred'::text]))),
    CONSTRAINT identity_evidence_source_check CHECK ((source = ANY (ARRAY['identify'::text, 'identify_signed'::text, 'form'::text, 'booking'::text, 'gate'::text, 'hutk'::text, 'email_link'::text, 'page_link'::text, 'crm'::text, 'crm_merge'::text, 'manual_merge'::text])))
);

ALTER TABLE public.identity_evidence OWNER TO postgres;

ALTER TABLE ONLY public.identity_evidence
    ADD CONSTRAINT identity_evidence_pkey PRIMARY KEY (workspace_id, id);

-- identity_settings -----------------------------------------------------
CREATE TABLE public.identity_settings (
    workspace_id uuid NOT NULL,
    own_domains text[] DEFAULT '{}'::text[] NOT NULL,
    partner_domains text[] DEFAULT '{}'::text[] NOT NULL,
    office_nets cidr[] DEFAULT '{}'::cidr[] NOT NULL,
    identify_secrets_sealed text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT identity_settings_office_nets_check CHECK ((cardinality(office_nets) <= 50)),
    CONSTRAINT identity_settings_own_domains_check CHECK ((cardinality(own_domains) <= 20)),
    CONSTRAINT identity_settings_partner_domains_check CHECK ((cardinality(partner_domains) <= 200))
);

ALTER TABLE public.identity_settings OWNER TO postgres;

ALTER TABLE ONLY public.identity_settings
    ADD CONSTRAINT identity_settings_pkey PRIMARY KEY (workspace_id);

-- imports ---------------------------------------------------------------
CREATE TABLE public.imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    file_name text,
    file_path text,
    mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    kind text DEFAULT 'file'::text NOT NULL,
    source_id uuid,
    size bigint,
    sheet text,
    progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    rows_done integer DEFAULT 0 NOT NULL,
    errors_path text,
    undo_until timestamp with time zone,
    undone_at timestamp with time zone,
    CONSTRAINT imports_file_name_check CHECK ((length(file_name) <= 200)),
    CONSTRAINT imports_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'paste'::text, 'source'::text, 'api'::text, 'migration'::text]))),
    CONSTRAINT imports_sheet_check CHECK ((length(sheet) <= 120)),
    CONSTRAINT imports_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'failed'::text, 'undoing'::text, 'undone'::text])))
);

ALTER TABLE public.imports OWNER TO postgres;

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);

-- inbox_messages --------------------------------------------------------
CREATE TABLE public.inbox_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    to_address text NOT NULL,
    from_address text,
    subject text,
    text_body text,
    html_body text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    external_id text
);

ALTER TABLE public.inbox_messages OWNER TO postgres;

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_pkey PRIMARY KEY (id);

-- intent_params ---------------------------------------------------------
CREATE TABLE public.intent_params (
    workspace_id uuid NOT NULL,
    k numeric DEFAULT 60 NOT NULL,
    fitted_at timestamp with time zone
);

ALTER TABLE public.intent_params OWNER TO postgres;

ALTER TABLE ONLY public.intent_params
    ADD CONSTRAINT intent_params_pkey PRIMARY KEY (workspace_id);

-- invites ---------------------------------------------------------------
CREATE TABLE public.invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT invites_email_check CHECK ((length(email) <= 320))
);

ALTER TABLE public.invites OWNER TO postgres;

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_workspace_id_email_key UNIQUE (workspace_id, email);

-- ip_cache --------------------------------------------------------------
CREATE TABLE public.ip_cache (
    key bytea NOT NULL,
    net cidr NOT NULL,
    domain text,
    kind text,
    confidence integer,
    vendor text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ip_cache OWNER TO postgres;

ALTER TABLE ONLY public.ip_cache
    ADD CONSTRAINT ip_cache_pkey PRIMARY KEY (key);

-- jobs ------------------------------------------------------------------
CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    kind text NOT NULL,
    key text DEFAULT ''::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    run_after timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    locked_by text,
    locked_until timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    priority smallint DEFAULT 1 NOT NULL,
    CONSTRAINT jobs_key_check CHECK ((length(key) <= 200)),
    CONSTRAINT jobs_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_]{1,40}$'::text)),
    CONSTRAINT jobs_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
    CONSTRAINT jobs_priority_check CHECK (((priority >= 0) AND (priority <= 3))),
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.jobs OWNER TO postgres;

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

-- lead_score_marks ------------------------------------------------------
CREATE TABLE public.lead_score_marks (
    workspace_id uuid NOT NULL,
    sweep_after uuid,
    sweep_started_at timestamp with time zone,
    ran_at timestamp with time zone
);

ALTER TABLE public.lead_score_marks OWNER TO postgres;

ALTER TABLE ONLY public.lead_score_marks
    ADD CONSTRAINT lead_score_marks_pkey PRIMARY KEY (workspace_id);

-- lead_settings ---------------------------------------------------------
CREATE TABLE public.lead_settings (
    workspace_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    threshold integer DEFAULT 70 NOT NULL,
    fit_weight numeric DEFAULT 0.5 NOT NULL,
    half_life_days integer DEFAULT 30 NOT NULL,
    weights jsonb DEFAULT '{"visit": 3, "email.clicked": 8, "visit.pricing": 15, "form.submitted": 25, "meeting.booked": 40, "email.unsubscribed": -30}'::jsonb NOT NULL,
    titles text[] DEFAULT '{}'::text[] NOT NULL,
    routing jsonb DEFAULT '{"rules": [], "default": {"owners": []}, "respect_owner": true}'::jsonb NOT NULL,
    turns jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_settings_fit_weight_check CHECK (((fit_weight >= (0)::numeric) AND (fit_weight <= (1)::numeric))),
    CONSTRAINT lead_settings_half_life_days_check CHECK (((half_life_days >= 1) AND (half_life_days <= 365))),
    CONSTRAINT lead_settings_routing_check CHECK ((jsonb_typeof(routing) = 'object'::text)),
    CONSTRAINT lead_settings_threshold_check CHECK (((threshold >= 1) AND (threshold <= 100))),
    CONSTRAINT lead_settings_titles_check CHECK ((cardinality(titles) <= 50)),
    CONSTRAINT lead_settings_weights_check CHECK ((jsonb_typeof(weights) = 'object'::text))
);

ALTER TABLE public.lead_settings OWNER TO postgres;

ALTER TABLE ONLY public.lead_settings
    ADD CONSTRAINT lead_settings_pkey PRIMARY KEY (workspace_id);

-- learned_networks ------------------------------------------------------
CREATE TABLE public.learned_networks (
    workspace_id uuid NOT NULL,
    net cidr NOT NULL,
    account_id uuid,
    people integer DEFAULT 0 NOT NULL,
    share numeric,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.learned_networks OWNER TO postgres;

ALTER TABLE ONLY public.learned_networks
    ADD CONSTRAINT learned_networks_pkey PRIMARY KEY (workspace_id, net);

-- link_domains ----------------------------------------------------------
CREATE TABLE public.link_domains (
    workspace_id uuid NOT NULL,
    hostname text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    dns_ok boolean DEFAULT false NOT NULL,
    cert_ok boolean DEFAULT false NOT NULL,
    last_error text,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT link_domains_hostname_check CHECK (((length(hostname) <= 253) AND (hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'::text))),
    CONSTRAINT link_domains_last_error_check CHECK ((length(last_error) <= 300)),
    CONSTRAINT link_domains_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'failed'::text])))
);

ALTER TABLE public.link_domains OWNER TO postgres;

ALTER TABLE ONLY public.link_domains
    ADD CONSTRAINT link_domains_hostname_key UNIQUE (hostname);

ALTER TABLE ONLY public.link_domains
    ADD CONSTRAINT link_domains_pkey PRIMARY KEY (workspace_id);

-- mailbox_sends ---------------------------------------------------------
CREATE TABLE public.mailbox_sends (
    mailbox_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.mailbox_sends OWNER TO postgres;

-- mailboxes -------------------------------------------------------------
CREATE TABLE public.mailboxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    email text NOT NULL,
    sealed text NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    error text,
    broken_at timestamp with time zone,
    told_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mailboxes_email_check CHECK (((email ~ '^[^\s@]+@[^\s@]+$'::text) AND (length(email) <= 254))),
    CONSTRAINT mailboxes_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT mailboxes_provider_check CHECK ((provider = ANY (ARRAY['gmail'::text, 'outlook'::text]))),
    CONSTRAINT mailboxes_sealed_check CHECK ((length(sealed) <= 8000)),
    CONSTRAINT mailboxes_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'reconnect'::text])))
);

ALTER TABLE public.mailboxes OWNER TO postgres;

ALTER TABLE ONLY public.mailboxes
    ADD CONSTRAINT mailboxes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mailboxes
    ADD CONSTRAINT mailboxes_workspace_id_user_id_key UNIQUE (workspace_id, user_id);

-- mappings --------------------------------------------------------------
CREATE TABLE public.mappings (
    workspace_id uuid NOT NULL,
    source_id uuid NOT NULL,
    object text NOT NULL,
    col text NOT NULL,
    target text NOT NULL,
    value_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    wins text DEFAULT 'claritia'::text NOT NULL,
    CONSTRAINT mappings_col_check CHECK (((length(col) >= 1) AND (length(col) <= 200))),
    CONSTRAINT mappings_object_check CHECK ((object = ANY (ARRAY['contact'::text, 'company'::text]))),
    CONSTRAINT mappings_target_check CHECK ((target ~ '^(skip|email|name|first_name|last_name|title|phone|company|website|country|region|timezone|lifecycle|lead_status|basis|industry|size|domain|score|score_band|owner_crm|f\.[a-z][a-z0-9_]{0,39})$'::text)),
    CONSTRAINT mappings_value_map_check CHECK ((jsonb_typeof(value_map) = 'object'::text)),
    CONSTRAINT mappings_wins_check CHECK ((wins = ANY (ARRAY['claritia'::text, 'crm'::text, 'newest'::text])))
);

ALTER TABLE public.mappings OWNER TO postgres;

ALTER TABLE ONLY public.mappings
    ADD CONSTRAINT mappings_pkey PRIMARY KEY (source_id, object, col);

-- meeting_events --------------------------------------------------------
CREATE TABLE public.meeting_events (
    id bigint NOT NULL,
    meeting_id uuid NOT NULL,
    kind text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_events_kind_check CHECK ((kind ~ '^[a-z_]{2,40}$'::text))
);

ALTER TABLE public.meeting_events OWNER TO postgres;

ALTER TABLE public.meeting_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.meeting_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.meeting_events
    ADD CONSTRAINT meeting_events_pkey PRIMARY KEY (id);

-- meeting_links ---------------------------------------------------------
CREATE TABLE public.meeting_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    type_id uuid,
    owner_user_id uuid NOT NULL,
    title text,
    offered jsonb DEFAULT '[]'::jsonb NOT NULL,
    length_min integer,
    token_hash text NOT NULL,
    used_at timestamp with time zone,
    meeting_id uuid,
    closed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    location jsonb,
    token_sealed text,
    CONSTRAINT meeting_links_check CHECK ((((kind = 'single_use'::text) AND (type_id IS NOT NULL)) OR (kind <> 'single_use'::text))),
    CONSTRAINT meeting_links_kind_check CHECK ((kind = ANY (ARRAY['single_use'::text, 'one_off'::text, 'poll'::text]))),
    CONSTRAINT meeting_links_length_min_check CHECK (((length_min >= 5) AND (length_min <= 480))),
    CONSTRAINT meeting_links_location_check CHECK (((location IS NULL) OR (jsonb_typeof(location) = 'object'::text))),
    CONSTRAINT meeting_links_offered_check CHECK ((jsonb_typeof(offered) = 'array'::text)),
    CONSTRAINT meeting_links_title_check CHECK ((length(title) <= 120))
);

ALTER TABLE public.meeting_links OWNER TO postgres;

ALTER TABLE ONLY public.meeting_links
    ADD CONSTRAINT meeting_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meeting_links
    ADD CONSTRAINT meeting_links_token_hash_key UNIQUE (token_hash);

-- meeting_mails ---------------------------------------------------------
CREATE TABLE public.meeting_mails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    meeting_id uuid,
    submission_id uuid,
    kind text NOT NULL,
    to_email text NOT NULL,
    dedupe text NOT NULL,
    status text DEFAULT 'sending'::text NOT NULL,
    skip_reason text,
    error text,
    provider_id text,
    attempts integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    bounced text,
    complained_at timestamp with time zone,
    CONSTRAINT meeting_mails_bounced_check CHECK ((bounced = ANY (ARRAY['hard'::text, 'soft'::text]))),
    CONSTRAINT meeting_mails_dedupe_check CHECK ((length(dedupe) <= 300)),
    CONSTRAINT meeting_mails_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT meeting_mails_kind_check CHECK ((kind = ANY (ARRAY['confirm'::text, 'host_booked'::text, 'update'::text, 'host_moved'::text, 'cancel'::text, 'host_canceled'::text, 'reminder'::text, 'after'::text, 'no_show'::text, 'book_later'::text, 'reconnect'::text]))),
    CONSTRAINT meeting_mails_provider_id_check CHECK ((length(provider_id) <= 200)),
    CONSTRAINT meeting_mails_skip_reason_check CHECK ((length(skip_reason) <= 40)),
    CONSTRAINT meeting_mails_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'sent'::text, 'retry'::text, 'failed'::text, 'unknown'::text, 'skipped'::text]))),
    CONSTRAINT meeting_mails_to_email_check CHECK ((length(to_email) <= 320))
);

ALTER TABLE public.meeting_mails OWNER TO postgres;

ALTER TABLE ONLY public.meeting_mails
    ADD CONSTRAINT meeting_mails_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meeting_mails
    ADD CONSTRAINT meeting_mails_workspace_id_dedupe_key UNIQUE (workspace_id, dedupe);

-- meeting_outcome_uses --------------------------------------------------
CREATE TABLE public.meeting_outcome_uses (
    nonce text NOT NULL,
    meeting_id uuid NOT NULL,
    status text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_outcome_uses_nonce_check CHECK ((nonce ~ '^[0-9a-f]{16}$'::text)),
    CONSTRAINT meeting_outcome_uses_status_check CHECK ((status = ANY (ARRAY['held'::text, 'no_show'::text])))
);

ALTER TABLE public.meeting_outcome_uses OWNER TO postgres;

ALTER TABLE ONLY public.meeting_outcome_uses
    ADD CONSTRAINT meeting_outcome_uses_pkey PRIMARY KEY (nonce);

-- meeting_sync_leases ---------------------------------------------------
CREATE TABLE public.meeting_sync_leases (
    meeting_id uuid NOT NULL,
    job text NOT NULL,
    until timestamp with time zone NOT NULL
);

ALTER TABLE public.meeting_sync_leases OWNER TO postgres;

ALTER TABLE ONLY public.meeting_sync_leases
    ADD CONSTRAINT meeting_sync_leases_pkey PRIMARY KEY (meeting_id);

-- meeting_types ---------------------------------------------------------
CREATE TABLE public.meeting_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    hosts jsonb DEFAULT '[]'::jsonb NOT NULL,
    settings jsonb NOT NULL,
    secret boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    owner_user_id uuid,
    template_id uuid,
    locked text[] DEFAULT '{}'::text[] NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_types_hosts_check CHECK ((jsonb_typeof(hosts) = 'array'::text)),
    CONSTRAINT meeting_types_kind_check CHECK ((kind = ANY (ARRAY['one'::text, 'round_robin'::text, 'collective'::text, 'owner_first'::text, 'double'::text, 'group'::text]))),
    CONSTRAINT meeting_types_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT meeting_types_settings_check CHECK ((jsonb_typeof(settings) = 'object'::text)),
    CONSTRAINT meeting_types_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'::text))
);

ALTER TABLE public.meeting_types OWNER TO postgres;

ALTER TABLE ONLY public.meeting_types
    ADD CONSTRAINT meeting_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meeting_types
    ADD CONSTRAINT meeting_types_workspace_id_slug_key UNIQUE (workspace_id, slug);

-- meetings --------------------------------------------------------------
CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    type_id uuid,
    link_id uuid,
    hosts uuid[] NOT NULL,
    contact_id uuid,
    submission_id uuid,
    guest_email text NOT NULL,
    guest_name text,
    guest_tz text,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    block_start timestamp with time zone NOT NULL,
    block_end timestamp with time zone NOT NULL,
    status text DEFAULT 'booked'::text NOT NULL,
    source text NOT NULL,
    rr boolean DEFAULT false NOT NULL,
    location jsonb DEFAULT '{}'::jsonb NOT NULL,
    events jsonb DEFAULT '{}'::jsonb NOT NULL,
    token_hash text NOT NULL,
    payment jsonb,
    cancel_reason text,
    booked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    token_sealed text,
    CONSTRAINT meetings_answers_check CHECK ((jsonb_typeof(answers) = 'object'::text)),
    CONSTRAINT meetings_cancel_reason_check CHECK ((length(cancel_reason) <= 500)),
    CONSTRAINT meetings_check CHECK ((end_at > start_at)),
    CONSTRAINT meetings_check1 CHECK ((block_end >= end_at)),
    CONSTRAINT meetings_guest_email_check CHECK ((length(guest_email) <= 320)),
    CONSTRAINT meetings_guest_name_check CHECK ((length(guest_name) <= 200)),
    CONSTRAINT meetings_guest_tz_check CHECK ((length(guest_tz) <= 60)),
    CONSTRAINT meetings_hosts_check CHECK (((cardinality(hosts) >= 1) AND (cardinality(hosts) <= 20))),
    CONSTRAINT meetings_source_check CHECK ((source = ANY (ARRAY['page'::text, 'form'::text, 'handoff'::text, 'one_off'::text, 'poll'::text, 'api'::text]))),
    CONSTRAINT meetings_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'booked'::text, 'canceled'::text, 'held'::text, 'no_show'::text]))),
    CONSTRAINT meetings_token_sealed_check CHECK ((length(token_sealed) <= 400))
);

ALTER TABLE public.meetings OWNER TO postgres;

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_token_hash_key UNIQUE (token_hash);

-- merge_proposals -------------------------------------------------------
CREATE TABLE public.merge_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    person_a uuid NOT NULL,
    person_b uuid NOT NULL,
    reason text NOT NULL,
    evidence_id uuid,
    status text DEFAULT 'open'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merge_proposals_status_check CHECK ((status = ANY (ARRAY['open'::text, 'approved'::text, 'denied'::text])))
);

ALTER TABLE public.merge_proposals OWNER TO postgres;

ALTER TABLE ONLY public.merge_proposals
    ADD CONSTRAINT merge_proposals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.merge_proposals
    ADD CONSTRAINT merge_proposals_workspace_id_person_a_person_b_key UNIQUE (workspace_id, person_a, person_b);

-- network_flags ---------------------------------------------------------
CREATE TABLE public.network_flags (
    workspace_id uuid NOT NULL,
    net cidr NOT NULL,
    flag text NOT NULL,
    by_user uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT network_flags_flag_check CHECK ((flag = ANY (ARRAY['office'::text, 'shared'::text, 'partner'::text, 'ignore'::text])))
);

ALTER TABLE public.network_flags OWNER TO postgres;

ALTER TABLE ONLY public.network_flags
    ADD CONSTRAINT network_flags_pkey PRIMARY KEY (workspace_id, net, flag);

-- notes -----------------------------------------------------------------
CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    object text NOT NULL,
    record_id uuid NOT NULL,
    body text NOT NULL,
    author uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notes_body_check CHECK (((length(body) >= 1) AND (length(body) <= 20000))),
    CONSTRAINT notes_object_check CHECK ((object ~ '^[a-z][a-z0-9_]{0,39}$'::text))
);

ALTER TABLE public.notes OWNER TO postgres;

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);

-- nurture_enrollments ---------------------------------------------------
CREATE TABLE public.nurture_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nurture_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    step integer DEFAULT 0 NOT NULL,
    next_at timestamp with time zone DEFAULT now() NOT NULL,
    exit_reason text,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT nurture_enrollments_exit_reason_check CHECK ((exit_reason = ANY (ARRAY['reached_stage'::text, 'unsubscribed'::text, 'suppressed'::text, 'deleted'::text, 'removed'::text]))),
    CONSTRAINT nurture_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'done'::text, 'exited'::text])))
);

ALTER TABLE public.nurture_enrollments OWNER TO postgres;

ALTER TABLE ONLY public.nurture_enrollments
    ADD CONSTRAINT nurture_enrollments_nurture_id_contact_id_key UNIQUE (nurture_id, contact_id);

ALTER TABLE ONLY public.nurture_enrollments
    ADD CONSTRAINT nurture_enrollments_pkey PRIMARY KEY (id);

-- nurture_marks ---------------------------------------------------------
CREATE TABLE public.nurture_marks (
    nurture_id uuid NOT NULL,
    enrolled_to timestamp with time zone
);

ALTER TABLE public.nurture_marks OWNER TO postgres;

ALTER TABLE ONLY public.nurture_marks
    ADD CONSTRAINT nurture_marks_pkey PRIMARY KEY (nurture_id);

-- nurture_steps ---------------------------------------------------------
CREATE TABLE public.nurture_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nurture_id uuid NOT NULL,
    "position" integer NOT NULL,
    wait_days integer DEFAULT 2 NOT NULL,
    email_id uuid NOT NULL,
    ai boolean DEFAULT false NOT NULL,
    review_notes text[] DEFAULT '{}'::text[] NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nurture_steps_position_check CHECK ((("position" >= 0) AND ("position" <= 49))),
    CONSTRAINT nurture_steps_wait_days_check CHECK (((wait_days >= 0) AND (wait_days <= 90)))
);

ALTER TABLE public.nurture_steps OWNER TO postgres;

ALTER TABLE ONLY public.nurture_steps
    ADD CONSTRAINT nurture_steps_nurture_id_position_key UNIQUE (nurture_id, "position") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY public.nurture_steps
    ADD CONSTRAINT nurture_steps_pkey PRIMARY KEY (id);

-- nurtures --------------------------------------------------------------
CREATE TABLE public.nurtures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    trigger jsonb DEFAULT '{}'::jsonb NOT NULL,
    topic_id uuid,
    brief text DEFAULT ''::text NOT NULL,
    exit_stages text[] DEFAULT '{sql,opportunity,customer}'::text[] NOT NULL,
    live_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nurtures_brief_check CHECK ((length(brief) <= 8000)),
    CONSTRAINT nurtures_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT nurtures_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'paused'::text]))),
    CONSTRAINT nurtures_trigger_check CHECK ((jsonb_typeof(trigger) = 'object'::text))
);

ALTER TABLE public.nurtures OWNER TO postgres;

ALTER TABLE ONLY public.nurtures
    ADD CONSTRAINT nurtures_pkey PRIMARY KEY (id);

-- oauth_codes -----------------------------------------------------------
CREATE TABLE public.oauth_codes (
    code_hash text NOT NULL,
    client text NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    redirect_uri text NOT NULL,
    challenge text,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    key_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_codes_challenge_check CHECK ((length(challenge) <= 128)),
    CONSTRAINT oauth_codes_client_check CHECK ((client = ANY (ARRAY['zapier'::text, 'make'::text, 'activepieces'::text]))),
    CONSTRAINT oauth_codes_code_hash_check CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT oauth_codes_redirect_uri_check CHECK ((length(redirect_uri) <= 2000))
);

ALTER TABLE public.oauth_codes OWNER TO postgres;

ALTER TABLE ONLY public.oauth_codes
    ADD CONSTRAINT oauth_codes_pkey PRIMARY KEY (code_hash);

-- object_layouts --------------------------------------------------------
CREATE TABLE public.object_layouts (
    workspace_id uuid NOT NULL,
    object text NOT NULL,
    sections jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT object_layouts_object_check CHECK ((object ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT object_layouts_sections_check CHECK (((jsonb_typeof(sections) = 'array'::text) AND (length((sections)::text) <= 20000)))
);

ALTER TABLE public.object_layouts OWNER TO postgres;

ALTER TABLE ONLY public.object_layouts
    ADD CONSTRAINT object_layouts_pkey PRIMARY KEY (workspace_id, object);

-- objects ---------------------------------------------------------------
CREATE TABLE public.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    plural text NOT NULL,
    icon text DEFAULT 'box'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    system boolean DEFAULT false NOT NULL,
    CONSTRAINT objects_icon_check CHECK ((length(icon) <= 30)),
    CONSTRAINT objects_key_check CHECK (((key ~ '^[a-z][a-z0-9_]{0,39}$'::text) AND (key <> ALL (ARRAY['contact'::text, 'company'::text, 'lead'::text, 'deal'::text, 'account'::text, 'visitor'::text, 'segment'::text])))),
    CONSTRAINT objects_label_check CHECK (((length(label) >= 1) AND (length(label) <= 60))),
    CONSTRAINT objects_plural_check CHECK (((length(plural) >= 1) AND (length(plural) <= 60)))
);

ALTER TABLE public.objects OWNER TO postgres;

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_workspace_id_key_key UNIQUE (workspace_id, key);

-- opt_outs --------------------------------------------------------------
CREATE TABLE public.opt_outs (
    site_id uuid NOT NULL,
    device_hash bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.opt_outs OWNER TO postgres;

ALTER TABLE ONLY public.opt_outs
    ADD CONSTRAINT opt_outs_pkey PRIMARY KEY (site_id, device_hash);

-- page_groups -----------------------------------------------------------
CREATE TABLE public.page_groups (
    site_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    pattern text NOT NULL,
    grp text NOT NULL,
    competitor text,
    source text DEFAULT 'user'::text NOT NULL,
    CONSTRAINT page_groups_competitor_check CHECK ((length(competitor) <= 100)),
    CONSTRAINT page_groups_grp_check CHECK ((grp = ANY (ARRAY['pricing'::text, 'demo'::text, 'compare'::text, 'security'::text, 'integrations'::text, 'docs'::text, 'case_study'::text, 'product'::text, 'blog'::text, 'careers'::text, 'legal'::text, 'login'::text, 'private'::text, 'other'::text]))),
    CONSTRAINT page_groups_pattern_check CHECK (((pattern ~ '^/'::text) AND (length(pattern) <= 300))),
    CONSTRAINT page_groups_source_check CHECK ((source = ANY (ARRAY['user'::text, 'suggested'::text])))
);

ALTER TABLE public.page_groups OWNER TO postgres;

ALTER TABLE ONLY public.page_groups
    ADD CONSTRAINT page_groups_pkey PRIMARY KEY (site_id, pattern);

-- payment_accounts ------------------------------------------------------
CREATE TABLE public.payment_accounts (
    workspace_id uuid NOT NULL,
    stripe_account text NOT NULL,
    ready boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_accounts_stripe_account_check CHECK ((stripe_account ~ '^acct_[A-Za-z0-9]{1,64}$'::text))
);

ALTER TABLE public.payment_accounts OWNER TO postgres;

ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_pkey PRIMARY KEY (workspace_id);

ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_stripe_account_key UNIQUE (stripe_account);

-- person_aliases --------------------------------------------------------
CREATE TABLE public.person_aliases (
    old_id uuid NOT NULL,
    new_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.person_aliases OWNER TO postgres;

ALTER TABLE ONLY public.person_aliases
    ADD CONSTRAINT person_aliases_pkey PRIMARY KEY (old_id);

-- person_cache ----------------------------------------------------------
CREATE TABLE public.person_cache (
    email_clean text NOT NULL,
    vendor text NOT NULL,
    data jsonb,
    not_found boolean DEFAULT false NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT person_cache_email_clean_check CHECK ((length(email_clean) <= 254)),
    CONSTRAINT person_cache_vendor_check CHECK ((length(vendor) <= 40))
);

ALTER TABLE public.person_cache OWNER TO postgres;

ALTER TABLE ONLY public.person_cache
    ADD CONSTRAINT person_cache_pkey PRIMARY KEY (email_clean);

-- persons ---------------------------------------------------------------
CREATE TABLE public.persons (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    primary_email text,
    account_id uuid,
    partner boolean DEFAULT false NOT NULL,
    opted_out boolean DEFAULT false NOT NULL,
    merged_into uuid
);

ALTER TABLE public.persons OWNER TO postgres;

ALTER TABLE ONLY public.persons
    ADD CONSTRAINT persons_pkey PRIMARY KEY (id);

-- plan_usage ------------------------------------------------------------
CREATE TABLE public.plan_usage (
    workspace_id uuid NOT NULL,
    month date NOT NULL,
    submissions integer DEFAULT 0 NOT NULL,
    ai_credits integer DEFAULT 0 NOT NULL,
    CONSTRAINT plan_usage_ai_credits_check CHECK ((ai_credits >= 0)),
    CONSTRAINT plan_usage_month_check CHECK ((month = (date_trunc('month'::text, (month)::timestamp with time zone))::date)),
    CONSTRAINT plan_usage_submissions_check CHECK ((submissions >= 0))
);

ALTER TABLE public.plan_usage OWNER TO postgres;

ALTER TABLE ONLY public.plan_usage
    ADD CONSTRAINT plan_usage_pkey PRIMARY KEY (workspace_id, month);

-- plans -----------------------------------------------------------------
CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    proposals integer DEFAULT 0 NOT NULL,
    error text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    ai_calls integer DEFAULT 0 NOT NULL,
    ai_input_tokens integer DEFAULT 0 NOT NULL,
    ai_output_tokens integer DEFAULT 0 NOT NULL,
    locked_by text,
    locked_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT plans_notes_check CHECK ((length(notes) <= 30000)),
    CONSTRAINT plans_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'error'::text])))
);

ALTER TABLE public.plans OWNER TO postgres;

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);

-- poll_votes ------------------------------------------------------------
CREATE TABLE public.poll_votes (
    link_id uuid NOT NULL,
    email text NOT NULL,
    name text,
    picks jsonb DEFAULT '[]'::jsonb NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT poll_votes_email_check CHECK ((length(email) <= 320)),
    CONSTRAINT poll_votes_name_check CHECK ((length(name) <= 200)),
    CONSTRAINT poll_votes_picks_check CHECK ((jsonb_typeof(picks) = 'array'::text))
);

ALTER TABLE public.poll_votes OWNER TO postgres;

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (link_id, email);

-- privacy_exports -------------------------------------------------------
CREATE TABLE public.privacy_exports (
    request_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.privacy_exports OWNER TO postgres;

ALTER TABLE ONLY public.privacy_exports
    ADD CONSTRAINT privacy_exports_pkey PRIMARY KEY (request_id);

-- privacy_requests ------------------------------------------------------
CREATE TABLE public.privacy_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    subject_hash bytea NOT NULL,
    requested_by uuid,
    source text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT privacy_requests_kind_check CHECK ((kind = ANY (ARRAY['export'::text, 'erase'::text, 'opt_out'::text, 'correct'::text]))),
    CONSTRAINT privacy_requests_source_check CHECK ((source = ANY (ARRAY['app'::text, 'api'::text, 'hubspot'::text, 'omniscient'::text]))),
    CONSTRAINT privacy_requests_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.privacy_requests OWNER TO postgres;

ALTER TABLE ONLY public.privacy_requests
    ADD CONSTRAINT privacy_requests_pkey PRIMARY KEY (id);

-- projects --------------------------------------------------------------
CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    inbox_id text NOT NULL,
    CONSTRAINT projects_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80)))
);

ALTER TABLE public.projects OWNER TO postgres;

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

-- qualify_settings ------------------------------------------------------
CREATE TABLE public.qualify_settings (
    workspace_id uuid NOT NULL,
    "on" boolean DEFAULT false NOT NULL,
    outcomes jsonb DEFAULT '[]'::jsonb NOT NULL,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qualify_settings_outcomes_check CHECK ((jsonb_typeof(outcomes) = 'array'::text)),
    CONSTRAINT qualify_settings_rules_check CHECK ((jsonb_typeof(rules) = 'array'::text))
);

ALTER TABLE public.qualify_settings OWNER TO postgres;

ALTER TABLE ONLY public.qualify_settings
    ADD CONSTRAINT qualify_settings_pkey PRIMARY KEY (workspace_id);

-- record_links ----------------------------------------------------------
CREATE TABLE public.record_links (
    workspace_id uuid NOT NULL,
    field_id uuid NOT NULL,
    from_object text NOT NULL,
    from_id uuid NOT NULL,
    to_object text NOT NULL,
    to_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.record_links OWNER TO postgres;

ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_pkey PRIMARY KEY (field_id, from_id, to_id);

-- records ---------------------------------------------------------------
CREATE TABLE public.records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    object_id uuid NOT NULL,
    name text NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    field_sources jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT records_fields_check CHECK ((jsonb_typeof(fields) = 'object'::text)),
    CONSTRAINT records_name_check CHECK (((length(name) >= 1) AND (length(name) <= 300)))
);

ALTER TABLE public.records OWNER TO postgres;

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_pkey PRIMARY KEY (id);

-- router_alert_sent -----------------------------------------------------
CREATE TABLE public.router_alert_sent (
    run_id uuid NOT NULL,
    part text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT router_alert_sent_part_check CHECK (((length(part) >= 1) AND (length(part) <= 320)))
);

ALTER TABLE public.router_alert_sent OWNER TO postgres;

ALTER TABLE ONLY public.router_alert_sent
    ADD CONSTRAINT router_alert_sent_pkey PRIMARY KEY (run_id, part);

-- router_chats ----------------------------------------------------------
CREATE TABLE public.router_chats (
    workspace_id uuid NOT NULL,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT router_chats_messages_check CHECK ((jsonb_typeof(messages) = 'array'::text))
);

ALTER TABLE public.router_chats OWNER TO postgres;

ALTER TABLE ONLY public.router_chats
    ADD CONSTRAINT router_chats_pkey PRIMARY KEY (workspace_id);

-- router_replays --------------------------------------------------------
CREATE TABLE public.router_replays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    done integer DEFAULT 0 NOT NULL,
    result jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT router_replays_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.router_replays OWNER TO postgres;

ALTER TABLE ONLY public.router_replays
    ADD CONSTRAINT router_replays_pkey PRIMARY KEY (id);

-- router_reps -----------------------------------------------------------
CREATE TABLE public.router_reps (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    paused_until timestamp with time zone,
    out_dates jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup uuid,
    cap_day integer,
    cap_week integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT router_reps_cap_day_check CHECK (((cap_day >= 1) AND (cap_day <= 1000))),
    CONSTRAINT router_reps_cap_week_check CHECK (((cap_week >= 1) AND (cap_week <= 5000))),
    CONSTRAINT router_reps_out_dates_check CHECK ((jsonb_typeof(out_dates) = 'array'::text))
);

ALTER TABLE public.router_reps OWNER TO postgres;

ALTER TABLE ONLY public.router_reps
    ADD CONSTRAINT router_reps_pkey PRIMARY KEY (workspace_id, user_id);

-- router_runs -----------------------------------------------------------
CREATE TABLE public.router_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid,
    key text NOT NULL,
    reason text NOT NULL,
    version integer,
    kind text NOT NULL,
    owner uuid,
    by text,
    queue_id text,
    rule_id text,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    facts jsonb DEFAULT '{}'::jsonb NOT NULL,
    ms integer,
    undone_at timestamp with time zone,
    by_user uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    policy_id uuid,
    policy_version integer,
    source_id uuid,
    source_revision integer,
    parent_run_id uuid,
    assignment_state text,
    booking_state text,
    booking_reason text,
    sync_state text,
    previous_owner uuid,
    effect text,
    trace jsonb,
    team_id uuid,
    meeting_id uuid,
    booking_active_at timestamp with time zone,
    CONSTRAINT router_runs_assignment_state_check CHECK (((assignment_state IS NULL) OR (assignment_state = ANY (ARRAY['pending'::text, 'held_for_review'::text, 'assigned'::text, 'unassigned_needs_review'::text, 'excluded'::text, 'failed'::text])))),
    CONSTRAINT router_runs_booking_reason_check CHECK (((booking_reason IS NULL) OR (booking_reason = ANY (ARRAY['no_slots'::text, 'calendar_disconnected'::text, 'permission_error'::text, 'timeout'::text, 'unknown'::text, 'slot_taken'::text, 'outcome_unknown'::text, 'provider_error'::text])))),
    CONSTRAINT router_runs_booking_state_check CHECK (((booking_state IS NULL) OR (booking_state = ANY (ARRAY['not_requested'::text, 'awaiting_selection'::text, 'pending_confirmation'::text, 'confirmed'::text, 'unavailable'::text, 'abandoned'::text, 'cancelled'::text, 'failed'::text])))),
    CONSTRAINT router_runs_by_check CHECK ((by = ANY (ARRAY['account'::text, 'keep'::text, 'queue'::text, 'fallback'::text, 'hand'::text, 'rule'::text, 'backup'::text]))),
    CONSTRAINT router_runs_effect_check CHECK (((effect IS NULL) OR (effect = ANY (ARRAY['new'::text, 'retained'::text, 'none'::text])))),
    CONSTRAINT router_runs_key_check CHECK ((length(key) <= 200)),
    CONSTRAINT router_runs_kind_check CHECK ((kind = ANY (ARRAY['owner'::text, 'held'::text, 'unassigned'::text]))),
    CONSTRAINT router_runs_queue_id_check CHECK ((length(queue_id) <= 40)),
    CONSTRAINT router_runs_reason_check CHECK ((reason = ANY (ARRAY['form'::text, 'import'::text, 'crm'::text, 'api'::text, 'again'::text, 'let_through'::text, 'score'::text, 'manual'::text, 'sla'::text, 'booking'::text]))),
    CONSTRAINT router_runs_rule_id_check CHECK ((length(rule_id) <= 40)),
    CONSTRAINT router_runs_sync_state_check CHECK (((sync_state IS NULL) OR (sync_state = ANY (ARRAY['not_required'::text, 'pending'::text, 'complete'::text, 'failed'::text]))))
);

ALTER TABLE public.router_runs OWNER TO postgres;

ALTER TABLE ONLY public.router_runs
    ADD CONSTRAINT router_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.router_runs
    ADD CONSTRAINT router_runs_workspace_id_key_key UNIQUE (workspace_id, key);

-- router_secrets --------------------------------------------------------
CREATE TABLE public.router_secrets (
    workspace_id uuid NOT NULL,
    sealed text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.router_secrets OWNER TO postgres;

ALTER TABLE ONLY public.router_secrets
    ADD CONSTRAINT router_secrets_pkey PRIMARY KEY (workspace_id);

-- router_slas -----------------------------------------------------------
CREATE TABLE public.router_slas (
    run_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    nudge_at timestamp with time zone,
    due_at timestamp with time zone NOT NULL,
    next text NOT NULL,
    manager uuid,
    status text DEFAULT 'open'::text NOT NULL,
    ended_by text,
    acted_at timestamp with time zone,
    nudged_at timestamp with time zone,
    ended_at timestamp with time zone,
    CONSTRAINT router_slas_ended_by_check CHECK ((ended_by = ANY (ARRAY['note'::text, 'task'::text, 'meeting'::text, 'marked'::text, 'owner_changed'::text, 'undone'::text]))),
    CONSTRAINT router_slas_next_check CHECK ((next = ANY (ARRAY['route'::text, 'manager'::text, 'nudge'::text]))),
    CONSTRAINT router_slas_status_check CHECK ((status = ANY (ARRAY['open'::text, 'met'::text, 'missed'::text, 'closed'::text])))
);

ALTER TABLE public.router_slas OWNER TO postgres;

ALTER TABLE ONLY public.router_slas
    ADD CONSTRAINT router_slas_pkey PRIMARY KEY (run_id);

-- router_versions -------------------------------------------------------
CREATE TABLE public.router_versions (
    workspace_id uuid NOT NULL,
    version integer NOT NULL,
    body jsonb NOT NULL,
    note text,
    published_by uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT router_versions_body_check CHECK ((jsonb_typeof(body) = 'object'::text)),
    CONSTRAINT router_versions_note_check CHECK ((length(note) <= 300)),
    CONSTRAINT router_versions_version_check CHECK ((version > 0))
);

ALTER TABLE public.router_versions OWNER TO postgres;

ALTER TABLE ONLY public.router_versions
    ADD CONSTRAINT router_versions_pkey PRIMARY KEY (workspace_id, version);

-- routers ---------------------------------------------------------------
CREATE TABLE public.routers (
    workspace_id uuid NOT NULL,
    live_version integer,
    draft jsonb,
    draft_base integer,
    draft_revision integer DEFAULT 0 NOT NULL,
    draft_by uuid,
    draft_at timestamp with time zone,
    allow text[] DEFAULT '{}'::text[] NOT NULL,
    block text[] DEFAULT '{}'::text[] NOT NULL,
    alert_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paused_at timestamp with time zone,
    paused_by uuid,
    CONSTRAINT routers_alert_label_check CHECK ((length(alert_label) <= 120)),
    CONSTRAINT routers_allow_check CHECK ((cardinality(allow) <= 2000)),
    CONSTRAINT routers_block_check CHECK ((cardinality(block) <= 2000)),
    CONSTRAINT routers_draft_check CHECK (((draft IS NULL) OR (jsonb_typeof(draft) = 'object'::text)))
);

ALTER TABLE public.routers OWNER TO postgres;

ALTER TABLE ONLY public.routers
    ADD CONSTRAINT routers_pkey PRIMARY KEY (workspace_id);

-- routing_assignments ---------------------------------------------------
CREATE TABLE public.routing_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    run_id uuid NOT NULL,
    contact_id uuid,
    user_id uuid NOT NULL,
    previous_owner uuid,
    team_id uuid,
    counted boolean DEFAULT false NOT NULL,
    advanced boolean DEFAULT false NOT NULL,
    quota_period timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.routing_assignments OWNER TO postgres;

ALTER TABLE ONLY public.routing_assignments
    ADD CONSTRAINT routing_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.routing_assignments
    ADD CONSTRAINT routing_assignments_run_id_key UNIQUE (run_id);

-- routing_policies ------------------------------------------------------
CREATE TABLE public.routing_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    draft jsonb,
    draft_base integer,
    draft_revision integer DEFAULT 0 NOT NULL,
    draft_by uuid,
    draft_at timestamp with time zone,
    active_version integer,
    archived_at timestamp with time zone,
    create_key text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    draft_name text,
    CONSTRAINT routing_policies_create_key_check CHECK ((length(create_key) <= 100)),
    CONSTRAINT routing_policies_draft_check CHECK (((draft IS NULL) OR (jsonb_typeof(draft) = 'object'::text))),
    CONSTRAINT routing_policies_draft_name_check CHECK (((draft_name IS NULL) OR ((length(btrim(draft_name)) >= 1) AND (length(btrim(draft_name)) <= 80)))),
    CONSTRAINT routing_policies_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);

ALTER TABLE public.routing_policies OWNER TO postgres;

ALTER TABLE ONLY public.routing_policies
    ADD CONSTRAINT routing_policies_pkey PRIMARY KEY (id);

-- routing_policy_versions -----------------------------------------------
CREATE TABLE public.routing_policy_versions (
    policy_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    version integer NOT NULL,
    config jsonb NOT NULL,
    note text,
    published_by uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    publish_key text,
    sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT routing_policy_versions_config_check CHECK ((jsonb_typeof(config) = 'object'::text)),
    CONSTRAINT routing_policy_versions_note_check CHECK ((length(note) <= 300)),
    CONSTRAINT routing_policy_versions_publish_key_check CHECK ((length(publish_key) <= 100)),
    CONSTRAINT routing_policy_versions_sources_check CHECK ((jsonb_typeof(sources) = 'array'::text)),
    CONSTRAINT routing_policy_versions_version_check CHECK ((version > 0))
);

ALTER TABLE public.routing_policy_versions OWNER TO postgres;

ALTER TABLE ONLY public.routing_policy_versions
    ADD CONSTRAINT routing_policy_versions_pkey PRIMARY KEY (policy_id, version);

-- routing_quota ---------------------------------------------------------
CREATE TABLE public.routing_quota (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    tz text DEFAULT 'UTC'::text NOT NULL,
    n integer DEFAULT 0 NOT NULL,
    CONSTRAINT routing_quota_check CHECK ((period_end > period_start)),
    CONSTRAINT routing_quota_n_check CHECK ((n >= 0)),
    CONSTRAINT routing_quota_tz_check CHECK ((length(tz) <= 60))
);

ALTER TABLE public.routing_quota OWNER TO postgres;

ALTER TABLE ONLY public.routing_quota
    ADD CONSTRAINT routing_quota_pkey PRIMARY KEY (workspace_id, user_id, period_start);

-- routing_reviews -------------------------------------------------------
CREATE TABLE public.routing_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    run_id uuid NOT NULL,
    contact_id uuid,
    submission_id uuid,
    policy_id uuid,
    reason text NOT NULL,
    state text DEFAULT 'open'::text NOT NULL,
    reviewer uuid NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    child_run_id uuid,
    latest_action jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routing_reviews_reason_check CHECK ((reason = ANY (ARRAY['spam'::text, 'rule'::text, 'source_mapping_mismatch'::text, 'multiple_companies'::text, 'no_eligible_recipient'::text, 'no_default'::text, 'source_disconnected'::text]))),
    CONSTRAINT routing_reviews_state_check CHECK ((state = ANY (ARRAY['open'::text, 'approved_pending_execution'::text, 'in_progress'::text, 'resolved'::text, 'dismissed'::text])))
);

ALTER TABLE public.routing_reviews OWNER TO postgres;

ALTER TABLE ONLY public.routing_reviews
    ADD CONSTRAINT routing_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.routing_reviews
    ADD CONSTRAINT routing_reviews_run_id_key UNIQUE (run_id);

-- routing_sources -------------------------------------------------------
CREATE TABLE public.routing_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    form_id uuid,
    policy_id uuid,
    enabled boolean DEFAULT false NOT NULL,
    outcome text DEFAULT 'assign_only'::text NOT NULL,
    meeting_type_id uuid,
    mappings jsonb DEFAULT '[]'::jsonb NOT NULL,
    completion jsonb DEFAULT '{"from": "form"}'::jsonb NOT NULL,
    no_slots jsonb DEFAULT '{"task": true, "message": "form"}'::jsonb NOT NULL,
    live_revision integer DEFAULT 1 NOT NULL,
    follows_default boolean DEFAULT true NOT NULL,
    draft jsonb,
    draft_revision integer DEFAULT 0 NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    when_off text DEFAULT 'none'::text NOT NULL,
    CONSTRAINT routing_sources_check CHECK (((kind <> 'form'::text) OR (form_id IS NOT NULL))),
    CONSTRAINT routing_sources_check1 CHECK (((NOT enabled) OR (outcome <> 'assign_and_calendar'::text) OR (meeting_type_id IS NOT NULL))),
    CONSTRAINT routing_sources_completion_check CHECK ((jsonb_typeof(completion) = 'object'::text)),
    CONSTRAINT routing_sources_draft_check CHECK (((draft IS NULL) OR (jsonb_typeof(draft) = 'object'::text))),
    CONSTRAINT routing_sources_kind_check CHECK ((kind = ANY (ARRAY['form'::text, 'handoff'::text]))),
    CONSTRAINT routing_sources_mappings_check CHECK ((jsonb_typeof(mappings) = 'array'::text)),
    CONSTRAINT routing_sources_no_slots_check CHECK ((jsonb_typeof(no_slots) = 'object'::text)),
    CONSTRAINT routing_sources_outcome_check CHECK ((outcome = ANY (ARRAY['assign_only'::text, 'assign_and_calendar'::text]))),
    CONSTRAINT routing_sources_when_off_check CHECK ((when_off = ANY (ARRAY['none'::text, 'review'::text])))
);

ALTER TABLE public.routing_sources OWNER TO postgres;

ALTER TABLE ONLY public.routing_sources
    ADD CONSTRAINT routing_sources_pkey PRIMARY KEY (id);

-- routing_team_keys -----------------------------------------------------
CREATE TABLE public.routing_team_keys (
    workspace_id uuid NOT NULL,
    key text NOT NULL,
    team_id uuid NOT NULL,
    CONSTRAINT routing_team_keys_key_check CHECK ((key ~ '^[A-Za-z0-9_-]{1,40}$'::text))
);

ALTER TABLE public.routing_team_keys OWNER TO postgres;

ALTER TABLE ONLY public.routing_team_keys
    ADD CONSTRAINT routing_team_keys_pkey PRIMARY KEY (workspace_id, key);

-- routing_team_members --------------------------------------------------
CREATE TABLE public.routing_team_members (
    team_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    "position" integer NOT NULL,
    weight integer DEFAULT 1 NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routing_team_members_position_check CHECK (("position" >= 0)),
    CONSTRAINT routing_team_members_weight_check CHECK (((weight >= 1) AND (weight <= 10)))
);

ALTER TABLE public.routing_team_members OWNER TO postgres;

ALTER TABLE ONLY public.routing_team_members
    ADD CONSTRAINT routing_team_members_pkey PRIMARY KEY (team_id, user_id);

ALTER TABLE ONLY public.routing_team_members
    ADD CONSTRAINT routing_team_members_team_id_position_key UNIQUE (team_id, "position");

-- routing_teams ---------------------------------------------------------
CREATE TABLE public.routing_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    method text DEFAULT 'rr'::text NOT NULL,
    strict boolean DEFAULT false NOT NULL,
    hours_only boolean DEFAULT false NOT NULL,
    next_position integer DEFAULT 0 NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routing_teams_method_check CHECK ((method = ANY (ARRAY['rr'::text, 'weighted'::text, 'load'::text]))),
    CONSTRAINT routing_teams_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80))),
    CONSTRAINT routing_teams_next_position_check CHECK ((next_position >= 0))
);

ALTER TABLE public.routing_teams OWNER TO postgres;

ALTER TABLE ONLY public.routing_teams
    ADD CONSTRAINT routing_teams_pkey PRIMARY KEY (id);

-- routing_test_evidence -------------------------------------------------
CREATE TABLE public.routing_test_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    policy_id uuid NOT NULL,
    fingerprint text NOT NULL,
    draft_revision integer,
    tested text NOT NULL,
    version integer,
    source_id uuid,
    dependencies jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    by_user uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routing_test_evidence_dependencies_check CHECK ((jsonb_typeof(dependencies) = 'object'::text)),
    CONSTRAINT routing_test_evidence_fingerprint_check CHECK (((length(fingerprint) >= 8) AND (length(fingerprint) <= 64))),
    CONSTRAINT routing_test_evidence_result_check CHECK ((jsonb_typeof(result) = 'object'::text)),
    CONSTRAINT routing_test_evidence_tested_check CHECK ((tested = ANY (ARRAY['draft'::text, 'live'::text])))
);

ALTER TABLE public.routing_test_evidence OWNER TO postgres;

ALTER TABLE ONLY public.routing_test_evidence
    ADD CONSTRAINT routing_test_evidence_pkey PRIMARY KEY (id);

-- run_steps -------------------------------------------------------------
CREATE TABLE public.run_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    "position" integer NOT NULL,
    step_id text,
    kind text NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    retried boolean DEFAULT false NOT NULL,
    started_ms integer,
    duration_ms integer,
    error text,
    screenshot_path text,
    intent text,
    written boolean DEFAULT false NOT NULL,
    code text,
    healed boolean DEFAULT false NOT NULL,
    CONSTRAINT run_steps_kind_check CHECK ((kind = ANY (ARRAY['do'::text, 'check'::text, 'use'::text]))),
    CONSTRAINT run_steps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'passed'::text, 'failed'::text, 'skipped'::text])))
);

ALTER TABLE public.run_steps OWNER TO postgres;

ALTER TABLE ONLY public.run_steps
    ADD CONSTRAINT run_steps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.run_steps
    ADD CONSTRAINT run_steps_run_id_position_key UNIQUE (run_id, "position");

-- runs ------------------------------------------------------------------
CREATE TABLE public.runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    test_id uuid,
    test_name text NOT NULL,
    test_version integer NOT NULL,
    environment_id uuid,
    environment_name text NOT NULL,
    base_url text NOT NULL,
    lock text NOT NULL,
    trigger text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    duration_ms integer,
    video_path text,
    trace_paths text[] DEFAULT '{}'::text[] NOT NULL,
    console_path text,
    locked_by text,
    locked_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    live_path text,
    ai_calls integer DEFAULT 0 NOT NULL,
    ai_input_tokens integer DEFAULT 0 NOT NULL,
    ai_output_tokens integer DEFAULT 0 NOT NULL,
    lock_saved boolean DEFAULT false NOT NULL,
    network_path text,
    verdict text,
    verdict_reason text,
    retry_of uuid,
    retried_as uuid,
    schedule_id uuid,
    api_key_id uuid,
    CONSTRAINT runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'passed'::text, 'failed'::text, 'error'::text, 'canceled'::text]))),
    CONSTRAINT runs_trigger_check CHECK ((trigger = ANY (ARRAY['manual'::text, 'schedule'::text, 'ci'::text, 'api'::text, 'mcp'::text, 'retry'::text]))),
    CONSTRAINT runs_verdict_check CHECK ((verdict = ANY (ARRAY['app_bug'::text, 'flaky'::text, 'setup'::text])))
);

ALTER TABLE public.runs OWNER TO postgres;

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);

-- salts -----------------------------------------------------------------
CREATE TABLE public.salts (
    day date NOT NULL,
    salt bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.salts OWNER TO postgres;

ALTER TABLE ONLY public.salts
    ADD CONSTRAINT salts_pkey PRIMARY KEY (day);

-- saved_views -----------------------------------------------------------
CREATE TABLE public.saved_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    screen text NOT NULL,
    name text NOT NULL,
    filters jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    columns jsonb,
    sort jsonb,
    layout text DEFAULT 'table'::text NOT NULL,
    group_by text,
    owner_id uuid,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT saved_views_columns_check CHECK (((columns IS NULL) OR ((jsonb_typeof(columns) = 'array'::text) AND (jsonb_array_length(columns) <= 100)))),
    CONSTRAINT saved_views_filters_check CHECK (((jsonb_typeof(filters) = 'array'::text) AND (jsonb_array_length(filters) <= 20) AND (length((filters)::text) <= 10000))),
    CONSTRAINT saved_views_group_by_check CHECK ((length(group_by) <= 42)),
    CONSTRAINT saved_views_layout_check CHECK ((layout = ANY (ARRAY['table'::text, 'board'::text]))),
    CONSTRAINT saved_views_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80))),
    CONSTRAINT saved_views_screen_check CHECK ((screen ~ '^(contacts|leads|companies|visitors|accounts|object:[a-z][a-z0-9_]{0,39})$'::text)),
    CONSTRAINT saved_views_sort_check CHECK (((sort IS NULL) OR (jsonb_typeof(sort) = 'object'::text)))
);

ALTER TABLE public.saved_views OWNER TO postgres;

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_pkey PRIMARY KEY (id);

-- scheduler_links -------------------------------------------------------
CREATE TABLE public.scheduler_links (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tool text NOT NULL,
    url text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scheduler_links_tool_check CHECK ((tool = ANY (ARRAY['calendly'::text, 'calcom'::text, 'hubspot_meetings'::text, 'savvycal'::text, 'link'::text]))),
    CONSTRAINT scheduler_links_url_check CHECK (((url ~ '^https://[^\s]+$'::text) AND (length(url) <= 500)))
);

ALTER TABLE public.scheduler_links OWNER TO postgres;

ALTER TABLE ONLY public.scheduler_links
    ADD CONSTRAINT scheduler_links_pkey PRIMARY KEY (workspace_id, user_id, tool);

-- schedules -------------------------------------------------------------
CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    name text NOT NULL,
    scope text DEFAULT 'all'::text NOT NULL,
    use_case text,
    test_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    every text NOT NULL,
    at_hour integer DEFAULT 9 NOT NULL,
    at_minute integer DEFAULT 0 NOT NULL,
    weekday integer DEFAULT 1 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    next_run_at timestamp with time zone,
    last_run_at timestamp with time zone,
    last_count integer,
    last_error text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedules_at_hour_check CHECK (((at_hour >= 0) AND (at_hour <= 23))),
    CONSTRAINT schedules_at_minute_check CHECK (((at_minute >= 0) AND (at_minute <= 59))),
    CONSTRAINT schedules_every_check CHECK ((every = ANY (ARRAY['hour'::text, 'day'::text, 'weekday'::text, 'week'::text]))),
    CONSTRAINT schedules_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80))),
    CONSTRAINT schedules_scope_check CHECK ((scope = ANY (ARRAY['all'::text, 'use_case'::text, 'tests'::text]))),
    CONSTRAINT schedules_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

ALTER TABLE public.schedules OWNER TO postgres;

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);

-- scoring_models --------------------------------------------------------
CREATE TABLE public.scoring_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    draft jsonb,
    draft_base integer,
    revision integer DEFAULT 0 NOT NULL,
    live_version integer,
    built jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scoring_models_name_check CHECK (((length(name) >= 1) AND (length(name) <= 60)))
);

ALTER TABLE public.scoring_models OWNER TO postgres;

ALTER TABLE ONLY public.scoring_models
    ADD CONSTRAINT scoring_models_pkey PRIMARY KEY (id);

-- scoring_versions ------------------------------------------------------
CREATE TABLE public.scoring_versions (
    model_id uuid NOT NULL,
    version integer NOT NULL,
    body jsonb NOT NULL,
    published_by uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.scoring_versions OWNER TO postgres;

ALTER TABLE ONLY public.scoring_versions
    ADD CONSTRAINT scoring_versions_pkey PRIMARY KEY (model_id, version);

-- segment_members -------------------------------------------------------
CREATE TABLE public.segment_members (
    workspace_id uuid NOT NULL,
    segment_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone
);

ALTER TABLE public.segment_members OWNER TO postgres;

ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_pkey PRIMARY KEY (segment_id, contact_id);

-- segments --------------------------------------------------------------
CREATE TABLE public.segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    kind text DEFAULT 'dynamic'::text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    refreshed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_id uuid,
    external_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    error text,
    CONSTRAINT segments_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT segments_external_id_check CHECK ((length(external_id) <= 200)),
    CONSTRAINT segments_kind_check CHECK ((kind = ANY (ARRAY['dynamic'::text, 'static'::text]))),
    CONSTRAINT segments_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120)))
);

ALTER TABLE public.segments OWNER TO postgres;

ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_pkey PRIMARY KEY (id);

-- send_settings ---------------------------------------------------------
CREATE TABLE public.send_settings (
    workspace_id uuid NOT NULL,
    from_name text,
    from_email text,
    reply_to text,
    address text,
    cap_count integer DEFAULT 3 NOT NULL,
    cap_days integer DEFAULT 7 NOT NULL,
    quiet_start integer DEFAULT 21 NOT NULL,
    quiet_end integer DEFAULT 8 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    per_second integer DEFAULT 14 NOT NULL,
    per_day integer DEFAULT 50000 NOT NULL,
    paused boolean DEFAULT false NOT NULL,
    paused_reason text,
    paused_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT send_settings_address_check CHECK ((length(address) <= 300)),
    CONSTRAINT send_settings_cap_count_check CHECK (((cap_count >= 1) AND (cap_count <= 50))),
    CONSTRAINT send_settings_cap_days_check CHECK (((cap_days >= 1) AND (cap_days <= 60))),
    CONSTRAINT send_settings_from_email_check CHECK (((length(from_email) <= 254) AND ((from_email IS NULL) OR (from_email ~ '^[^\s@]+@[^\s@]+$'::text)))),
    CONSTRAINT send_settings_from_name_check CHECK ((length(from_name) <= 80)),
    CONSTRAINT send_settings_paused_reason_check CHECK ((length(paused_reason) <= 300)),
    CONSTRAINT send_settings_per_day_check CHECK (((per_day >= 1) AND (per_day <= 10000000))),
    CONSTRAINT send_settings_per_second_check CHECK (((per_second >= 1) AND (per_second <= 200))),
    CONSTRAINT send_settings_quiet_end_check CHECK (((quiet_end >= 0) AND (quiet_end <= 23))),
    CONSTRAINT send_settings_quiet_start_check CHECK (((quiet_start >= 0) AND (quiet_start <= 23))),
    CONSTRAINT send_settings_reply_to_check CHECK (((length(reply_to) <= 254) AND ((reply_to IS NULL) OR (reply_to ~ '^[^\s@]+@[^\s@]+$'::text)))),
    CONSTRAINT send_settings_timezone_check CHECK ((length(timezone) <= 60))
);

ALTER TABLE public.send_settings OWNER TO postgres;

ALTER TABLE ONLY public.send_settings
    ADD CONSTRAINT send_settings_pkey PRIMARY KEY (workspace_id);

-- sending_domains -------------------------------------------------------
CREATE TABLE public.sending_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    domain text NOT NULL,
    mail_from text NOT NULL,
    tracking_host text NOT NULL,
    dkim_tokens text[] DEFAULT '{}'::text[] NOT NULL,
    records jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    checked_at timestamp with time zone,
    verified_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_id text,
    CONSTRAINT sending_domains_domain_check CHECK (((domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'::text) AND (length(domain) <= 253))),
    CONSTRAINT sending_domains_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT sending_domains_provider_id_check CHECK ((length(provider_id) <= 100)),
    CONSTRAINT sending_domains_records_check CHECK ((jsonb_typeof(records) = 'array'::text)),
    CONSTRAINT sending_domains_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])))
);

ALTER TABLE public.sending_domains OWNER TO postgres;

COMMENT ON COLUMN public.sending_domains.mail_from IS 'The return path Resend sends bounces to: send.<domain>.';

COMMENT ON COLUMN public.sending_domains.dkim_tokens IS 'SES only; no longer written.';

ALTER TABLE ONLY public.sending_domains
    ADD CONSTRAINT sending_domains_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sending_domains
    ADD CONSTRAINT sending_domains_provider_id_key UNIQUE (provider_id);

-- sessions --------------------------------------------------------------
CREATE TABLE public.sessions (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid NOT NULL,
    device_id uuid,
    cookieless_key bytea,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone NOT NULL,
    policy text NOT NULL,
    consent text,
    gpc boolean DEFAULT false NOT NULL,
    country text,
    region text,
    city text,
    device_type text,
    browser text,
    os text,
    landing_path text,
    referrer_host text,
    source text,
    medium text,
    campaign text,
    term text,
    content text,
    ref_class text,
    ip_net cidr,
    ip_kind text,
    person_id uuid,
    person_level text,
    person_source text,
    account_id uuid,
    account_source text,
    network_account_id uuid,
    pageviews integer DEFAULT 0 NOT NULL,
    engaged_s integer DEFAULT 0 NOT NULL,
    internal boolean DEFAULT false NOT NULL,
    is_bot boolean DEFAULT false NOT NULL,
    split_from uuid,
    split_to uuid,
    signaled_at timestamp with time zone,
    CONSTRAINT sessions_account_source_check CHECK ((account_source = ANY (ARRAY['crm'::text, 'email'::text, 'learned_network'::text, 'vendor_network'::text, 'manual'::text]))),
    CONSTRAINT sessions_check CHECK (((device_id IS NOT NULL) OR (cookieless_key IS NOT NULL))),
    CONSTRAINT sessions_consent_check CHECK ((consent = ANY (ARRAY['granted'::text, 'denied'::text, 'unknown'::text]))),
    CONSTRAINT sessions_country_check CHECK ((length(country) = 2)),
    CONSTRAINT sessions_device_type_check CHECK ((device_type = ANY (ARRAY['desktop'::text, 'mobile'::text, 'tablet'::text, 'other'::text]))),
    CONSTRAINT sessions_ip_net_check CHECK (((ip_net IS NULL) OR ((family((ip_net)::inet) = 4) AND (masklen((ip_net)::inet) <= 24)) OR ((family((ip_net)::inet) = 6) AND (masklen((ip_net)::inet) <= 48)))),
    CONSTRAINT sessions_person_level_check CHECK ((person_level = ANY (ARRAY['verified'::text, 'asserted'::text, 'probable'::text]))),
    CONSTRAINT sessions_person_source_check CHECK ((person_source = ANY (ARRAY['live'::text, 'backfill'::text, 'split'::text]))),
    CONSTRAINT sessions_policy_check CHECK ((policy = ANY (ARRAY['strict'::text, 'notice'::text, 'off'::text, 'cookieless'::text]))),
    CONSTRAINT sessions_ref_class_check CHECK ((ref_class = ANY (ARRAY['search'::text, 'ai_assistant'::text, 'review_site'::text, 'social'::text, 'partner'::text, 'email'::text, 'paid'::text, 'direct'::text, 'other'::text])))
);

ALTER TABLE public.sessions OWNER TO postgres;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

-- signal_types ----------------------------------------------------------
CREATE TABLE public.signal_types (
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    weight numeric NOT NULL,
    half_life_days numeric NOT NULL,
    dedupe text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT signal_types_dedupe_check CHECK ((dedupe = ANY (ARRAY['session'::text, 'day'::text, 'week'::text, 'account'::text]))),
    CONSTRAINT signal_types_half_life_days_check CHECK (((half_life_days >= (1)::numeric) AND (half_life_days <= (365)::numeric))),
    CONSTRAINT signal_types_weight_check CHECK (((weight >= (0)::numeric) AND (weight <= (100)::numeric)))
);

ALTER TABLE public.signal_types OWNER TO postgres;

ALTER TABLE ONLY public.signal_types
    ADD CONSTRAINT signal_types_pkey PRIMARY KEY (workspace_id, kind);

-- signals ---------------------------------------------------------------
CREATE TABLE public.signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid NOT NULL,
    person_id uuid,
    kind text NOT NULL,
    weight numeric NOT NULL,
    at timestamp with time zone NOT NULL,
    dedupe_key text NOT NULL,
    evidence jsonb NOT NULL
);

ALTER TABLE public.signals OWNER TO postgres;

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_workspace_id_dedupe_key_key UNIQUE (workspace_id, dedupe_key);

-- site_daily ------------------------------------------------------------
CREATE TABLE public.site_daily (
    site_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    day date NOT NULL,
    path text DEFAULT ''::text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    medium text DEFAULT ''::text NOT NULL,
    campaign text DEFAULT ''::text NOT NULL,
    ref_class text DEFAULT ''::text NOT NULL,
    country text DEFAULT ''::text NOT NULL,
    device_type text DEFAULT ''::text NOT NULL,
    visitors integer DEFAULT 0 NOT NULL,
    sessions integer DEFAULT 0 NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    engaged_s bigint DEFAULT 0 NOT NULL,
    bounces integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.site_daily OWNER TO postgres;

ALTER TABLE ONLY public.site_daily
    ADD CONSTRAINT site_daily_pkey PRIMARY KEY (site_id, day, path, source, medium, campaign, ref_class, country, device_type);

-- site_rolled -----------------------------------------------------------
CREATE TABLE public.site_rolled (
    workspace_id uuid NOT NULL,
    day date NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.site_rolled OWNER TO postgres;

ALTER TABLE ONLY public.site_rolled
    ADD CONSTRAINT site_rolled_pkey PRIMARY KEY (workspace_id, day);

-- sites -----------------------------------------------------------------
CREATE TABLE public.sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    domain text NOT NULL,
    extra_domains text[] DEFAULT '{}'::text[] NOT NULL,
    site_key text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    proxy_secret text DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text) NOT NULL,
    install_mode text,
    policy_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    private_paths text[] DEFAULT '{}'::text[] NOT NULL,
    url_param_allow text[] DEFAULT '{utm_source,utm_medium,utm_campaign,utm_term,utm_content,gclid,fbclid,ref,page,q}'::text[] NOT NULL,
    city_level boolean DEFAULT true NOT NULL,
    honor_dnt boolean DEFAULT false NOT NULL,
    event_retention_days integer DEFAULT 90 NOT NULL,
    paused boolean DEFAULT false NOT NULL,
    last_event_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sites_domain_check CHECK ((domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'::text)),
    CONSTRAINT sites_event_retention_days_check CHECK (((event_retention_days >= 30) AND (event_retention_days <= 180))),
    CONSTRAINT sites_extra_domains_check CHECK ((cardinality(extra_domains) <= 20)),
    CONSTRAINT sites_install_mode_check CHECK ((install_mode = ANY (ARRAY['proxy'::text, 'a_record'::text, 'cname'::text, 'direct'::text]))),
    CONSTRAINT sites_private_paths_check CHECK ((cardinality(private_paths) <= 100))
);

ALTER TABLE public.sites OWNER TO postgres;

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_site_key_key UNIQUE (site_key);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_workspace_id_domain_key UNIQUE (workspace_id, domain);

-- slack_installs --------------------------------------------------------
CREATE TABLE public.slack_installs (
    workspace_id uuid NOT NULL,
    team_id text NOT NULL,
    team_name text,
    bot_user_id text,
    sealed text NOT NULL,
    installed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slack_installs_bot_user_id_check CHECK ((length(bot_user_id) <= 40)),
    CONSTRAINT slack_installs_team_id_check CHECK ((length(team_id) <= 40)),
    CONSTRAINT slack_installs_team_name_check CHECK ((length(team_name) <= 200))
);

ALTER TABLE public.slack_installs OWNER TO postgres;

ALTER TABLE ONLY public.slack_installs
    ADD CONSTRAINT slack_installs_pkey PRIMARY KEY (workspace_id);

ALTER TABLE ONLY public.slack_installs
    ADD CONSTRAINT slack_installs_team_id_key UNIQUE (team_id);

-- source_event_keys -----------------------------------------------------
CREATE TABLE public.source_event_keys (
    source_id uuid NOT NULL,
    key text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_event_keys_key_check CHECK ((length(key) <= 300))
);

ALTER TABLE public.source_event_keys OWNER TO postgres;

ALTER TABLE ONLY public.source_event_keys
    ADD CONSTRAINT source_event_keys_pkey PRIMARY KEY (source_id, key);

-- source_kinds ----------------------------------------------------------
CREATE TABLE public.source_kinds (
    kind text NOT NULL,
    class text NOT NULL,
    CONSTRAINT source_kinds_class_check CHECK ((class = ANY (ARRAY['manual'::text, 'crm'::text, 'form'::text, 'product'::text, 'import'::text, 'vendor'::text, 'ai'::text]))),
    CONSTRAINT source_kinds_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_]{1,40}$'::text))
);

ALTER TABLE public.source_kinds OWNER TO postgres;

ALTER TABLE ONLY public.source_kinds
    ADD CONSTRAINT source_kinds_pkey PRIMARY KEY (kind);

-- source_links ----------------------------------------------------------
CREATE TABLE public.source_links (
    workspace_id uuid NOT NULL,
    source_id uuid NOT NULL,
    object text NOT NULL,
    external_id text NOT NULL,
    local_id uuid NOT NULL,
    last_values jsonb,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_links_external_id_check CHECK (((length(external_id) >= 1) AND (length(external_id) <= 200))),
    CONSTRAINT source_links_object_check CHECK ((object = ANY (ARRAY['contact'::text, 'company'::text, 'list'::text, 'record'::text])))
);

ALTER TABLE public.source_links OWNER TO postgres;

ALTER TABLE ONLY public.source_links
    ADD CONSTRAINT source_links_pkey PRIMARY KEY (source_id, object, external_id);

-- source_runs -----------------------------------------------------------
CREATE TABLE public.source_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    source_id uuid NOT NULL,
    object text NOT NULL,
    direction text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    pulled integer DEFAULT 0 NOT NULL,
    written integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    errors integer DEFAULT 0 NOT NULL,
    error text,
    CONSTRAINT source_runs_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT source_runs_error_check CHECK ((length(error) <= 1000)),
    CONSTRAINT source_runs_object_check CHECK ((length(object) <= 40))
);

ALTER TABLE public.source_runs OWNER TO postgres;

ALTER TABLE ONLY public.source_runs
    ADD CONSTRAINT source_runs_pkey PRIMARY KEY (id);

-- source_secrets --------------------------------------------------------
CREATE TABLE public.source_secrets (
    source_id uuid NOT NULL,
    sealed text NOT NULL,
    hook_sealed text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.source_secrets OWNER TO postgres;

ALTER TABLE ONLY public.source_secrets
    ADD CONSTRAINT source_secrets_pkey PRIMARY KEY (source_id);

-- sources ---------------------------------------------------------------
CREATE TABLE public.sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    account text,
    status text DEFAULT 'active'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    cursors jsonb DEFAULT '{}'::jsonb NOT NULL,
    push_cursor text,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone DEFAULT now() NOT NULL,
    columns jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_error text,
    errors_in_row integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_at timestamp with time zone,
    CONSTRAINT sources_account_check CHECK ((length(account) <= 200)),
    CONSTRAINT sources_columns_check CHECK ((jsonb_typeof(columns) = 'object'::text)),
    CONSTRAINT sources_cursors_check CHECK ((jsonb_typeof(cursors) = 'object'::text)),
    CONSTRAINT sources_kind_check CHECK ((kind ~ '^[a-z][a-z0-9_]{1,40}$'::text)),
    CONSTRAINT sources_last_error_check CHECK ((length(last_error) <= 1000)),
    CONSTRAINT sources_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT sources_settings_check CHECK ((jsonb_typeof(settings) = 'object'::text)),
    CONSTRAINT sources_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'error'::text, 'disconnected'::text])))
);

ALTER TABLE public.sources OWNER TO postgres;

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_workspace_id_kind_key UNIQUE (workspace_id, kind);

-- submission_results ----------------------------------------------------
CREATE TABLE public.submission_results (
    submission_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    form_id uuid,
    form_version integer NOT NULL,
    engine integer DEFAULT 1 NOT NULL,
    outcome_id text,
    outcome_title text,
    "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
    constants jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT submission_results_constants_check CHECK (((jsonb_typeof(constants) = 'object'::text) AND (length((constants)::text) <= 16000))),
    CONSTRAINT submission_results_outcome_id_check CHECK ((outcome_id ~ '^[a-z0-9_]{1,24}$'::text)),
    CONSTRAINT submission_results_outcome_title_check CHECK ((length(outcome_title) <= 300)),
    CONSTRAINT submission_results_values_check CHECK (((jsonb_typeof("values") = 'object'::text) AND (length(("values")::text) <= 16000)))
);

ALTER TABLE public.submission_results OWNER TO postgres;

ALTER TABLE ONLY public.submission_results
    ADD CONSTRAINT submission_results_pkey PRIMARY KEY (submission_id);

-- submission_track ------------------------------------------------------
CREATE TABLE public.submission_track (
    submission_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    info jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT submission_track_info_check CHECK (((jsonb_typeof(info) = 'object'::text) AND (length((info)::text) <= 4000)))
);

ALTER TABLE public.submission_track OWNER TO postgres;

ALTER TABLE ONLY public.submission_track
    ADD CONSTRAINT submission_track_pkey PRIMARY KEY (submission_id);

-- submissions -----------------------------------------------------------
CREATE TABLE public.submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    form_id uuid,
    form_version integer NOT NULL,
    contact_id uuid,
    idem_key text NOT NULL,
    "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
    hidden jsonb DEFAULT '{}'::jsonb NOT NULL,
    consent jsonb DEFAULT '{}'::jsonb NOT NULL,
    country text,
    spam boolean DEFAULT false NOT NULL,
    spam_reason text,
    test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_shown_at timestamp with time zone,
    booking_type_id uuid,
    not_booked_at timestamp with time zone,
    search tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, regexp_replace(lower((("left"(("values")::text, 20000) || ' '::text) || "left"((hidden)::text, 4000))), '[^[:alnum:]]+'::text, ' '::text, 'g'::text))) STORED,
    over_cap boolean DEFAULT false NOT NULL,
    payment jsonb,
    CONSTRAINT submissions_consent_check CHECK ((jsonb_typeof(consent) = 'object'::text)),
    CONSTRAINT submissions_country_check CHECK ((country ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT submissions_hidden_check CHECK (((jsonb_typeof(hidden) = 'object'::text) AND (length((hidden)::text) <= 8000))),
    CONSTRAINT submissions_idem_key_check CHECK ((idem_key ~ '^[A-Za-z0-9_-]{16,64}$'::text)),
    CONSTRAINT submissions_payment_check CHECK (((payment IS NULL) OR (jsonb_typeof(payment) = 'object'::text))),
    CONSTRAINT submissions_spam_reason_check CHECK ((length(spam_reason) <= 60)),
    CONSTRAINT submissions_values_check CHECK (((jsonb_typeof("values") = 'object'::text) AND (length(("values")::text) <= 32768)))
);

ALTER TABLE public.submissions OWNER TO postgres;

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);

-- subscriptions ---------------------------------------------------------
CREATE TABLE public.subscriptions (
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    status text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['subscribed'::text, 'unsubscribed'::text])))
);

ALTER TABLE public.subscriptions OWNER TO postgres;

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (contact_id, topic_id);

-- suite_connections -----------------------------------------------------
CREATE TABLE public.suite_connections (
    workspace_id uuid NOT NULL,
    product text NOT NULL,
    base_url text NOT NULL,
    key_sealed text NOT NULL,
    key_hint text,
    brand text,
    status text DEFAULT 'error'::text NOT NULL,
    error text,
    checked_at timestamp with time zone,
    connected_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suite_connections_base_url_check CHECK ((base_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'::text)),
    CONSTRAINT suite_connections_brand_check CHECK ((length(brand) <= 200)),
    CONSTRAINT suite_connections_key_sealed_check CHECK ((key_sealed ~~ 'v1:%'::text)),
    CONSTRAINT suite_connections_product_check CHECK ((product = ANY (ARRAY['omniscient'::text, 'arrowsterr'::text]))),
    CONSTRAINT suite_connections_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text])))
);

ALTER TABLE public.suite_connections OWNER TO postgres;

ALTER TABLE ONLY public.suite_connections
    ADD CONSTRAINT suite_connections_pkey PRIMARY KEY (workspace_id, product);

-- suppressions ----------------------------------------------------------
CREATE TABLE public.suppressions (
    workspace_id uuid NOT NULL,
    email_clean text NOT NULL,
    reason text NOT NULL,
    source text NOT NULL,
    import_id uuid,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suppressions_email_clean_check CHECK ((length(email_clean) <= 254)),
    CONSTRAINT suppressions_reason_check CHECK ((reason = ANY (ARRAY['unsubscribed'::text, 'bounced'::text, 'complained'::text, 'cleaned'::text, 'manual'::text]))),
    CONSTRAINT suppressions_source_check CHECK ((length(source) <= 40))
);

ALTER TABLE public.suppressions OWNER TO postgres;

ALTER TABLE ONLY public.suppressions
    ADD CONSTRAINT suppressions_pkey PRIMARY KEY (workspace_id, email_clean);

-- sync_log --------------------------------------------------------------
CREATE TABLE public.sync_log (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    source_id uuid NOT NULL,
    direction text NOT NULL,
    object text NOT NULL,
    local_id uuid,
    external_id text,
    action text NOT NULL,
    fields text[] DEFAULT '{}'::text[] NOT NULL,
    error text,
    retried_at timestamp with time zone,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sync_log_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'suppress'::text, 'error'::text]))),
    CONSTRAINT sync_log_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT sync_log_error_check CHECK ((length(error) <= 1000)),
    CONSTRAINT sync_log_external_id_check CHECK ((length(external_id) <= 200)),
    CONSTRAINT sync_log_object_check CHECK ((length(object) <= 40))
);

ALTER TABLE public.sync_log OWNER TO postgres;

ALTER TABLE public.sync_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sync_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.sync_log
    ADD CONSTRAINT sync_log_pkey PRIMARY KEY (id);

-- tasks -----------------------------------------------------------------
CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    object text NOT NULL,
    record_id uuid NOT NULL,
    title text NOT NULL,
    due date,
    assignee uuid,
    done boolean DEFAULT false NOT NULL,
    done_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idem_key text,
    dedupe_key text,
    CONSTRAINT tasks_dedupe_key_check CHECK ((length(dedupe_key) <= 200)),
    CONSTRAINT tasks_idem_key_check CHECK ((length(idem_key) <= 200)),
    CONSTRAINT tasks_object_check CHECK ((object ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT tasks_title_check CHECK (((length(title) >= 1) AND (length(title) <= 300)))
);

ALTER TABLE public.tasks OWNER TO postgres;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

-- test_proposals --------------------------------------------------------
CREATE TABLE public.test_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    plan_id uuid,
    name text NOT NULL,
    use_case text DEFAULT 'General'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    steps jsonb NOT NULL,
    reason text,
    pages text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    test_id uuid,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    CONSTRAINT test_proposals_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT test_proposals_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT test_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'dismissed'::text]))),
    CONSTRAINT test_proposals_use_case_check CHECK (((length(use_case) >= 1) AND (length(use_case) <= 60)))
);

ALTER TABLE public.test_proposals OWNER TO postgres;

ALTER TABLE ONLY public.test_proposals
    ADD CONSTRAINT test_proposals_pkey PRIMARY KEY (id);

-- test_versions ---------------------------------------------------------
CREATE TABLE public.test_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    version integer NOT NULL,
    name text NOT NULL,
    use_case text NOT NULL,
    priority text NOT NULL,
    steps jsonb NOT NULL,
    lock text,
    author_id uuid,
    author_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.test_versions OWNER TO postgres;

ALTER TABLE ONLY public.test_versions
    ADD CONSTRAINT test_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.test_versions
    ADD CONSTRAINT test_versions_test_id_version_key UNIQUE (test_id, version);

-- tests -----------------------------------------------------------------
CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    use_case text DEFAULT 'General'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    lock text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tests_lock_check CHECK ((length(lock) <= 200000)),
    CONSTRAINT tests_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT tests_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT tests_steps_check CHECK (public.valid_steps(steps, true)),
    CONSTRAINT tests_use_case_check CHECK (((length(use_case) >= 1) AND (length(use_case) <= 60)))
);

ALTER TABLE public.tests OWNER TO postgres;

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);

-- text_messages ---------------------------------------------------------
CREATE TABLE public.text_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid,
    run_id uuid,
    step_id text,
    channel text NOT NULL,
    to_phone text NOT NULL,
    body text,
    template text,
    vars jsonb DEFAULT '{}'::jsonb NOT NULL,
    meeting_id uuid,
    meeting_start timestamp with time zone,
    fallback jsonb,
    dedupe text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    sid text,
    from_number text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT text_messages_body_check CHECK ((length(body) <= 1600)),
    CONSTRAINT text_messages_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text]))),
    CONSTRAINT text_messages_dedupe_check CHECK ((length(dedupe) <= 200)),
    CONSTRAINT text_messages_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT text_messages_fallback_check CHECK (((fallback IS NULL) OR ((jsonb_typeof(fallback) = 'object'::text) AND (length((fallback)::text) <= 4000)))),
    CONSTRAINT text_messages_from_number_check CHECK ((length(from_number) <= 64)),
    CONSTRAINT text_messages_sid_check CHECK ((length(sid) <= 64)),
    CONSTRAINT text_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text, 'unknown'::text, 'emailed'::text]))),
    CONSTRAINT text_messages_step_id_check CHECK ((length(step_id) <= 80)),
    CONSTRAINT text_messages_template_check CHECK ((template ~ '^HX[0-9a-f]{32}$'::text)),
    CONSTRAINT text_messages_to_phone_check CHECK ((to_phone ~ '^\+[1-9][0-9]{6,14}$'::text)),
    CONSTRAINT text_messages_vars_check CHECK (((jsonb_typeof(vars) = 'object'::text) AND (length((vars)::text) <= 4000)))
);

ALTER TABLE public.text_messages OWNER TO postgres;

ALTER TABLE ONLY public.text_messages
    ADD CONSTRAINT text_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.text_messages
    ADD CONSTRAINT text_messages_workspace_id_dedupe_key UNIQUE (workspace_id, dedupe);

-- text_optouts ----------------------------------------------------------
CREATE TABLE public.text_optouts (
    sender text NOT NULL,
    phone text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT text_optouts_phone_check CHECK ((phone ~ '^\+[1-9][0-9]{6,14}$'::text)),
    CONSTRAINT text_optouts_sender_check CHECK ((length(sender) <= 64))
);

ALTER TABLE public.text_optouts OWNER TO postgres;

ALTER TABLE ONLY public.text_optouts
    ADD CONSTRAINT text_optouts_pkey PRIMARY KEY (sender, phone);

-- topics ----------------------------------------------------------------
CREATE TABLE public.topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    default_on boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT topics_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80)))
);

ALTER TABLE public.topics OWNER TO postgres;

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);

-- tunnels ---------------------------------------------------------------
CREATE TABLE public.tunnels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    api_key_id uuid,
    ports integer[] DEFAULT '{}'::integer[] NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    disconnected_at timestamp with time zone
);

ALTER TABLE public.tunnels OWNER TO postgres;

ALTER TABLE ONLY public.tunnels
    ADD CONSTRAINT tunnels_pkey PRIMARY KEY (id);

-- webhook_deliveries ----------------------------------------------------
CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    endpoint_id uuid NOT NULL,
    event text NOT NULL,
    event_id bigint,
    meeting_id uuid,
    body jsonb NOT NULL,
    frozen boolean DEFAULT false NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    code integer,
    error text,
    test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    submission_id uuid,
    ref text,
    CONSTRAINT webhook_deliveries_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT webhook_deliveries_event_check CHECK ((length(event) <= 40)),
    CONSTRAINT webhook_deliveries_ref_check CHECK ((length(ref) <= 80)),
    CONSTRAINT webhook_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'retrying'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.webhook_deliveries OWNER TO postgres;

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_endpoint_id_event_id_key UNIQUE (endpoint_id, event_id);

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);

-- webhook_endpoints -----------------------------------------------------
CREATE TABLE public.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    host text NOT NULL,
    sealed text NOT NULL,
    secret_hint text NOT NULL,
    events text[] NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    last_ok_at timestamp with time zone,
    last_fail_at timestamp with time zone,
    last_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    via text DEFAULT 'app'::text NOT NULL,
    forms uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    api_key_id uuid,
    failing_since timestamp with time zone,
    CONSTRAINT webhook_endpoints_description_check CHECK ((length(description) <= 120)),
    CONSTRAINT webhook_endpoints_events_check CHECK (((cardinality(events) >= 1) AND (events <@ ARRAY['meeting.booked'::text, 'meeting.rescheduled'::text, 'meeting.canceled'::text, 'meeting.held'::text, 'meeting.no_show'::text, 'form.submitted'::text, 'lead.routed'::text]))),
    CONSTRAINT webhook_endpoints_forms_check CHECK ((cardinality(forms) <= 50)),
    CONSTRAINT webhook_endpoints_host_check CHECK (((length(host) >= 1) AND (length(host) <= 255))),
    CONSTRAINT webhook_endpoints_last_error_check CHECK ((length(last_error) <= 500)),
    CONSTRAINT webhook_endpoints_sealed_check CHECK ((length(sealed) <= 4000)),
    CONSTRAINT webhook_endpoints_secret_hint_check CHECK ((length(secret_hint) <= 8)),
    CONSTRAINT webhook_endpoints_via_check CHECK ((via = ANY (ARRAY['app'::text, 'zapier'::text, 'make'::text, 'activepieces'::text, 'api'::text])))
);

ALTER TABLE public.webhook_endpoints OWNER TO postgres;

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);

-- workflow_emails -------------------------------------------------------
CREATE TABLE public.workflow_emails (
    workflow_id uuid NOT NULL,
    version integer NOT NULL,
    step_id text NOT NULL,
    email_id uuid NOT NULL
);

ALTER TABLE public.workflow_emails OWNER TO postgres;

ALTER TABLE ONLY public.workflow_emails
    ADD CONSTRAINT workflow_emails_pkey PRIMARY KEY (workflow_id, version, step_id);

-- workflow_folders ------------------------------------------------------
CREATE TABLE public.workflow_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_folders_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60)))
);

ALTER TABLE public.workflow_folders OWNER TO postgres;

ALTER TABLE ONLY public.workflow_folders
    ADD CONSTRAINT workflow_folders_pkey PRIMARY KEY (id);

-- workflow_marks --------------------------------------------------------
CREATE TABLE public.workflow_marks (
    workflow_id uuid NOT NULL,
    scanned_to timestamp with time zone,
    fired_version integer,
    date_ran_on date
);

ALTER TABLE public.workflow_marks OWNER TO postgres;

ALTER TABLE ONLY public.workflow_marks
    ADD CONSTRAINT workflow_marks_pkey PRIMARY KEY (workflow_id);

-- workflow_runs ---------------------------------------------------------
CREATE TABLE public.workflow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    version integer NOT NULL,
    contact_id uuid,
    key text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    at_step text,
    next_at timestamp with time zone DEFAULT now() NOT NULL,
    wait jsonb,
    exit_reason text,
    error text,
    claimed_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT workflow_runs_error_check CHECK ((length(error) <= 500)),
    CONSTRAINT workflow_runs_exit_reason_check CHECK ((length(exit_reason) <= 60)),
    CONSTRAINT workflow_runs_key_check CHECK ((length(key) <= 200)),
    CONSTRAINT workflow_runs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'waiting'::text, 'done'::text, 'exited'::text, 'failed'::text])))
);

ALTER TABLE public.workflow_runs OWNER TO postgres;

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workflow_id_key_key UNIQUE (workflow_id, key);

-- workflow_steps_done ---------------------------------------------------
CREATE TABLE public.workflow_steps_done (
    run_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    step_id text NOT NULL,
    visit integer DEFAULT 1 NOT NULL,
    status text NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_steps_done_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'skipped'::text, 'failed'::text, 'unknown'::text])))
);

ALTER TABLE public.workflow_steps_done OWNER TO postgres;

ALTER TABLE ONLY public.workflow_steps_done
    ADD CONSTRAINT workflow_steps_done_pkey PRIMARY KEY (run_id, step_id, visit);

-- workflow_versions -----------------------------------------------------
CREATE TABLE public.workflow_versions (
    workflow_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    version integer NOT NULL,
    body jsonb NOT NULL,
    note text,
    published_by uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_versions_body_check CHECK ((jsonb_typeof(body) = 'object'::text)),
    CONSTRAINT workflow_versions_note_check CHECK ((length(note) <= 300))
);

ALTER TABLE public.workflow_versions OWNER TO postgres;

ALTER TABLE ONLY public.workflow_versions
    ADD CONSTRAINT workflow_versions_pkey PRIMARY KEY (workflow_id, version);

-- workflow_watch --------------------------------------------------------
CREATE TABLE public.workflow_watch (
    workspace_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    key text NOT NULL,
    CONSTRAINT workflow_watch_key_check CHECK ((length(key) <= 80))
);

ALTER TABLE public.workflow_watch OWNER TO postgres;

ALTER TABLE ONLY public.workflow_watch
    ADD CONSTRAINT workflow_watch_pkey PRIMARY KEY (workflow_id, key);

-- workflows -------------------------------------------------------------
CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    draft jsonb DEFAULT '{}'::jsonb NOT NULL,
    draft_revision integer DEFAULT 0 NOT NULL,
    live_version integer,
    trigger_kind text,
    live_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stage text,
    journey text,
    folder_id uuid,
    CONSTRAINT workflows_draft_check CHECK (((jsonb_typeof(draft) = 'object'::text) AND (length((draft)::text) <= 400000))),
    CONSTRAINT workflows_journey_check CHECK ((length(journey) <= 40)),
    CONSTRAINT workflows_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT workflows_stage_check CHECK ((stage = ANY (ARRAY['trial'::text, 'pipeline'::text, 'customer'::text]))),
    CONSTRAINT workflows_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'paused'::text])))
);

ALTER TABLE public.workflows OWNER TO postgres;

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);

-- workspace_billing -----------------------------------------------------
CREATE TABLE public.workspace_billing (
    workspace_id uuid NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    status text,
    stripe_customer_id text,
    stripe_subscription_id text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_interval text DEFAULT 'month'::text NOT NULL,
    hosts integer DEFAULT 1 NOT NULL,
    CONSTRAINT workspace_billing_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text]))),
    CONSTRAINT workspace_billing_hosts_check CHECK (((hosts >= 1) AND (hosts <= 10000))),
    CONSTRAINT workspace_billing_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'starter'::text, 'pro'::text, 'business'::text])))
);

ALTER TABLE public.workspace_billing OWNER TO postgres;

ALTER TABLE ONLY public.workspace_billing
    ADD CONSTRAINT workspace_billing_pkey PRIMARY KEY (workspace_id);

ALTER TABLE ONLY public.workspace_billing
    ADD CONSTRAINT workspace_billing_stripe_customer_id_key UNIQUE (stripe_customer_id);

-- workspace_members -----------------------------------------------------
CREATE TABLE public.workspace_members (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text])))
);

ALTER TABLE public.workspace_members OWNER TO postgres;

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id);

-- workspaces ------------------------------------------------------------
CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    first_pass_at timestamp with time zone,
    features text[] DEFAULT '{marketing}'::text[] NOT NULL,
    booking_slug text,
    booking_page jsonb DEFAULT '{}'::jsonb NOT NULL,
    brand_kit_id uuid,
    workflow_defaults_at timestamp with time zone,
    named boolean DEFAULT true NOT NULL,
    CONSTRAINT workspaces_booking_page_check CHECK (((jsonb_typeof(booking_page) = 'object'::text) AND (length((booking_page)::text) <= 8000))),
    CONSTRAINT workspaces_booking_slug_check CHECK ((booking_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'::text)),
    CONSTRAINT workspaces_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80)))
);

ALTER TABLE public.workspaces OWNER TO postgres;

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_booking_slug_key UNIQUE (booking_slug);

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);
