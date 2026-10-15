import { Meilisearch } from 'meilisearch';

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || 'masterKey123';

export const meilisearch = new Meilisearch({
  host: MEILISEARCH_HOST,
  apiKey: MEILISEARCH_API_KEY.trim(),
});

const EMAIL_EMBEDDER_CONFIG = {
  source: 'rest' as const,
  apiKey: process.env.MEILISEARCH_EMBED_API_KEY,
  url: process.env.MEILISEARCH_EMBED_URL || 'http://127.0.0.1:8080/v1/embeddings',
  headers: {
    Authorization: 'Bearer {{apiKey}}',
    'Content-Type': 'application/json',
  },
  request: {
    model: process.env.MEILISEARCH_EMBED_MODEL || 'bge-m3-mlx-fp16',
    input: '{{text}}',
  },
  response: {
    data: [
      {
        embedding: '{{embedding}}',
      },
    ],
  },
  // Keep the template in sync with the email document fields used for embeddings.
  documentTemplate: `Email Document
Subject: {{ doc.subject | default: 'No Subject' }}
From: {{ doc.fromName | default: 'Unknown' }} <{{ doc.fromAddress }}>
{% if doc.toAddresses %}To: {% for to in doc.toAddresses %}{{ to.address }} {% endfor %}{% endif %}
Content Preview: {{ doc.snippet }}`,
};

/** Enable or remove the email embedder and wait for Meilisearch to apply it. */
export async function configureEmailEmbedder(enabled: boolean): Promise<void> {
  const index = meilisearch.index('emails');
  const task = enabled
    ? index.updateEmbedders({ default: EMAIL_EMBEDDER_CONFIG })
    : index.resetEmbedders();
  const result = await task.waitTask({ timeout: 120_000, interval: 250 });

  if (result.status !== 'succeeded') {
    throw new Error(`Meilisearch embedder update failed with status: ${result.status}`);
  }
}

export async function initMeilisearch() {
  const index = meilisearch.index('emails');

  await index.updateSettings({
    searchableAttributes: [
      'subject',
      'fromAddress',
      'fromName',
      'toAddresses',
      'snippet',
    ],
    filterableAttributes: [
      'accountId',
      'folder',
      'isRead',
      'isStarred',
      'hasAttachments',
      'labelIds',
      'organizationId',
      'receivedAt',
      'sentAt',
      'threadId',
    ],
    sortableAttributes: [
      'receivedAt',
      'sentAt',
    ],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: {
        oneTypo: 4,
        twoTypos: 8,
      },
    },
  });

  console.log('Meilisearch index "emails" initialized.');
}
