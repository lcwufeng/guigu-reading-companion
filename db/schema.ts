import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readingProgress = sqliteTable("reading_progress", {
  deviceId: text("device_id").notNull(),
  bookId: text("book_id").notNull(),
  chapterIndex: integer("chapter_index").notNull().default(0),
  pageIndex: integer("page_index").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.deviceId, table.bookId] })]);

export const studentMemory = sqliteTable("student_memory", {
  deviceId: text("device_id").primaryKey(),
  memoryJson: text("memory_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userGameState = sqliteTable("user_game_state", {
  userId: text("user_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userReadingProgress = sqliteTable("user_reading_progress", {
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  chapterIndex: integer("chapter_index").notNull().default(0),
  pageIndex: integer("page_index").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.bookId] })]);

export const userStudentMemory = sqliteTable("user_student_memory", {
  userId: text("user_id").primaryKey(),
  memoryJson: text("memory_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustResetPassword: integer("must_reset_password", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("app_users_username_idx").on(table.username)]);

export const appSessions = sqliteTable("app_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("app_sessions_user_idx").on(table.userId),
  index("app_sessions_expiry_idx").on(table.expiresAt),
]);

export const appParentUsers = sqliteTable("app_parent_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustResetPassword: integer("must_reset_password", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("app_parent_users_username_idx").on(table.username)]);

export const appParentSessions = sqliteTable("app_parent_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  parentId: text("parent_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("app_parent_sessions_parent_idx").on(table.parentId),
  index("app_parent_sessions_expiry_idx").on(table.expiresAt),
]);

export const parentStudentLinks = sqliteTable("parent_student_links", {
  parentId: text("parent_id").notNull(),
  studentId: text("student_id").notNull(),
  relationship: text("relationship").notNull().default("监护人"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.parentId, table.studentId] }),
  index("parent_student_links_student_idx").on(table.studentId),
]);

export const userParentControls = sqliteTable("user_parent_controls", {
  userId: text("user_id").primaryKey(),
  interestAnalysisEnabled: integer("interest_analysis_enabled", { mode: "boolean" }).notNull().default(true),
  chatMemoryEnabled: integer("chat_memory_enabled", { mode: "boolean" }).notNull().default(true),
  mistakePhotoRetentionDays: integer("mistake_photo_retention_days").notNull().default(365),
  chatClearedAt: integer("chat_cleared_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const parentDeletionRequests = sqliteTable("parent_deletion_requests", {
  requestId: text("request_id").primaryKey(),
  parentId: text("parent_id").notNull(),
  studentId: text("student_id").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: integer("requested_at").notNull(),
  resolvedAt: integer("resolved_at"),
}, (table) => [
  index("parent_deletion_requests_parent_idx").on(table.parentId, table.requestedAt),
  index("parent_deletion_requests_student_idx").on(table.studentId, table.status),
]);

export const appDataMigrations = sqliteTable("app_data_migrations", {
  migrationId: text("migration_id").primaryKey(),
  completedAt: integer("completed_at").notNull(),
  sourceBackupDir: text("source_backup_dir").notNull(),
  detailsJson: text("details_json").notNull(),
});

export const legacyUnassignedData = sqliteTable("legacy_unassigned_data", {
  sourceType: text("source_type").notNull(),
  sourceKey: text("source_key").notNull(),
  payloadJson: text("payload_json").notNull(),
  importedAt: integer("imported_at").notNull(),
}, (table) => [primaryKey({ columns: [table.sourceType, table.sourceKey] })]);

export const userStateMeta = sqliteTable("user_state_meta", {
  userId: text("user_id").primaryKey(),
  updatedAt: integer("updated_at").notNull(),
});

export const userPetState = sqliteTable("user_pet_state", {
  userId: text("user_id").primaryKey(),
  petName: text("pet_name").notNull(),
  hunger: integer("hunger").notNull(),
  cleanliness: integer("cleanliness").notNull(),
  boredom: integer("boredom").notNull(),
  fruits: integer("fruits").notNull(),
  stars: integer("stars").notNull(),
  tickets: integer("tickets").notNull(),
  lastSeen: integer("last_seen").notNull(),
  readingFontSize: text("reading_font_size").notNull().default("medium"),
  updatedAt: integer("updated_at").notNull(),
});

export const userReadingRecords = sqliteTable("user_reading_records", {
  userId: text("user_id").notNull(),
  recordId: text("record_id").notNull(),
  title: text("title").notNull(),
  readDate: text("read_date").notNull(),
  answer: text("answer").notNull(),
  summary: text("summary").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.recordId] }),
  index("user_reading_records_user_date_idx").on(table.userId, table.createdAt),
]);

