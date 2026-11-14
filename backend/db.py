"""Database operations: connection, init, and curriculum save."""

import json
import re
import time
import psycopg2
import psycopg2.pool
from config import DATABASE_URL

# ── Connection Pool ──────────────────────────────────────────────────────────
# Lazy-init: pool is created on first get_db() call after init_db() succeeds.
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _ensure_pool():
    """Create the connection pool if it doesn't exist yet."""
    global _pool
    if _pool is None:
        try:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1, maxconn=10, dsn=DATABASE_URL
            )
        except Exception as e:
            print(f"Failed to create connection pool: {e}")


class PooledConnection:
    """Wrapper around a psycopg2 connection that returns it to the pool on close().

    Backward-compatible: works with both patterns:
        # Old pattern (still works — close() returns to pool instead of destroying)
        conn = get_db()
        ...
        conn.close()

        # New pattern (preferred)
        with get_db() as conn:
            ...
    """

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool

    # ── Proxy all connection methods ──────────────────────────────────────
    def cursor(self, *args, **kwargs):
        return self._conn.cursor(*args, **kwargs)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    @property
    def autocommit(self):
        return self._conn.autocommit

    @autocommit.setter
    def autocommit(self, value):
        self._conn.autocommit = value

    def close(self):
        """Return connection to the pool instead of closing it."""
        if self._conn and self._pool:
            try:
                self._pool.putconn(self._conn)
            except Exception:
                pass
            self._conn = None

    # ── Context manager support ───────────────────────────────────────────
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    # ── Make truthiness checks work (if not conn: ...) ────────────────────
    def __bool__(self):
        return self._conn is not None


def get_db():
    """Return a pooled DB connection (backward-compatible).

    The returned PooledConnection wraps a real psycopg2 connection and
    returns it to the pool when close() is called.

    Returns None if the pool cannot be created or is exhausted.
    """
    _ensure_pool()
    if _pool is None:
        return None
    try:
        conn = _pool.getconn()
        return PooledConnection(conn, _pool)
    except Exception as e:
        print(f"DB pool connection error: {e}")
        return None


def get_db_raw():
    """Non-pooled connection for init_db() bootstrap (before pool exists)."""
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"DB connection error: {e}")
        return None


def normalize_semester(raw: str) -> str:
    """'fall 2025' → 'Fall 2025'. Ensures consistent casing."""
    parts = raw.strip().split()
    if len(parts) == 2:
        return f"{parts[0].capitalize()} {parts[1]}"
    return raw.strip().title()


