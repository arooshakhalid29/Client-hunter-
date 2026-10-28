import { DiscoveryProvider, DiscoveryQuery, RawBusinessRecord } from './types.js';
import { OsmOverpassProvider } from './osm-provider.js';
import { AustralianDirectoryProvider } from './directory-provider.js';
import { PublicWebSearchProvider } from './search-provider.js';
import { GooglePlacesProvider } from './google-places-provider.js';
import { HunterDiscoveryProvider } from './hunter-provider.js';
import { DiscoveryDiagnostics, BusinessRecord, AustralianState, SourceRecord, FieldEvidence } from '../types.js';
import { AUSTRALIAN_NICHES } from '../niches.js';
import { auditBusinessWebsite } from '../enrichment/website-auditor.js';
import { crawlBusinessWebsite } from '../enrichment/crawler.js';
import { calculateOpportunityScore } from '../enrichment/scoring-engine.js';
import { db } from '../db.js';

export function normalizeDomain(urlStr: string | null): string | null {
  if (!urlStr) return null;
  try {
    let clean = urlStr.trim().toLowerCase();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return urlStr.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

export function normalizePhone(rawPhone: string | null): string | null {
  if (!rawPhone) return null;
  const cleaned = rawPhone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('04') && cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  if ((cleaned.startsWith('02') || cleaned.startsWith('03') || cleaned.startsWith('07') || cleaned.startsWith('08')) && cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
  }
  return rawPhone.trim();
}

export class DiscoveryManager {
  private providers: DiscoveryProvider[] = [
    new OsmOverpassProvider(),
    new AustralianDirectoryProvider(),
    new PublicWebSearchProvider(),
    new GooglePlacesProvider(),
    new HunterDiscoveryProvider(),
  ];

  async getDiagnostics(): Promise<DiscoveryDiagnostics> {
    const configured: string[] = [];
    const reachable: string[] = [];
    const errors: { provider: string; message: string; timestamp: string }[] = [];

    for (const p of this.providers) {
      const isConf = await p.isConfigured();
      if (isConf) {
        configured.push(p.name);
        const reach = await p.checkReachable();
        if (reach.reachable) {
          reachable.push(p.name);
        } else if (reach.error) {
          errors.push({ provider: p.name, message: reach.error, timestamp: new Date().toISOString() });
        }
      }
    }

    return {
      configuredProviders: configured,
      reachableProviders: reachable,
      queriesExecuted: 0,
      rawRecordsReturned: 0,
      uniqueBusinessesRetained: 0,
      officialWebsitesFound: 0,
      leadsQualified: 0,
      leadsExcluded: [],
      providerErrors: errors,
      executionTimeMs: 0,
    };
  }

  async runDiscovery(query: DiscoveryQuery): Promise<{ businesses: BusinessRecord[]; diagnostics: DiscoveryDiagnostics }> {
    const startTime = Date.now();
    const runId = 'run_' + Math.random().toString(36).substring(2, 11);

    const configuredProviders: string[] = [];
    const reachableProviders: string[] = [];
    const providerErrors: { provider: string; message: string; timestamp: string }[] = [];
    let totalQueries = 0;
    const allRawRecords: RawBusinessRecord[] = [];

    // Run discovery across all active, reachable providers
    for (const provider of this.providers) {
      const isConf = await provider.isConfigured();
      if (isConf) {
        configuredProviders.push(provider.name);
        const reachCheck = await provider.checkReachable();
        if (reachCheck.reachable) {
          reachableProviders.push(provider.name);
          try {
            const result = await provider.search(query);
            totalQueries += result.queryCount;
            if (result.records.length > 0) {
              allRawRecords.push(...result.records);
            }
            if (result.error) {
              providerErrors.push({ provider: provider.name, message: result.error, timestamp: new Date().toISOString() });
            }
          } catch (err: any) {
            providerErrors.push({ provider: provider.name, message: err.message || 'Execution error', timestamp: new Date().toISOString() });
          }
        } else {
          providerErrors.push({
            provider: provider.name,
            message: reachCheck.error || 'Provider currently unreachable',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Check suppression list from DB
    const suppressionRows = db.prepare('SELECT entity_value FROM suppression_list').all() as { entity_value: string }[];
    const suppressedSet = new Set(suppressionRows.map((s) => s.entity_value.toLowerCase().trim()));

    // Multi-source deduplication and merging map
    interface MergedCandidate {
      primary: RawBusinessRecord;
      additionalSources: Array<{ source: string; sourceUrl: string | null; raw: RawBusinessRecord }>;
    }

    const mergedCandidates = new Map<string, MergedCandidate>();
    const excludedReasons: Record<string, number> = {};

    for (const raw of allRawRecords) {
      const normDomain = normalizeDomain(raw.website);
      const normName = raw.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normAddress = (raw.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // Key differentiates branches: if same domain exists at different physical addresses, keep both!
      const dedupKey = normDomain
        ? `${normDomain}::${normAddress || raw.city.toLowerCase()}`
        : `${normName}::${raw.city.toLowerCase()}::${normAddress}`;

      if (mergedCandidates.has(dedupKey)) {
        // Merge extra source info instead of discarding evidence!
        const existing = mergedCandidates.get(dedupKey)!;
        existing.additionalSources.push({ source: raw.source, sourceUrl: raw.sourceUrl, raw });

        // Backfill missing fields from secondary source
        if (!existing.primary.phone && raw.phone) existing.primary.phone = raw.phone;
        if (!existing.primary.email && raw.email) existing.primary.email = raw.email;
        if (!existing.primary.website && raw.website) existing.primary.website = raw.website;
        if (!existing.primary.address && raw.address) existing.primary.address = raw.address;
        if (!existing.primary.bookingUrl && raw.bookingUrl) existing.primary.bookingUrl = raw.bookingUrl;
        if (!existing.primary.businessHours && raw.businessHours) existing.primary.businessHours = raw.businessHours;
        continue;
      }

      // Check user-requested hard filters
      if (query.requireWebsite && !raw.website) {
        excludedReasons['Missing official website (filter enabled)'] = (excludedReasons['Missing official website (filter enabled)'] || 0) + 1;
        continue;
      }
      if (query.requirePhone && !raw.phone) {
        excludedReasons['Missing phone number (filter enabled)'] = (excludedReasons['Missing phone number (filter enabled)'] || 0) + 1;
        continue;
      }
      if (query.requireEmail && !raw.email) {
        excludedReasons['Missing email (filter enabled)'] = (excludedReasons['Missing email (filter enabled)'] || 0) + 1;
        continue;
      }

      mergedCandidates.set(dedupKey, {
        primary: { ...raw },
        additionalSources: [],
      });
    }

    const uniqueCandidates = Array.from(mergedCandidates.values());
    let officialWebsitesCount = 0;
    const finalBusinesses: BusinessRecord[] = [];

    // Process & enrich each unique business record
    for (const item of uniqueCandidates) {
      const raw = item.primary;
      const bizId = 'biz_' + Math.random().toString(36).substring(2, 11);
      const niche = AUSTRALIAN_NICHES.find((n) => n.id === raw.nicheId) || AUSTRALIAN_NICHES[0];
      const normDomain = normalizeDomain(raw.website);
      const now = new Date().toISOString();

      if (raw.website) officialWebsitesCount++;

      // Check suppression
      const isSuppressed = (normDomain && suppressedSet.has(normDomain))
        || (raw.email && suppressedSet.has(raw.email.toLowerCase()))
        || (raw.phone && suppressedSet.has(raw.phone.replace(/[^\d+]/g, '')))
        || suppressedSet.has(raw.name.toLowerCase());

      // Multi-Source provenance tracking
      const sources: SourceRecord[] = [
        {
          sourceName: raw.source,
          sourceUrl: raw.sourceUrl,
          discoveredAt: now,
          enrichedAt: null,
          status: 'verified',
          fieldsProvided: ['name', ...(raw.address ? ['address'] : []), ...(raw.phone ? ['phone'] : []), ...(raw.website ? ['website'] : []), ...(raw.email ? ['email'] : [])],
        },
      ];

      for (const add of item.additionalSources) {
        if (!sources.some((s) => s.sourceName === add.source)) {
          sources.push({
            sourceName: add.source,
            sourceUrl: add.sourceUrl,
            discoveredAt: now,
            enrichedAt: null,
            status: 'verified',
            fieldsProvided: [
              ...(add.raw.phone ? ['phone'] : []),
              ...(add.raw.website ? ['website'] : []),
              ...(add.raw.email ? ['email'] : []),
              ...(add.raw.address ? ['address'] : []),
            ],
          });
        }
      }

      const attemptedSources: string[] = sources.map((s) => s.sourceName);

      // Fast website audit / crawl if website exists
      let auditResult = null;
      let emailFound = raw.email;
      let emailStatus: BusinessRecord['emailStatus'] = emailFound ? 'public_source' : 'unknown';
      let phoneFound = raw.phone;
      let bookingUrlFound = raw.bookingUrl;
      let contactPageUrlFound = raw.contactPageUrl || null;
      let socialProfilesFound = raw.socialProfiles || [];

      if (raw.website) {
        try {
          auditResult = await auditBusinessWebsite(bizId, raw.website);
          attemptedSources.push('Website Auditor');

          if (auditResult.detectedEmails.length > 0 && !emailFound) {
            emailFound = auditResult.detectedEmails[0];
            emailStatus = 'official_website';
          }
          if (auditResult.detectedPhones.length > 0 && !phoneFound) {
            phoneFound = auditResult.detectedPhones[0];
          }
          if (auditResult.contactPageUrl && !contactPageUrlFound) {
            contactPageUrlFound = auditResult.contactPageUrl;
          }
          if (auditResult.detectedBookingSystems.length > 0 && !bookingUrlFound) {
            bookingUrlFound = auditResult.detectedBookingSystems[0];
          }
          if (auditResult.detectedSocialProfiles && auditResult.detectedSocialProfiles.length > 0) {
            socialProfilesFound = auditResult.detectedSocialProfiles;
          }

          sources.push({
            sourceName: 'Official Website Auditor',
            sourceUrl: raw.website,
            discoveredAt: now,
            enrichedAt: now,
            status: auditResult.success ? 'enriched' : 'inconclusive',
            error: auditResult.errorMessage,
            fieldsProvided: [
              ...(auditResult.detectedEmails.length > 0 ? ['email'] : []),
              ...(auditResult.detectedPhones.length > 0 ? ['phone'] : []),
              ...(auditResult.contactPageUrl ? ['contactPageUrl'] : []),
              ...(socialProfilesFound.length > 0 ? ['socialProfiles'] : []),
            ],
          });
        } catch {
          // Never lose a lead due to website audit failure!
        }
      }

      // Build Field-Level Evidence Mapping
      const fieldEvidence: Record<string, FieldEvidence> = {
        name: {
          field: 'name',
          value: raw.name,
          sourceName: raw.source,
          sourceUrl: raw.sourceUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        },
        address: {
          field: 'address',
          value: raw.address || `${raw.city} ${raw.state}`,
          sourceName: raw.source,
          sourceUrl: raw.sourceUrl,
          confidence: raw.address ? 'High' : 'Medium',
          verifiedStatus: raw.address ? 'verified' : 'unverified',
          timestamp: now,
        },
      };

      if (phoneFound) {
        fieldEvidence.phone = {
          field: 'phone',
          value: normalizePhone(phoneFound),
          sourceName: auditResult?.detectedPhones.includes(phoneFound) ? 'Official Website Auditor' : raw.source,
          sourceUrl: auditResult?.detectedPhones.includes(phoneFound) ? raw.website : raw.sourceUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      } else {
        fieldEvidence.phone = {
          field: 'phone',
          value: null,
          sourceName: 'None',
          sourceUrl: null,
          confidence: 'Low',
          verifiedStatus: 'missing',
          timestamp: now,
        };
      }

      if (emailFound) {
        fieldEvidence.email = {
          field: 'email',
          value: emailFound,
          sourceName: emailStatus === 'official_website' ? 'Official Website Auditor' : raw.source,
          sourceUrl: emailStatus === 'official_website' ? raw.website : raw.sourceUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      } else {
        fieldEvidence.email = {
          field: 'email',
          value: null,
          sourceName: 'None',
          sourceUrl: null,
          confidence: 'Low',
          verifiedStatus: 'missing',
          timestamp: now,
        };
      }

      if (raw.website) {
        fieldEvidence.website = {
          field: 'website',
          value: raw.website,
          sourceName: raw.source,
          sourceUrl: raw.sourceUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      } else {
        fieldEvidence.website = {
          field: 'website',
          value: null,
          sourceName: 'None',
          sourceUrl: null,
          confidence: 'Low',
          verifiedStatus: 'missing',
          timestamp: now,
        };
      }

      if (bookingUrlFound) {
        fieldEvidence.bookingUrl = {
          field: 'bookingUrl',
          value: bookingUrlFound,
          sourceName: auditResult ? 'Official Website Auditor' : raw.source,
          sourceUrl: raw.website || raw.sourceUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      }

      if (socialProfilesFound.length > 0) {
        fieldEvidence.socialProfiles = {
          field: 'socialProfiles',
          value: socialProfilesFound.filter((s) => s.status === 'verified').map((s) => s.platform),
          sourceName: 'Official Website Auditor',
          sourceUrl: raw.website,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      }

      // Calculate missing fields
      const missingFields: string[] = [];
      if (!phoneFound) missingFields.push('phone');
      if (!emailFound) missingFields.push('email');
      if (!raw.website) missingFields.push('website');
      if (!bookingUrlFound) missingFields.push('bookingUrl');

      // Determine enrichment status
      let enrichmentStatus: BusinessRecord['enrichmentStatus'] = 'pending';
      if (auditResult?.success && (emailFound || phoneFound)) {
        enrichmentStatus = 'enriched';
      } else if (emailFound || phoneFound || raw.website) {
        enrichmentStatus = 'partial';
      } else {
        enrichmentStatus = 'pending';
      }

      // Score lead
      const scoreResult = calculateOpportunityScore({
        id: bizId,
        name: raw.name,
        nicheId: raw.nicheId,
        category: niche.category,
        websiteUrl: raw.website,
        phone: phoneFound,
        email: emailFound,
        businessHours: raw.businessHours,
        bookingUrl: bookingUrlFound,
        city: raw.city,
        state: raw.state,
        audit: auditResult,
      });

      // Filter by min score if specified
      if (query.minScore && scoreResult.score < query.minScore) {
        excludedReasons['Opportunity score below threshold'] = (excludedReasons['Opportunity score below threshold'] || 0) + 1;
        continue;
      }

      const bizRecord: BusinessRecord = {
        id: bizId,
        name: raw.name,
        nicheId: niche.id,
        nicheName: niche.name,
        category: niche.category,
        websiteUrl: raw.website,
        normalizedDomain: normDomain,
        address: raw.address,
        suburb: raw.suburb,
        city: raw.city,
        state: raw.state,
        postcode: raw.postcode,
        phone: normalizePhone(phoneFound),
        email: emailFound,
        contactPageUrl: contactPageUrlFound,
        socialProfiles: socialProfilesFound,
        sources,
        fieldEvidence,
        enrichmentStatus,
        missingFields,
        attemptedSources,
        emailStatus,
        bookingUrl: bookingUrlFound,
        businessHours: raw.businessHours,
        latitude: raw.latitude,
        longitude: raw.longitude,
        source: raw.source,
        sourceUrl: raw.sourceUrl,
        dataConfidence: scoreResult.confidence,
        websiteStatus: raw.website ? (auditResult?.success ? 'verified' : 'accessible') : 'none',
        opportunityScore: scoreResult.score,
        scoreBand: scoreResult.band,
        status: 'New',
        notes: null,
        tags: [niche.categoryLabel],
        isSaved: false,
        isSuppressed: Boolean(isSuppressed),
        createdAt: now,
        updatedAt: now,
        lastAuditedAt: auditResult ? now : null,
      };

      // Persist to DB
      try {
        db.prepare(`
          INSERT INTO businesses (
            id, name, niche_id, niche_name, category, website_url, normalized_domain,
            contact_page_url, social_profiles, sources_json, evidence_json, enrichment_status,
            missing_fields_json, attempted_sources_json,
            address, suburb, city, state, postcode, phone, email, email_status,
            booking_url, business_hours, latitude, longitude, source, source_url,
            data_confidence, website_status, opportunity_score, score_band, status,
            notes, tags, is_saved, is_suppressed, created_at, updated_at, last_audited_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          bizRecord.id, bizRecord.name, bizRecord.nicheId, bizRecord.nicheName, bizRecord.category,
          bizRecord.websiteUrl, bizRecord.normalizedDomain,
          bizRecord.contactPageUrl, JSON.stringify(bizRecord.socialProfiles),
          JSON.stringify(bizRecord.sources), JSON.stringify(bizRecord.fieldEvidence),
          bizRecord.enrichmentStatus, JSON.stringify(bizRecord.missingFields),
          JSON.stringify(bizRecord.attemptedSources),
          bizRecord.address, bizRecord.suburb,
          bizRecord.city, bizRecord.state, bizRecord.postcode, bizRecord.phone, bizRecord.email,
          bizRecord.emailStatus, bizRecord.bookingUrl, bizRecord.businessHours, bizRecord.latitude,
          bizRecord.longitude, bizRecord.source, bizRecord.sourceUrl, bizRecord.dataConfidence,
          bizRecord.websiteStatus, bizRecord.opportunityScore, bizRecord.scoreBand, bizRecord.status,
          bizRecord.notes, JSON.stringify(bizRecord.tags), bizRecord.isSaved ? 1 : 0,
          bizRecord.isSuppressed ? 1 : 0, bizRecord.createdAt, bizRecord.updatedAt, bizRecord.lastAuditedAt
        );

        // Store score breakdown
        db.prepare(`
          INSERT INTO opportunity_scores (
            id, business_id, score, band, confidence,
            industry_fit, appointment_call_fit, operational_complexity,
            automation_opportunity, evidence_confidence, positive_signals,
            negative_signals, missing_info, suggested_service, suggested_angle,
            concise_explanation, scored_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          scoreResult.id, scoreResult.businessId, scoreResult.score, scoreResult.band, scoreResult.confidence,
          scoreResult.scoreBreakdown.industryFit, scoreResult.scoreBreakdown.appointmentCallFit,
          scoreResult.scoreBreakdown.operationalComplexity, scoreResult.scoreBreakdown.automationOpportunity,
          scoreResult.scoreBreakdown.evidenceConfidence, JSON.stringify(scoreResult.positiveSignals),
          JSON.stringify(scoreResult.negativeSignals), JSON.stringify(scoreResult.missingInformation),
          scoreResult.suggestedService, scoreResult.suggestedAngle, scoreResult.conciseExplanation, scoreResult.scoredAt
        );

        // Store audit if ran
        if (auditResult) {
          db.prepare(`
            INSERT INTO website_audits (
              id, business_id, url, http_status, is_https, response_time_ms,
              title, meta_description, detected_booking_systems, has_phone_prominence,
              has_after_hours_emergency, has_contact_form, detected_emails,
              detected_phones, multi_practitioner_signals, faq_count,
              audit_evidence, success, error_message, audited_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            auditResult.id, auditResult.businessId, auditResult.url, auditResult.httpStatus,
            auditResult.isHttps ? 1 : 0, auditResult.responseTimeMs, auditResult.title,
            auditResult.metaDescription, JSON.stringify(auditResult.detectedBookingSystems),
            auditResult.hasPhoneProminence ? 1 : 0, auditResult.hasAfterHoursOrEmergency ? 1 : 0,
            auditResult.hasContactForm ? 1 : 0, JSON.stringify(auditResult.detectedEmails),
            JSON.stringify(auditResult.detectedPhones), JSON.stringify(auditResult.multiPractitionerSignals),
            auditResult.faqCount, JSON.stringify(auditResult.auditEvidence),
            auditResult.success ? 1 : 0, auditResult.errorMessage, auditResult.auditedAt
          );
        }

        // Store contact records with provenance
        if (bizRecord.phone) {
          db.prepare(`
            INSERT INTO business_contacts (id, business_id, contact_type, contact_value, source_url, provenance, status, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            'cnt_' + Math.random().toString(36).substring(2, 9),
            bizRecord.id, 'phone', bizRecord.phone, bizRecord.sourceUrl, bizRecord.source, 'verified', 'High', now
          );
        }
        if (bizRecord.email) {
          db.prepare(`
            INSERT INTO business_contacts (id, business_id, contact_type, contact_value, source_url, provenance, status, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            'cnt_' + Math.random().toString(36).substring(2, 9),
            bizRecord.id, 'email', bizRecord.email, bizRecord.websiteUrl, bizRecord.emailStatus === 'official_website' ? 'official_website' : 'public_source', 'valid_syntax', 'Medium', now
          );
        }
      } catch (err: any) {
        console.error('Failed to insert business record:', err);
      }

      finalBusinesses.push(bizRecord);
    }

    const executionTimeMs = Date.now() - startTime;
    const leadsExcluded = Object.entries(excludedReasons).map(([reason, count]) => ({ reason, count }));

    const diagnostics: DiscoveryDiagnostics = {
      configuredProviders,
      reachableProviders,
      queriesExecuted: totalQueries,
      rawRecordsReturned: allRawRecords.length,
      uniqueBusinessesRetained: finalBusinesses.length,
      officialWebsitesFound: officialWebsitesCount,
      leadsQualified: finalBusinesses.filter((b) => b.opportunityScore >= 60).length,
      leadsExcluded,
      providerErrors,
      executionTimeMs,
    };

    // Store discovery run in DB
    try {
      db.prepare(`
        INSERT INTO discovery_runs (
          id, niche_ids, state, city, suburb, postcode, provider,
          query_count, raw_count, retained_count, qualified_count,
          status, error_message, diagnostics_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId, JSON.stringify(query.nicheIds), query.state, query.city, query.suburb || null,
        query.postcode || null, configuredProviders.join(', '), totalQueries, allRawRecords.length,
        finalBusinesses.length, diagnostics.leadsQualified,
        finalBusinesses.length > 0 ? 'COMPLETED' : (providerErrors.length > 0 ? 'FAILED' : 'NO_RESULTS'),
        providerErrors.length > 0 ? providerErrors.map((e) => `${e.provider}: ${e.message}`).join(' | ') : null,
        JSON.stringify(diagnostics), new Date().toISOString()
      );
    } catch (err) {
      console.error('Failed to record discovery run:', err);
    }

    return { businesses: finalBusinesses, diagnostics };
  }

  /**
   * Multi-source lead re-enrichment workflow:
   * Works for businesses WITH or WITHOUT a website!
   * Never discards existing verified details; merges new evidence cleanly.
   */
  async enrichLead(businessId: string): Promise<{
    business: BusinessRecord;
    message: string;
    newFieldsFound: string[];
  }> {
    const bizRow = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId) as any;
    if (!bizRow) {
      throw new Error('Business record not found');
    }

    const now = new Date().toISOString();
    const existingSources: SourceRecord[] = JSON.parse(bizRow.sources_json || '[]');
    const existingEvidence: Record<string, FieldEvidence> = JSON.parse(bizRow.evidence_json || '{}');
    const existingAttempted: string[] = JSON.parse(bizRow.attempted_sources_json || '[]');
    let currentSocials = JSON.parse(bizRow.social_profiles || '[]');

    let updatedPhone = bizRow.phone;
    let updatedEmail = bizRow.email;
    let updatedWebsite = bizRow.website_url;
    let updatedContactPage = bizRow.contact_page_url;
    let updatedBooking = bizRow.booking_url;
    let updatedHours = bizRow.business_hours;

    const newFieldsFound: string[] = [];

    // Case A: Business already has a website URL -> Run Ethical Multi-Page Web Crawler
    if (updatedWebsite) {
      const crawlRes = await crawlBusinessWebsite(updatedWebsite, 4);
      if (!existingAttempted.includes('Controlled Website Crawler')) {
        existingAttempted.push('Controlled Website Crawler');
      }

      existingSources.push({
        sourceName: 'Controlled Website Crawler',
        sourceUrl: crawlRes.startUrl,
        discoveredAt: now,
        enrichedAt: now,
        status: crawlRes.pagesCrawled.length > 0 ? 'enriched' : 'inconclusive',
        fieldsProvided: [
          ...(crawlRes.discoveredPhones.length > 0 ? ['phone'] : []),
          ...(crawlRes.discoveredEmails.length > 0 ? ['email'] : []),
          ...(crawlRes.contactPageUrl ? ['contactPageUrl'] : []),
          ...(crawlRes.bookingUrl ? ['bookingUrl'] : []),
          ...(crawlRes.discoveredSocials.length > 0 ? ['socialProfiles'] : []),
        ],
        error: crawlRes.errors.length > 0 ? crawlRes.errors.join('; ') : null,
      });

      // Merge newly discovered contact details
      if (crawlRes.discoveredPhones.length > 0 && !updatedPhone) {
        updatedPhone = crawlRes.discoveredPhones[0].phone;
        newFieldsFound.push('phone');
        existingEvidence.phone = {
          field: 'phone',
          value: normalizePhone(updatedPhone),
          sourceName: 'Controlled Website Crawler',
          sourceUrl: crawlRes.discoveredPhones[0].sourceUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      }

      if (crawlRes.discoveredEmails.length > 0 && !updatedEmail) {
        updatedEmail = crawlRes.discoveredEmails[0].email;
        newFieldsFound.push('email');
        existingEvidence.email = {
          field: 'email',
          value: updatedEmail,
          sourceName: 'Controlled Website Crawler',
          sourceUrl: crawlRes.discoveredEmails[0].sourceUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      }

      if (crawlRes.contactPageUrl && !updatedContactPage) {
        updatedContactPage = crawlRes.contactPageUrl;
        newFieldsFound.push('contactPageUrl');
      }

      if (crawlRes.bookingUrl && !updatedBooking) {
        updatedBooking = crawlRes.bookingUrl;
        newFieldsFound.push('bookingUrl');
        existingEvidence.bookingUrl = {
          field: 'bookingUrl',
          value: updatedBooking,
          sourceName: 'Controlled Website Crawler',
          sourceUrl: crawlRes.bookingUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      }

      if (crawlRes.businessHours && !updatedHours) {
        updatedHours = crawlRes.businessHours;
        newFieldsFound.push('businessHours');
      }

      if (crawlRes.discoveredSocials.length > 0) {
        currentSocials = crawlRes.discoveredSocials;
        newFieldsFound.push('socialProfiles');
        existingEvidence.socialProfiles = {
          field: 'socialProfiles',
          value: crawlRes.discoveredSocials.map((s) => s.platform),
          sourceName: 'Controlled Website Crawler',
          sourceUrl: crawlRes.startUrl,
          confidence: 'High',
          verifiedStatus: 'verified',
          timestamp: now,
        };
      }
    } else {
      // Case B: Business has NO website URL -> Search directory & web indexes by business name & city!
      if (!existingAttempted.includes('Public Web Search & Directory Index')) {
        existingAttempted.push('Public Web Search & Directory Index');
      }

      const searchProvider = new PublicWebSearchProvider();
      const searchRes = await searchProvider.search({
        nicheIds: [bizRow.niche_id],
        businessName: bizRow.name,
        city: bizRow.city,
        state: bizRow.state,
      });

      if (searchRes.records.length > 0) {
        const found = searchRes.records[0];
        if (found.website && !updatedWebsite) {
          updatedWebsite = found.website;
          newFieldsFound.push('website');
          existingEvidence.website = {
            field: 'website',
            value: updatedWebsite,
            sourceName: 'Public Web Search',
            sourceUrl: found.sourceUrl,
            confidence: 'Medium',
            verifiedStatus: 'review_required',
            timestamp: now,
          };
        }
        if (found.phone && !updatedPhone) {
          updatedPhone = found.phone;
          newFieldsFound.push('phone');
          existingEvidence.phone = {
            field: 'phone',
            value: normalizePhone(updatedPhone),
            sourceName: 'Public Web Search',
            sourceUrl: found.sourceUrl,
            confidence: 'Medium',
            verifiedStatus: 'review_required',
            timestamp: now,
          };
        }
        if (found.email && !updatedEmail) {
          updatedEmail = found.email;
          newFieldsFound.push('email');
          existingEvidence.email = {
            field: 'email',
            value: updatedEmail,
            sourceName: 'Public Web Search',
            sourceUrl: found.sourceUrl,
            confidence: 'Medium',
            verifiedStatus: 'review_required',
            timestamp: now,
          };
        }

        existingSources.push({
          sourceName: 'Public Web Search & Index',
          sourceUrl: found.sourceUrl,
          discoveredAt: now,
          enrichedAt: now,
          status: 'enriched',
          fieldsProvided: newFieldsFound,
        });
      } else {
        existingSources.push({
          sourceName: 'Public Web Search & Index',
          sourceUrl: null,
          discoveredAt: now,
          enrichedAt: now,
          status: 'inconclusive',
          fieldsProvided: [],
          error: 'No matching online directory profile located for this business name in this region.',
        });
      }
    }

    // Recalculate missing fields
    const missingFields: string[] = [];
    if (!updatedPhone) missingFields.push('phone');
    if (!updatedEmail) missingFields.push('email');
    if (!updatedWebsite) missingFields.push('website');
    if (!updatedBooking) missingFields.push('bookingUrl');

    const enrichmentStatus = (updatedEmail || updatedPhone) && updatedWebsite
      ? 'enriched'
      : (updatedEmail || updatedPhone || updatedWebsite ? 'partial' : 'inconclusive');

    // Recalculate score
    const newScore = calculateOpportunityScore({
      id: bizRow.id,
      name: bizRow.name,
      nicheId: bizRow.niche_id,
      category: bizRow.category,
      websiteUrl: updatedWebsite,
      phone: updatedPhone,
      email: updatedEmail,
      businessHours: updatedHours,
      bookingUrl: updatedBooking,
      city: bizRow.city,
      state: bizRow.state,
      audit: null,
    });

    // Update database
    db.prepare(`
      UPDATE businesses
      SET phone = ?,
          email = ?,
          website_url = ?,
          normalized_domain = ?,
          contact_page_url = ?,
          booking_url = ?,
          business_hours = ?,
          social_profiles = ?,
          sources_json = ?,
          evidence_json = ?,
          enrichment_status = ?,
          missing_fields_json = ?,
          attempted_sources_json = ?,
          opportunity_score = ?,
          score_band = ?,
          data_confidence = ?,
          website_status = ?,
          last_audited_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      updatedPhone ? normalizePhone(updatedPhone) : null,
      updatedEmail,
      updatedWebsite,
      normalizeDomain(updatedWebsite),
      updatedContactPage,
      updatedBooking,
      updatedHours,
      JSON.stringify(currentSocials),
      JSON.stringify(existingSources),
      JSON.stringify(existingEvidence),
      enrichmentStatus,
      JSON.stringify(missingFields),
      JSON.stringify(existingAttempted),
      newScore.score,
      newScore.band,
      newScore.confidence,
      updatedWebsite ? 'verified' : 'none',
      now,
      now,
      businessId
    );

    const updatedBizRow = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId) as any;
    const finalBusinessRecord: BusinessRecord = {
      ...updatedBizRow,
      tags: JSON.parse(updatedBizRow.tags || '[]'),
      socialProfiles: JSON.parse(updatedBizRow.social_profiles || '[]'),
      sources: JSON.parse(updatedBizRow.sources_json || '[]'),
      fieldEvidence: JSON.parse(updatedBizRow.evidence_json || '{}'),
      missingFields: JSON.parse(updatedBizRow.missing_fields_json || '[]'),
      attemptedSources: JSON.parse(updatedBizRow.attempted_sources_json || '[]'),
      contactPageUrl: updatedBizRow.contact_page_url,
      isSaved: Boolean(updatedBizRow.is_saved),
      isSuppressed: Boolean(updatedBizRow.is_suppressed),
      nicheId: updatedBizRow.niche_id,
      nicheName: updatedBizRow.niche_name,
      websiteUrl: updatedBizRow.website_url,
      normalizedDomain: updatedBizRow.normalized_domain,
      emailStatus: updatedBizRow.email_status,
      bookingUrl: updatedBizRow.booking_url,
      businessHours: updatedBizRow.business_hours,
      sourceUrl: updatedBizRow.source_url,
      dataConfidence: updatedBizRow.data_confidence,
      websiteStatus: updatedBizRow.website_status,
      opportunityScore: updatedBizRow.opportunity_score,
      scoreBand: updatedBizRow.score_band,
      createdAt: updatedBizRow.created_at,
      updatedAt: updatedBizRow.updated_at,
      lastAuditedAt: updatedBizRow.last_audited_at,
    };

    const message = newFieldsFound.length > 0
      ? `Multi-source enrichment succeeded: Discovered ${newFieldsFound.join(', ')}.`
      : 'Enrichment complete: Current contact channels and source evidence confirmed.';

    return {
      business: finalBusinessRecord,
      message,
      newFieldsFound,
    };
  }
}

export const discoveryManager = new DiscoveryManager();
