jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('@/components/rules/RuleModal', () => ({
  RuleModal: () => null,
}));

import { renderToStaticMarkup } from 'react-dom/server';
import LabelAssignmentPage from '@/app/(dashboard)/settings/labels/page';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

const mockUseQuery = useQuery as jest.Mock;
const mockUseMutation = useMutation as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;

interface QueryOptions {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}

interface MutationOptions {
  mutationFn: (variables: {
    labelId: string;
    accountIds: string[];
  }) => Promise<unknown>;
}

describe('Labels settings page', () => {
  const originalFetch = global.fetch;
  let queryOptions: QueryOptions[];
  let mutationOptions: MutationOptions[];
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    queryOptions = [];
    mutationOptions = [];
    mockFetch = jest.fn();
    global.fetch = mockFetch as typeof fetch;

    mockUseQueryClient.mockReturnValue({
      cancelQueries: jest.fn(),
      getQueryData: jest.fn(),
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    });
    mockUseQuery.mockImplementation((options: QueryOptions) => {
      queryOptions.push(options);

      if (options.queryKey[0] === 'auth-me') {
        return { data: { role: 'member' } };
      }
      if (
        options.queryKey[0] === 'labels' &&
        options.queryKey[1] === 'management'
      ) {
        return {
          data: {
            labels: [
              {
                id: 'label-new',
                name: 'New label',
                color: '#3B82F6',
                accountIds: [],
              },
            ],
          },
          isLoading: false,
          isError: false,
        };
      }
      if (options.queryKey[0] === 'accounts') {
        return {
          data: [
            {
              id: 'account-visible',
              label: 'Inbox',
              emailAddress: 'inbox@example.com',
            },
          ],
          isLoading: false,
          isError: false,
        };
      }

      return { isLoading: false, isError: false };
    });
    mockUseMutation.mockImplementation((options: MutationOptions) => {
      mutationOptions.push(options);
      return {
        mutate: jest.fn(),
        isPending: false,
        variables: undefined,
      };
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('keeps an unassigned label visible and assignable after a management refetch', async () => {
    const html = renderToStaticMarkup(<LabelAssignmentPage />);

    expect(html).toContain('New label');
    expect(html).toContain(
      'aria-label="Assign account Inbox to label New label"'
    );
    expect(html).not.toContain('Delete requires admin access');
    expect(html).not.toContain('Label deletion remains admin-only');

    const managementQuery = queryOptions.find(
      ({ queryKey }) =>
        queryKey[0] === 'labels' && queryKey[1] === 'management'
    );
    expect(managementQuery).toBeDefined();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ labels: [] }),
    });
    await managementQuery!.queryFn();

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/labels?scope=management'
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, accountIds: ['account-visible'] }),
    });
    await mutationOptions[0].mutationFn({
      labelId: 'label-new',
      accountIds: ['account-visible'],
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/labels/label-new/accounts',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: ['account-visible'] }),
      }
    );
  });
});
