import { SocialProfile } from '../types.js';
import { validateSafeUrl } from './website-auditor.js';
import { extractSocialProfiles } from './social-extractor.js';

export interface PageEvidence {
  url: string;
  statusCode: number;
  title: string | null;
  phonesFound: string[];
  emailsFound: string[];
  bookingLinks: string[];
  socialsFound: SocialProfile[];
  hasContactForm: boolean;
  businessHours: string | null;
}

export interface CrawlResult {
  domain: string;
  startUrl: string;
  pagesCrawled: PageEvidence[];
  contactPageUrl: string | null;
  bookingUrl: string | null;
  discoveredPhones: Array<{ phone: string; sourceUrl: string }>;
  discoveredEmails: Array<{ email: string; sourceUrl: string }>;
  discoveredSocials: SocialProfile[];
  businessHours: string | null;
  detectedBookingSystems: string[];
  robotsAllowed: boolean;
  crawlDurationMs: number;
  errors: string[];
}

const COMMON_CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/contact_us',
  '/get-in-touch',
  '/about',
  '/about-us',
  '/locations',
  '/clinics',
  '/book',
  '/booking',
  '/book-online',
  '/appointments',
  '/services',
];

const BOOKING_KEYWORDS = [
  'hotdoc.com.au',
  'cliniko.com',
  'fresha.com',
  'gettimely.com',
  'calendly.com',
  'mindbodyonline.com',
  'mindbody.io',
  'squareup.com/appointments',
  'janeapp.com',
  'servicem8.com',
  'acuityscheduling.com',
  'healthengine.com.au',
  'booker.com',
  'setmore.com',
  'phorest.com',
  'shortcuts.com.au',
];

