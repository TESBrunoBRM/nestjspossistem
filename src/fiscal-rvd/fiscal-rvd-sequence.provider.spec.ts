import { FiscalRvdSequenceProvider } from './fiscal-rvd-sequence.provider';

describe('FiscalRvdSequenceProvider', () => {
  let provider: FiscalRvdSequenceProvider;

  beforeEach(() => {
    provider = new FiscalRvdSequenceProvider();
  });

  it('generates sequential numbers starting from 1 for each unique rut/date key', () => {
    const rut1 = '12345678-5';
    const rut2 = '87654321-2';
    const fecha = '2026-05-25';

    expect(provider.getNextSequence(rut1, fecha)).toBe(1);
    expect(provider.getNextSequence(rut1, fecha)).toBe(2);

    expect(provider.getNextSequence(rut2, fecha)).toBe(1);
    expect(provider.getNextSequence(rut1, '2026-05-26')).toBe(1);
  });

  it('can set and get sequence numbers', () => {
    const rut = '12345678-5';
    const fecha = '2026-05-25';

    provider.setSequence(rut, fecha, 10);
    expect(provider.getCurrentSequence(rut, fecha)).toBe(10);
    expect(provider.getNextSequence(rut, fecha)).toBe(11);
  });
});
