import { useSignatures, Signature } from '@/hooks/useSignatures';

describe('useSignatures hook exports', () => {
  it('exports useSignatures function', () => {
    expect(typeof useSignatures).toBe('function');
  });
});
