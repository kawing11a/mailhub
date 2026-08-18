import * as React from 'react';

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    __esModule: true,
    ...actual,
    default: actual,
    useState: jest.fn(),
    useEffect: jest.fn(),
    Suspense: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: jest.fn(),
}));

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAccountStore } from '@/stores/accountStore';
import { renderToStaticMarkup } from 'react-dom/server';
import { AddAccountModal } from '@/components/settings/AddAccountModal';
import { ManageAccountAccessModal } from '@/components/settings/ManageAccountAccessModal';
import EmailAccountsPage from '@/app/(dashboard)/settings/accounts/page';

type ReactNodeLike = React.ReactNode;
type TestClickEvent = { stopPropagation?: () => void };
type TestElementProps = {
  children?: ReactNodeLike;
  onAccountCreated?: (accountId: string) => unknown;
  onClick?: (event?: TestClickEvent) => unknown;
  [key: string]: unknown;
};
type ReactElementLike = React.ReactElement<TestElementProps>;

const mockUseState = useState as jest.Mock;
const mockUseEffect = useEffect as jest.Mock;
const mockUseQuery = useQuery as jest.Mock;
const mockUseMutation = useMutation as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUseSearchParams = useSearchParams as jest.Mock;
const mockToastSuccess = toast.success as jest.Mock;
const mockUseAccountStore = useAccountStore as unknown as jest.Mock;

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_TWO_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_THREE_ID = '33333333-3333-4333-8333-333333333333';

let stateSetters: jest.Mock[] = [];
let mutationConfigs: Array<Record<string, any>> = [];

function configureUseState(overrides: unknown[] = []) {
  stateSetters = [];
  let index = 0;
  mockUseState.mockImplementation((initial: unknown) => {
    const value =
      index < overrides.length
        ? overrides[index]
        : typeof initial === 'function'
          ? (initial as () => unknown)()
          : initial;
    const setter = jest.fn();
    stateSetters.push(setter);
    index += 1;
    return [value, setter];
  });
}

function configureMutationMock() {
  mutationConfigs = [];
  mockUseMutation.mockImplementation((config: Record<string, any>) => {
    mutationConfigs.push(config);
    return {
      mutate: jest.fn(),
      isPending: false,
      variables: undefined,
    };
  });
}

function createSearchParams(params: Record<string, string>) {
  return {
    get: (key: string) => params[key] ?? null,
  };
}

function isReactElement(node: ReactNodeLike): node is ReactElementLike {
  return Boolean(node) && typeof node === 'object' && 'props' in (node as object) && 'type' in (node as object);
}

function childNodes(node: ReactNodeLike): ReactNodeLike[] {
  if (!isReactElement(node)) return [];
  return React.Children.toArray(node.props.children) as ReactNodeLike[];
}

function findAll(node: ReactNodeLike, predicate: (element: ReactElementLike) => boolean): ReactElementLike[] {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.flatMap((child) => findAll(child, predicate));
  }
  if (!isReactElement(node)) return [];

  const matches = predicate(node) ? [node] : [];
  return matches.concat(childNodes(node).flatMap((child) => findAll(child, predicate)));
}

function textContent(node: ReactNodeLike): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map((child) => textContent(child)).join('');
  }
  if (!isReactElement(node)) return '';
  return childNodes(node).map((child) => textContent(child)).join('');
}

function findButtonByText(node: ReactNodeLike, label: string) {
  return findAll(
    node,
    (element) => element.type === 'button' && textContent(element).includes(label)
  )[0];
}

function getClickHandler(element: ReactElementLike) {
  if (!element.props.onClick) throw new Error('Expected element to have an onClick handler');
  return element.props.onClick;
}

function getAccountCreatedHandler(element: ReactElementLike) {
  if (!element.props.onAccountCreated) {
    throw new Error('Expected AddAccountModal to have an onAccountCreated handler');
  }
  return element.props.onAccountCreated;
}

