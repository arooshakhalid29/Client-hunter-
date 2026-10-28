import { OpportunityScoreResult, WebsiteAuditResult, AustralianState } from '../types.js';
import { AUSTRALIAN_NICHES } from '../niches.js';
import { db } from '../db.js';

interface BusinessForScoring {
  id: string;
  name: string;
  nicheId: string;
  category: string;
  websiteUrl: string | null;
  phone: string | null;
  email: string | null;
  businessHours: string | null;
  bookingUrl: string | null;
  city: string;
  state: AustralianState;
  audit?: WebsiteAuditResult | null;
}

export function calculateOpportunityScore(biz: BusinessForScoring): OpportunityScoreResult {
  const scoreId = 'score_' + Math.random().toString(36).substring(2, 11);
  const niche = AUSTRALIAN_NICHES.find((n) => n.id === biz.nicheId);
  const audit = biz.audit;

  // Retrieve configurable weights from DB
  let weights = {
    industryFitWeight: 25,
    appointmentCallWeight: 25,
    operationalComplexityWeight: 20,
    automationOpportunityWeight: 15,
    evidenceConfidenceWeight: 15,
  };
  try {
    const row = db.prepare('SELECT value FROM provider_settings WHERE key = ?').get('scoring_weights') as { value: string } | undefined;
    if (row?.value) {
      weights = { ...weights, ...JSON.parse(row.value) };
    }
  } catch {
    // Fallback to defaults
  }

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  const missingInfo: string[] = [];

  // 1. Industry and Service Fit (max 25 pts)
  let industryFit = 0;
  if (niche) {
    if (niche.category === 'home_services') {
      industryFit = 24;
      positiveSignals.push('High urgent-callout propensity in trades & home services');
    } else if (niche.category === 'beauty_personal_care') {
      industryFit = 23;
      positiveSignals.push('Appointment-driven beauty salon with high phone interruption risk');
    } else if (niche.category === 'dental_healthcare') {
      industryFit = 25;
      positiveSignals.push('High patient volume & appointment coordination requirement');
    } else if (niche.category === 'automotive') {
      industryFit = 22;
      positiveSignals.push('High-touch repair estimate & workshop booking workflow');
    } else {
      industryFit = 20;
      positiveSignals.push('Standard appointment or recurring reservation workflow');
    }
  } else {
    industryFit = 10;
    negativeSignals.push('Industry not in primary prioritized target niches');
  }

  // 2. Appointment or Call Dependency (max 25 pts)
  let appointmentCallFit = 0;
  if (biz.phone) {
    appointmentCallFit += 10;
    positiveSignals.push('Published direct phone line actively receiving customer enquiries');
  } else {
    missingInfo.push('No direct phone number listed');
  }

  if (audit?.hasPhoneProminence) {
    appointmentCallFit += 7;
    positiveSignals.push('Website emphasizes phone call-to-actions over online forms');
  }

  if (audit?.hasAfterHoursOrEmergency) {
    appointmentCallFit += 8;
    positiveSignals.push('Advertises 24/7 or after-hours availability requiring round-the-clock call triage');
  } else if (biz.businessHours) {
    appointmentCallFit += 4;
    positiveSignals.push('Clear operational hours; off-hours calls are currently missed');
  } else {
    missingInfo.push('Operating hours not publicly specified');
  }

  // Cap at 25
  appointmentCallFit = Math.min(25, appointmentCallFit);

  // 3. Observable Operational Complexity (max 20 pts)
  let operationalComplexity = 0;
  if (audit && audit.multiPractitionerSignals.length > 0) {
    operationalComplexity += 10;
    positiveSignals.push('Multiple practitioners/technicians detected (multi-calendar coordination)');
  }

  if (audit && audit.detectedBookingSystems.length > 0) {
    operationalComplexity += 7;
    positiveSignals.push(`Existing scheduling infrastructure (${audit.detectedBookingSystems.join(', ')}) ready for voice integration`);
  } else if (biz.bookingUrl) {
    operationalComplexity += 6;
    positiveSignals.push('Online booking portal identified');
  } else {
    operationalComplexity += 4;
    positiveSignals.push('Manual booking workflow: high risk of missed booking requests');
  }

  if (audit && audit.faqCount > 1) {
    operationalComplexity += 3;
    positiveSignals.push('Repetitive customer FAQs suitable for voice AI answering');
  }

  operationalComplexity = Math.min(20, operationalComplexity);

  // 4. Evidence of Automation Opportunity (max 15 pts)
  let automationOpportunity = 0;
  if (niche?.id === 'emergency_plumber' || niche?.id === 'emergency_electrician' || audit?.hasAfterHoursOrEmergency) {
    automationOpportunity += 15;
    positiveSignals.push('Prime target for 24/7 Voice Dispatch & Instant Emergency Lead Triage');
  } else if (audit && audit.hasPhoneProminence && audit.detectedBookingSystems.length === 0) {
    automationOpportunity += 14;
    positiveSignals.push('High phone dependence with no automated after-hours capture');
  } else if (audit && audit.detectedBookingSystems.length > 0) {
    automationOpportunity += 12;
    positiveSignals.push('Can connect Nexamor AI Voice Receptionist directly to existing booking API');
  } else {
    automationOpportunity += 8;
  }
  automationOpportunity = Math.min(15, automationOpportunity);

  // 5. Evidence Quality and Confidence (max 15 pts)
  let evidenceConfidence = 0;
  if (biz.websiteUrl) evidenceConfidence += 4;
  if (audit && audit.success) evidenceConfidence += 5;
  if (biz.phone) evidenceConfidence += 3;
  if (biz.email) evidenceConfidence += 3;
  evidenceConfidence = Math.min(15, evidenceConfidence);

  // Calculate Weighted Total Score
  // Normalized to 0-100
  const rawSum = industryFit + appointmentCallFit + operationalComplexity + automationOpportunity + evidenceConfidence;
  const score = Math.max(0, Math.min(100, Math.round(rawSum)));

  // Bands
  let band: 'High priority' | 'Medium priority' | 'Low priority' = 'Low priority';
  if (score >= 80) {
    band = 'High priority';
  } else if (score >= 60) {
    band = 'Medium priority';
  }

  // Confidence Rating
  let confidence: 'High' | 'Medium' | 'Low / Manual Review' = 'Low / Manual Review';
  if (evidenceConfidence >= 12 && biz.phone && biz.websiteUrl) {
    confidence = 'High';
  } else if (evidenceConfidence >= 7 || (biz.phone && biz.websiteUrl)) {
    confidence = 'Medium';
  }

  // Determine tailored service & outreach angle
  const suggestedService = niche?.suggestedService || 'AI Phone Concierge & Booking Automation';
  const suggestedAngle = niche?.automationAngles?.[0] || 'Capture after-hours customer calls and automate appointment scheduling';

  // Concise explanation
  const conciseExplanation = `${biz.name} in ${biz.city} operates in ${niche?.name || 'an appointment-driven industry'}. Observable signals indicate ${
    audit?.hasAfterHoursOrEmergency
      ? 'strong 24/7 or emergency callout positioning'
      : audit?.hasPhoneProminence
      ? 'heavy phone reliance for inbound customer enquiries'
      : 'active appointment scheduling requirements'
  }, scoring ${score}/100 with ${confidence.toLowerCase()} confidence for ${suggestedService}.`;

  return {
    id: scoreId,
    businessId: biz.id,
    score,
    band,
    confidence,
    scoreBreakdown: {
      industryFit,
      appointmentCallFit,
      operationalComplexity,
      automationOpportunity,
      evidenceConfidence,
    },
    positiveSignals,
    negativeSignals,
    missingInformation: missingInfo,
    suggestedService,
    suggestedAngle,
    conciseExplanation,
    scoredAt: new Date().toISOString(),
  };
}
