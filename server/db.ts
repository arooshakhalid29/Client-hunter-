import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'clienthunter.db');
export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // 1. Discovery runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS discovery_runs (
      id TEXT PRIMARY KEY,
      niche_ids TEXT NOT NULL,
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      suburb TEXT,
      postcode TEXT,
      provider TEXT NOT NULL,
      query_count INTEGER DEFAULT 0,
      raw_count INTEGER DEFAULT 0,
      retained_count INTEGER DEFAULT 0,
      qualified_count INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      error_message TEXT,
      diagnostics_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 2. Businesses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      niche_id TEXT NOT NULL,
      niche_name TEXT NOT NULL,
      category TEXT NOT NULL,
      website_url TEXT,
      normalized_domain TEXT,
      address TEXT,
      suburb TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      postcode TEXT,
      phone TEXT,
      email TEXT,
      email_status TEXT DEFAULT 'unknown',
      booking_url TEXT,
      business_hours TEXT,
      latitude REAL,
      longitude REAL,
      source TEXT NOT NULL,
      source_url TEXT,
      data_confidence TEXT DEFAULT 'Medium',
      website_status TEXT DEFAULT 'none',
      opportunity_score INTEGER DEFAULT 0,
      score_band TEXT DEFAULT 'Low priority',
      status TEXT DEFAULT 'New',
      notes TEXT,
      tags TEXT DEFAULT '[]',
      contact_page_url TEXT,
      social_profiles TEXT DEFAULT '[]',
      sources_json TEXT DEFAULT '[]',
      evidence_json TEXT DEFAULT '{}',
      enrichment_status TEXT DEFAULT 'pending',
      missing_fields_json TEXT DEFAULT '[]',
      attempted_sources_json TEXT DEFAULT '[]',
      is_saved INTEGER DEFAULT 0,
      is_suppressed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_audited_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_businesses_state ON businesses(state);
    CREATE INDEX IF NOT EXISTS idx_businesses_city ON businesses(city);
    CREATE INDEX IF NOT EXISTS idx_businesses_niche ON businesses(niche_id);
    CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
    CREATE INDEX IF NOT EXISTS idx_businesses_score ON businesses(opportunity_score DESC);
    CREATE INDEX IF NOT EXISTS idx_businesses_domain ON businesses(normalized_domain);
    CREATE INDEX IF NOT EXISTS idx_businesses_saved ON businesses(is_saved);
  `);

  // Safe column migrations for existing databases
  try {
    db.exec("ALTER TABLE businesses ADD COLUMN contact_page_url TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE businesses ADD COLUMN social_profiles TEXT DEFAULT '[]';");
  } catch {}
  try {
    db.exec("ALTER TABLE businesses ADD COLUMN sources_json TEXT DEFAULT '[]';");
  } catch {}
  try {
    db.exec("ALTER TABLE businesses ADD COLUMN evidence_json TEXT DEFAULT '{}';");
  } catch {}
  try {
    db.exec("ALTER TABLE businesses ADD COLUMN enrichment_status TEXT DEFAULT 'pending';");
  } catch {}
  try {
    db.exec("ALTER TABLE businesses ADD COLUMN missing_fields_json TEXT DEFAULT '[]';");
  } catch {}
  try {
    db.exec("ALTER TABLE businesses ADD COLUMN attempted_sources_json TEXT DEFAULT '[]';");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_businesses_enrichment ON businesses(enrichment_status);");
  } catch {}
  try {
    db.exec("ALTER TABLE website_audits ADD COLUMN contact_page_url TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE website_audits ADD COLUMN detected_social_profiles TEXT DEFAULT '[]';");
  } catch {}

  // 3. Business contacts (provenance & status)
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_contacts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      contact_type TEXT NOT NULL, -- 'phone', 'email', 'booking_url', 'contact_page'
      contact_value TEXT NOT NULL,
      source_url TEXT,
      provenance TEXT NOT NULL, -- 'official_website', 'osm', 'google_places', 'manual'
      status TEXT NOT NULL, -- 'verified', 'valid_syntax', 'unconfirmed', 'invalid'
      confidence TEXT DEFAULT 'Medium',
      created_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_business ON business_contacts(business_id);
  `);

  // 4. Website audits
  db.exec(`
    CREATE TABLE IF NOT EXISTS website_audits (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      url TEXT NOT NULL,
      http_status INTEGER,
      is_https INTEGER DEFAULT 0,
      response_time_ms INTEGER DEFAULT 0,
      title TEXT,
      meta_description TEXT,
      detected_booking_systems TEXT, -- JSON array
      has_phone_prominence INTEGER DEFAULT 0,
      has_after_hours_emergency INTEGER DEFAULT 0,
      has_contact_form INTEGER DEFAULT 0,
      detected_emails TEXT, -- JSON array
      detected_phones TEXT, -- JSON array
      multi_practitioner_signals TEXT, -- JSON array
      faq_count INTEGER DEFAULT 0,
      audit_evidence TEXT, -- JSON array
      success INTEGER DEFAULT 1,
      error_message TEXT,
      audited_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_audits_business ON website_audits(business_id);
  `);

  // 5. Opportunity scores breakdown
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_scores (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      band TEXT NOT NULL,
      confidence TEXT NOT NULL,
      industry_fit INTEGER DEFAULT 0,
      appointment_call_fit INTEGER DEFAULT 0,
      operational_complexity INTEGER DEFAULT 0,
      automation_opportunity INTEGER DEFAULT 0,
      evidence_confidence INTEGER DEFAULT 0,
      positive_signals TEXT, -- JSON array
      negative_signals TEXT, -- JSON array
      missing_info TEXT, -- JSON array
      suggested_service TEXT,
      suggested_angle TEXT,
      concise_explanation TEXT,
      scored_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scores_business ON opportunity_scores(business_id);
  `);

  // 6. Lead status history
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_status_history (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      change_reason TEXT,
      changed_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_history_business ON lead_status_history(business_id);
  `);

  // 7. Outreach drafts & events
  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_drafts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      channel TEXT NOT NULL, -- 'email', 'call_script', 'contact_form', 'follow_up'
      subject TEXT,
      content TEXT NOT NULL,
      opening_line TEXT,
      call_to_action TEXT,
      is_approved INTEGER DEFAULT 0,
      approved_at TEXT,
      sent_at TEXT,
      delivery_status TEXT DEFAULT 'draft',
      provider_message_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_drafts_business ON outreach_drafts(business_id);
  `);

  // 8. Follow-up tasks
  db.exec(`
    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_business ON follow_up_tasks(business_id);
  `);

  // 9. Suppression list (Do Not Contact)
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppression_list (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL, -- 'domain', 'email', 'phone', 'business_name'
      entity_value TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      added_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_suppression_value ON suppression_list(entity_value);
  `);

  // 10. Provider and app settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Seed default weights & provider settings if not already present
  const existingSettings = db.prepare('SELECT key FROM provider_settings WHERE key = ?').get('scoring_weights');
  if (!existingSettings) {
    const defaultWeights = JSON.stringify({
      industryFitWeight: 25,
      appointmentCallWeight: 25,
      operationalComplexityWeight: 20,
      automationOpportunityWeight: 15,
      evidenceConfidenceWeight: 15,
    });
    db.prepare('INSERT INTO provider_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'scoring_weights',
      defaultWeights,
      new Date().toISOString()
    );
  }

  const existingProviders = db.prepare('SELECT key FROM provider_settings WHERE key = ?').get('providers_config');
  if (!existingProviders) {
    const defaultProviders = JSON.stringify({
      osmEnabled: true,
      googlePlacesEnabled: false,
      webSearchEnabled: true,
      maxResultsPerSearch: 20,
    });
    db.prepare('INSERT INTO provider_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'providers_config',
      defaultProviders,
      new Date().toISOString()
    );
  }
}

// Automatically initialize on import
initDatabase();
