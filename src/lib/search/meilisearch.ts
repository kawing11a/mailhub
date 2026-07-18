import { Meilisearch } from 'meilisearch';

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || 'masterKey123';

export const meilisearch = new Meilisearch({
  host: MEILISEARCH_HOST,
  apiKey: MEILISEARCH_API_KEY.trim(),
});

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
    ],
    sortableAttributes: [
      'receivedAt',
      'sentAt',
    ],
    // 👇 Add the embedders configuration
    embedders: {
      default: {
        source: 'rest',
        apiKey: process.env.MEILISEARCH_EMBED_API_KEY, // Make sure to add this to your .env
        url: process.env.MEILISEARCH_EMBED_URL || 'http://127.0.0.1:8080/v1/embeddings',
        headers: {
          'Authorization': 'Bearer {{apiKey}}',
          'Content-Type': 'application/json'
        },
        request: {
          model: process.env.MEILISEARCH_EMBED_MODEL || 'bge-m3-mlx-fp16',
          input: '{{text}}'
        },
        response: {
          data: [
            {
              embedding: '{{embedding}}'
            }
          ]
        },
        // documentTemplate tells Meilisearch which fields to combine into the embedding vector
        documentTemplate: `Email Document
Subject: {{ doc.subject | default: 'No Subject' }}
From: {{ doc.fromName | default: 'Unknown' }} <{{ doc.fromAddress }}>
{% if doc.toAddresses %}To: {% for to in doc.toAddresses %}{{ to.address }} {% endfor %}{% endif %}
Content Preview: {{ doc.snippet }}`
      }
    },
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