export async function crawlBusinessWebsite(targetUrl: string, maxPages: number = 4): Promise<CrawlResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const pagesCrawled: PageEvidence[] = [];
  const visitedUrls = new Set<string>();

  const urlCheck = validateSafeUrl(targetUrl);
  if (!urlCheck.valid || !urlCheck.url) {
    return {
      domain: targetUrl,
      startUrl: targetUrl,
      pagesCrawled: [],
      contactPageUrl: null,
      bookingUrl: null,
      discoveredPhones: [],
      discoveredEmails: [],
      discoveredSocials: [],
      businessHours: null,
      detectedBookingSystems: [],
      robotsAllowed: false,
      crawlDurationMs: 0,
      errors: [urlCheck.error || 'Invalid target URL'],
    };
  }

  const baseOrigin = urlCheck.url.origin;
  const domain = urlCheck.url.hostname.replace(/^www\./, '');

  // 1. Polite robots.txt inspection
  let robotsAllowed = true;
  try {
    const robotsController = new AbortController();
    const robotsTimer = setTimeout(() => robotsController.abort(), 2500);
    const robotsRes = await fetch(`${baseOrigin}/robots.txt`, {
      signal: robotsController.signal,
      headers: { 'User-Agent': 'NexamorProspectingCrawler/1.0 (+https://nexamor.com.au/bot)' },
    });
    clearTimeout(robotsTimer);
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      if (/User-agent:\s*\*\s*\nDisallow:\s*\/\s*$/i.test(robotsTxt)) {
        robotsAllowed = false;
        errors.push('Domain robots.txt requested no bot access; crawl limited to public homepage verification only');
      }
    }
  } catch {
    // robots.txt unreachable or not provided, continue safely
  }

  // URLs queue (start with homepage)
  const queue: string[] = [urlCheck.url.toString()];
  const discoveredContactLinks: string[] = [];
  const discoveredPhones: Array<{ phone: string; sourceUrl: string }> = [];
  const discoveredEmails: Array<{ email: string; sourceUrl: string }> = [];
  const discoveredSocialsMap = new Map<string, SocialProfile>();
  const detectedBookingSystems = new Set<string>();
  let primaryContactPage: string | null = null;
  let primaryBookingUrl: string | null = null;
  let detectedHours: string | null = null;

  // Crawl loop up to maxPages
  while (queue.length > 0 && pagesCrawled.length < (robotsAllowed ? maxPages : 1)) {
    const currentUrlStr = queue.shift()!;
    const norm = currentUrlStr.split('#')[0].replace(/\/+$/, '');
    if (visitedUrls.has(norm)) continue;
    visitedUrls.add(norm);

    try {
      const pageCheck = validateSafeUrl(currentUrlStr);
      if (!pageCheck.valid || !pageCheck.url) continue;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);

      const response = await fetch(currentUrlStr, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (Nexamor ClientHunter)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      clearTimeout(timer);

      if (!response.ok) {
        errors.push(`Page returned ${response.status}: ${currentUrlStr}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        continue;
      }

      const rawHtml = await response.text();
      const htmlSlice = rawHtml.slice(0, 512 * 1024); // 512KB limit

      // Page Title
      const titleMatch = htmlSlice.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : null;

      // Extract Phones
      const phoneMatches = htmlSlice.match(/(?:\+?61\s?|0)[23784]\s?\d{4}\s?\d{4}|(?:\+?61\s?|0)4\d{2}\s?\d{3}\s?\d{3}|1[38]00\s?\d{3}\s?\d{3}/g) || [];
      const pagePhones = Array.from(new Set(phoneMatches.map((p) => p.trim()))).slice(0, 3);
      for (const ph of pagePhones) {
        if (!discoveredPhones.some((dp) => dp.phone === ph)) {
          discoveredPhones.push({ phone: ph, sourceUrl: currentUrlStr });
        }
      }

      // Extract Emails
      const emailMatches = htmlSlice.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const pageEmails = Array.from(new Set(emailMatches))
        .filter((e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('sentry') && !e.includes('example.com') && !e.includes('wixpress') && !e.includes('schema.org') && !e.includes('domain.'))
        .slice(0, 3);
      for (const em of pageEmails) {
        if (!discoveredEmails.some((de) => de.email === em)) {
          discoveredEmails.push({ email: em, sourceUrl: currentUrlStr });
        }
      }

      // Extract Socials
      const pageSocials = extractSocialProfiles(htmlSlice, currentUrlStr);
      for (const soc of pageSocials) {
        if (soc.status === 'verified') {
          discoveredSocialsMap.set(soc.platform, {
            ...soc,
            source: `Crawler: ${currentUrlStr}`,
          });
        }
      }

      // Booking links detection
      const pageBookingLinks: string[] = [];
      for (const bk of BOOKING_KEYWORDS) {
        const regex = new RegExp(`https?://[^"'\s]*${bk}[^"'\s]*`, 'gi');
        const bkMatches = htmlSlice.match(regex);
        if (bkMatches) {
          for (const m of bkMatches) {
            pageBookingLinks.push(m);
            detectedBookingSystems.add(bk);
            if (!primaryBookingUrl) primaryBookingUrl = m;
          }
        }
      }

      // Check contact form
      const hasContactForm = /<form[^>]*>[\s\S]*?(email|phone|message|contact)[\s\S]*?<\/form>/i.test(htmlSlice)
        || /contact-form|wpforms|ninja-forms|gravityform/i.test(htmlSlice);

      // Check business hours
      if (!detectedHours) {
        const hoursMatch = htmlSlice.match(/(?:monday|mon|hours|open)[^<]{5,80}(?:am|pm)/i);
        if (hoursMatch) {
          detectedHours = hoursMatch[0].replace(/\s+/g, ' ').trim();
        }
      }

      pagesCrawled.push({
        url: currentUrlStr,
        statusCode: response.status,
        title,
        phonesFound: pagePhones,
        emailsFound: pageEmails,
        bookingLinks: pageBookingLinks,
        socialsFound: pageSocials.filter((s) => s.status === 'verified'),
        hasContactForm,
        businessHours: detectedHours,
      });

      // Internal links discovery for contact, about, booking
      if (robotsAllowed && queue.length < 5) {
        const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"'#]+)["'][^>]*>/gi;
        let lMatch;
        while ((lMatch = linkRegex.exec(htmlSlice)) !== null) {
          const rawHref = lMatch[1].trim();
          if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
            continue;
          }

          try {
            const resolved = new URL(rawHref, currentUrlStr);
            // Must belong to same domain
            if (resolved.origin === baseOrigin) {
              const lowerPath = resolved.pathname.toLowerCase();
              const isTargetPage = COMMON_CONTACT_PATHS.some((p) => lowerPath.includes(p));

              if (isTargetPage && !visitedUrls.has(resolved.toString())) {
                if (lowerPath.includes('contact') && !primaryContactPage) {
                  primaryContactPage = resolved.toString();
                }
                if ((lowerPath.includes('book') || lowerPath.includes('appointment')) && !primaryBookingUrl) {
                  primaryBookingUrl = resolved.toString();
                }
                if (!queue.includes(resolved.toString()) && queue.length < 4) {
                  queue.push(resolved.toString());
                }
              }
            }
          } catch {
            // ignore malformed relative links
          }
        }
      }
    } catch (err: any) {
      errors.push(`Error fetching ${currentUrlStr}: ${err?.message || 'Timeout'}`);
    }
  }

  // Build final array of social profiles
  const finalSocials = Array.from(discoveredSocialsMap.values());

  return {
    domain,
    startUrl: targetUrl,
    pagesCrawled,
    contactPageUrl: primaryContactPage,
    bookingUrl: primaryBookingUrl,
    discoveredPhones,
    discoveredEmails,
    discoveredSocials: finalSocials,
    businessHours: detectedHours,
    detectedBookingSystems: Array.from(detectedBookingSystems),
    robotsAllowed,
    crawlDurationMs: Date.now() - startTime,
    errors,
  };
}
