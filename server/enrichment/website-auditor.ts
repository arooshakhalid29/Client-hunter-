import { WebsiteAuditResult } from '../types.js';
import { extractSocialProfiles } from './social-extractor.js';

// SSRF IP blacklist
function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '0.0.0.0' || lower === '::1') return true;
  if (lower.endsWith('.local') || lower.endsWith('.internal')) return true;

  // IPv4 regex checks
  const ipv4Match = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const b1 = parseInt(ipv4Match[1], 10);
    const b2 = parseInt(ipv4Match[2], 10);
    if (b1 === 10) return true; // 10.0.0.0/8
    if (b1 === 127) return true; // 127.0.0.0/8
    if (b1 === 169 && b2 === 254) return true; // 169.254.0.0/16 (metadata)
    if (b1 === 172 && b2 >= 16 && b2 <= 31) return true; // 172.16.0.0/12
    if (b1 === 192 && b2 === 168) return true; // 192.168.0.0/16
  }
  return false;
}

export function validateSafeUrl(rawUrl: string): { valid: boolean; error?: string; url?: URL } {
  try {
    let parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }
    if (isPrivateIpOrHost(parsed.hostname)) {
      return { valid: false, error: 'Private or local addresses are forbidden (SSRF protection)' };
    }
    return { valid: true, url: parsed };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Invalid URL format' };
  }
}

// Known Australian and global booking systems
const BOOKING_SYSTEM_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'HotDoc', pattern: /hotdoc\.com\.au/i },
  { name: 'Cliniko', pattern: /cliniko\.com/i },
  { name: 'Fresha', pattern: /fresha\.com/i },
  { name: 'Timely', pattern: /gettimely\.com/i },
  { name: 'Calendly', pattern: /calendly\.com/i },
  { name: 'Mindbody', pattern: /mindbodyonline\.com|mindbody\.io/i },
  { name: 'Square Appointments', pattern: /squareup\.com\/appointments/i },
  { name: 'JaneApp', pattern: /janeapp\.com/i },
  { name: 'ServiceM8', pattern: /servicem8\.com/i },
  { name: 'Acuity Scheduling', pattern: /acuityscheduling\.com/i },
  { name: 'Healthengine', pattern: /healthengine\.com\.au/i },
  { name: 'Booker', pattern: /booker\.com/i },
  { name: 'Setmore', pattern: /setmore\.com/i },
  { name: 'Phorest', pattern: /phorest\.com/i },
  { name: 'Shortcuts', pattern: /shortcuts\.com\.au/i },
];