export const userReadingRewards = sqliteTable("user_reading_rewards", {
  userId: text("user_id").notNull(),
  rewardKey: text("reward_key").notNull(),
  earnedAt: integer("earned_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.rewardKey] })]);

export const userTravelRecords = sqliteTable("user_travel_records", {
  userId: text("user_id").notNull(),
  recordId: text("record_id").notNull(),
  destinationId: text("destination_id"),
  destination: text("destination").notNull(),
  travelDate: text("travel_date").notNull(),
  reward: text("reward").notNull(),
  photo: text("photo").notNull(),
  knowledge: text("knowledge"),
  knowledgeCardId: text("knowledge_card_id"),
  knowledgeTitle: text("knowledge_title"),
  knowledgeFactsJson: text("knowledge_facts_json").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.recordId] }),
  index("user_travel_records_user_date_idx").on(table.userId, table.createdAt),
]);

export const userActiveTravel = sqliteTable("user_active_travel", {
  userId: text("user_id").primaryKey(),
  destinationId: text("destination_id").notNull(),
  startedAt: integer("started_at").notNull(),
  endsAt: integer("ends_at").notNull(),
});

export const userMistakes = sqliteTable("user_mistakes", {
  userId: text("user_id").notNull(),
  mistakeId: text("mistake_id").notNull(),
  subject: text("subject").notNull(),
  question: text("question").notNull(),
  wrongAnswer: text("wrong_answer").notNull(),
  correction: text("correction").notNull(),
  cause: text("cause").notNull(),
  status: text("status").notNull(),
  mistakeDate: text("mistake_date").notNull(),
  reviewCount: integer("review_count").notNull().default(0),
  imageUrl: text("image_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.mistakeId] }),
  index("user_mistakes_user_status_idx").on(table.userId, table.status, table.updatedAt),
]);

export const userMistakeReviewEvents = sqliteTable("user_mistake_review_events", {
  eventId: text("event_id").primaryKey(),
  userId: text("user_id").notNull(),
  mistakeId: text("mistake_id").notNull(),
  outcome: text("outcome").notNull(),
  reviewNumber: integer("review_number").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
}, (table) => [index("user_mistake_reviews_user_date_idx").on(table.userId, table.reviewedAt)]);

export const userMistakeAnalyses = sqliteTable("user_mistake_analyses", {
  userId: text("user_id").notNull(),
  mistakeId: text("mistake_id").notNull(),
  modelSource: text("model_source").notNull(),
  notice: text("notice").notNull().default(""),
  analyzedAt: integer("analyzed_at").notNull(),
  confirmedAt: integer("confirmed_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.mistakeId] }),
  index("user_mistake_analyses_user_date_idx").on(table.userId, table.confirmedAt),
]);

export const userMistakeAnswerAttempts = sqliteTable("user_mistake_answer_attempts", {
  attemptId: text("attempt_id").primaryKey(),
  userId: text("user_id").notNull(),
  mistakeId: text("mistake_id").notNull(),
  answerImageUrl: text("answer_image_url").notNull(),
  recognizedAnswer: text("recognized_answer").notNull(),
  recognizedSteps: text("recognized_steps").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull().default(false),
  feedback: text("feedback").notNull(),
  notice: text("notice").notNull().default(""),
  modelSource: text("model_source").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("user_mistake_answers_user_date_idx").on(table.userId, table.createdAt),
  index("user_mistake_answers_user_mistake_idx").on(table.userId, table.mistakeId, table.createdAt),
]);

export const userDailyState = sqliteTable("user_daily_state", {
  userId: text("user_id").notNull(),
  dateKey: text("date_key").notNull(),
  mistakeMode: text("mistake_mode").notNull(),
  feedTarget: integer("feed_target").notNull(),
  swimTarget: integer("swim_target").notNull(),
  readingTarget: integer("reading_target").notNull(),
  mistakeTarget: integer("mistake_target").notNull(),
  feedProgress: integer("feed_progress").notNull(),
  swimProgress: integer("swim_progress").notNull(),
  readingProgress: integer("reading_progress").notNull(),
  mistakeProgress: integer("mistake_progress").notNull(),
  rewardClaimed: integer("reward_claimed", { mode: "boolean" }).notNull().default(false),
  fruitPicked: integer("fruit_picked").notNull().default(0),
  hideCompleted: integer("hide_completed").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.dateKey] }),
  index("user_daily_state_user_date_idx").on(table.userId, table.dateKey),
]);

