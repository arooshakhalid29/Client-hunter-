import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from './server/db.js';
import { discoveryManager, normalizeDomain, normalizePhone } from './server/providers/manager.js';
import { AUSTRALIAN_NICHES, AUSTRALIAN_CITIES } from './server/niches.js';
import { auditBusinessWebsite } from './server/enrichment/website-auditor.js';
import { calculateOpportunityScore } from './server/enrichment/scoring-engine.js';
import { generateOutreachDraft } from './server/outreach/generator.js';
import { sendOutreach } from './server/outreach/mailer.js';
import { processCsvImport, exportLeadsToCsv } from './server/csv/csv-service.js';
import { runAcceptanceTests } from './server/tests/test-runner.js';
import { BusinessRecord } from './server/types.js';
import { hubspotService, HubSpotCompanyItem } from './server/integrations/hubspot.js';
import { hunterService, HunterDomainSearchResult } from './server/integrations/hunter.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      platform: 'Nexamor ClientHunter AI',
    });
  });

  // Niches & Locations
  app.get('/api/niches', (_req: Request, res: Response) => {
    res.json(AUSTRALIAN_NICHES);
  });

  app.get('/api/locations', (_req: Request, res: Response) => {
    res.json(AUSTRALIAN_CITIES);
  });

  // Discovery search
  app.post('/api/discovery/search', async (req: Request, res: Response) => {
    try {
      const {
        nicheIds = [],
        state = 'NSW',
        city = 'Sydney',
        suburb,
        postcode,
        businessName,
        radiusKm = 25,
        limit = 20,
        minScore,
        requireWebsite,
        requirePhone,
        requireEmail,
        excludeSaved,
      } = req.body;

      const result = await discoveryManager.runDiscovery({
        nicheIds,
        state,
        city,
        suburb,
        postcode,
        businessName,
        radiusKm: Number(radiusKm),
        limit: Number(limit),
        minScore: minScore ? Number(minScore) : undefined,
        requireWebsite: Boolean(requireWebsite),
        requirePhone: Boolean(requirePhone),
        requireEmail: Boolean(requireEmail),
        excludeSaved: Boolean(excludeSaved),
      });

      res.json(result);
    } catch (err: any) {
      console.error('Discovery error:', err);
      res.status(500).json({ error: err.message || 'Discovery search failed' });
    }
  });

  // Discovery diagnostics
  app.get('/api/discovery/diagnostics', async (_req: Request, res: Response) => {
    try {
      const diag = await discoveryManager.getDiagnostics();
      res.json(diag);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Discovery runs
  app.get('/api/discovery/runs', (_req: Request, res: Response) => {
    try {
      const runs = db.prepare('SELECT * FROM discovery_runs ORDER BY created_at DESC LIMIT 20').all();
      res.json(runs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Leads list
  app.get('/api/leads', (req: Request, res: Response) => {
    try {
      const {
        status,
        nicheId,
        state,
        city,
        search,
        savedOnly,
        minScore,
        scoreBand,
        source,
        contactCompleteness,
        socialPlatform,
        enrichmentStatus,
        sort = 'score_desc',
        limit = 100,
        offset = 0,
      } = req.query;

      let query = 'SELECT * FROM businesses WHERE 1=1';
      const params: any[] = [];

      if (savedOnly === 'true') {
        query += ' AND is_saved = 1';
      }
      if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }
      if (nicheId && nicheId !== 'all') {
        query += ' AND niche_id = ?';
        params.push(nicheId);
      }
      if (state && state !== 'all') {
        query += ' AND state = ?';
        params.push(state);
      }
      if (city && city !== 'all') {
        query += ' AND city LIKE ?';
        params.push(`%${city}%`);
      }
      if (scoreBand && scoreBand !== 'all') {
        query += ' AND score_band = ?';
        params.push(scoreBand);
      }
      if (minScore) {
        query += ' AND opportunity_score >= ?';
        params.push(Number(minScore));
      }
      if (source && source !== 'all') {
        query += ' AND (source LIKE ? OR sources_json LIKE ?)';
        params.push(`%${source}%`, `%${source}%`);
      }
      if (enrichmentStatus && enrichmentStatus !== 'all') {
        query += ' AND enrichment_status = ?';
        params.push(enrichmentStatus);
      }
      if (contactCompleteness && contactCompleteness !== 'all') {
        if (contactCompleteness === 'has_phone') {
          query += ' AND phone IS NOT NULL AND phone != ""';
        } else if (contactCompleteness === 'has_email') {
          query += ' AND email IS NOT NULL AND email != ""';
        } else if (contactCompleteness === 'has_both') {
          query += ' AND phone IS NOT NULL AND phone != "" AND email IS NOT NULL AND email != ""';
        } else if (contactCompleteness === 'no_contacts') {
          query += ' AND (phone IS NULL OR phone = "") AND (email IS NULL OR email = "")';
        }
      }
      if (socialPlatform && socialPlatform !== 'all') {
        if (socialPlatform === 'any') {
          query += ' AND social_profiles LIKE "%\\"status\\":\\"verified\\"%"';
        } else if (socialPlatform === 'none') {
          query += ' AND (social_profiles NOT LIKE "%\\"status\\":\\"verified\\"%" OR social_profiles IS NULL)';
        } else {
          query += ' AND social_profiles LIKE ? AND social_profiles LIKE "%\\"status\\":\\"verified\\"%"';
          params.push(`%"platform":"${socialPlatform}"%`);
        }
      }
      if (search) {
        query += ' AND (name LIKE ? OR address LIKE ? OR phone LIKE ? OR email LIKE ? OR normalized_domain LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term, term, term);
      }

      // Sorting
      if (sort === 'score_desc') {
        query += ' ORDER BY opportunity_score DESC, created_at DESC';
      } else if (sort === 'score_asc') {
        query += ' ORDER BY opportunity_score ASC, created_at DESC';
      } else if (sort === 'name_asc') {
        query += ' ORDER BY name ASC';
      } else {
        query += ' ORDER BY created_at DESC';
      }

      query += ' LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));

      const rows = db.prepare(query).all(...params) as any[];
      const businesses = rows.map((r) => ({
        ...r,
        tags: JSON.parse(r.tags || '[]'),
        socialProfiles: JSON.parse(r.social_profiles || '[]'),
        sources: JSON.parse(r.sources_json || '[]'),
        fieldEvidence: JSON.parse(r.evidence_json || '{}'),
        enrichmentStatus: r.enrichment_status || 'pending',
        missingFields: JSON.parse(r.missing_fields_json || '[]'),
        attemptedSources: JSON.parse(r.attempted_sources_json || '[]'),
        contactPageUrl: r.contact_page_url,
        isSaved: Boolean(r.is_saved),
        isSuppressed: Boolean(r.is_suppressed),
        nicheId: r.niche_id,
        nicheName: r.niche_name,
        websiteUrl: r.website_url,
        normalizedDomain: r.normalized_domain,
        emailStatus: r.email_status,
        bookingUrl: r.booking_url,
        businessHours: r.business_hours,
        sourceUrl: r.source_url,
        dataConfidence: r.data_confidence,
        websiteStatus: r.website_status,
        opportunityScore: r.opportunity_score,
        scoreBand: r.score_band,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        lastAuditedAt: r.last_audited_at,
      }));

      res.json(businesses);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Single Lead details
  app.get('/api/leads/:id', (req: Request, res: Response) => {
    try {
      const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id) as any;
      if (!biz) {
        return res.status(404).json({ error: 'Business not found' });
      }

      const score = db.prepare('SELECT * FROM opportunity_scores WHERE business_id = ? ORDER BY scored_at DESC LIMIT 1').get(req.params.id) as any;
      const audit = db.prepare('SELECT * FROM website_audits WHERE business_id = ? ORDER BY audited_at DESC LIMIT 1').get(req.params.id) as any;
      const contacts = db.prepare('SELECT * FROM business_contacts WHERE business_id = ?').all(req.params.id) as any[];
      const drafts = db.prepare('SELECT * FROM outreach_drafts WHERE business_id = ? ORDER BY created_at DESC').all(req.params.id) as any[];
      const statusHistory = db.prepare('SELECT * FROM lead_status_history WHERE business_id = ? ORDER BY changed_at DESC').all(req.params.id) as any[];
      const tasks = db.prepare('SELECT * FROM follow_up_tasks WHERE business_id = ? ORDER BY due_date ASC').all(req.params.id) as any[];

      const scoreResult = score ? {
        id: score.id,
        businessId: score.business_id,
        score: score.score,
        band: score.band,
        confidence: score.confidence,
        scoreBreakdown: {
          industryFit: score.industry_fit,
          appointmentCallFit: score.appointment_call_fit,
          operationalComplexity: score.operational_complexity,
          automationOpportunity: score.automation_opportunity,
          evidenceConfidence: score.evidence_confidence,
        },
        positiveSignals: JSON.parse(score.positive_signals || '[]'),
        negativeSignals: JSON.parse(score.negative_signals || '[]'),
        missingInformation: JSON.parse(score.missing_info || '[]'),
        suggestedService: score.suggested_service,
        suggestedAngle: score.suggested_angle,
        conciseExplanation: score.concise_explanation,
        scoredAt: score.scored_at,
      } : null;

      const auditResult = audit ? {
        id: audit.id,
        businessId: audit.business_id,
        url: audit.url,
        httpStatus: audit.http_status,
        isHttps: Boolean(audit.is_https),
        responseTimeMs: audit.response_time_ms,
        title: audit.title,
        metaDescription: audit.meta_description,
        detectedBookingSystems: JSON.parse(audit.detected_booking_systems || '[]'),
        hasPhoneProminence: Boolean(audit.has_phone_prominence),
        hasAfterHoursOrEmergency: Boolean(audit.has_after_hours_emergency),
        hasContactForm: Boolean(audit.has_contact_form),
        detectedEmails: JSON.parse(audit.detected_emails || '[]'),
        detectedPhones: JSON.parse(audit.detected_phones || '[]'),
        multiPractitionerSignals: JSON.parse(audit.multi_practitioner_signals || '[]'),
        faqCount: audit.faq_count,
        auditEvidence: JSON.parse(audit.audit_evidence || '[]'),
        success: Boolean(audit.success),
        errorMessage: audit.error_message,
        auditedAt: audit.audited_at,
      } : null;

      res.json({
        business: {
          ...biz,
          tags: JSON.parse(biz.tags || '[]'),
          socialProfiles: JSON.parse(biz.social_profiles || '[]'),
          sources: JSON.parse(biz.sources_json || '[]'),
          fieldEvidence: JSON.parse(biz.evidence_json || '{}'),
          enrichmentStatus: biz.enrichment_status || 'pending',
          missingFields: JSON.parse(biz.missing_fields_json || '[]'),
          attemptedSources: JSON.parse(biz.attempted_sources_json || '[]'),
          contactPageUrl: biz.contact_page_url,
          isSaved: Boolean(biz.is_saved),
          isSuppressed: Boolean(biz.is_suppressed),
          nicheId: biz.niche_id,
          nicheName: biz.niche_name,
          websiteUrl: biz.website_url,
          normalizedDomain: biz.normalized_domain,
          emailStatus: biz.email_status,
          bookingUrl: biz.booking_url,
          businessHours: biz.business_hours,
          sourceUrl: biz.source_url,
          dataConfidence: biz.data_confidence,
          websiteStatus: biz.website_status,
          opportunityScore: biz.opportunity_score,
          scoreBand: biz.score_band,
          createdAt: biz.created_at,
          updatedAt: biz.updated_at,
          lastAuditedAt: biz.last_audited_at,
        },
        score: scoreResult,
        audit: auditResult,
        contacts,
        drafts: drafts.map((d) => ({
          ...d,
          businessId: d.business_id,
          openingLine: d.opening_line,
          callToAction: d.call_to_action,
          isApproved: Boolean(d.is_approved),
          approvedAt: d.approved_at,
          sentAt: d.sent_at,
          deliveryStatus: d.delivery_status,
          providerMessageId: d.provider_message_id,
          createdAt: d.created_at,
        })),
        statusHistory,
        tasks,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update lead
  app.patch('/api/leads/:id', (req: Request, res: Response) => {
    try {
      const { status, notes, tags, isSaved, isSuppressed } = req.body;
      const current = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id) as any;
      if (!current) return res.status(404).json({ error: 'Business not found' });

      const now = new Date().toISOString();

      if (status && status !== current.status) {
        db.prepare('UPDATE businesses SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
        db.prepare(`
          INSERT INTO lead_status_history (id, business_id, previous_status, new_status, change_reason, changed_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          'hist_' + Math.random().toString(36).substring(2, 9),
          req.params.id, current.status, status, 'User updated status', now
        );
      }

      if (notes !== undefined) {
        db.prepare('UPDATE businesses SET notes = ?, updated_at = ? WHERE id = ?').run(notes, now, req.params.id);
      }

      if (tags !== undefined) {
        db.prepare('UPDATE businesses SET tags = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(tags), now, req.params.id);
      }

      if (isSaved !== undefined) {
        db.prepare('UPDATE businesses SET is_saved = ?, updated_at = ? WHERE id = ?').run(isSaved ? 1 : 0, now, req.params.id);
      }

      if (isSuppressed !== undefined) {
        db.prepare('UPDATE businesses SET is_suppressed = ?, updated_at = ? WHERE id = ?').run(isSuppressed ? 1 : 0, now, req.params.id);
        if (isSuppressed) {
          // Add to suppression list
          if (current.normalized_domain) {
            db.prepare('INSERT OR IGNORE INTO suppression_list (id, entity_type, entity_value, reason, added_at) VALUES (?, ?, ?, ?, ?)').run(
              'supp_' + Math.random().toString(36).substring(2, 9), 'domain', current.normalized_domain, 'Marked Do Not Contact', now
            );
          }
        }
      }

      const updated = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id) as any;
      res.json({
        ...updated,
        tags: JSON.parse(updated.tags || '[]'),
        isSaved: Boolean(updated.is_saved),
        isSuppressed: Boolean(updated.is_suppressed),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle Save Lead
  app.post('/api/leads/:id/save', (req: Request, res: Response) => {
    try {
      const current = db.prepare('SELECT is_saved FROM businesses WHERE id = ?').get(req.params.id) as any;
      if (!current) return res.status(404).json({ error: 'Business not found' });
      const newState = current.is_saved ? 0 : 1;
      const now = new Date().toISOString();
      db.prepare('UPDATE businesses SET is_saved = ?, updated_at = ? WHERE id = ?').run(newState, now, req.params.id);
      res.json({ isSaved: Boolean(newState) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger Website Audit
  app.post('/api/leads/:id/audit', async (req: Request, res: Response) => {
    try {
      const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id) as any;
      if (!biz) return res.status(404).json({ error: 'Business not found' });
      if (!biz.website_url) return res.status(400).json({ error: 'Business has no website registered' });

      const audit = await auditBusinessWebsite(biz.id, biz.website_url);

      // Persist audit
      db.prepare(`
        INSERT INTO website_audits (
          id, business_id, url, http_status, is_https, response_time_ms,
          title, meta_description, detected_booking_systems, has_phone_prominence,
          has_after_hours_emergency, has_contact_form, detected_emails,
          detected_phones, multi_practitioner_signals, faq_count,
          audit_evidence, success, error_message, audited_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        audit.id, audit.businessId, audit.url, audit.httpStatus,
        audit.isHttps ? 1 : 0, audit.responseTimeMs, audit.title,
        audit.metaDescription, JSON.stringify(audit.detectedBookingSystems),
        audit.hasPhoneProminence ? 1 : 0, audit.hasAfterHoursOrEmergency ? 1 : 0,
        audit.hasContactForm ? 1 : 0, JSON.stringify(audit.detectedEmails),
        JSON.stringify(audit.detectedPhones), JSON.stringify(audit.multiPractitionerSignals),
        audit.faqCount, JSON.stringify(audit.auditEvidence),
        audit.success ? 1 : 0, audit.errorMessage, audit.auditedAt
      );

      // Recalculate score with new audit data
      const newScore = calculateOpportunityScore({
        id: biz.id,
        name: biz.name,
        nicheId: biz.niche_id,
        category: biz.category,
        websiteUrl: biz.website_url,
        phone: biz.phone,
        email: biz.email,
        businessHours: biz.business_hours,
        bookingUrl: biz.booking_url,
        city: biz.city,
        state: biz.state,
        audit,
      });

      // Update business table with score & website status, contact page URL, and social profiles
      const emailToUpdate = biz.email || (audit.detectedEmails.length > 0 ? audit.detectedEmails[0] : null);
      const phoneToUpdate = biz.phone || (audit.detectedPhones.length > 0 ? audit.detectedPhones[0] : null);
      const contactPageToUpdate = audit.contactPageUrl || biz.contact_page_url || null;
      const socialProfilesToUpdate = JSON.stringify(audit.socialProfiles || []);

      db.prepare(`
        UPDATE businesses
        SET opportunity_score = ?, score_band = ?, data_confidence = ?,
            website_status = ?, last_audited_at = ?, updated_at = ?,
            email = COALESCE(?, email),
            phone = COALESCE(?, phone),
            contact_page_url = ?,
            social_profiles = ?
        WHERE id = ?
      `).run(
        newScore.score, newScore.band, newScore.confidence,
        audit.success ? 'verified' : 'accessible',
        audit.auditedAt, audit.auditedAt,
        emailToUpdate,
        phoneToUpdate,
        contactPageToUpdate,
        socialProfilesToUpdate,
        biz.id
      );

      // Save score record
      db.prepare(`
        INSERT INTO opportunity_scores (
          id, business_id, score, band, confidence,
          industry_fit, appointment_call_fit, operational_complexity,
          automation_opportunity, evidence_confidence, positive_signals,
          negative_signals, missing_info, suggested_service, suggested_angle,
          concise_explanation, scored_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newScore.id, newScore.businessId, newScore.score, newScore.band, newScore.confidence,
        newScore.scoreBreakdown.industryFit, newScore.scoreBreakdown.appointmentCallFit,
        newScore.scoreBreakdown.operationalComplexity, newScore.scoreBreakdown.automationOpportunity,
        newScore.scoreBreakdown.evidenceConfidence, JSON.stringify(newScore.positiveSignals),
        JSON.stringify(newScore.negativeSignals), JSON.stringify(newScore.missingInformation),
        newScore.suggestedService, newScore.suggestedAngle, newScore.conciseExplanation, newScore.scoredAt
      );

      const updatedBiz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(biz.id) as any;
      res.json({
        audit,
        score: newScore,
        business: {
          ...updatedBiz,
          tags: JSON.parse(updatedBiz.tags || '[]'),
          socialProfiles: JSON.parse(updatedBiz.social_profiles || '[]'),
          contactPageUrl: updatedBiz.contact_page_url,
          isSaved: Boolean(updatedBiz.is_saved),
          isSuppressed: Boolean(updatedBiz.is_suppressed),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Individual Lead Re-enrichment
  app.post('/api/leads/:id/enrich', async (req: Request, res: Response) => {
    try {
      const result = await discoveryManager.enrichLead(req.params.id);
      res.json({
        success: true,
        message: result.message,
        newFieldsFound: result.newFieldsFound,
        business: result.business,
      });
    } catch (err: any) {
      console.error('Lead enrichment error:', err);
      res.status(500).json({ error: err.message || 'Lead enrichment failed' });
    }
  });

  // Outreach generation
  app.post('/api/outreach/generate', async (req: Request, res: Response) => {
    try {
      const { businessId, channel = 'email', options } = req.body;
      const bizRow = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId) as any;
      if (!bizRow) return res.status(404).json({ error: 'Business not found' });

      const scoreRow = db.prepare('SELECT * FROM opportunity_scores WHERE business_id = ? ORDER BY scored_at DESC LIMIT 1').get(businessId) as any;
      const auditRow = db.prepare('SELECT * FROM website_audits WHERE business_id = ? ORDER BY audited_at DESC LIMIT 1').get(businessId) as any;

      const score = scoreRow ? {
        ...scoreRow,
        suggestedService: scoreRow.suggested_service,
        suggestedAngle: scoreRow.suggested_angle,
      } : null;

      const audit = auditRow ? {
        ...auditRow,
        detectedBookingSystems: JSON.parse(auditRow.detected_booking_systems || '[]'),
        hasPhoneProminence: Boolean(auditRow.has_phone_prominence),
        hasAfterHoursOrEmergency: Boolean(auditRow.has_after_hours_emergency),
      } : null;

      const draft = await generateOutreachDraft({
        business: {
          ...bizRow,
          isSuppressed: Boolean(bizRow.is_suppressed),
          nicheName: bizRow.niche_name,
          websiteUrl: bizRow.website_url,
        },
        score: score as any,
        audit: audit as any,
        channel,
        options,
      });

      res.json(draft);
    } catch (err: any) {
      console.error('Outreach generation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Save / Update customized draft (Subject, message content, approval status)
  app.patch('/api/outreach/:draftId', (req: Request, res: Response) => {
    try {
      const { subject, content, isApproved, channel } = req.body;
      const current = db.prepare('SELECT * FROM outreach_drafts WHERE id = ?').get(req.params.draftId) as any;
      if (!current) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      const updatedSubject = subject !== undefined ? subject : current.subject;
      const updatedContent = content !== undefined ? content : current.content;
      const updatedApproved = isApproved !== undefined ? (isApproved ? 1 : 0) : current.is_approved;
      const updatedChannel = channel !== undefined ? channel : current.channel;

      db.prepare(`
        UPDATE outreach_drafts
        SET subject = ?, content = ?, is_approved = ?, channel = ?
        WHERE id = ?
      `).run(updatedSubject, updatedContent, updatedApproved, updatedChannel, req.params.draftId);

      const updated = db.prepare('SELECT * FROM outreach_drafts WHERE id = ?').get(req.params.draftId) as any;
      res.json({
        id: updated.id,
        businessId: updated.business_id,
        channel: updated.channel,
        subject: updated.subject,
        openingLine: updated.opening_line,
        content: updated.content,
        callToAction: updated.call_to_action,
        isApproved: Boolean(updated.is_approved),
        deliveryStatus: updated.delivery_status,
        createdAt: updated.created_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Approve draft
  app.post('/api/outreach/approve/:draftId', (req: Request, res: Response) => {
    try {
      const { approved = true } = req.body;
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE outreach_drafts
        SET is_approved = ?, approved_at = ?, delivery_status = ?
        WHERE id = ?
      `).run(approved ? 1 : 0, approved ? now : null, approved ? 'approved' : 'draft', req.params.draftId);

      res.json({ success: true, isApproved: approved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Send outreach
  app.post('/api/outreach/send/:draftId', async (req: Request, res: Response) => {
    try {
      const result = await sendOutreach(req.params.draftId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // CSV Import
  app.post('/api/csv/import', (req: Request, res: Response) => {
    try {
      const { csvText } = req.body;
      if (!csvText) return res.status(400).json({ error: 'csvText is required in body' });
      const result = processCsvImport(csvText);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // CSV Export
  app.get('/api/csv/export', (req: Request, res: Response) => {
    try {
      const { savedOnly = 'true' } = req.query;
      let query = 'SELECT * FROM businesses';
      if (savedOnly === 'true') {
        query += ' WHERE is_saved = 1';
      }
      query += ' ORDER BY opportunity_score DESC';

      const rows = db.prepare(query).all() as any[];
      const businesses: BusinessRecord[] = rows.map((r) => ({
        ...r,
        tags: JSON.parse(r.tags || '[]'),
        socialProfiles: JSON.parse(r.social_profiles || '[]'),
        contactPageUrl: r.contact_page_url,
        isSaved: Boolean(r.is_saved),
        isSuppressed: Boolean(r.is_suppressed),
        nicheId: r.niche_id,
        nicheName: r.niche_name,
        websiteUrl: r.website_url,
        normalizedDomain: r.normalized_domain,
        emailStatus: r.email_status,
        bookingUrl: r.booking_url,
        businessHours: r.business_hours,
        sourceUrl: r.source_url,
        dataConfidence: r.data_confidence,
        websiteStatus: r.website_status,
        opportunityScore: r.opportunity_score,
        scoreBand: r.score_band,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        lastAuditedAt: r.last_audited_at,
      }));

      const csvData = exportLeadsToCsv(businesses);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="nexamor_leads.csv"');
      res.send(csvData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dashboard Stats
  app.get('/api/dashboard/stats', (_req: Request, res: Response) => {
    try {
      const totalLeads = db.prepare('SELECT COUNT(*) as count FROM businesses').get() as { count: number };
      const savedLeads = db.prepare('SELECT COUNT(*) as count FROM businesses WHERE is_saved = 1').get() as { count: number };
      const qualified = db.prepare('SELECT COUNT(*) as count FROM businesses WHERE opportunity_score >= 60').get() as { count: number };
      const highPriority = db.prepare('SELECT COUNT(*) as count FROM businesses WHERE opportunity_score >= 80').get() as { count: number };
      const awaitingOutreach = db.prepare("SELECT COUNT(*) as count FROM businesses WHERE status = 'Ready for outreach' OR status = 'Qualified'").get() as { count: number };
      const byNiche = db.prepare('SELECT niche_name, COUNT(*) as count FROM businesses GROUP BY niche_name ORDER BY count DESC LIMIT 8').all();
      const byState = db.prepare('SELECT state, COUNT(*) as count FROM businesses GROUP BY state ORDER BY count DESC').all();
      const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM businesses GROUP BY status ORDER BY count DESC').all();
      const recentHistory = db.prepare(`
        SELECT h.*, b.name as business_name
        FROM lead_status_history h
        JOIN businesses b ON h.business_id = b.id
        ORDER BY h.changed_at DESC LIMIT 6
      `).all();

      const statusCounts = db.prepare('SELECT status, COUNT(*) as count FROM businesses GROUP BY status').all() as { status: string; count: number }[];
      const countMap: Record<string, number> = {};
      for (const row of statusCounts) {
        countMap[row.status] = row.count;
      }

      res.json({
        totalLeads: totalLeads.count,
        savedLeads: savedLeads.count,
        qualified: countMap['Qualified'] || qualified.count,
        highPriority: highPriority.count,
        newLeads: countMap['New'] || 0,
        needsReview: countMap['Needs Review'] || 0,
        contacted: countMap['Contacted'] || 0,
        replied: countMap['Replied'] || 0,
        converted: countMap['Converted'] || countMap['Won'] || 0,
        awaitingOutreach: countMap['Qualified'] || awaitingOutreach.count,
        byNiche,
        byState,
        byStatus,
        recentHistory,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Settings & Suppression List
  app.get('/api/settings', (_req: Request, res: Response) => {
    try {
      const rows = db.prepare('SELECT key, value FROM provider_settings').all() as any[];
      const settingsMap: Record<string, any> = {};
      for (const r of rows) {
        try {
          settingsMap[r.key] = JSON.parse(r.value);
        } catch {
          settingsMap[r.key] = r.value;
        }
      }
      const suppression = db.prepare('SELECT * FROM suppression_list ORDER BY added_at DESC').all();
      res.json({
        settings: settingsMap,
        suppression,
        env: {
          hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
          hasGooglePlacesKey: Boolean(process.env.GOOGLE_PLACES_API_KEY),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    try {
      const { key, value } = req.body;
      const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const now = new Date().toISOString();
      db.prepare('INSERT OR REPLACE INTO provider_settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, strVal, now);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/suppression', (req: Request, res: Response) => {
    try {
      const { entityType, entityValue, reason } = req.body;
      const id = 'supp_' + Math.random().toString(36).substring(2, 9);
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO suppression_list (id, entity_type, entity_value, reason, added_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, entityType, entityValue.toLowerCase().trim(), reason || 'User requested Do Not Contact', now);

      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/suppression/:id', (req: Request, res: Response) => {
    try {
      db.prepare('DELETE FROM suppression_list WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- HUBSPOT INTEGRATION ROUTES ---

  // Get HubSpot configuration status
  app.get('/api/hubspot/config', (_req: Request, res: Response) => {
    try {
      const token = hubspotService.getToken();
      if (token) {
        const masked = token.length > 10
          ? `${token.slice(0, 7)}...${token.slice(-4)}`
          : '••••••••••••';
        res.json({ hasToken: true, tokenMasked: masked });
      } else {
        res.json({ hasToken: false, tokenMasked: null });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save HubSpot Private App Access Token
  app.post('/api/hubspot/token', (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return res.status(400).json({ error: 'Token is required' });
      }
      hubspotService.saveToken(token.trim());
      res.json({ success: true, message: 'HubSpot token saved successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove / Disconnect HubSpot Access Token
  app.delete('/api/hubspot/token', (_req: Request, res: Response) => {
    try {
      hubspotService.deleteToken();
      res.json({ success: true, message: 'HubSpot token removed successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Test HubSpot API Connection
  app.post('/api/hubspot/test-connection', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      const result = await hubspotService.testConnection(token);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch companies from HubSpot CRM (live API or verified CRM feed)
  app.post('/api/hubspot/fetch-companies', async (req: Request, res: Response) => {
    try {
      const { token, limit = 25 } = req.body;
      const result = await hubspotService.fetchCompanies(token, limit);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Import selected HubSpot companies into ClientHunter
  app.post('/api/hubspot/import', async (req: Request, res: Response) => {
    try {
      const { companies = [], saveDirectly = true } = req.body;
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({ error: 'No companies provided for import' });
      }

      const importedBusinesses: BusinessRecord[] = [];
      const now = new Date().toISOString();

      for (const comp of companies as HubSpotCompanyItem[]) {
        const raw = hubspotService.mapToRawBusinessRecord(comp);
        const normDomain = normalizeDomain(raw.website);

        // Check suppression
        let isSuppressed = false;
        if (normDomain) {
          const sup = db.prepare('SELECT id FROM suppression_list WHERE entity_type = ? AND entity_value = ?').get('domain', normDomain);
          if (sup) isSuppressed = true;
        }

        const niche = AUSTRALIAN_NICHES.find((n) => n.id === raw.nicheId) || AUSTRALIAN_NICHES[0];
        const bizId = 'biz_hs_' + Math.random().toString(36).substring(2, 10);

        // Score opportunity
        const scoreResult = calculateOpportunityScore({
          id: bizId,
          name: raw.name,
          nicheId: raw.nicheId,
          category: niche.category,
          websiteUrl: raw.website,
          phone: raw.phone,
          email: raw.email,
          businessHours: raw.businessHours,
          bookingUrl: raw.bookingUrl,
          city: raw.city,
          state: raw.state,
          audit: null,
        });

        // Field Evidence
        const fieldEvidence: Record<string, any> = {
          name: {
            field: 'name',
            value: raw.name,
            sourceName: 'HubSpot CRM',
            sourceUrl: raw.sourceUrl,
            confidence: 'High',
            verifiedStatus: 'verified',
            timestamp: now,
          },
          address: {
            field: 'address',
            value: raw.address,
            sourceName: 'HubSpot CRM',
            sourceUrl: raw.sourceUrl,
            confidence: raw.address ? 'High' : 'Medium',
            verifiedStatus: raw.address ? 'verified' : 'unverified',
            timestamp: now,
          },
          phone: {
            field: 'phone',
            value: normalizePhone(raw.phone),
            sourceName: 'HubSpot CRM',
            sourceUrl: raw.sourceUrl,
            confidence: raw.phone ? 'High' : 'Low',
            verifiedStatus: raw.phone ? 'verified' : 'missing',
            timestamp: now,
          },
          email: {
            field: 'email',
            value: raw.email,
            sourceName: 'None',
            sourceUrl: null,
            confidence: 'Low',
            verifiedStatus: 'missing',
            timestamp: now,
          },
          website: {
            field: 'website',
            value: raw.website,
            sourceName: 'HubSpot CRM',
            sourceUrl: raw.sourceUrl,
            confidence: raw.website ? 'High' : 'Low',
            verifiedStatus: raw.website ? 'verified' : 'missing',
            timestamp: now,
          },
        };

        const missingFields = ['email'];
        if (!raw.phone) missingFields.push('phone');

        const sources = [{
          sourceName: 'HubSpot CRM',
          sourceUrl: raw.sourceUrl,
          discoveredAt: now,
          enrichedAt: now,
          status: 'verified' as const,
          fieldsProvided: ['name', 'website', 'phone', 'address', 'industry'],
        }];

        const bizRecord: BusinessRecord = {
          id: bizId,
          name: raw.name,
          nicheId: niche.id,
          nicheName: niche.name,
          category: niche.category,
          websiteUrl: raw.website,
          normalizedDomain: normDomain,
          contactPageUrl: null,
          socialProfiles: [],
          address: raw.address,
          suburb: raw.suburb,
          city: raw.city,
          state: raw.state,
          postcode: raw.postcode,
          phone: normalizePhone(raw.phone),
          email: raw.email,
          emailStatus: 'unknown',
          bookingUrl: raw.bookingUrl,
          businessHours: raw.businessHours,
          latitude: raw.latitude,
          longitude: raw.longitude,
          source: 'HubSpot CRM',
          sourceUrl: raw.sourceUrl,
          sources,
          fieldEvidence,
          enrichmentStatus: raw.phone && raw.website ? 'partial' : 'pending',
          missingFields,
          attemptedSources: ['HubSpot CRM API'],
          dataConfidence: scoreResult.confidence,
          websiteStatus: raw.website ? 'accessible' : 'none',
          opportunityScore: scoreResult.score,
          scoreBand: scoreResult.band,
          status: scoreResult.score >= 60 ? 'Qualified' : 'New',
          notes: comp.properties?.description ? `HubSpot Note: ${comp.properties.description}` : null,
          tags: [niche.categoryLabel, 'HubSpot CRM', ...(comp.properties?.industry ? [comp.properties.industry] : [])],
          isSaved: Boolean(saveDirectly),
          isSuppressed: Boolean(isSuppressed),
          createdAt: now,
          updatedAt: now,
          lastAuditedAt: null,
        };

        // Insert into database
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

        importedBusinesses.push(bizRecord);
      }

      res.json({
        success: true,
        importedCount: importedBusinesses.length,
        businesses: importedBusinesses,
      });
    } catch (err: any) {
      console.error('HubSpot import error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- HUNTER.IO INTEGRATION ROUTES ---

  // Get Hunter.io configuration status
  app.get('/api/hunter/config', (_req: Request, res: Response) => {
    try {
      const key = hunterService.getApiKey();
      if (key) {
        const masked = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : '••••••••';
        res.json({ hasKey: true, keyMasked: masked });
      } else {
        res.json({ hasKey: false, keyMasked: null });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save Hunter.io API Key
  app.post('/api/hunter/token', (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'API key is required' });
      }
      hunterService.saveApiKey(apiKey.trim());
      res.json({ success: true, message: 'Hunter.io API key saved successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove / Disconnect Hunter.io API Key
  app.delete('/api/hunter/token', (_req: Request, res: Response) => {
    try {
      hunterService.deleteApiKey();
      res.json({ success: true, message: 'Hunter.io API key removed' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Test Hunter.io API Connection
  app.post('/api/hunter/test-connection', async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      const result = await hunterService.testConnection(apiKey);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Domain & Company Search via Hunter.io
  app.post('/api/hunter/domain-search', async (req: Request, res: Response) => {
    try {
      const { query, limit = 10, apiKey } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query or domain is required' });
      }
      const result = await hunterService.searchDomain(query, apiKey, limit);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Email Deliverability Verifier
  app.post('/api/hunter/verify-email', async (req: Request, res: Response) => {
    try {
      const { email, apiKey } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }
      const result = await hunterService.verifyEmail(email, apiKey);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Enrich single lead with Hunter.io
  app.post('/api/hunter/enrich-lead/:id', async (req: Request, res: Response) => {
    try {
      const result = await hunterService.enrichLeadWithHunter(req.params.id);
      const updatedBiz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id) as any;
      const contacts = db.prepare('SELECT * FROM business_contacts WHERE business_id = ?').all(req.params.id) as any[];

      res.json({
        ...result,
        business: updatedBiz
          ? {
              ...updatedBiz,
              tags: JSON.parse(updatedBiz.tags || '[]'),
              socialProfiles: JSON.parse(updatedBiz.social_profiles || '[]'),
              sources: JSON.parse(updatedBiz.sources_json || '[]'),
              fieldEvidence: JSON.parse(updatedBiz.evidence_json || '{}'),
              isSaved: Boolean(updatedBiz.is_saved),
              isSuppressed: Boolean(updatedBiz.is_suppressed),
            }
          : null,
        contacts,
      });
    } catch (err: any) {
      console.error('Hunter enrichment error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Import Hunter.io domain search results into ClientHunter Leads
  app.post('/api/hunter/import', async (req: Request, res: Response) => {
    try {
      const { results = [], saveDirectly = true } = req.body;
      if (!Array.isArray(results) || results.length === 0) {
        return res.status(400).json({ error: 'No Hunter results provided for import' });
      }

      const importedBusinesses: BusinessRecord[] = [];
      const now = new Date().toISOString();

      for (const item of results as HunterDomainSearchResult[]) {
        const raw = hunterService.mapHunterResultToRawRecord(item);
        const normDomain = normalizeDomain(raw.website);

        // Check suppression
        let isSuppressed = false;
        if (normDomain) {
          const sup = db.prepare('SELECT id FROM suppression_list WHERE entity_type = ? AND entity_value = ?').get('domain', normDomain);
          if (sup) isSuppressed = true;
        }

        const niche = AUSTRALIAN_NICHES.find((n) => n.id === raw.nicheId) || AUSTRALIAN_NICHES[0];
        const bizId = 'biz_hnt_' + Math.random().toString(36).substring(2, 10);

        // Score opportunity
        const scoreResult = calculateOpportunityScore({
          id: bizId,
          name: raw.name,
          nicheId: raw.nicheId,
          category: niche.category,
          websiteUrl: raw.website,
          phone: raw.phone,
          email: raw.email,
          businessHours: raw.businessHours,
          bookingUrl: raw.bookingUrl,
          city: raw.city,
          state: raw.state,
          audit: null,
        });

        // Field Evidence
        const fieldEvidence: Record<string, any> = {
          name: {
            field: 'name',
            value: raw.name,
            sourceName: 'Hunter.io',
            sourceUrl: raw.sourceUrl,
            confidence: 'High',
            verifiedStatus: 'verified',
            timestamp: now,
          },
          domain: {
            field: 'domain',
            value: item.domain,
            sourceName: 'Hunter.io',
            confidence: 'High',
            verifiedStatus: 'verified',
            timestamp: now,
          },
          phone: {
            field: 'phone',
            value: normalizePhone(raw.phone),
            sourceName: 'Hunter.io',
            sourceUrl: raw.sourceUrl,
            confidence: raw.phone ? 'High' : 'Low',
            verifiedStatus: raw.phone ? 'verified' : 'missing',
            timestamp: now,
          },
          email: {
            field: 'email',
            value: raw.email,
            sourceName: 'Hunter.io',
            sourceUrl: raw.sourceUrl,
            confidence: raw.email ? 'High' : 'Low',
            verifiedStatus: raw.email ? 'verified' : 'missing',
            timestamp: now,
          },
        };

        const bizRecord: BusinessRecord = {
          id: bizId,
          name: raw.name,
          nicheId: raw.nicheId,
          nicheName: niche.name,
          category: niche.category,
          websiteUrl: raw.website,
          normalizedDomain: normDomain,
          contactPageUrl: null,
          socialProfiles: [],
          sources: [
            {
              sourceName: 'Hunter.io',
              sourceUrl: raw.sourceUrl,
              discoveredAt: now,
              enrichedAt: now,
              status: 'enriched',
              fieldsProvided: ['name', 'website', 'domain', 'email', 'phone', 'decision_makers'],
            },
          ],
          fieldEvidence,
          enrichmentStatus: 'enriched',
          missingFields: [],
          attemptedSources: ['Hunter.io'],
          address: raw.address,
          suburb: raw.suburb,
          city: raw.city,
          state: raw.state,
          postcode: raw.postcode,
          phone: normalizePhone(raw.phone),
          email: raw.email,
          emailStatus: raw.email ? 'domain_valid' : 'unknown',
          bookingUrl: null,
          businessHours: null,
          latitude: null,
          longitude: null,
          source: 'Hunter.io',
          sourceUrl: raw.sourceUrl,
          dataConfidence: 'High',
          websiteStatus: raw.website ? 'verified' : 'none',
          opportunityScore: scoreResult.score,
          scoreBand: scoreResult.band,
          status: 'New',
          notes: `Imported via Hunter.io Domain Search (${item.emails.length} verified emails detected). Decision makers found: ${item.emails.filter((e) => e.position).map((e) => `${e.firstName || ''} ${e.lastName || ''} (${e.position})`).join(', ') || 'N/A'}.`,
          tags: ['Hunter.io', 'Verified Decision Makers', niche.name],
          isSaved: saveDirectly ? true : false,
          isSuppressed,
          createdAt: now,
          updatedAt: now,
          lastAuditedAt: null,
        };

        // Insert into database
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

        // Store contacts into business_contacts
        for (const email of item.emails) {
          const contactId = 'ct_hnt_' + Math.random().toString(36).substring(2, 9);
          db.prepare(`
            INSERT INTO business_contacts (
              id, business_id, contact_type, contact_value, source_url, provenance, status, confidence, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            contactId,
            bizId,
            'email',
            email.value,
            raw.sourceUrl,
            'hunter_io',
            email.confidence >= 90 ? 'verified' : 'valid_syntax',
            email.confidence >= 90 ? 'High' : 'Medium',
            now
          );
        }

        importedBusinesses.push(bizRecord);
      }

      res.json({
        success: true,
        importedCount: importedBusinesses.length,
        businesses: importedBusinesses,
      });
    } catch (err: any) {
      console.error('Hunter.io import error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Automated Tests Runner
  app.post('/api/tests/run', async (_req: Request, res: Response) => {
    try {
      const testReport = await runAcceptanceTests();
      res.json(testReport);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function startServer() {
    const PORT = Number(process.env.PORT) || 3000;

    // --- VITE DEV MIDDLEWARE OR STATIC SERVING ---
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.resolve(__dirname, 'dist')));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Nexamor ClientHunter AI] Server running on port ${PORT}`);
    });
  }

  if (!process.env.VERCEL) {
    startServer().catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
  }

  export default app;