export async function auditBusinessWebsite(businessId: string, targetUrl: string): Promise<WebsiteAuditResult> {
  const auditId = 'audit_' + Math.random().toString(36).substring(2, 11);
  const startTime = Date.now();

  const urlCheck = validateSafeUrl(targetUrl);
  if (!urlCheck.valid || !urlCheck.url) {
    return {
      id: auditId,
      businessId,
      url: targetUrl,
      httpStatus: null,
      isHttps: false,
      responseTimeMs: 0,
      title: null,
      metaDescription: null,
      detectedBookingSystems: [],
      hasPhoneProminence: false,
      hasAfterHoursOrEmergency: false,
      hasContactForm: false,
      contactPageUrl: null,
      detectedEmails: [],
      detectedPhones: [],
      detectedSocialProfiles: [],
      multiPractitionerSignals: [],
      faqCount: 0,
      auditEvidence: [`Validation failed: ${urlCheck.error}`],
      success: false,
      errorMessage: urlCheck.error || 'Invalid or forbidden URL',
      auditedAt: new Date().toISOString(),
    };
  }

  const finalUrl = urlCheck.url.toString();
  const isHttps = urlCheck.url.protocol === 'https:';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(finalUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (Nexamor Automation Prospecting Auditor)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const responseTimeMs = Date.now() - startTime;
    const httpStatus = response.status;

    if (!response.ok) {
      return {
        id: auditId,
        businessId,
        url: finalUrl,
        httpStatus,
        isHttps,
        responseTimeMs,
        title: null,
        metaDescription: null,
        detectedBookingSystems: [],
        hasPhoneProminence: false,
        hasAfterHoursOrEmergency: false,
        hasContactForm: false,
        contactPageUrl: null,
        detectedEmails: [],
        detectedPhones: [],
        detectedSocialProfiles: [],
        multiPractitionerSignals: [],
        faqCount: 0,
        auditEvidence: [`HTTP request returned status ${httpStatus}`],
        success: false,
        errorMessage: `HTTP ${httpStatus} error`,
        auditedAt: new Date().toISOString(),
      };
    }

    // Limit text reading to 1MB
    const rawHtml = await response.text();
    const htmlSlice = rawHtml.slice(0, 1024 * 1024);

    // Extract title
    const titleMatch = htmlSlice.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Extract meta description
    const metaDescMatch = htmlSlice.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || htmlSlice.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : null;

    // Detect Booking Systems
    const detectedBookingSystems: string[] = [];
    for (const sys of BOOKING_SYSTEM_PATTERNS) {
      if (sys.pattern.test(htmlSlice)) {
        detectedBookingSystems.push(sys.name);
      }
    }
    // Generic booking CTA detection
    if (/book\s*now|book\s*online|schedule\s*appointment|request\s*appointment|book\s*a\s*service/i.test(htmlSlice)) {
      if (!detectedBookingSystems.includes('Custom Online Booking Form')) {
        detectedBookingSystems.push('Custom Online Booking Form');
      }
    }

    // Phone prominence (look for tel: links or prominent header phone)
    const hasTelLink = /href=["']tel:[^"']+["']/i.test(htmlSlice);
    const hasCallUs = /call\s*us|call\s*now|phone\s*our\s*team|speak\s*with/i.test(htmlSlice);
    const hasPhoneProminence = hasTelLink || hasCallUs;

    // After hours or Emergency messaging
    const hasAfterHoursOrEmergency = /24\/7|after[-\s]hours|emergency|rapid\s*response|urgent\s*callout|weekend\s*service/i.test(htmlSlice);

    // Contact form detection
    const hasContactForm = /<form[^>]*>[\s\S]*?(email|phone|message|contact)[\s\S]*?<\/form>/i.test(htmlSlice)
      || /contact-form|wpforms|ninja-forms|gravityform|contact\s*us/i.test(htmlSlice);

    // Contact page detection
    const contactLinkMatch = htmlSlice.match(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*(?:contact|get-in-touch|locations?)[^"']*)["'][^>]*>/i);
    let contactPageUrl: string | null = null;
    if (contactLinkMatch && contactLinkMatch[1]) {
      try {
        contactPageUrl = new URL(contactLinkMatch[1], finalUrl).toString();
      } catch {
        contactPageUrl = contactLinkMatch[1];
      }
    }

    // Detect emails (RFC 5322 simplified, filtered for common false positives)
    const emailMatches = htmlSlice.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const validEmails = Array.from(new Set(emailMatches))
      .filter((e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('sentry') && !e.includes('example.com') && !e.includes('wixpress') && !e.includes('schema.org'))
      .slice(0, 5);

    // Detect Australian phones
    const phoneMatches = htmlSlice.match(/(?:\+?61\s?|0)[23784]\s?\d{4}\s?\d{4}|(?:\+?61\s?|0)4\d{2}\s?\d{3}\s?\d{3}|1[38]00\s?\d{3}\s?\d{3}/g) || [];
    const validPhones = Array.from(new Set(phoneMatches.map((p) => p.trim()))).slice(0, 5);

    // Extract Social Media Profiles
    const detectedSocialProfiles = extractSocialProfiles(htmlSlice, finalUrl);
    const verifiedSocials = detectedSocialProfiles.filter((s) => s.status === 'verified');

    // Multi-practitioner or team signals
    const multiPractitionerSignals: string[] = [];
    if (/meet\s*the\s*team|our\s*doctors|our\s*stylists|our\s*plumbers|our\s*practitioners|our\s*mechanics|our\s*technicians/i.test(htmlSlice)) {
      multiPractitionerSignals.push('Staff / Team Directory page identified');
    }
    if (/dr\.\s+[a-z]+|doctor\s+[a-z]+|senior\s*stylist|master\s*electrician|licensed\s*tradesman/i.test(htmlSlice)) {
      multiPractitionerSignals.push('Multiple practitioner or specialist credentials detected');
    }

    // FAQ detection
    const faqMatches = htmlSlice.match(/faq|frequently\s*asked\s*questions|common\s*questions/gi) || [];
    const faqCount = faqMatches.length;

    // Compile audit evidence
    const auditEvidence: string[] = [];
    if (isHttps) auditEvidence.push('Secure HTTPS protocol verified');
    if (hasPhoneProminence) auditEvidence.push('Prominent phone numbers & call-to-actions on homepage');
    if (hasAfterHoursOrEmergency) auditEvidence.push('Emergency / after-hours service advertised');
    if (detectedBookingSystems.length > 0) {
      auditEvidence.push(`Integrated scheduling engine: ${detectedBookingSystems.join(', ')}`);
    } else {
      auditEvidence.push('No dedicated third-party booking widget detected (phone/email enquiry dependent)');
    }
    if (multiPractitionerSignals.length > 0) {
      auditEvidence.push(...multiPractitionerSignals);
    }
    if (validEmails.length > 0) {
      auditEvidence.push(`Public contact email extracted: ${validEmails[0]}`);
    }
    if (contactPageUrl) {
      auditEvidence.push(`Official contact page located: ${contactPageUrl}`);
    }
    if (verifiedSocials.length > 0) {
      auditEvidence.push(`Verified social profiles: ${verifiedSocials.map((s) => s.platform).join(', ')}`);
    }

    return {
      id: auditId,
      businessId,
      url: finalUrl,
      httpStatus,
      isHttps,
      responseTimeMs,
      title,
      metaDescription,
      detectedBookingSystems,
      hasPhoneProminence,
      hasAfterHoursOrEmergency,
      hasContactForm,
      contactPageUrl,
      detectedEmails: validEmails,
      detectedPhones: validPhones,
      detectedSocialProfiles,
      socialProfiles: detectedSocialProfiles,
      multiPractitionerSignals,
      faqCount,
      auditEvidence,
      success: true,
      errorMessage: null,
      auditedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const responseTimeMs = Date.now() - startTime;
    return {
      id: auditId,
      businessId,
      url: finalUrl,
      httpStatus: null,
      isHttps,
      responseTimeMs,
      title: null,
      metaDescription: null,
      detectedBookingSystems: [],
      hasPhoneProminence: false,
      hasAfterHoursOrEmergency: false,
      hasContactForm: false,
      contactPageUrl: null,
      detectedEmails: [],
      detectedPhones: [],
      detectedSocialProfiles: [],
      socialProfiles: [],
      multiPractitionerSignals: [],
      faqCount: 0,
      auditEvidence: ['Audit request timed out or was blocked by host firewall. Business record retained.'],
      success: false,
      errorMessage: err?.message || 'Audit connection timeout',
      auditedAt: new Date().toISOString(),
    };
  }
}