def init_db():
    for attempt in range(10):
        conn = get_db_raw()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS curricula (
                        id SERIAL PRIMARY KEY,
                        created_at TIMESTAMP DEFAULT NOW(),
                        topic TEXT NOT NULL,
                        level TEXT,
                        audience TEXT,
                        course_code TEXT,
                        course_type TEXT,
                        module_count INTEGER,
                        modules JSONB,
                        sources JSONB,
                        is_favorite BOOLEAN DEFAULT FALSE
                    )
                """)
                cur.execute("""
                    ALTER TABLE curricula ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS xapi_statements (
                        id SERIAL PRIMARY KEY,
                        actor_email TEXT NOT NULL,
                        actor_name TEXT NOT NULL,
                        verb TEXT NOT NULL,
                        object_id TEXT NOT NULL,
                        object_name TEXT NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        curriculum_topic TEXT,
                        course_id INTEGER
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS student_feedback (
                        id SERIAL PRIMARY KEY,
                        course_id INTEGER NOT NULL,
                        module_index INTEGER NOT NULL,
                        module_title TEXT,
                        sentiment TEXT NOT NULL,
                        comment TEXT DEFAULT '',
                        student_id TEXT DEFAULT 'anonymous',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_feedback_course
                    ON student_feedback(course_id)
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS course_analysis_snapshots (
                        id SERIAL PRIMARY KEY,
                        course_id INTEGER NOT NULL,
                        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        noise_label TEXT DEFAULT 'unknown',
                        risk_distribution JSONB,
                        total_students INTEGER,
                        at_risk_count INTEGER,
                        high_risk_count INTEGER,
                        top_signals JSONB,
                        module_engagement_summary JSONB,
                        verb_distribution JSONB,
                        cohort_groups JSONB,
                        is_favorite BOOLEAN DEFAULT FALSE
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_snapshots_course
                    ON course_analysis_snapshots(course_id, run_at DESC)
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS change_log (
                        id SERIAL PRIMARY KEY,
                        course_id INTEGER NOT NULL,
                        module_id VARCHAR NOT NULL,
                        timestamp TIMESTAMPTZ DEFAULT NOW(),
                        flag_reason TEXT[],
                        recommendation TEXT,
                        agent VARCHAR DEFAULT 'curriculum_agent',
                        status VARCHAR DEFAULT 'pending'
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_changelog_course
                    ON change_log(course_id, timestamp DESC)
                """)
                # Add backup_data column for redo/undo support (idempotent)
                cur.execute("""
                    DO $$ BEGIN
                        ALTER TABLE change_log ADD COLUMN backup_data TEXT;
                    EXCEPTION WHEN duplicate_column THEN NULL;
                    END $$;
                """)
                # Per-item JSON detail for assessment_design suggestions (idempotent)
                cur.execute("""
                    DO $$ BEGIN
                        ALTER TABLE change_log ADD COLUMN detail TEXT;
                    EXCEPTION WHEN duplicate_column THEN NULL;
                    END $$;
                """)
                # Add change_type column to distinguish objective/reference/assignment changes
                cur.execute("""
                    DO $$ BEGIN
                        ALTER TABLE change_log ADD COLUMN change_type VARCHAR DEFAULT 'objective_update';
                    EXCEPTION WHEN duplicate_column THEN NULL;
                    END $$;
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS module_flags (
                        id SERIAL PRIMARY KEY,
                        course_id INTEGER NOT NULL,
                        module_id VARCHAR NOT NULL,
                        flag_level VARCHAR NOT NULL,
                        signals JSONB,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        dismissed BOOLEAN DEFAULT FALSE
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_module_flags_course
                    ON module_flags(course_id, dismissed)
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS cohort_concept_mastery (
                        id SERIAL PRIMARY KEY,
                        course_id INTEGER NOT NULL,
                        semester TEXT NOT NULL DEFAULT '',
                        module_id TEXT NOT NULL,
                        concept_id TEXT NOT NULL,
                        concept_label TEXT,
                        mastery_level TEXT NOT NULL DEFAULT 'not_started',
                        completed_count INTEGER DEFAULT 0,
                        passed_count INTEGER DEFAULT 0,
                        failed_count INTEGER DEFAULT 0,
                        struggled_count INTEGER DEFAULT 0,
                        fb_got_it INTEGER DEFAULT 0,
                        fb_mostly INTEGER DEFAULT 0,
                        fb_confused INTEGER DEFAULT 0,
                        fb_not_read INTEGER DEFAULT 0,
                        valid_from TIMESTAMP DEFAULT now(),
                        valid_to TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT now(),
                        UNIQUE(course_id, semester, module_id, concept_id, valid_from)
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_mastery_course
                    ON cohort_concept_mastery(course_id, semester)
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_xapi_actor
                    ON xapi_statements(actor_email)
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_xapi_verb
                    ON xapi_statements(verb)
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_xapi_object
                    ON xapi_statements(object_id)
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_xapi_topic
                    ON xapi_statements(curriculum_topic)
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_xapi_timestamp
                    ON xapi_statements(timestamp)
                """)
                # ── concept_annotations (for KGContextAnalyst + annotation routes) ──
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS concept_annotations (
                        id SERIAL PRIMARY KEY,
                        course_id INTEGER NOT NULL,
                        concept_id TEXT NOT NULL,
                        student_id TEXT DEFAULT 'anonymous',
                        annotation_type TEXT NOT NULL DEFAULT 'confused',
                        content TEXT DEFAULT '',
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_annotations_course
                    ON concept_annotations(course_id)
                """)
                # ── student_profiles (student-facing profile page) ──────────────
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS student_profiles (
                        id SERIAL PRIMARY KEY,
                        email TEXT UNIQUE NOT NULL,
                        display_name TEXT DEFAULT '',
                        preferred_style TEXT DEFAULT '',
                        persona_sets JSONB DEFAULT '[]',
                        avatar_url TEXT DEFAULT '',
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_student_profiles_email
                    ON student_profiles(email)
                """)
                # Safe migrations for columns added after initial deploy
                cur.execute("ALTER TABLE xapi_statements ADD COLUMN IF NOT EXISTS course_id INTEGER")
                cur.execute("ALTER TABLE xapi_statements ADD COLUMN IF NOT EXISTS response TEXT")
                cur.execute("ALTER TABLE course_analysis_snapshots ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE")
                cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''")
                cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS discipline TEXT DEFAULT 'humanities'")
                cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS custom_prompt TEXT DEFAULT ''")
                cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS model_config JSONB DEFAULT '{}'")

                # ── lti_users (LTI 1.3 launches: matched by issuer + sub, never email) ──
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS lti_users (
                        issuer TEXT NOT NULL,
                        sub TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        role TEXT NOT NULL,
                        display_name TEXT DEFAULT '',
                        contact_email TEXT DEFAULT '',
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        last_launch_at TIMESTAMPTZ DEFAULT NOW(),
                        PRIMARY KEY (issuer, sub)
                    )
                """)

                # ── prompt_templates (professor-editable prompt instructions) ──
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS prompt_templates (
                        id SERIAL PRIMARY KEY,
                        template_key TEXT UNIQUE NOT NULL,
                        custom_instructions TEXT DEFAULT '',
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("ALTER TABLE curricula ADD COLUMN IF NOT EXISTS semester TEXT DEFAULT ''")
                cur.execute("ALTER TABLE concept_annotations ADD COLUMN IF NOT EXISTS student_id TEXT DEFAULT 'anonymous'")

                # ── selfview_snapshots (student-side warm LTM: retrospect cards) ──
                # Stores only what cannot be recomputed from raw xAPI:
                # the pattern statements shown and the student's own verdicts.
                # PRIVACY WALL: never read by any professor-facing route.
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS selfview_snapshots (
                        id SERIAL PRIMARY KEY,
                        email TEXT NOT NULL,
                        course_id INTEGER NOT NULL,
                        period TEXT NOT NULL,
                        rhythm_summary JSONB DEFAULT '{}',
                        footprint_summary JSONB DEFAULT '{}',
                        statements_shown JSONB DEFAULT '[]',
                        verdicts JSONB DEFAULT '[]',
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_selfview_snapshots_lookup
                    ON selfview_snapshots(email, course_id, created_at DESC)
                """)

                # ── Enterprise L&D domain facade ────────────────────────────
                # The shared engine still uses curricula/course_id internally.
                # These tables add organization and cohort boundaries without
                # duplicating the Academic analysis stack.
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS organizations (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL,
                        slug TEXT UNIQUE NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_programs (
                        id SERIAL PRIMARY KEY,
                        organization_id INTEGER NOT NULL REFERENCES organizations(id),
                        engine_course_id INTEGER NOT NULL UNIQUE REFERENCES curricula(id),
                        name TEXT NOT NULL,
                        description TEXT DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_enterprise_programs_org
                    ON enterprise_programs(organization_id, created_at DESC)
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_cohorts (
                        id SERIAL PRIMARY KEY,
                        program_id INTEGER NOT NULL REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        label TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(program_id, label)
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_sources (
                        id SERIAL PRIMARY KEY,
                        program_id INTEGER NOT NULL REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        cohort_id INTEGER REFERENCES enterprise_cohorts(id) ON DELETE SET NULL,
                        filename TEXT NOT NULL,
                        source_kind TEXT NOT NULL,
                        size_bytes BIGINT NOT NULL DEFAULT 0,
                        metadata JSONB NOT NULL DEFAULT '{}',
                        extracted_text TEXT DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_enterprise_sources_program
                    ON enterprise_sources(program_id, created_at DESC)
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_learning_events (
                        id BIGSERIAL PRIMARY KEY,
                        organization_id INTEGER NOT NULL REFERENCES organizations(id),
                        program_id INTEGER NOT NULL REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        cohort_id INTEGER REFERENCES enterprise_cohorts(id) ON DELETE SET NULL,
                        source_id INTEGER REFERENCES enterprise_sources(id) ON DELETE SET NULL,
                        learner_ref TEXT NOT NULL,
                        module_id TEXT NOT NULL,
                        module_title TEXT DEFAULT '',
                        event_type TEXT NOT NULL,
                        completion BOOLEAN NOT NULL DEFAULT FALSE,
                        score NUMERIC,
                        duration_seconds NUMERIC,
                        attempts INTEGER NOT NULL DEFAULT 1,
                        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        raw_payload JSONB NOT NULL DEFAULT '{}',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_enterprise_events_scope
                    ON enterprise_learning_events(organization_id, program_id, cohort_id, module_id)
                """)

                # ── Manager Follow-up Pulse (post-training behaviour evidence) ──
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_followup_config (
                        program_id INTEGER PRIMARY KEY REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        intervals_days JSONB NOT NULL DEFAULT '[30, 90]',
                        program_version TEXT NOT NULL DEFAULT 'v1',
                        anchor_date DATE NOT NULL DEFAULT CURRENT_DATE,
                        min_group_size INTEGER NOT NULL DEFAULT 5,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_followup_managers (
                        id SERIAL PRIMARY KEY,
                        program_id INTEGER NOT NULL REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        cohort_id INTEGER NOT NULL REFERENCES enterprise_cohorts(id) ON DELETE CASCADE,
                        manager_email TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(program_id, cohort_id, manager_email)
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_followup_responses (
                        id SERIAL PRIMARY KEY,
                        manager_id INTEGER NOT NULL REFERENCES enterprise_followup_managers(id) ON DELETE CASCADE,
                        interval_days INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        comment TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(manager_id, interval_days)
                    )
                """)
                # LTM-side aggregate snapshots, keyed by program version so later
                # versions can be compared. Aggregates only: no manager identity.
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_followup_snapshots (
                        id SERIAL PRIMARY KEY,
                        program_id INTEGER NOT NULL REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        cohort_id INTEGER NOT NULL REFERENCES enterprise_cohorts(id) ON DELETE CASCADE,
                        program_version TEXT NOT NULL,
                        interval_days INTEGER NOT NULL,
                        aggregate JSONB NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(program_id, cohort_id, program_version, interval_days)
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_measurement_plans (
                        id SERIAL PRIMARY KEY,
                        program_id INTEGER NOT NULL REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        version INTEGER NOT NULL,
                        status TEXT NOT NULL DEFAULT 'draft',
                        plan JSONB NOT NULL DEFAULT '{}',
                        approved_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(program_id, version)
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS enterprise_confidence_responses (
                        id BIGSERIAL PRIMARY KEY,
                        organization_id INTEGER NOT NULL REFERENCES organizations(id),
                        program_id INTEGER NOT NULL REFERENCES enterprise_programs(id) ON DELETE CASCADE,
                        cohort_id INTEGER REFERENCES enterprise_cohorts(id) ON DELETE SET NULL,
                        program_version TEXT NOT NULL DEFAULT 'v1',
                        phase TEXT NOT NULL CHECK (phase IN ('pre', 'post')),
                        learner_ref TEXT NOT NULL,
                        answers JSONB NOT NULL,
                        duration_seconds NUMERIC,
                        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(program_id, cohort_id, program_version, phase, learner_ref)
                    )
                """)
                conn.commit()
                cur.close()
                conn.close()
                # Now bootstrap the pool since DB is ready
                _ensure_pool()
                print("DB initialized.")
                return
            except Exception as e:
                print(f"DB init error: {e}")
                conn.close()
                return
        print(f"DB not ready, retrying ({attempt + 1}/10)...")
        time.sleep(3)
    print("Could not connect to DB after 10 attempts. Continuing without DB.")


def save_curriculum(topic, level, audience, course_code, course_type, module_count, data, design_approach="addie", semester="") -> int | None:
    """Save curriculum and return the new course id."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            normalized_semester = normalize_semester(semester) if semester else ""
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO curricula (topic, level, audience, course_code, course_type, module_count, modules, sources, semester)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (topic, level, audience, course_code, course_type, module_count,
                 json.dumps(data.get("modules", [])),
                 json.dumps(data.get("sources", [])),
                 normalized_semester)
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            cur.close()
            return new_id
        except Exception as e:
            print(f"DB save error: {e}")
            return None
