import { extractCleanEmailText } from '@/lib/email/clean-text';
import { createUniqueId } from '@/lib/identifiers';

export interface SpamTrainingSample {
  id: string;
  label: 'spam' | 'ham';
  fromAddress?: string | null;
  fromDomain?: string | null;
  subject?: string | null;
  snippet?: string | null;
  tokens: string[];
  createdAt: string;
}

export interface SpamModelState {
  spamCount: number;
  hamCount: number;
  tokenSpamCounts: Record<string, number>;
  tokenHamCounts: Record<string, number>;
  domainScores: Record<string, number>; // Domain spam probability (0.0 to 1.0)
}

export interface GenericSpamDataset {
  version: string;
  exportedAt: string;
  stats: {
    totalSpam: number;
    totalHam: number;
    vocabularySize: number;
  };
  samples: SpamTrainingSample[];
  modelState: SpamModelState;
}

export interface SpamClassificationResult {
  isSpam: boolean;
  score: number; // 0.0 (definitely safe) to 1.0 (definitely spam)
  confidence: number;
  topSpamTriggers: string[];
  topSafeSignals: string[];
  reason: string;
}

// Initial robust seed dataset for out-of-the-box accuracy
const DEFAULT_SEED_STATE: SpamModelState = {
  spamCount: 50,
  hamCount: 50,
  tokenSpamCounts: {
    lottery: 35,
    winner: 32,
    prize: 30,
    claim: 28,
    wire: 26,
    crypto: 25,
    bitcoin: 25,
    inheritance: 22,
    beneficiary: 20,
    casino: 22,
    jackpot: 20,
    urgent: 24,
    passwords: 18,
    verify: 18,
    suspended: 18,
    transfer: 20,
    payout: 22,
    funds: 19,
    congratulations: 25,
    million: 22,
    dollars: 20,
    reward: 18,
    unclaimed: 20,
  },
  tokenHamCounts: {
    meeting: 38,
    agenda: 30,
    standup: 25,
    sprint: 26,
    invoice: 28,
    report: 32,
    schedule: 30,
    calendar: 28,
    project: 35,
    review: 30,
    attached: 25,
    team: 35,
    update: 32,
    github: 25,
    pull: 20,
    request: 22,
    discussion: 20,
    colleague: 18,
    documents: 22,
    deployment: 20,
  },
  domainScores: {
    'phish-crypto-winner.xyz': 0.99,
    'winner-prize.xyz': 0.99,
    'github.com': 0.01,
    'google.com': 0.05,
  },
};

// Global in-memory model state (backed by defaults and updated via training)
let activeModelState: SpamModelState = JSON.parse(JSON.stringify(DEFAULT_SEED_STATE));
let activeSamples: SpamTrainingSample[] = [];

/**
 * Normalizes and extracts meaningful tokens, currencies, and domain features from email text.
 */
export function tokenizeEmail(
  subject?: string | null,
  snippetOrBody?: string | null,
  fromAddress?: string | null
): string[] {
  const combinedRaw = `${subject || ''} ${snippetOrBody || ''}`;
  const cleanText = extractCleanEmailText(combinedRaw, { maxLength: 2000, preserveParagraphs: false });

  const tokens: string[] = [];

  // Extract domain from sender address
  if (fromAddress) {
    const domainMatch = fromAddress.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase();
      tokens.push(`domain:${domain}`);
    }
  }

  // Extract currency amounts like $1,000,000 or €500
  const currencyMatches = cleanText.match(/[$€£¥]\s*\d[\d,.]*/g);
  if (currencyMatches) {
    for (const match of currencyMatches) {
      const normalized = match.replace(/[\s,]/g, '');
      tokens.push(normalized);
    }
  }

  // Tokenize words
  const words = cleanText
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w));

  // Common stop words to ignore
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'was',
    'you', 'your', 'our', 'all', 'any', 'can', 'will', 'but', 'not', 'out',
    'about', 'more', 'into', 'some', 'been', 'there', 'they', 'when', 'what',
  ]);

  for (const word of words) {
    if (!STOP_WORDS.has(word)) {
      tokens.push(word);
    }
  }

  return Array.from(new Set(tokens));
}

/**
 * Calculates token-level Robinson/Graham Bayesian spam probability with Laplace smoothing.
 */