export const userChatMessages = sqliteTable("user_chat_messages", {
  userId: text("user_id").notNull(),
  messageId: text("message_id").notNull(),
  role: text("role").notNull(),
  messageText: text("message_text").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.messageId] }),
  index("user_chat_messages_expiry_idx").on(table.expiresAt),
  index("user_chat_messages_user_date_idx").on(table.userId, table.createdAt),
]);

export const userRewardLedger = sqliteTable("user_reward_ledger", {
  entryId: text("entry_id").primaryKey(),
  userId: text("user_id").notNull(),
  resourceType: text("resource_type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("user_reward_ledger_source_idx").on(table.userId, table.resourceType, table.sourceId),
  index("user_reward_ledger_user_date_idx").on(table.userId, table.createdAt),
]);

export const userReadingMetrics = sqliteTable("user_reading_metrics", {
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  firstReadAt: integer("first_read_at").notNull(),
  lastReadAt: integer("last_read_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [primaryKey({ columns: [table.userId, table.bookId] })]);

export const chapterAnswerAttempts = sqliteTable("chapter_answer_attempts", {
  attemptId: text("attempt_id").primaryKey(),
  userId: text("user_id").notNull(),
  bookId: text("book_id"),
  questionKey: text("question_key"),
  bookTitle: text("book_title").notNull(),
  chapterTitle: text("chapter_title").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  feedback: text("feedback").notNull(),
  modelSource: text("model_source").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("chapter_answers_user_date_idx").on(table.userId, table.createdAt),
  index("chapter_answers_user_question_idx").on(table.userId, table.questionKey, table.correct),
]);

export const userMemoryProfile = sqliteTable("user_memory_profile", {
  userId: text("user_id").primaryKey(),
  studentName: text("student_name").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const userMemoryBooks = sqliteTable("user_memory_books", {
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  chapter: text("chapter").notNull(),
  lastReadAt: integer("last_read_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.title] }),
  index("user_memory_books_user_date_idx").on(table.userId, table.lastReadAt),
]);

export const userMemoryFacts = sqliteTable("user_memory_facts", {
  userId: text("user_id").notNull(),
  factType: text("fact_type").notNull(),
  factValue: text("fact_value").notNull(),
  sourceType: text("source_type").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at").notNull(),
  expiresAt: integer("expires_at"),
}, (table) => [
  primaryKey({ columns: [table.userId, table.factType, table.factValue] }),
  index("user_memory_facts_user_type_idx").on(table.userId, table.factType, table.lastUsedAt),
]);

export const userActivityLog = sqliteTable("user_activity_log", {
  activityId: text("activity_id").primaryKey(),
  userId: text("user_id").notNull(),
  activity: text("activity").notNull(),
  detail: text("detail").notNull(),
  happenedAt: integer("happened_at").notNull(),
}, (table) => [index("user_activity_log_user_date_idx").on(table.userId, table.happenedAt)]);
