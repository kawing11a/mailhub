import * as React from 'react';

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    __esModule: true,
    ...actual,
    default: actual,
    useState: jest.fn(),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/components/sidebar/AccountsSection', () => ({
  AccountsSection: () => <div data-testid="accounts-section">Accounts Section</div>,
}));

jest.mock('@/components/pwa/InstallPWAButton', () => ({
  InstallPWAButton: () => null,
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: jest.fn(),
}));

jest.mock('@/stores/uiStore', () => ({
  useUIStore: jest.fn(),
}));

jest.mock('@/hooks/useFavouriteMutations', () => ({
  useAccounts: jest.fn(),
}));

jest.mock('@/hooks/useSignatures', () => ({
  useSignatures: jest.fn(),
}));

jest.mock('@/components/signatures/SignatureModal', () => ({
  SignatureModal: () => null,
}));

jest.mock('@/components/rules/RuleModal', () => ({
  RuleModal: () => null,
}));

import { renderToStaticMarkup } from 'react-dom/server';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { useAccounts } from '@/hooks/useFavouriteMutations';
import { useSignatures } from '@/hooks/useSignatures';
import { Sidebar } from '@/components/sidebar/Sidebar';
import LabelAssignmentPage from '@/app/(dashboard)/settings/labels/page';
import SignaturesSettingsPage from '@/app/(dashboard)/settings/signatures/page';

const mockUseState = React.useState as jest.Mock;
const mockUseMutation = useMutation as jest.Mock;
const mockUseQuery = useQuery as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockUsePathname = usePathname as jest.Mock;
const mockUseAccountStore = useAccountStore as unknown as jest.Mock;
const mockUseUIStore = useUIStore as unknown as jest.Mock;
const mockUseAccounts = useAccounts as jest.Mock;
const mockUseSignatures = useSignatures as jest.Mock;

function configureUseState(overrides: unknown[] = []) {
  let index = 0;
  mockUseState.mockImplementation((initial: unknown) => {
    const value =
      index < overrides.length
        ? overrides[index]
        : typeof initial === 'function'
          ? (initial as () => unknown)()
          : initial;
    index += 1;
    return [value, jest.fn()];
  });
}

describe('member permission navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureUseState();
    mockUsePathname.mockReturnValue('/inbox');
    mockUseAccountStore.mockImplementation((selector?: (state: { setComposeModalOpen: jest.Mock }) => unknown) => {
      const state = { setComposeModalOpen: jest.fn() };
      return typeof selector === 'function' ? selector(state) : state;
    });
    mockUseUIStore.mockImplementation((selector?: (state: { setSearchOpen: jest.Mock }) => unknown) => {
      const state = { setSearchOpen: jest.fn() };
      return typeof selector === 'function' ? selector(state) : state;
    });
    mockUseAccounts.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseSignatures.mockReturnValue({
      signatures: [],
      isLoading: false,
      deleteSignature: jest.fn(),
      setDefaultSignature: jest.fn(),
    });
    mockUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    mockUseQueryClient.mockReturnValue({
      cancelQueries: jest.fn().mockResolvedValue(undefined),
      getQueryData: jest.fn(),
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    });
  });

  function configureSidebarQueries(role: 'admin' | 'member') {
    mockUseQuery.mockImplementation((options: { queryKey: readonly unknown[] }) => {
      if (options.queryKey[0] === 'new-emails-count') {
        return { data: { emails: [] } };
      }

      if (options.queryKey[0] === 'auth-me') {
        return { data: { role } };
      }

      return { data: undefined };
    });
  }

  it('routes members to an allowed settings page from the sidebar', () => {
    configureSidebarQueries('member');

    const html = renderToStaticMarkup(<Sidebar />);

    expect(html).toContain('href="/settings/accounts"');
    expect(html).not.toContain('href="/settings/members"');
  });

  it('keeps the admin sidebar settings shortcut pointed at members management', () => {
    configureSidebarQueries('admin');

    const html = renderToStaticMarkup(<Sidebar />);

    expect(html).toContain('href="/settings/members"');
  });

  it('falls back to the first accessible signature account when local selection is stale', () => {
    configureUseState(['missing-account', '', '', false, null]);
    mockUseAccounts.mockReturnValue({
      data: [
        {
          id: 'account-visible',
          label: 'Visible Inbox',
          emailAddress: 'visible@example.com',
          canManageAccess: false,
          isFavourite: false,
          sortOrder: null,
        },
      ],
      isLoading: false,
    });

    renderToStaticMarkup(<SignaturesSettingsPage />);

    expect(mockUseSignatures).toHaveBeenCalledWith('account-visible');
  });

  it('renders only the accessible account data in member label assignment controls', () => {
    configureUseState();
    mockUseQuery.mockImplementation((options: { queryKey: readonly unknown[] }) => {
      if (options.queryKey[0] === 'auth-me') {
        return { data: { role: 'member' } };
      }

      if (options.queryKey[0] === 'labels') {
        return {
          data: {
            labels: [
              {
                id: 'label-visible',
                name: 'Customer',
                color: '#3B82F6',
                accountIds: ['account-visible'],
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
              label: 'Visible Inbox',
              emailAddress: 'visible@example.com',
              color: '#3B82F6',
              avatarInitials: 'VI',
            },
          ],
          isLoading: false,
          isError: false,
        };
      }

      return { data: undefined, isLoading: false, isError: false };
    });

    const html = renderToStaticMarkup(<LabelAssignmentPage />);

    expect(html).toContain('Visible Inbox');
    expect(html).toContain('visible@example.com');
    expect(html).toContain('You can manage labels for the email accounts you can access.');
    expect(html).not.toContain('Delete requires admin access');
  });
});
