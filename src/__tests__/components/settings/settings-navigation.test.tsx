jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('@/components/rules/RuleModal', () => ({
  RuleModal: () => null,
}));

jest.mock('@/components/settings/CreateUserModal', () => ({
  CreateUserModal: () => null,
}));

jest.mock('@/components/settings/ManageAccountAccessModal', () => ({
  ManageAccountAccessModal: () => null,
}));

jest.mock('@/components/settings/SpamSettingsTab', () => ({
  SpamSettingsTab: () => <div>Spam Settings Tab</div>,
}));

import { renderToStaticMarkup } from 'react-dom/server';
import SettingsLayout from '@/app/(dashboard)/settings/layout';
import MembersPage from '@/app/(dashboard)/settings/members/page';
import RulesSettingsPage from '@/app/(dashboard)/settings/rules/page';
import ExperimentsSettingsPage from '@/app/(dashboard)/settings/experiments/page';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';

const mockUseQuery = useQuery as jest.Mock;
const mockUseMutation = useMutation as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockUsePathname = usePathname as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUseSearchParams = useSearchParams as jest.Mock;

type QueryOptions = {
  queryKey: readonly unknown[];
  enabled?: boolean;
};

describe('Settings navigation and member guards', () => {
  let queryOptions: QueryOptions[];

  beforeEach(() => {
    jest.clearAllMocks();
    queryOptions = [];

    mockUsePathname.mockReturnValue('/settings/accounts');
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      refresh: jest.fn(),
      replace: jest.fn(),
    });
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
      cancelQueries: jest.fn(),
      getQueryData: jest.fn(),
      setQueryData: jest.fn(),
    });
    mockUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      variables: undefined,
    });
  });

  function configureQueries(role: 'admin' | 'member') {
    mockUseQuery.mockImplementation((options: QueryOptions) => {
      queryOptions.push(options);

      if (options.queryKey[0] === 'auth-me') {
        return {
          data: {
            role,
            user: { id: 'user-1' },
          },
          isLoading: false,
        };
      }

      if (options.queryKey[0] === 'members') {
        return { data: [], isLoading: false };
      }

      if (options.queryKey[0] === 'rules') {
        return { data: { rules: [] }, isLoading: false };
      }

      if (options.queryKey[0] === 'labels') {
        return { data: { labels: [] }, isLoading: false };
      }

      if (options.queryKey[0] === 'accounts') {
        return { data: [], isLoading: false };
      }

      if (options.queryKey[0] === 'experiment-settings') {
        return {
          data: {
            isAiEnabled: true,
            aiProvider: 'openai',
            aiApiKeyMasked: '',
            hasApiKey: false,
            aiModelName: 'gpt-4o-mini',
          },
          isLoading: false,
        };
      }

      if (options.queryKey[0] === 'notification-webhooks') {
        return { data: [], isLoading: false };
      }

      return { data: undefined, isLoading: false };
    });
  }

  it('shows admin-only links to admins', () => {
    configureQueries('admin');

    const html = renderToStaticMarkup(
      <SettingsLayout>
        <div>Settings body</div>
      </SettingsLayout>
    );

    expect(html).toContain('Members');
    expect(html).toContain('Label Assignment');
    expect(html).toContain('Email Accounts');
    expect(html).toContain('Email Rules');
    expect(html).toContain('Signatures');
    expect(html).toContain('Preferences');
    expect(html).toContain('Experimental');
    expect(html).toContain('Security');
  });

  it('hides admin-only links for members while keeping allowed settings links', () => {
    configureQueries('member');

    const html = renderToStaticMarkup(
      <SettingsLayout>
        <div>Settings body</div>
      </SettingsLayout>
    );

    expect(html).not.toContain('Members');
    expect(html).not.toContain('Email Rules');
    expect(html).not.toContain('Experimental');
    expect(html).toContain('Label Assignment');
    expect(html).toContain('Email Accounts');
    expect(html).toContain('Signatures');
    expect(html).toContain('Preferences');
    expect(html).toContain('Security');
  });

  it('renders a member fallback for the members page and disables member data fetching', () => {
    configureQueries('member');

    const html = renderToStaticMarkup(<MembersPage />);

    expect(html).toContain('Admin access required');
    expect(html).toContain('Go to Email Accounts');

    const membersQuery = queryOptions.find(
      ({ queryKey }) => queryKey[0] === 'members'
    );
    expect(membersQuery?.enabled).toBe(false);
  });

  it('renders a member fallback for the rules page and disables protected queries', () => {
    configureQueries('member');

    const html = renderToStaticMarkup(<RulesSettingsPage />);

    expect(html).toContain('Admin access required');
    expect(html).toContain('Go to Email Accounts');
    expect(
      queryOptions.find(({ queryKey }) => queryKey[0] === 'rules')?.enabled
    ).toBe(false);
    expect(
      queryOptions.find(({ queryKey }) => queryKey[0] === 'labels')?.enabled
    ).toBe(false);
    expect(
      queryOptions.find(({ queryKey }) => queryKey[0] === 'accounts')?.enabled
    ).toBe(false);
  });

  it('renders a member fallback for the experiments page and disables protected queries', () => {
    configureQueries('member');

    const html = renderToStaticMarkup(<ExperimentsSettingsPage />);

    expect(html).toContain('Admin access required');
    expect(html).toContain('Go to Email Accounts');
    expect(
      queryOptions.find(
        ({ queryKey }) => queryKey[0] === 'experiment-settings'
      )?.enabled
    ).toBe(false);
    expect(
      queryOptions.find(
        ({ queryKey }) => queryKey[0] === 'notification-webhooks'
      )?.enabled
    ).toBe(false);
  });
});
