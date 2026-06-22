import { Meilisearch } from 'meilisearch';

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || 'masterKey123';

export const meilisearch = new Meilisearch({
  host: MEILISEARCH_HOST,
  apiKey: MEILISEARCH_API_KEY,
});

export async function initMeilisearch() {
  const index = meilisearch.index('emails');
  
  await index.updateSettings({
    searchableAttributes: [
      'subject',
      'bodyText',
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
