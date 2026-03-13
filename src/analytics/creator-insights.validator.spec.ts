import { validateCreatorInsightsResponse } from './creator-insights.validator';

describe('validateCreatorInsightsResponse', () => {
  it('rejects non-object payloads', () => {
    expect(validateCreatorInsightsResponse(null)).toEqual({ ok: false, error: 'Response is not an object' });
    expect(validateCreatorInsightsResponse('nope' as any).ok).toBe(false);
  });

  it('requires summary', () => {
    const res = validateCreatorInsightsResponse({ topIssues: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('summary');
    }
  });

  it('accepts a minimal valid response', () => {
    const res = validateCreatorInsightsResponse({
      summary: 'Hello',
      topIssues: [],
      fixes: [],
      rewriteSuggestions: [],
      experiments: [],
      warnings: [],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.summary).toBe('Hello');
      expect(res.value.topIssues).toEqual([]);
      expect(res.value.fixes).toEqual([]);
      expect(res.value.rewriteSuggestions).toEqual([]);
      expect(res.value.experiments).toEqual([]);
      expect(res.value.warnings).toEqual([]);
    }
  });

  it('filters malformed entries and normalizes confidence/targets', () => {
    const res = validateCreatorInsightsResponse({
      summary: 'ok',
      topIssues: [
        { stepId: 'c1', stepTitle: 'Chapter 1', hypothesis: 'Hard', metricEvidence: ['a'], confidence: 'HIGH' },
        { stepId: '', stepTitle: 'Missing', hypothesis: 'x' },
      ],
      fixes: [{ title: 'Fix', exactCreatorAction: 'Do', whyItHelps: 'Because', expectedMetricLift: 'up', risk: 'low' }],
      rewriteSuggestions: [{ target: 'CTA', stepId: 'c1', text: 'New CTA' }],
      experiments: [{ name: 'A/B', variantA: 'A', variantB: 'B', successMetric: 'starts', runForDays: 7 }],
      warnings: ['w1', ' ', 1],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.topIssues).toHaveLength(1);
      expect(res.value.topIssues[0].confidence).toBe('high');
      expect(res.value.rewriteSuggestions[0].target).toBe('cta');
      expect(res.value.warnings).toEqual(['w1']);
    }
  });
});