function renderAccountsPageContent() {
  const suspenseElement = EmailAccountsPage() as ReactElementLike;
  const emailAccountsElement = (suspenseElement.type as (props: Record<string, unknown>) => ReactNodeLike)(
    suspenseElement.props
  ) as ReactElementLike;
  return (emailAccountsElement.type as (props: Record<string, unknown>) => ReactNodeLike)(
    emailAccountsElement.props
  );
}

describe('member account actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    mockUseEffect.mockImplementation((effect: () => void) => effect());
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    });
    configureMutationMock();
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    });
    mockUseSearchParams.mockReturnValue(createSearchParams({}));
    mockUseAccountStore.mockImplementation((selector: (state: { setSelectedAccountId: jest.Mock }) => unknown) =>
      selector({ setSelectedAccountId: jest.fn() })
    );
  });

  it('shows Connect Account for members and invites them to connect an account in the empty state', () => {
    configureUseState();
    mockUseQuery.mockImplementation((config: Record<string, any>) => {
      switch (config.queryKey[0]) {
        case 'accounts':
          return { data: [], isLoading: false };
        case 'auth-me':
          return { data: { role: 'member' }, isLoading: false };
        default:
          return { data: null, isLoading: false };
      }
    });

    const tree = renderAccountsPageContent();
    const buttons = findAll(
      tree,
      (element) => element.type === 'button' && textContent(element).includes('Connect Account')
    );
    const copy = textContent(tree);

    expect(buttons.length).toBeGreaterThan(0);
    expect(copy.toLowerCase()).toContain('connect an account');
  });

  it('shows Manage Access only for manageable accounts and keeps admin-only controls hidden from non-owner members', () => {
    configureUseState();
    mockUseQuery.mockImplementation((config: Record<string, any>) => {
      switch (config.queryKey[0]) {
        case 'accounts':
          return {
            data: [
              {
                id: 'account-manageable',
                label: 'Managed Inbox',
                emailAddress: 'managed@example.com',
                provider: 'imap',
                color: '#3B82F6',
                avatarInitials: 'MI',
                isActive: true,
                authError: null,
                lastSyncedAt: null,
                canManageAccess: true,
              },
              {
                id: 'account-readonly',
                label: 'Read Only',
                emailAddress: 'readonly@example.com',
                provider: 'imap',
                color: '#10B981',
                avatarInitials: 'RO',
                isActive: false,
                authError: 'Credentials expired',
                lastSyncedAt: null,
                canManageAccess: false,
              },
            ],
            isLoading: false,
          };
        case 'auth-me':
          return { data: { role: 'member' }, isLoading: false };
        default:
          return { data: null, isLoading: false };
      }
    });

    const tree = renderAccountsPageContent();
    const manageButtons = findAll(
      tree,
      (element) => element.type === 'button' && textContent(element).includes('Manage Access')
    );
    const editButtons = findAll(
      tree,
      (element) => element.type === 'button' && element.props.title === 'Edit Account Settings'
    );
    const disconnectButtons = findAll(
      tree,
      (element) => element.type === 'button' && element.props.title === 'Disconnect'
    );

    expect(manageButtons).toHaveLength(1);
    expect(editButtons).toHaveLength(0);
    expect(disconnectButtons).toHaveLength(0);
    expect(textContent(tree)).not.toContain('Reauthorize');
    expect(textContent(tree)).toContain('Active');
    expect(textContent(tree)).toContain('Inactive');
    expect(textContent(tree)).toContain('Auth Error');
    expect(textContent(tree)).toContain('Never');

    getClickHandler(manageButtons[0])({ stopPropagation: jest.fn() });
    expect(stateSetters[3]).toBeDefined();
    expect(stateSetters[3]).toHaveBeenCalledWith('account-manageable');
  });

  it('keeps inactive owner accounts manageable for members without exposing the admin reauthorize path', () => {
    configureUseState();
    mockUseQuery.mockImplementation((config: Record<string, any>) => {
      switch (config.queryKey[0]) {
        case 'accounts':
          return {
            data: [
              {
                id: 'owner-account',
                label: 'Owner Inbox',
                emailAddress: 'owner@example.com',
                provider: 'google',
                color: '#8B5CF6',
                avatarInitials: 'OI',
                isActive: false,
                authError: 'Credentials expired',
                lastSyncedAt: null,
                canManageAccess: true,
                owner: { userId: OWNER_ID },
              },
            ],
            isLoading: false,
          };
        case 'auth-me':
          return { data: { role: 'member' }, isLoading: false };
        default:
          return { data: null, isLoading: false };
      }
    });

    const tree = renderAccountsPageContent();
    const manageButtons = findAll(
      tree,
      (element) => element.type === 'button' && textContent(element).includes('Manage Access')
    );

    expect(manageButtons).toHaveLength(1);
    expect(findAll(
      tree,
      (element) => element.type === 'button' && element.props.title === 'Edit Account Settings'
    )).toHaveLength(0);
    expect(findAll(
      tree,
      (element) => element.type === 'button' && element.props.title === 'Disconnect'
    )).toHaveLength(0);
    expect(textContent(tree)).not.toContain('Reauthorize');
    expect(textContent(tree)).toContain('Inactive');
    expect(textContent(tree)).toContain('Auth Error');

    getClickHandler(manageButtons[0])({ stopPropagation: jest.fn() });
    expect(stateSetters[3]).toBeDefined();
    expect(stateSetters[3]).toHaveBeenCalledWith('owner-account');
  });

  it('retains access management, edit, disconnect, and health controls for admins', () => {
    configureUseState();
    mockUseQuery.mockImplementation((config: Record<string, any>) => {
      switch (config.queryKey[0]) {
        case 'accounts':
          return {
            data: [
              {
                id: 'admin-account',
                label: 'Organization Inbox',
                emailAddress: 'organization@example.com',
                provider: 'imap',
                color: '#3B82F6',
                avatarInitials: 'OI',
                isActive: false,
                authError: 'Credentials expired',
                lastSyncedAt: null,
                canManageAccess: true,
              },
            ],
            isLoading: false,
          };
        case 'auth-me':
          return { data: { role: 'admin' }, isLoading: false };
        default:
          return { data: null, isLoading: false };
      }
    });

    const tree = renderAccountsPageContent();

    expect(findAll(
      tree,
      (element) => element.type === 'button' && textContent(element).includes('Manage Access')
    )).toHaveLength(1);
    expect(findAll(
      tree,
      (element) => element.type === 'button' && element.props.title === 'Edit Account Settings'
    )).toHaveLength(1);
    expect(findAll(
      tree,
      (element) => element.type === 'button' && element.props.title === 'Disconnect'
    )).toHaveLength(1);
    expect(textContent(tree)).toContain('Reauthorize');
    expect(textContent(tree)).toContain('Auth Error');
    expect(textContent(tree)).toContain('Never');
  });

  it('opens sharing from OAuth success params, direct share params, and the IMAP success callback', () => {
    configureUseState();
    const router = {
      push: jest.fn(),
      replace: jest.fn(),
    };
    mockUseRouter.mockReturnValue(router);
    mockUseQuery.mockImplementation((config: Record<string, any>) => {
      switch (config.queryKey[0]) {
        case 'accounts':
          return { data: [], isLoading: false };
        case 'auth-me':
          return { data: { role: 'member' }, isLoading: false };
        default:
          return { data: null, isLoading: false };
      }
    });

    mockUseSearchParams.mockReturnValue(
      createSearchParams({
        success: 'true',
        accountId: 'oauth-account-1',
        share: '1',
      })
    );

    let tree = renderAccountsPageContent();
    let addAccountModal = findAll(
      tree,
      (element) => element.type === AddAccountModal
    )[0];

    expect(stateSetters[3]).toBeDefined();
    expect(stateSetters[3]).toHaveBeenCalledWith('oauth-account-1');
    expect(mockToastSuccess).toHaveBeenCalledWith('Account successfully connected!');
    expect(router.replace).toHaveBeenCalledWith('/settings/accounts');

    getAccountCreatedHandler(addAccountModal)('imap-account-1');
    expect(stateSetters[3]).toHaveBeenCalledWith('imap-account-1');

    jest.clearAllMocks();
    configureUseState();
    configureMutationMock();
    mockUseEffect.mockImplementation((effect: () => void) => effect());
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    });
    mockUseRouter.mockReturnValue(router);
    mockUseAccountStore.mockImplementation((selector: (state: { setSelectedAccountId: jest.Mock }) => unknown) =>
      selector({ setSelectedAccountId: jest.fn() })
    );
    mockUseQuery.mockImplementation((config: Record<string, any>) => {
      switch (config.queryKey[0]) {
        case 'accounts':
          return { data: [], isLoading: false };
        case 'auth-me':
          return { data: { role: 'member' }, isLoading: false };
        default:
          return { data: null, isLoading: false };
      }
    });
    mockUseSearchParams.mockReturnValue(
      createSearchParams({
        accountId: 'direct-share-account',
        share: '1',
      })
    );

    tree = renderAccountsPageContent();
    addAccountModal = findAll(tree, (element) => element.type === AddAccountModal)[0];

    expect(stateSetters[3]).toBeDefined();
    expect(stateSetters[3]).toHaveBeenCalledWith('direct-share-account');
    expect(router.replace).toHaveBeenCalledWith('/settings/accounts');
    expect(addAccountModal).toBeDefined();
  });
});

