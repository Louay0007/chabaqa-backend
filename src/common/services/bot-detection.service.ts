import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';
import { SecurityService } from './security.service';
import * as crypto from 'crypto';

export interface BotDetectionResult {
  isBot: boolean;
  confidence: number;
  reasons: string[];
  requiresCaptcha: boolean;
  behaviorScore: number;
  fingerprint?: string;
}

export interface RequestFingerprint {
  ip: string;
  userAgent: string;
  acceptLanguage?: string;
  acceptEncoding?: string;
  dnr?: string; // Do Not Track
  timezone?: string;
  screenResolution?: string;
  plugins?: string[];
  requestPattern?: string;
}

export interface BehaviorMetrics {
  requestFrequency: number;
  sequentialRequests: number;
  mouseMovements: number;
  keyboardEvents: number;
  scrollEvents: number;
  clickEvents: number;
  sessionDuration: number;
  pageViews: number;
  timeOnPage: number;
  referrer?: string;
}

@Injectable()
export class BotDetectionService {
  private readonly logger = new Logger(BotDetectionService.name);

  // Known bot user agents
  private readonly KNOWN_BOT_PATTERNS = [
    // Search engine bots
    /googlebot/i,
    /bingbot/i,
    /slurp/i,
    /duckduckbot/i,
    /baiduspider/i,
    /yandexbot/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /whatsapp/i,
    /telegrambot/i,
    
    // SEO/Monitoring tools
    /ahrefsbot/i,
    /semrushbot/i,
    /mj12bot/i,
    /dotbot/i,
    /uptimerobot/i,
    /pingdom/i,
    /gtmetrix/i,
    
    // Malicious bots
    /python-requests/i,
    /curl/i,
    /wget/i,
    /httpclient/i,
    /okhttp/i,
    /go-http-client/i,
    /node-fetch/i,
    /axios/i,
    /postman/i,
    /insomnia/i,
    /httpie/i,
    
    // Security scanners
    /nmap/i,
    /masscan/i,
    /zmap/i,
    /nikto/i,
    /sqlmap/i,
    /dirb/i,
    /dirbuster/i,
    /gobuster/i,
    /wfuzz/i,
    /burp/i,
    /owasp/i,
    
    // Generic bot indicators
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /fetcher/i,
    /parser/i,
    /extractor/i,
    /monitor/i,
    /checker/i,
    /validator/i,
  ];

  // Legitimate bots that should be allowed
  private readonly LEGITIMATE_BOTS = [
    /googlebot/i,
    /bingbot/i,
    /slurp/i, // Yahoo
    /duckduckbot/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /whatsapp/i,
    /uptimerobot/i,
    /pingdom/i,
  ];

  constructor(
    private cacheService: CacheService,
    private securityService: SecurityService,
  ) {}

