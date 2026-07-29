import {
  DraftAutosaveController,
  type DraftSaveFunction,
  type DraftIdentity,
  type DraftSnapshot,
} from '@/lib/email/draft-autosave';

const snapshot = (overrides: Partial<DraftSnapshot> = {}): DraftSnapshot => ({
  accountId: 'account-a',
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  bodyHtml: '<p>Hello</p>',
  bodyText: 'Hello',
  ...overrides,
});

describe('DraftAutosaveController', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('saves once after three seconds with the latest scheduled snapshot', async () => {
    const save = jest.fn(async (draft: DraftSnapshot) => ({
      draftId: 'draft-1',
      accountId: draft.accountId,
    }));
    const controller = new DraftAutosaveController(save, jest.fn());

    controller.schedule(snapshot({ bodyText: 'First' }));
    jest.advanceTimersByTime(2000);
    controller.schedule(snapshot({ bodyText: 'Latest' }));
    jest.advanceTimersByTime(2999);
    expect(save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ bodyText: 'Latest' }),
      null
    );
  });

  it('flushes immediately and preserves ordered account changes', async () => {
    const resolvers: Array<(identity: DraftIdentity) => void> = [];
    const save: jest.MockedFunction<DraftSaveFunction> = jest.fn(
      (_draft: DraftSnapshot, _identity: DraftIdentity | null) =>
        new Promise<DraftIdentity>((resolve) => {
          resolvers.push((identity) => resolve(identity));
        })
    );
    const controller = new DraftAutosaveController(save, jest.fn());

    const saveA = controller.flush(snapshot({ accountId: 'account-a' }));
    await Promise.resolve();
    const saveB = controller.flush(snapshot({ accountId: 'account-b' }));

    expect(save).toHaveBeenCalledTimes(1);
    resolvers[0]({ draftId: 'draft-1', accountId: 'account-a' });
    await saveA;
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toEqual({
      draftId: 'draft-1',
      accountId: 'account-a',
    });

    resolvers[1]({ draftId: 'draft-1', accountId: 'account-b' });
    await expect(saveB).resolves.toEqual({
      draftId: 'draft-1',
      accountId: 'account-b',
    });
    expect(controller.getIdentity()?.accountId).toBe('account-b');
  });

  it('does not create a draft for an empty composer', async () => {
    const save = jest.fn();
    const controller = new DraftAutosaveController(save, jest.fn());

    await expect(controller.flush(snapshot({
      bodyHtml: '<p><br></p>',
      bodyText: '',
    }))).resolves.toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