function getTokenSpamProbability(token: string, model: SpamModelState): number {
  const spamCount = model.tokenSpamCounts[token] || 0;
  const hamCount = model.tokenHamCounts[token] || 0;

  if (spamCount === 0 && hamCount === 0) {
    return 0.4; // Unknown neutral prior
  }

  const s = Math.max(1, model.spamCount);
  const h = Math.max(1, model.hamCount);

  const pSpam = spamCount / s;
  const pHam = hamCount / h;

  // Probability given this token
  const prob = pSpam / (pSpam + pHam);

  // Robinson smoothing for low frequency tokens (s = 1, x = 0.4)
  const totalOccurrences = spamCount + hamCount;
  const smoothed = (1 * 0.4 + totalOccurrences * prob) / (1 + totalOccurrences);

  return Math.min(0.99, Math.max(0.01, smoothed));
}

/**
 * Evaluates an email and returns the Bayesian spam score and explanation.
 */
export function classifySpam(
  subject?: string | null,
  snippetOrBody?: string | null,
  fromAddress?: string | null,
  customModel?: SpamModelState
): SpamClassificationResult {
  const model = customModel || activeModelState;
  const tokens = tokenizeEmail(subject, snippetOrBody, fromAddress);

  if (tokens.length === 0) {
    return {
      isSpam: false,
      score: 0.2,
      confidence: 0.1,
      topSpamTriggers: [],
      topSafeSignals: [],
      reason: 'Insufficient content for statistical spam scoring',
    };
  }

  // Calculate probabilities for all tokens
  const tokenScores: { token: string; prob: number; distance: number }[] = [];

  for (const token of tokens) {
    if (token.startsWith('domain:')) {
      const domain = token.replace('domain:', '');
      if (model.domainScores[domain] !== undefined) {
        const dScore = model.domainScores[domain];
        tokenScores.push({ token, prob: dScore, distance: Math.abs(dScore - 0.5) });
      }
    } else {
      const prob = getTokenSpamProbability(token, model);
      tokenScores.push({ token, prob, distance: Math.abs(prob - 0.5) });
    }
  }

  // Pick top 15 most informative tokens (farthest from 0.5 neutral)
  tokenScores.sort((a, b) => b.distance - a.distance);
  const significantTokens = tokenScores.slice(0, 15);

  // Combine probabilities using Graham/Robinson method
  let pProduct = 1;
  let invProduct = 1;

  for (const item of significantTokens) {
    pProduct *= item.prob;
    invProduct *= 1 - item.prob;
  }

  const combinedScore = pProduct / (pProduct + invProduct);
  const normalizedScore = Number.isFinite(combinedScore) ? Math.min(1, Math.max(0, combinedScore)) : 0.4;

  const topSpamTriggers = significantTokens
    .filter((t) => t.prob > 0.6)
    .map((t) => t.token.replace('domain:', ''));

  const topSafeSignals = significantTokens
    .filter((t) => t.prob < 0.4)
    .map((t) => t.token.replace('domain:', ''));

  const isSpam = normalizedScore >= 0.7;

  let reason = '';
  if (isSpam) {
    reason = topSpamTriggers.length > 0
      ? `High spam indicators detected: ${topSpamTriggers.slice(0, 4).join(', ')}`
      : `High probability spam score (${(normalizedScore * 100).toFixed(0)}%)`;
  } else if (normalizedScore <= 0.3) {
    reason = `Classified safe based on authentic patterns: ${topSafeSignals.slice(0, 3).join(', ')}`;
  } else {
    reason = `Neutral / Low Risk score (${(normalizedScore * 100).toFixed(0)}%)`;
  }

  return {
    isSpam,
    score: Number(normalizedScore.toFixed(3)),
    confidence: Number((Math.abs(normalizedScore - 0.5) * 2).toFixed(2)),
    topSpamTriggers,
    topSafeSignals,
    reason,
  };
}

/**
 * Online training: incrementally updates Bayesian token & domain counts on user feedback.
 */
