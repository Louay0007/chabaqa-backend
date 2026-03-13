export type CreatorInsightsConfidence = 'low' | 'med' | 'high';

export type CreatorInsightsResponse = {
  summary: string;
  topIssues: Array<{
    stepId: string;
    stepTitle: string;
    metricEvidence: string[];
    hypothesis: string;
    confidence: CreatorInsightsConfidence;
  }>;
  fixes: Array<{
    title: string;
    whyItHelps: string;
    exactCreatorAction: string;
    expectedMetricLift: string;
    risk: string;
  }>;
  rewriteSuggestions: Array<{
    target: 'intro' | 'cta' | 'structure';
    stepId: string;
    text: string;
  }>;
  experiments: Array<{
    name: string;
    variantA: string;
    variantB: string;
    successMetric: string;
    runForDays: number;
  }>;
  warnings: string[];
};

const toNonEmptyString = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

const toConfidence = (value: unknown): CreatorInsightsConfidence => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'high') return 'high';
  if (raw === 'med' || raw === 'medium') return 'med';
  return 'low';
};

export const validateCreatorInsightsResponse = (
  payload: unknown,
): { ok: true; value: CreatorInsightsResponse } | { ok: false; error: string } => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Response is not an object' };
  }

  const obj: any = payload as any;
  const summary = toNonEmptyString(obj.summary);
  if (!summary) {
    return { ok: false, error: 'Missing "summary"' };
  }

  const topIssuesRaw = Array.isArray(obj.topIssues) ? obj.topIssues : [];
  const fixesRaw = Array.isArray(obj.fixes) ? obj.fixes : [];
  const rewriteRaw = Array.isArray(obj.rewriteSuggestions) ? obj.rewriteSuggestions : [];
  const experimentsRaw = Array.isArray(obj.experiments) ? obj.experiments : [];
  const warnings = toStringArray(obj.warnings);

  const topIssues = topIssuesRaw
    .map((entry: any) => ({
      stepId: toNonEmptyString(entry?.stepId) || '',
      stepTitle: toNonEmptyString(entry?.stepTitle) || '',
      metricEvidence: toStringArray(entry?.metricEvidence),
      hypothesis: toNonEmptyString(entry?.hypothesis) || '',
      confidence: toConfidence(entry?.confidence),
    }))
    .filter((entry: any) => entry.stepId && entry.stepTitle && entry.hypothesis);

  const fixes = fixesRaw
    .map((entry: any) => ({
      title: toNonEmptyString(entry?.title) || '',
      whyItHelps: toNonEmptyString(entry?.whyItHelps) || '',
      exactCreatorAction: toNonEmptyString(entry?.exactCreatorAction) || '',
      expectedMetricLift: toNonEmptyString(entry?.expectedMetricLift) || '',
      risk: toNonEmptyString(entry?.risk) || '',
    }))
    .filter((entry: any) => entry.title && entry.exactCreatorAction);

  const rewriteSuggestions = rewriteRaw
    .map((entry: any) => {
      const targetRaw = typeof entry?.target === 'string' ? entry.target.trim().toLowerCase() : '';
      const target: 'intro' | 'cta' | 'structure' =
        targetRaw === 'cta' ? 'cta' : targetRaw === 'structure' ? 'structure' : 'intro';
      return {
        target,
        stepId: toNonEmptyString(entry?.stepId) || '',
        text: toNonEmptyString(entry?.text) || '',
      };
    })
    .filter((entry: any) => entry.stepId && entry.text);

  const experiments = experimentsRaw
    .map((entry: any) => ({
      name: toNonEmptyString(entry?.name) || '',
      variantA: toNonEmptyString(entry?.variantA) || '',
      variantB: toNonEmptyString(entry?.variantB) || '',
      successMetric: toNonEmptyString(entry?.successMetric) || '',
      runForDays: Number(entry?.runForDays || 0),
    }))
    .filter((entry: any) => entry.name && entry.variantA && entry.variantB && Number.isFinite(entry.runForDays) && entry.runForDays > 0);

  return {
    ok: true,
    value: {
      summary,
      topIssues,
      fixes,
      rewriteSuggestions,
      experiments,
      warnings,
    },
  };
};

