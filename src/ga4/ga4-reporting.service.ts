import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { createPrivateKey } from 'crypto';

/**
 * Lightweight GA4 Data API wrapper.
 *
 * NOTE: This requires the following env vars to be set in production:
 *  - GA4_PROPERTY_ID
 *  - GA4_SERVICE_ACCOUNT_EMAIL
 *  - GA4_SERVICE_ACCOUNT_KEY (JSON private key or base64-encoded)
 *
 * If these are not configured, methods will return empty datasets rather than throwing.
 */
@Injectable()
export class Ga4ReportingService {
  private readonly logger = new Logger(Ga4ReportingService.name);
  private readonly propertyId: string | undefined;
  private analyticsDataClient: any | null = null;
  private disabledUntilMs = 0;

  constructor(private readonly configService: ConfigService) {
    this.propertyId = this.configService.get<string>('GA4_PROPERTY_ID');
  }

  private async getClient() {
    if (this.disabledUntilMs && Date.now() < this.disabledUntilMs) {
      return null;
    }

    if (!this.propertyId) {
      return null;
    }

    if (this.analyticsDataClient) {
      return this.analyticsDataClient;
    }

    const clientEmail = this.configService.get<string>('GA4_SERVICE_ACCOUNT_EMAIL');
    const rawKey = this.configService.get<string>('GA4_SERVICE_ACCOUNT_KEY');

    if (!clientEmail || !rawKey) {
      this.logger.warn('GA4 reporting disabled: missing service account configuration');
      return null;
    }

    const normalize = (value: string) => {
      let v = value.trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v.trim();
    };

    let material = normalize(rawKey);

    const looksHexToken = /^[0-9a-f]{32,128}$/i.test(material);
    if (looksHexToken) {
      this.disabledUntilMs = Date.now() + 5 * 60 * 1000;
      this.logger.warn(
        'GA4 reporting disabled: GA4_SERVICE_ACCOUNT_KEY looks like a token. Expected JSON service account key or base64(JSON).',
      );
      return null;
    }

    if (!material.startsWith('{') && !material.includes('-----BEGIN')) {
      try {
        material = normalize(Buffer.from(material, 'base64').toString('utf8'));
      } catch {
        material = normalize(rawKey);
      }
    }

    let email = clientEmail;
    let privateKey = material;
    if (material.startsWith('{')) {
      try {
        const jsonKey = JSON.parse(material);
        email = email || jsonKey.client_email;
        privateKey = jsonKey.private_key || jsonKey.privateKey;
      } catch {
        this.disabledUntilMs = Date.now() + 5 * 60 * 1000;
        this.logger.warn('GA4 reporting disabled: invalid JSON service account key');
        return null;
      }
    }

    if (!email || !privateKey) {
      this.disabledUntilMs = Date.now() + 5 * 60 * 1000;
      this.logger.warn('GA4 reporting disabled: missing client email or private key');
      return null;
    }

    privateKey = normalize(privateKey).replace(/\\r/g, '\r').replace(/\\n/g, '\n');

    let key: string;
    try {
      key = createPrivateKey(privateKey).export({ format: 'pem', type: 'pkcs8' }).toString();
    } catch {
      const compact = privateKey.replace(/\s+/g, '');
      const looksBase64 = compact.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compact);
      if (!looksBase64) {
        this.disabledUntilMs = Date.now() + 5 * 60 * 1000;
        this.logger.warn('GA4 reporting disabled: unsupported private key format');
        return null;
      }

      let buf: Buffer;
      try {
        buf = Buffer.from(compact, 'base64');
      } catch {
        this.disabledUntilMs = Date.now() + 5 * 60 * 1000;
        this.logger.warn('GA4 reporting disabled: unsupported private key format');
        return null;
      }

      try {
        key = createPrivateKey({ key: buf, format: 'der', type: 'pkcs8' })
          .export({ format: 'pem', type: 'pkcs8' })
          .toString();
      } catch {
        try {
          key = createPrivateKey({ key: buf, format: 'der', type: 'pkcs1' })
            .export({ format: 'pem', type: 'pkcs8' })
            .toString();
        } catch {
          this.disabledUntilMs = Date.now() + 5 * 60 * 1000;
          this.logger.warn('GA4 reporting disabled: unsupported private key format');
          return null;
        }
      }
    }

    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });

    try {
      await auth.authorize();
    } catch (error) {
      this.disabledUntilMs = Date.now() + 5 * 60 * 1000;
      this.logger.warn(`GA4 reporting disabled: failed to authorize (${error})`);
      return null;
    }

    this.analyticsDataClient = google.analyticsdata({ version: 'v1beta', auth });
    return this.analyticsDataClient;
  }

  /**
   * Basic time-series for views/starts/completes for a content item.
   */
  async getContentTimeSeries(
    contentId: string,
    contentType: string,
    from: string,
    to: string,
  ): Promise<
    Array<{
      date: string;
      views: number;
      starts: number;
      completes: number;
    }>
  > {
    const client = await this.getClient();
    if (!client || !this.propertyId) {
      return [];
    }

    try {
      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'eventCount' }, // we will filter per event name later
          ],
          dimensionFilter: {
            andGroup: {
              expressions: [
                {
                  filter: {
                    fieldName: 'eventName',
                    stringFilter: { value: 'content_view' },
                  },
                },
                {
                  filter: {
                    fieldName: 'customEvent:content_id',
                    stringFilter: { value: contentId },
                  },
                },
                {
                  filter: {
                    fieldName: 'customEvent:content_type',
                    stringFilter: { value: contentType },
                  },
                },
              ],
            },
          },
        },
      });

      const rows = response.rows ?? [];
      return rows.map((row: any) => ({
        date: row.dimensionValues?.[0]?.value ?? '',
        views: Number(row.metricValues?.[0]?.value ?? 0),
        starts: 0,
        completes: 0,
      }));
    } catch (error) {
      this.logger.warn(`Failed to query GA4 time series for content ${contentId}: ${error}`);
      return [];
    }
  }

  /**
   * High-level engagement summary for the whole property (sessions, page views, etc.)
   */
  async getEngagementSummary(
    from: string,
    to: string,
  ): Promise<{
    totalSessions: number;
    pageViews: number;
    averageSessionDuration: number;
    bounceRate: number;
  } | null> {
    const client = await this.getClient();
    if (!client || !this.propertyId) {
      return null;
    }

    try {
      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          metrics: [
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
          ],
        },
      });

      const row = response.rows?.[0];
      if (!row) {
        return {
          totalSessions: 0,
          pageViews: 0,
          averageSessionDuration: 0,
          bounceRate: 0,
        };
      }

      const [sessions, pageViews, avgSessionDuration, bounceRate] = row.metricValues ?? [];

      return {
        totalSessions: Number(sessions?.value ?? 0),
        pageViews: Number(pageViews?.value ?? 0),
        averageSessionDuration: Number(avgSessionDuration?.value ?? 0),
        // GA4 bounceRate is already a percentage [0-100]; convert to 0-1 for internal use
        bounceRate: Number(bounceRate?.value ?? 0) / 100,
      };
    } catch (error) {
      this.logger.warn(`Failed to query GA4 engagement summary: ${error}`);
      return null;
    }
  }

  async getCreatorOverview(creatorId: string, from: string, to: string, communityId?: string) {
    const client = await this.getClient();
    if (!client || !this.propertyId) return null;

    try {
      const expressions: any[] = [
        { filter: { fieldName: 'customEvent:creator_id', stringFilter: { value: creatorId } } }
      ];

      if (communityId) {
        expressions.push({
          filter: { fieldName: 'customEvent:community_id', stringFilter: { value: communityId } }
        });
      }

      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          metrics: [
            { name: 'activeUsers' }, // uniqueUsers
            { name: 'eventCount' },  // interactions
            { name: 'sessions' }
          ],
          dimensionFilter: { andGroup: { expressions } }
        }
      });

      const values = response.rows?.[0]?.metricValues;
      return {
        uniqueUsers: Number(values?.[0]?.value ?? 0),
        interactions: Number(values?.[1]?.value ?? 0),
        sessions: Number(values?.[2]?.value ?? 0),
      };
    } catch (err) {
      this.logger.warn(`Failed to query GA4 creator overview: ${err}`);
      return null;
    }
  }

  async getCreatorContentStats(creatorId: string, contentType: string, from: string, to: string, communityId?: string) {
    const client = await this.getClient();
    if (!client || !this.propertyId) return [];

    try {
      const expressions: any[] = [
        { filter: { fieldName: 'customEvent:creator_id', stringFilter: { value: creatorId } } },
        { filter: { fieldName: 'customEvent:content_type', stringFilter: { value: contentType } } }
      ];
      if (communityId) {
        expressions.push({ filter: { fieldName: 'customEvent:community_id', stringFilter: { value: communityId } } });
      }

      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [
            { name: 'customEvent:content_id' },
            { name: 'eventName' }
          ],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: { andGroup: { expressions } }
        }
      });

      const map = new Map<string, any>();
      
      response.rows?.forEach((row: any) => {
        const contentId = row.dimensionValues?.[0]?.value;
        const eventName = row.dimensionValues?.[1]?.value;
        const count = Number(row.metricValues?.[0]?.value ?? 0);

        if (!map.has(contentId)) {
          map.set(contentId, { 
            contentId, 
            views: 0, starts: 0, completes: 0, likes: 0, shares: 0, downloads: 0, bookmarks: 0, ratingsCount: 0
          });
        }
        const entry = map.get(contentId);
        
        if (eventName === 'content_view') entry.views += count;
        else if (eventName === 'content_start') entry.starts += count;
        else if (eventName === 'content_complete') entry.completes += count;
        else if (eventName === 'content_like') entry.likes += count;
        else if (eventName === 'content_share') entry.shares += count;
        else if (eventName === 'content_download') entry.downloads += count;
        else if (eventName === 'content_bookmark') entry.bookmarks += count;
        else if (eventName === 'content_rate') entry.ratingsCount += count;
      });

      return Array.from(map.values());
    } catch (err) {
      this.logger.warn(`Failed to query GA4 creator content stats: ${err}`);
      return [];
    }
  }

  async getCreatorEventCounts(creatorId: string, from: string, to: string, communityId?: string) {
    const client = await this.getClient();
    if (!client || !this.propertyId) return null;

    try {
      const expressions: any[] = [
        { filter: { fieldName: 'customEvent:creator_id', stringFilter: { value: creatorId } } }
      ];
      if (communityId) {
        expressions.push({ filter: { fieldName: 'customEvent:community_id', stringFilter: { value: communityId } } });
      }

      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: { andGroup: { expressions } }
        }
      });

      const counts = {
        views: 0, starts: 0, completes: 0, likes: 0, shares: 0, downloads: 0, bookmarks: 0, ratingsCount: 0
      };

      response.rows?.forEach((row: any) => {
        const eventName = row.dimensionValues?.[0]?.value;
        const count = Number(row.metricValues?.[0]?.value ?? 0);
        
        if (eventName === 'content_view') counts.views += count;
        else if (eventName === 'content_start') counts.starts += count;
        else if (eventName === 'content_complete') counts.completes += count;
        else if (eventName === 'content_like') counts.likes += count;
        else if (eventName === 'content_share') counts.shares += count;
        else if (eventName === 'content_download') counts.downloads += count;
        else if (eventName === 'content_bookmark') counts.bookmarks += count;
        else if (eventName === 'content_rate') counts.ratingsCount += count;
      });

      return counts;
    } catch (err) {
      this.logger.warn(`Failed to query GA4 creator event counts: ${err}`);
      return null;
    }
  }

  async getCreatorDailyTrend(creatorId: string, from: string, to: string, communityId?: string) {
    const client = await this.getClient();
    if (!client || !this.propertyId) return [];

    try {
      const expressions: any[] = [
        { filter: { fieldName: 'customEvent:creator_id', stringFilter: { value: creatorId } } }
      ];
      if (communityId) {
        expressions.push({ filter: { fieldName: 'customEvent:community_id', stringFilter: { value: communityId } } });
      }

      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: 'date' }, { name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: { andGroup: { expressions } },
        },
      });

      const byDate = new Map<string, { date: string; views: number; starts: number; completes: number; watchTime: number }>();

      for (const row of response.rows || []) {
        const rawDate = row.dimensionValues?.[0]?.value || '';
        const eventName = row.dimensionValues?.[1]?.value || '';
        const count = Number(row.metricValues?.[0]?.value ?? 0);
        if (!rawDate) continue;

        const normalizedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T00:00:00.000Z`;
        if (!byDate.has(normalizedDate)) {
          byDate.set(normalizedDate, {
            date: normalizedDate,
            views: 0,
            starts: 0,
            completes: 0,
            watchTime: 0,
          });
        }

        const bucket = byDate.get(normalizedDate)!;
        if (eventName === 'content_view') bucket.views += count;
        else if (eventName === 'content_start') bucket.starts += count;
        else if (eventName === 'content_complete') bucket.completes += count;
      }

      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      this.logger.warn(`Failed to query GA4 creator daily trend: ${err}`);
      return [];
    }
  }

  async getCreatorDevices(creatorId: string, from: string, to: string, communityId?: string) {
    const client = await this.getClient();
    if (!client || !this.propertyId) return [];

    try {
      const expressions: any[] = [
        { filter: { fieldName: 'customEvent:creator_id', stringFilter: { value: creatorId } } }
      ];
      if (communityId) {
        expressions.push({ filter: { fieldName: 'customEvent:community_id', stringFilter: { value: communityId } } });
      }

      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'activeUsers' }],
          dimensionFilter: { andGroup: { expressions } }
        }
      });

      return response.rows?.map((row: any) => ({
        device: row.dimensionValues?.[0]?.value ?? 'unknown',
        count: Number(row.metricValues?.[0]?.value ?? 0)
      })) ?? [];
    } catch (err) {
      this.logger.warn(`Failed to query GA4 creator devices: ${err}`);
      return [];
    }
  }

  async getCreatorReferrers(creatorId: string, from: string, to: string, communityId?: string) {
    const client = await this.getClient();
    if (!client || !this.propertyId) return [];

    try {
      const expressions: any[] = [
        { filter: { fieldName: 'customEvent:creator_id', stringFilter: { value: creatorId } } }
      ];
      if (communityId) {
        expressions.push({ filter: { fieldName: 'customEvent:community_id', stringFilter: { value: communityId } } });
      }

      const [response] = await client.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: 'sessionSource' }],
          metrics: [{ name: 'sessions' }],
          dimensionFilter: { andGroup: { expressions } }
        }
      });

      return response.rows?.map((row: any) => ({
        referrer: row.dimensionValues?.[0]?.value ?? 'unknown',
        count: Number(row.metricValues?.[0]?.value ?? 0)
      })) ?? [];
    } catch (err) {
      this.logger.warn(`Failed to query GA4 creator referrers: ${err}`);
      return [];
    }
  }
}