  /**
   * Analyze request for bot behavior
   */
  async analyzeBotBehavior(
    fingerprint: RequestFingerprint,
    behaviorMetrics?: BehaviorMetrics
  ): Promise<BotDetectionResult> {
    try {
      let botScore = 0;
      const reasons: string[] = [];
      let requiresCaptcha = false;

      // Generate request fingerprint
      const requestFingerprint = this.generateFingerprint(fingerprint);

      // 1. User Agent Analysis
      const userAgentAnalysis = this.analyzeUserAgent(fingerprint.userAgent);
      botScore += userAgentAnalysis.score;
      reasons.push(...userAgentAnalysis.reasons);

      // 2. Header Analysis  
      const headerAnalysis = this.analyzeHeaders(fingerprint);
      botScore += headerAnalysis.score;
      reasons.push(...headerAnalysis.reasons);

      // 3. Behavioral Analysis
      if (behaviorMetrics) {
        const behaviorAnalysis = await this.analyzeBehaviorMetrics(
          fingerprint.ip, 
          behaviorMetrics
        );
        botScore += behaviorAnalysis.score;
        reasons.push(...behaviorAnalysis.reasons);
      }

      // 4. Request Pattern Analysis
      const patternAnalysis = await this.analyzeRequestPatterns(fingerprint.ip);
      botScore += patternAnalysis.score;
      reasons.push(...patternAnalysis.reasons);

      // 5. Fingerprint Analysis
      const fingerprintAnalysis = await this.analyzeFingerprint(requestFingerprint);
      botScore += fingerprintAnalysis.score;
      reasons.push(...fingerprintAnalysis.reasons);

      // 6. Rate-based Detection
      const rateAnalysis = await this.analyzeRequestRate(fingerprint.ip);
      botScore += rateAnalysis.score;
      reasons.push(...rateAnalysis.reasons);

      // Decision logic
      const confidence = Math.min(botScore, 100);
      const isBot = confidence > 70;
      requiresCaptcha = confidence > 50 || rateAnalysis.score > 30;

      // Check if it's a legitimate bot
      const isLegitimateBot = this.isLegitimateBot(fingerprint.userAgent);
      
      const result: BotDetectionResult = {
        isBot: isBot && !isLegitimateBot,
        confidence,
        reasons: reasons.filter(r => r),
        requiresCaptcha: requiresCaptcha && !isLegitimateBot,
        behaviorScore: botScore,
        fingerprint: requestFingerprint,
      };

      // Log suspicious bot activity
      if (result.isBot || result.requiresCaptcha) {
        this.securityService.logSecurityEvent(
          result.isBot ? 'BOT_DETECTED' : 'CAPTCHA_REQUIRED',
          {
            ip: fingerprint.ip,
            userAgent: fingerprint.userAgent,
            confidence: result.confidence,
            reasons: result.reasons,
            fingerprint: requestFingerprint,
            behaviorMetrics,
          },
          result.isBot ? 'warn' : 'info'
        );
      }

      // Cache the result
      await this.cacheService.set(
        `bot_detection:${requestFingerprint}`,
        result,
        300 // 5 minutes
      );

      return result;
    } catch (error) {
      this.logger.error('Bot detection analysis failed:', error);
      
      // Fail-safe response
      return {
        isBot: false,
        confidence: 0,
        reasons: ['analysis_failed'],
        requiresCaptcha: false,
        behaviorScore: 0,
      };
    }
  }

  /**
   * Analyze user agent for bot indicators
   */
  private analyzeUserAgent(userAgent: string): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    if (!userAgent || userAgent.trim() === '') {
      score += 50;
      reasons.push('empty_user_agent');
      return { score, reasons };
    }

    // Check against known bot patterns
    for (const pattern of this.KNOWN_BOT_PATTERNS) {
      if (pattern.test(userAgent)) {
        score += 80;
        reasons.push('known_bot_pattern');
        break;
      }
    }

    // Suspicious characteristics
    if (userAgent.length < 20) {
      score += 30;
      reasons.push('short_user_agent');
    }

    if (userAgent.length > 500) {
      score += 20;
      reasons.push('abnormally_long_user_agent');
    }

    // Check for programming language indicators
    const programmingLanguages = [
      'python', 'java', 'php', 'ruby', 'perl', 'go', 'rust', 'node'
    ];
    
    for (const lang of programmingLanguages) {
      if (userAgent.toLowerCase().includes(lang)) {
        score += 40;
        reasons.push('programming_language_indicator');
        break;
      }
    }

    // Check for missing browser indicators
    const browserIndicators = ['mozilla', 'webkit', 'chrome', 'firefox', 'safari', 'edge'];
    const hasBrowserIndicator = browserIndicators.some(indicator => 
      userAgent.toLowerCase().includes(indicator)
    );

    if (!hasBrowserIndicator) {
      score += 35;
      reasons.push('missing_browser_indicators');
    }

    // Check for suspicious version patterns
    if (/version\/0\.0/i.test(userAgent)) {
      score += 25;
      reasons.push('suspicious_version_pattern');
    }

