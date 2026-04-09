"""Database operations: connection, init, and curriculum save."""

import json
import time
import psycopg2
from config import DATABASE_URL


def get_db():
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"DB connection error: {e}")
        return None


def init_db():
    for attempt in range(10):
        conn = get_db()
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
                        curriculum_topic TEXT
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
                        cohort_groups JSONB
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
                conn.commit()
                cur.close()
                conn.close()
                print("DB initialized.")
                return
            except Exception as e:
                print(f"DB init error: {e}")
                conn.close()
                return
        print(f"DB not ready, retrying ({attempt + 1}/10)...")
        time.sleep(3)
    print("Could not connect to DB after 10 attempts. Continuing without DB.")


def save_curriculum(topic, level, audience, course_code, course_type, module_count, data, design_approach="addie"):
    conn = get_db()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO curricula (topic, level, audience, course_code, course_type, module_count, modules, sources)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (topic, level, audience, course_code, course_type, module_count,
             json.dumps(data.get("modules", [])),
             json.dumps(data.get("sources", [])))
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"DB save error: {e}")
