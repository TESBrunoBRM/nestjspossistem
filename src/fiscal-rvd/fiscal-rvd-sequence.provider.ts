import { Injectable } from '@nestjs/common';

@Injectable()
export class FiscalRvdSequenceProvider {
  private readonly sequences = new Map<string, number>();

  getNextSequence(rutEmisor: string, fecha: string): number {
    const key = `${rutEmisor}:${fecha}`;
    const nextSeq = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, nextSeq);
    return nextSeq;
  }

  getCurrentSequence(rutEmisor: string, fecha: string): number {
    const key = `${rutEmisor}:${fecha}`;
    return this.sequences.get(key) ?? 0;
  }

  setSequence(rutEmisor: string, fecha: string, seq: number): void {
    const key = `${rutEmisor}:${fecha}`;
    this.sequences.set(key, seq);
  }

  clear(): void {
    this.sequences.clear();
  }
}
