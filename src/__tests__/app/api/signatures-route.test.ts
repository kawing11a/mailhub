import { GET as getAccountSignatures, POST as createSignature } from '@/app/api/accounts/[id]/signatures/route';
import { PATCH as updateSignature, DELETE as deleteSignature } from '@/app/api/signatures/[id]/route';
import { POST as setDefaultSignature } from '@/app/api/signatures/[id]/set-default/route';

describe('Signature API Routes exports', () => {
  it('exports valid API route handler functions', () => {
    expect(typeof getAccountSignatures).toBe('function');
    expect(typeof createSignature).toBe('function');
    expect(typeof updateSignature).toBe('function');
    expect(typeof deleteSignature).toBe('function');
    expect(typeof setDefaultSignature).toBe('function');
  });
});
