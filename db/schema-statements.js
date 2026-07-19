export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    must_reset_password INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at)",
  `CREATE TABLE IF NOT EXISTS app_parent_users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    must_reset_password INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_parent_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    parent_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS app_parent_sessions_parent_idx ON app_parent_sessions(parent_id)",
  "CREATE INDEX IF NOT EXISTS app_parent_sessions_expiry_idx ON app_parent_sessions(expires_at)",
  `CREATE TABLE IF NOT EXISTS parent_student_links (
    parent_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT '监护人',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (parent_id, student_id)
  )`,
  "CREATE INDEX IF NOT EXISTS parent_student_links_student_idx ON parent_student_links(student_id)",
  `CREATE TABLE IF NOT EXISTS user_parent_controls (
    user_id TEXT PRIMARY KEY NOT NULL,
    interest_analysis_enabled INTEGER NOT NULL DEFAULT 1,
    chat_memory_enabled INTEGER NOT NULL DEFAULT 1,
    mistake_photo_retention_days INTEGER NOT NULL DEFAULT 365,
    chat_cleared_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS parent_deletion_requests (
    request_id TEXT PRIMARY KEY NOT NULL,
    parent_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at INTEGER NOT NULL,
    resolved_at INTEGER
  )`,
  "CREATE INDEX IF NOT EXISTS parent_deletion_requests_parent_idx ON parent_deletion_requests(parent_id, requested_at DESC)",
  "CREATE INDEX IF NOT EXISTS parent_deletion_requests_student_idx ON parent_deletion_requests(student_id, status)",
  `CREATE TABLE IF NOT EXISTS app_data_migrations (
    migration_id TEXT PRIMARY KEY NOT NULL,
    completed_at INTEGER NOT NULL,
    source_backup_dir TEXT NOT NULL,
    details_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS legacy_unassigned_data (
    source_type TEXT NOT NULL,
    source_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    PRIMARY KEY (source_type, source_key)
  )`,

  // Legacy tables are retained for one-way, on-demand migration of existing Sites D1 data.
  `CREATE TABLE IF NOT EXISTS user_game_state (
    user_id TEXT PRIMARY KEY NOT NULL,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_student_memory (
    user_id TEXT PRIMARY KEY NOT NULL,
    memory_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS user_state_meta (
    user_id TEXT PRIMARY KEY NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_pet_state (
    user_id TEXT PRIMARY KEY NOT NULL,
    pet_name TEXT NOT NULL,
    hunger INTEGER NOT NULL,
    cleanliness INTEGER NOT NULL,
    boredom INTEGER NOT NULL,
    fruits INTEGER NOT NULL,
    stars INTEGER NOT NULL,
    tickets INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    reading_font_size TEXT NOT NULL DEFAULT 'medium',
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_reading_records (
    user_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    title TEXT NOT NULL,
    read_date TEXT NOT NULL,
    answer TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, record_id)
  )`,
  "CREATE INDEX IF NOT EXISTS user_reading_records_user_date_idx ON user_reading_records(user_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_reading_rewards (
    user_id TEXT NOT NULL,
    reward_key TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, reward_key)
  )`,
  `CREATE TABLE IF NOT EXISTS user_travel_records (
    user_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    destination_id TEXT,
    destination TEXT NOT NULL,
    travel_date TEXT NOT NULL,
    reward TEXT NOT NULL,
    photo TEXT NOT NULL,
    knowledge TEXT,
    knowledge_card_id TEXT,
    knowledge_title TEXT,
    knowledge_facts_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, record_id)
  )`,
  "CREATE INDEX IF NOT EXISTS user_travel_records_user_date_idx ON user_travel_records(user_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_active_travel (
    user_id TEXT PRIMARY KEY NOT NULL,
    destination_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_mistakes (
    user_id TEXT NOT NULL,
    mistake_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    question TEXT NOT NULL,
    wrong_answer TEXT NOT NULL,
    correction TEXT NOT NULL,
    cause TEXT NOT NULL,
    status TEXT NOT NULL,
    mistake_date TEXT NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, mistake_id)
  )`,
  "CREATE INDEX IF NOT EXISTS user_mistakes_user_status_idx ON user_mistakes(user_id, status, updated_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_mistake_review_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    mistake_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    review_number INTEGER NOT NULL,
    reviewed_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS user_mistake_reviews_user_date_idx ON user_mistake_review_events(user_id, reviewed_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_mistake_analyses (
    user_id TEXT NOT NULL,
    mistake_id TEXT NOT NULL,
    model_source TEXT NOT NULL,
    notice TEXT NOT NULL DEFAULT '',
    analyzed_at INTEGER NOT NULL,
    confirmed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, mistake_id)
  )`,
  "CREATE INDEX IF NOT EXISTS user_mistake_analyses_user_date_idx ON user_mistake_analyses(user_id, confirmed_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_mistake_answer_attempts (
    attempt_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    mistake_id TEXT NOT NULL,
    answer_image_url TEXT NOT NULL,
    recognized_answer TEXT NOT NULL,
    recognized_steps TEXT NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    feedback TEXT NOT NULL,
    notice TEXT NOT NULL DEFAULT '',
    model_source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS user_mistake_answers_user_date_idx ON user_mistake_answer_attempts(user_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS user_mistake_answers_user_mistake_idx ON user_mistake_answer_attempts(user_id, mistake_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_daily_state (
    user_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    mistake_mode TEXT NOT NULL,
    feed_target INTEGER NOT NULL,
    swim_target INTEGER NOT NULL,
    reading_target INTEGER NOT NULL,
    mistake_target INTEGER NOT NULL,
    feed_progress INTEGER NOT NULL,
    swim_progress INTEGER NOT NULL,
    reading_progress INTEGER NOT NULL,
    mistake_progress INTEGER NOT NULL,
    reward_claimed INTEGER NOT NULL DEFAULT 0,
    fruit_picked INTEGER NOT NULL DEFAULT 0,
    hide_completed INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, date_key)
  )`,
  "CREATE INDEX IF NOT EXISTS user_daily_state_user_date_idx ON user_daily_state(user_id, date_key DESC)",
  `CREATE TABLE IF NOT EXISTS user_chat_messages (
    user_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, message_id)
  )`,
  "CREATE INDEX IF NOT EXISTS user_chat_messages_expiry_idx ON user_chat_messages(expires_at)",
  "CREATE INDEX IF NOT EXISTS user_chat_messages_user_date_idx ON user_chat_messages(user_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_reward_ledger (
    entry_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, resource_type, source_id)
  )`,
  "CREATE INDEX IF NOT EXISTS user_reward_ledger_user_date_idx ON user_reward_ledger(user_id, created_at DESC)",

  `CREATE TABLE IF NOT EXISTS user_reading_progress (
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL DEFAULT 0,
    page_index INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, book_id)
  )`,
  "CREATE INDEX IF NOT EXISTS user_reading_progress_updated_idx ON user_reading_progress(updated_at)",
  `CREATE TABLE IF NOT EXISTS user_reading_metrics (
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    first_read_at INTEGER NOT NULL,
    last_read_at INTEGER NOT NULL,
    completed_at INTEGER,
    PRIMARY KEY (user_id, book_id)
  )`,
  `CREATE TABLE IF NOT EXISTS chapter_answer_attempts (
    attempt_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    book_id TEXT,
    question_key TEXT,
    book_title TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    correct INTEGER NOT NULL,
    feedback TEXT NOT NULL,
    model_source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS chapter_answers_user_date_idx ON chapter_answer_attempts(user_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS chapter_answers_user_question_idx ON chapter_answer_attempts(user_id, question_key, correct)",

  `CREATE TABLE IF NOT EXISTS user_memory_profile (
    user_id TEXT PRIMARY KEY NOT NULL,
    student_name TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_memory_books (
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    chapter TEXT NOT NULL,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, title)
  )`,
  "CREATE INDEX IF NOT EXISTS user_memory_books_user_date_idx ON user_memory_books(user_id, last_read_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_memory_facts (
    user_id TEXT NOT NULL,
    fact_type TEXT NOT NULL,
    fact_value TEXT NOT NULL,
    source_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (user_id, fact_type, fact_value)
  )`,
  "CREATE INDEX IF NOT EXISTS user_memory_facts_user_type_idx ON user_memory_facts(user_id, fact_type, last_used_at DESC)",
  `CREATE TABLE IF NOT EXISTS user_activity_log (
    activity_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    activity TEXT NOT NULL,
    detail TEXT NOT NULL,
    happened_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS user_activity_log_user_date_idx ON user_activity_log(user_id, happened_at DESC)",
];