export function recordSpamTrainingSample(args: {
  label: 'spam' | 'ham';
  subject?: string | null;
  snippet?: string | null;
  fromAddress?: string | null;
  emailId?: string | null;
}): { sample: SpamTrainingSample; updatedStats: GenericSpamDataset['stats'] } {
  const { label, subject, snippet, fromAddress, emailId } = args;
  const tokens = tokenizeEmail(subject, snippet, fromAddress);

  let fromDomain: string | null = null;
  if (fromAddress) {
    const domainMatch = fromAddress.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (domainMatch) fromDomain = domainMatch[1].toLowerCase();
  }

  const sample: SpamTrainingSample = {
    id: emailId || createUniqueId('sample'),
    label,
    fromAddress,
    fromDomain,
    subject,
    snippet,
    tokens,
    createdAt: new Date().toISOString(),
  };

  activeSamples.push(sample);

  // Update model counts
  if (label === 'spam') {
    activeModelState.spamCount += 1;
    for (const token of tokens) {
      activeModelState.tokenSpamCounts[token] = (activeModelState.tokenSpamCounts[token] || 0) + 1;
    }
    if (fromDomain) {
      activeModelState.domainScores[fromDomain] = Math.min(0.99, (activeModelState.domainScores[fromDomain] || 0.5) + 0.2);
    }
  } else {
    activeModelState.hamCount += 1;
    for (const token of tokens) {
      activeModelState.tokenHamCounts[token] = (activeModelState.tokenHamCounts[token] || 0) + 1;
    }
    if (fromDomain) {
      activeModelState.domainScores[fromDomain] = Math.max(0.01, (activeModelState.domainScores[fromDomain] || 0.5) - 0.2);
    }
  }

  return {
    sample,
    updatedStats: getSpamModelStats(),
  };
}

/**
 * Returns summary statistics and top keywords of the current model.
 */
export function getSpamModelStats() {
  const spamKeywords = Object.entries(activeModelState.tokenSpamCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([token, count]) => ({ token, count }));

  const hamKeywords = Object.entries(activeModelState.tokenHamCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([token, count]) => ({ token, count }));

  const totalTokens = new Set([
    ...Object.keys(activeModelState.tokenSpamCounts),
    ...Object.keys(activeModelState.tokenHamCounts),
  ]).size;

  return {
    totalSpam: activeModelState.spamCount,
    totalHam: activeModelState.hamCount,
    vocabularySize: totalTokens,
    totalSamplesRecorded: activeSamples.length,
    topSpamKeywords: spamKeywords,
    topSafeKeywords: hamKeywords,
  };
}

/**
 * Exports the complete, portable generic JSON dataset.
 */
export function exportGenericSpamDataset(): GenericSpamDataset {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    stats: getSpamModelStats(),
    samples: JSON.parse(JSON.stringify(activeSamples)),
    modelState: JSON.parse(JSON.stringify(activeModelState)),
  };
}

/**
 * Imports and merges or replaces the generic JSON dataset from another environment.
 */
export function importGenericSpamDataset(
  dataset: Partial<GenericSpamDataset>,
  mode: 'replace' | 'merge' = 'replace'
): { success: boolean; stats: GenericSpamDataset['stats'] } {
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('Invalid dataset format');
  }

  if (mode === 'replace' && dataset.modelState) {
    activeModelState = {
      spamCount: dataset.modelState.spamCount || 0,
      hamCount: dataset.modelState.hamCount || 0,
      tokenSpamCounts: { ...(dataset.modelState.tokenSpamCounts || {}) },
      tokenHamCounts: { ...(dataset.modelState.tokenHamCounts || {}) },
      domainScores: { ...(dataset.modelState.domainScores || {}) },
    };
    activeSamples = Array.isArray(dataset.samples) ? [...dataset.samples] : [];
  } else if (dataset.modelState) {
    // Merge mode
    activeModelState.spamCount += dataset.modelState.spamCount || 0;
    activeModelState.hamCount += dataset.modelState.hamCount || 0;

    for (const [k, v] of Object.entries(dataset.modelState.tokenSpamCounts || {})) {
      activeModelState.tokenSpamCounts[k] = (activeModelState.tokenSpamCounts[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(dataset.modelState.tokenHamCounts || {})) {
      activeModelState.tokenHamCounts[k] = (activeModelState.tokenHamCounts[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(dataset.modelState.domainScores || {})) {
      activeModelState.domainScores[k] = v;
    }
    if (Array.isArray(dataset.samples)) {
      activeSamples = [...activeSamples, ...dataset.samples];
    }
  }

  return {
    success: true,
    stats: getSpamModelStats(),
  };
}

/**
 * Resets the spam model back to default seeds (useful for test isolation or reset).
 */
export function resetSpamModelToDefault() {
  activeModelState = JSON.parse(JSON.stringify(DEFAULT_SEED_STATE));
  activeSamples = [];
}
