import { BusinessRecord, AustralianState } from '../types.js';
import { normalizeDomain, normalizePhone } from '../providers/manager.js';
import { AUSTRALIAN_NICHES } from '../niches.js';
import { calculateOpportunityScore } from '../enrichment/scoring-engine.js';
import { db } from '../db.js';

export interface CsvImportRow {
  name: string;
  niche?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  notes?: string;
}

export interface CsvImportResult {
  totalRows: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: { rowNumber: number; reason: string }[];
  importedBusinesses: BusinessRecord[];
}

export function parseCsvText(csvText: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // ignore carriage return
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

export function processCsvImport(csvContent: string): CsvImportResult {
  const rows = parseCsvText(csvContent);
  if (rows.length < 2) {
    return {
      totalRows: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 1,
      errors: [{ rowNumber: 1, reason: 'CSV must contain a header row and at least one data row' }],
      importedBusinesses: [],
    };
  }

  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('business') || h.includes('company'));
  const nicheIdx = header.findIndex((h) => h.includes('niche') || h.includes('category') || h.includes('industry'));
  const websiteIdx = header.findIndex((h) => h.includes('website') || h.includes('url') || h.includes('domain'));
  const phoneIdx = header.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('tel'));
  const emailIdx = header.findIndex((h) => h.includes('email') || h.includes('mail'));
  const addressIdx = header.findIndex((h) => h.includes('address') || h.includes('street'));
  const suburbIdx = header.findIndex((h) => h.includes('suburb'));
  const cityIdx = header.findIndex((h) => h.includes('city') || h.includes('town'));
  const stateIdx = header.findIndex((h) => h.includes('state') || h.includes('territory'));
  const postcodeIdx = header.findIndex((h) => h.includes('postcode') || h.includes('postal') || h.includes('zip'));
  const notesIdx = header.findIndex((h) => h.includes('note') || h.includes('comment'));

  if (nameIdx === -1) {
    return {
      totalRows: rows.length - 1,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 1,
      errors: [{ rowNumber: 1, reason: 'Could not identify a business name column in CSV header' }],
      importedBusinesses: [],
    };
  }

  const dataRows = rows.slice(1);
  const errors: { rowNumber: number; reason: string }[] = [];
  const importedBusinesses: BusinessRecord[] = [];
  let duplicateCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2;
    const name = row[nameIdx]?.trim();

    if (!name || name.length < 2) {
      errors.push({ rowNumber: rowNum, reason: 'Missing or empty business name' });
      continue;
    }

    const rawNiche = nicheIdx !== -1 ? row[nicheIdx] : '';
    const rawWebsite = websiteIdx !== -1 ? row[websiteIdx] : '';
    const rawPhone = phoneIdx !== -1 ? row[phoneIdx] : '';
    const rawEmail = emailIdx !== -1 ? row[emailIdx] : '';
    const rawAddress = addressIdx !== -1 ? row[addressIdx] : '';
    const rawSuburb = suburbIdx !== -1 ? row[suburbIdx] : '';
    const rawCity = cityIdx !== -1 ? row[cityIdx] : 'Sydney';
    let rawState = (stateIdx !== -1 ? row[stateIdx] : 'NSW').toUpperCase();
    const rawPostcode = postcodeIdx !== -1 ? row[postcodeIdx] : '';
    const notes = notesIdx !== -1 ? row[notesIdx] : '';

    const validStates: AustralianState[] = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'ACT', 'TAS', 'NT'];
    let state: AustralianState = validStates.includes(rawState as AustralianState) ? (rawState as AustralianState) : 'NSW';

    // Match niche
    const matchedNiche = AUSTRALIAN_NICHES.find(
      (n) => n.name.toLowerCase() === rawNiche.toLowerCase() || n.id === rawNiche.toLowerCase() || n.searchKeywords.some((k) => k.toLowerCase() === rawNiche.toLowerCase())
    ) || AUSTRALIAN_NICHES[0];

    const normDomain = normalizeDomain(rawWebsite || null);
    const normPhone = normalizePhone(rawPhone || null);

    // Duplicate check in DB
    const existing = db.prepare(`
      SELECT id FROM businesses 
      WHERE (normalized_domain IS NOT NULL AND normalized_domain = ?)
         OR (name = ? AND city = ?)
    `).get(normDomain || '', name, rawCity);

    if (existing) {
      duplicateCount++;
      continue;
    }

    const bizId = 'biz_csv_' + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();

    const scoreResult = calculateOpportunityScore({
      id: bizId,
      name,
      nicheId: matchedNiche.id,
      category: matchedNiche.category,
      websiteUrl: rawWebsite || null,
      phone: normPhone,
      email: rawEmail || null,
      businessHours: null,
      bookingUrl: null,
      city: rawCity,
      state,
      audit: null,
    });

    const biz: BusinessRecord = {
      id: bizId,
      name,
      nicheId: matchedNiche.id,
      nicheName: matchedNiche.name,
      category: matchedNiche.category,
      websiteUrl: rawWebsite || null,
      normalizedDomain: normDomain,
      contactPageUrl: null,
      socialProfiles: [],
      address: rawAddress || null,
      suburb: rawSuburb || null,
      city: rawCity,
      state,
      postcode: rawPostcode || null,
      phone: normPhone,
      email: rawEmail || null,
      emailStatus: rawEmail ? 'public_source' : 'unknown',
      bookingUrl: null,
      businessHours: null,
      latitude: null,
      longitude: null,
      source: 'User CSV Import',
      sourceUrl: null,
      sources: [
        {
          sourceName: 'User CSV Import',
          sourceUrl: null,
          discoveredAt: now,
          enrichedAt: null,
          status: 'verified',
          fieldsProvided: ['name', ...(rawAddress ? ['address'] : []), ...(normPhone ? ['phone'] : []), ...(rawEmail ? ['email'] : []), ...(rawWebsite ? ['website'] : [])],
        },
      ],
      fieldEvidence: {
        name: { field: 'name', value: name, sourceName: 'User CSV Import', sourceUrl: null, confidence: 'High', verifiedStatus: 'verified', timestamp: now },
      },
      enrichmentStatus: (normPhone || rawEmail) ? 'partial' : 'pending',
      missingFields: [
        ...(!normPhone ? ['phone'] : []),
        ...(!rawEmail ? ['email'] : []),
        ...(!rawWebsite ? ['website'] : []),
      ],
      attemptedSources: ['User CSV Import'],
      dataConfidence: 'Medium',
      websiteStatus: rawWebsite ? 'accessible' : 'none',
      opportunityScore: scoreResult.score,
      scoreBand: scoreResult.band,
      status: 'Qualified',
      notes: notes || 'Imported via CSV',
      tags: ['CSV Import', matchedNiche.categoryLabel],
      isSaved: true,
      isSuppressed: false,
      createdAt: now,
      updatedAt: now,
      lastAuditedAt: null,
    };

    // Insert to DB
    try {
      db.prepare(`
        INSERT INTO businesses (
          id, name, niche_id, niche_name, category, website_url, normalized_domain,
          address, suburb, city, state, postcode, phone, email, email_status,
          booking_url, business_hours, source, source_url, data_confidence,
          sources_json, evidence_json, enrichment_status, missing_fields_json, attempted_sources_json,
          website_status, opportunity_score, score_band, status, notes, tags,
          is_saved, is_suppressed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        biz.id, biz.name, biz.nicheId, biz.nicheName, biz.category,
        biz.websiteUrl, biz.normalizedDomain, biz.address, biz.suburb,
        biz.city, biz.state, biz.postcode, biz.phone, biz.email, biz.emailStatus,
        biz.bookingUrl, biz.businessHours, biz.source, biz.sourceUrl,
        biz.dataConfidence, JSON.stringify(biz.sources), JSON.stringify(biz.fieldEvidence),
        biz.enrichmentStatus, JSON.stringify(biz.missingFields), JSON.stringify(biz.attemptedSources),
        biz.websiteStatus, biz.opportunityScore,
        biz.scoreBand, biz.status, biz.notes, JSON.stringify(biz.tags),
        1, 0, biz.createdAt, biz.updatedAt
      );

      importedBusinesses.push(biz);
    } catch (err: any) {
      errors.push({ rowNumber: rowNum, reason: err.message || 'Database insert failed' });
    }
  }

  return {
    totalRows: dataRows.length,
    importedCount: importedBusinesses.length,
    duplicateCount,
    errorCount: errors.length,
    errors,
    importedBusinesses,
  };
}

export function exportLeadsToCsv(businesses: BusinessRecord[]): string {
  const headers = [
    'Business Name',
    'Niche',
    'Category',
    'State',
    'City',
    'Suburb',
    'Address',
    'Postcode',
    'Phone',
    'Email',
    'Email Status',
    'Website',
    'Booking System',
    'Contact Page URL',
    'Instagram',
    'Facebook',
    'LinkedIn',
    'TikTok',
    'YouTube',
    'Pinterest',
    'X (Twitter)',
    'Opportunity Score',
    'Score Band',
    'Status',
    'Enrichment Status',
    'Missing Fields',
    'Data Confidence',
    'Discovery Source',
    'Source URL',
    'Notes',
    'Created At',
  ];

  function escapeField(val: any): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function getSocialUrl(profiles: any[] | undefined, platform: string): string {
    if (!profiles || !Array.isArray(profiles)) return '';
    const found = profiles.find((p) => p.platform === platform && p.url);
    return found ? found.url : '';
  }

  const rows = [headers.join(',')];

  for (const b of businesses) {
    const row = [
      escapeField(b.name),
      escapeField(b.nicheName),
      escapeField(b.category),
      escapeField(b.state),
      escapeField(b.city),
      escapeField(b.suburb),
      escapeField(b.address),
      escapeField(b.postcode),
      escapeField(b.phone),
      escapeField(b.email),
      escapeField(b.emailStatus),
      escapeField(b.websiteUrl),
      escapeField(b.bookingUrl),
      escapeField(b.contactPageUrl),
      escapeField(getSocialUrl(b.socialProfiles, 'instagram')),
      escapeField(getSocialUrl(b.socialProfiles, 'facebook')),
      escapeField(getSocialUrl(b.socialProfiles, 'linkedin')),
      escapeField(getSocialUrl(b.socialProfiles, 'tiktok')),
      escapeField(getSocialUrl(b.socialProfiles, 'youtube')),
      escapeField(getSocialUrl(b.socialProfiles, 'pinterest')),
      escapeField(getSocialUrl(b.socialProfiles, 'x')),
      escapeField(b.opportunityScore),
      escapeField(b.scoreBand),
      escapeField(b.status),
      escapeField(b.enrichmentStatus || 'pending'),
      escapeField((b.missingFields || []).join('; ')),
      escapeField(b.dataConfidence),
      escapeField(b.source),
      escapeField(b.sourceUrl || ''),
      escapeField(b.notes),
      escapeField(b.createdAt),
    ];
    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}
