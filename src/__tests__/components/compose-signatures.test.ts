import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposeModal } from '@/components/email/ComposeModal';

const mockUseAccountStore = jest.fn();
const mockUseAccounts = jest.fn();
const mockUseSignatures = jest.fn();
const mockUseDraftAutosave = jest.fn();

const mockEditor = {
  getHTML: jest.fn(() => ''),
  getText: jest.fn(() => 'Draft body'),
  getAttributes: jest.fn(() => ({})),
  isActive: jest.fn(() => false),
  commands: {
    setContent: jest.fn(),
  },
  chain: jest.fn(() => ({
    focus: () => ({
      setContent: () => ({
        run: jest.fn(),
      }),
    }),
  })),
};

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: () => mockUseAccountStore(),
}));

jest.mock('@/hooks/useFavouriteMutations', () => ({
  useAccounts: () => mockUseAccounts(),
}));

jest.mock('@/hooks/useSignatures', () => ({
  useSignatures: () => mockUseSignatures(),
}));

jest.mock('@/hooks/useDraftAutosave', () => ({
  useDraftAutosave: () => mockUseDraftAutosave(),
}));

jest.mock('@/components/email/FromAddressSelect', () => {
  const React = jest.requireActual('react');

  return {
    FromAddressSelect: () => React.createElement('div', { 'data-testid': 'from-address-select' }),
  };
});

jest.mock('@/components/email/SignatureSelect', () => {
  const React = jest.requireActual('react');

  return {
    SignatureSelect: () => React.createElement('div', { 'data-testid': 'signature-select' }),
  };
});

jest.mock('@/components/signatures/SignatureModal', () => {
  const React = jest.requireActual('react');

  return {
    SignatureModal: ({ accountId }: { accountId: string }) =>
      React.createElement('div', { 'data-testid': 'signature-modal' }, accountId),
  };
});

jest.mock('@/components/email/ComposeAiWriter', () => {
  const React = jest.requireActual('react');

  return {
    ComposeAiWriter: ({ accountId }: { accountId: string }) =>
      React.createElement('div', { 'data-testid': 'compose-ai-writer' }, accountId),
  };
});

jest.mock('@/components/editor/ResizableImageExtension', () => ({
  ResizableImage: {
    configure: jest.fn(() => ({})),
  },
  imageDropAndPasteProps: {
    handleDrop: jest.fn(),
    handlePaste: jest.fn(),
  },
}));

jest.mock('@tiptap/starter-kit', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(() => ({})),
  },
}));

jest.mock('@tiptap/extension-placeholder', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(() => ({})),
  },
}));

jest.mock('@tiptap/extension-link', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(() => ({})),
  },
}));

jest.mock('@tiptap/react', () => {
  const React = jest.requireActual('react');

  return {
    useEditor: () => mockEditor,
    EditorContent: () => React.createElement('div', { 'data-testid': 'editor-content' }),
  };
});

jest.mock('lucide-react', () => {
  const React = jest.requireActual('react');

  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Icon = () => React.createElement('svg', { 'data-icon': String(prop) });
        Icon.displayName = String(prop);
        return Icon;
      },
    }
  );
});

jest.mock('@/lib/email/clean-text', () => ({
  extractCleanEmailText: jest.fn(() => ''),
}));

function buildAccount(id: string) {
  return {
    id,
    emailAddress: `${id}@example.com`,
    canManageAccess: true,
    isFavourite: false,
    sortOrder: null,
  };
}

function renderComposeModal() {
  return renderToStaticMarkup(createElement(ComposeModal));
}

describe('ComposeModal AI writer guard', () => {
  beforeEach(() => {
    mockUseAccountStore.mockReturnValue({
      selectedAccountId: null,
      setSelectedAccountId: jest.fn(),
      selectedFolder: 'INBOX',
      setSelectedFolder: jest.fn(),
      isComposeModalOpen: true,
      setComposeModalOpen: jest.fn(),
      composeDraft: null,
      setComposeDraft: jest.fn(),
    });

    mockUseAccounts.mockReturnValue({ data: [buildAccount('acct-1')] });
    mockUseSignatures.mockReturnValue({
      signatures: [],
      defaultSignature: null,
    });
    mockUseDraftAutosave.mockReturnValue({
      status: 'idle',
      initialize: jest.fn(),
      flush: jest.fn(),
      cancelScheduledSave: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the AI writer when a from account exists', () => {
    const html = renderComposeModal();

    expect(html).toContain('data-testid="compose-ai-writer"');
    expect(html).toContain('acct-1');
  });

  it('does not render the AI writer while accounts are still unavailable', () => {
    mockUseAccounts.mockReturnValue({});

    expect(() => renderComposeModal()).not.toThrow();

    const html = renderComposeModal();
    expect(html).not.toContain('data-testid="compose-ai-writer"');
  });

  it('does not render the AI writer when there are no accounts', () => {
    mockUseAccounts.mockReturnValue({ data: [] });

    expect(() => renderComposeModal()).not.toThrow();

    const html = renderComposeModal();
    expect(html).not.toContain('data-testid="compose-ai-writer"');
  });
});