    return { score, reasons };
  }

  /**
   * Analyze HTTP headers for bot indicators
   */
  private analyzeHeaders(fingerprint: RequestFingerprint): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Missing Accept-Language header (common in bots)
    if (!fingerprint.acceptLanguage) {
      score += 25;
      reasons.push('missing_accept_language');
    }

    // Missing Accept-Encoding header
    if (!fingerprint.acceptEncoding) {
      score += 20;
      reasons.push('missing_accept_encoding');
    }

    // Suspicious Accept-Language values
    if (fingerprint.acceptLanguage === '*' || fingerprint.acceptLanguage === 'en') {
      score += 15;
      reasons.push('suspicious_accept_language');
    }

    // DNT (Do Not Track) analysis
    if (fingerprint.dnr === '1') {
      score -= 5; // Slightly less suspicious
    }

    return { score, reasons };
  }

  /**
   * Analyze behavioral metrics
   */
  private async analyzeBehaviorMetrics(
    ip: string, 
    metrics: BehaviorMetrics
  ): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    // No mouse/keyboard/scroll events (strong bot indicator)
    if (metrics.mouseMovements === 0 && metrics.keyboardEvents === 0 && metrics.scrollEvents === 0) {
      score += 60;
      reasons.push('no_user_interaction');
    }

    // Very fast page navigation
    if (metrics.timeOnPage < 1000) { // Less than 1 second
      score += 40;
      reasons.push('extremely_fast_navigation');
    }

    // Too many page views in short time
    if (metrics.pageViews > 10 && metrics.sessionDuration < 60000) { // 10+ pages in 1 minute
      score += 50;
      reasons.push('rapid_page_consumption');
    }

    // High request frequency
    if (metrics.requestFrequency > 10) { // More than 10 requests per second
      score += 45;
      reasons.push('high_request_frequency');
    }

    // Sequential requests pattern
    if (metrics.sequentialRequests > 20) {
      score += 35;
      reasons.push('sequential_request_pattern');
    }

    // No referrer (might be direct bot access)
    if (!metrics.referrer) {
      score += 10;
      reasons.push('no_referrer');
    }

    return { score, reasons };
  }

  /**
   * Analyze request patterns over time
   */
  private async analyzeRequestPatterns(ip: string): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    try {
      // Get request history from cache
      const requestHistory = await this.cacheService.get<number[]>(`request_history:${ip}`) || [];
      
      if (requestHistory.length > 0) {
        // Calculate request intervals
        const intervals: number[] = [];
        for (let i = 1; i < requestHistory.length; i++) {
          intervals.push(requestHistory[i] - requestHistory[i - 1]);
        }

        // Check for too regular intervals (bot characteristic)
        if (intervals.length > 5) {
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance = intervals.reduce((sum, interval) => {
            return sum + Math.pow(interval - avgInterval, 2);
          }, 0) / intervals.length;

          // Low variance indicates very regular timing (bot-like)
          if (variance < 100) { // Very regular timing
            score += 40;
            reasons.push('regular_timing_pattern');
          }
        }

        // Check for burst patterns
        const recentRequests = requestHistory.filter(
          timestamp => Date.now() - timestamp < 60000 // Last minute
        );

        if (recentRequests.length > 30) { // More than 30 requests in 1 minute
          score += 50;
          reasons.push('request_burst_pattern');
        }
      }

      // Update request history
      requestHistory.push(Date.now());
      if (requestHistory.length > 100) {
        requestHistory.shift(); // Keep only last 100 requests
      }

      await this.cacheService.set(`request_history:${ip}`, requestHistory, 3600); // 1 hour

    } catch (error) {
      this.logger.debug(`Request pattern analysis failed for ${ip}:`, error);
    }

    return { score, reasons };
  }

  /**
   * Analyze device fingerprint
   */
  private async analyzeFingerprint(fingerprint: string): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    try {
      // Check if we've seen this exact fingerprint before
      const fingerprintCount = await this.cacheService.get<number>(`fingerprint_count:${fingerprint}`) || 0;
      
      if (fingerprintCount > 10) { // Same fingerprint used many times
        score += 30;
        reasons.push('repeated_fingerprint');
      }

      // Update fingerprint count
      await this.cacheService.set(
        `fingerprint_count:${fingerprint}`, 
        fingerprintCount + 1, 
        3600 // 1 hour
      );

    } catch (error) {
      this.logger.debug('Fingerprint analysis failed:', error);
    }

    return { score, reasons };
  }

  /**
   * Analyze request rate
   */
  private async analyzeRequestRate(ip: string): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    try {
      const currentTime = Date.now();
      const windowSize = 60000; // 1 minute window
      const requestKey = `request_rate:${ip}`;
      
      // Get current request timestamps
      const requests = await this.cacheService.get<number[]>(requestKey) || [];
      
      // Filter requests within the time window
      const recentRequests = requests.filter(timestamp => 
        currentTime - timestamp < windowSize
      );

      // Add current request
      recentRequests.push(currentTime);

      // Rate-based scoring
      if (recentRequests.length > 60) { // More than 1 request per second
        score += 60;
        reasons.push('extremely_high_request_rate');
      } else if (recentRequests.length > 30) { // More than 0.5 requests per second
        score += 40;
        reasons.push('high_request_rate');
      } else if (recentRequests.length > 15) { // More than 0.25 requests per second
        score += 20;
        reasons.push('elevated_request_rate');
      }

      // Update cache (convert windowSize to seconds)
      const ttl = 300; // 5 minutes
      this.cacheService.set(requestKey, recentRequests.slice(0, 100), ttl);

    } catch (error) {
      this.logger.debug(`Request rate analysis failed for ${ip}:`, error);
    }

    return { score, reasons };
  }

  /**
   * Generate device fingerprint
   */
  private generateFingerprint(fingerprint: RequestFingerprint): string {
    const fingerprintData = [
      fingerprint.userAgent,
      fingerprint.acceptLanguage,
      fingerprint.acceptEncoding,
      fingerprint.timezone,
      fingerprint.screenResolution,
      fingerprint.plugins?.join(','),
    ].filter(Boolean).join('|');

    return crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);
  }

  /**
   * Check if user agent belongs to a legitimate bot
   */
  private isLegitimateBot(userAgent: string): boolean {
    return this.LEGITIMATE_BOTS.some(pattern => pattern.test(userAgent));
  }

  /**
   * Generate CAPTCHA challenge
   */
  async generateCaptchaChallenge(ip: string): Promise<{ challenge: string; token: string }> {
    const challenge = this.generateMathCaptcha();
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store challenge answer for verification
    await this.cacheService.set(
      `captcha:${token}`,
      { answer: challenge.answer, ip, createdAt: Date.now() },
      300 // 5 minutes
    );

    return {
      challenge: challenge.question,
      token,
    };
  }

  /**
   * Verify CAPTCHA response
   */
  async verifyCaptcha(token: string, answer: string, ip: string): Promise<boolean> {
    try {
      const challengeData = await this.cacheService.get<any>(`captcha:${token}`);
      
      if (!challengeData) {
        return false; // Challenge expired or invalid
      }

      if (challengeData.ip !== ip) {
        return false; // IP mismatch
      }

      const isCorrect = challengeData.answer.toString() === answer.toString();
      
      if (isCorrect) {
        // Mark IP as verified for some time
        await this.cacheService.set(`captcha_verified:${ip}`, true, 1800); // 30 minutes
        
        // Remove used challenge
        await this.cacheService.delete(`captcha:${token}`);
      }

      return isCorrect;
    } catch (error) {
      this.logger.error('CAPTCHA verification failed:', error);
      return false;
    }
  }

  /**
   * Check if IP has passed CAPTCHA recently
   */
  async isCaptchaVerified(ip: string): Promise<boolean> {
    const verified = await this.cacheService.get<boolean>(`captcha_verified:${ip}`);
    return !!verified;
  }

  /**
   * Generate simple math CAPTCHA
   */
  private generateMathCaptcha(): { question: string; answer: number } {
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let answer: number;
    let question: string;

    switch (operation) {
      case '+':
        answer = num1 + num2;
        question = `What is ${num1} + ${num2}?`;
        break;
      case '-':
        // Ensure positive result
        const [larger, smaller] = num1 > num2 ? [num1, num2] : [num2, num1];
        answer = larger - smaller;
        question = `What is ${larger} - ${smaller}?`;
        break;
      case '*':
        // Use smaller numbers for multiplication
        const smallNum1 = Math.floor(Math.random() * 10) + 1;
        const smallNum2 = Math.floor(Math.random() * 10) + 1;
        answer = smallNum1 * smallNum2;
        question = `What is ${smallNum1} × ${smallNum2}?`;
        break;
      default:
        answer = num1 + num2;
        question = `What is ${num1} + ${num2}?`;
    }

    return { question, answer };
  }
}