describe('account access modal in account mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    mockUseEffect.mockImplementation((effect: () => void) => effect());
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    });
    configureMutationMock();
  });

  it('renders the owner row as checked and disabled when managing a specific account', () => {
    configureUseState([new Set([MEMBER_THREE_ID]), '', null]);
    mockUseQuery.mockReturnValue({
      data: {
        account: {
          id: 'account-1',
          label: 'Shared Inbox',
          emailAddress: 'shared@example.com',
          owner: {
            userId: OWNER_ID,
            name: 'Owner Name',
            email: 'owner@example.com',
          },
        },
        members: [
          {
            userId: OWNER_ID,
            name: 'Owner Name',
            email: 'owner@example.com',
            hasAccess: true,
          },
          {
            userId: MEMBER_TWO_ID,
            name: 'Teammate One',
            email: 'member-2@example.com',
            hasAccess: false,
          },
          {
            userId: MEMBER_THREE_ID,
            name: 'Teammate Two',
            email: 'member-3@example.com',
            hasAccess: true,
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    const html = renderToStaticMarkup(
      <ManageAccountAccessModal
        isOpen={true}
        accountId="account-1"
        onClose={jest.fn()}
      />
    );

    expect(html).toContain('Owner Name');
    expect(html).toContain('aria-label="Owner Name access"');
    expect(html).toContain('checked=""');
    expect(html).toContain('disabled=""');
  });

  it('sends only memberIds when saving account access updates', async () => {
    configureUseState([new Set([MEMBER_THREE_ID]), '', null]);
    mockUseQuery.mockReturnValue({
      data: {
        account: {
          id: 'account-1',
          label: 'Shared Inbox',
          emailAddress: 'shared@example.com',
          owner: {
            userId: OWNER_ID,
            name: 'Owner Name',
            email: 'owner@example.com',
          },
        },
        members: [],
      },
      isLoading: false,
      error: null,
    });
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true, memberIds: [OWNER_ID, MEMBER_THREE_ID] }),
    });

    renderToStaticMarkup(
      <ManageAccountAccessModal
        isOpen={true}
        accountId="account-1"
        onClose={jest.fn()}
      />
    );

    await mutationConfigs[0].mutationFn([MEMBER_TWO_ID, MEMBER_THREE_ID]);

    expect((global as any).fetch).toHaveBeenCalledWith('/api/accounts/account-1/access', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberIds: [MEMBER_TWO_ID, MEMBER_THREE_ID],
      }),
    });
  });
});
