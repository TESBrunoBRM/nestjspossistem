import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import bwipjs from 'bwip-js';
import { chromium, type Browser, type Page } from 'playwright';
type PdfOptions = Parameters<Page['pdf']>[0];

import {
  buildPrintedSampleArtifact,
  isBoletaTipoDTE,
  type DteDocument,
} from 'sii-engine';
import {
  FiscalDocumentRepository,
  type FiscalDocumentRecord,
  type FiscalPdfFormat,
} from './fiscal-document.repository';

export interface GeneratedFiscalPdf {
  buffer: Buffer;
  format: FiscalPdfFormat;
  sha256: string;
}

@Injectable()
export class FiscalPdfService implements OnModuleDestroy {
  private browserPromise?: Promise<Browser>;
  private readonly memoryCache = new Map<string, GeneratedFiscalPdf>();

  constructor(private readonly repository: FiscalDocumentRepository) {}

  async getOrCreate(
    record: FiscalDocumentRecord,
    requestedFormat: 'auto' | FiscalPdfFormat,
  ): Promise<GeneratedFiscalPdf> {
    const format = resolveFormat(record.tipoDTE, requestedFormat);
    const cacheKey = `${record.internalId}:${format}`;
    const memory = this.memoryCache.get(cacheKey);
    if (memory) return memory;

    const persisted = await this.repository.readPdfArtifact(record, format);
    const persistedMetadata = record.pdfArtifacts?.[format];
    if (persisted && persistedMetadata) {
      const result = {
        buffer: persisted,
        format,
        sha256: persistedMetadata.sha256,
      };
      this.memoryCache.set(cacheKey, result);
      return result;
    }

    const buffer = await this.render(record, format);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    await this.repository.savePdfArtifact(
      record.internalId,
      format,
      buffer,
      sha256,
    );
    const result = { buffer, format, sha256 };
    this.memoryCache.set(cacheKey, result);
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
    }
  }

  private async render(
    record: FiscalDocumentRecord,
    format: FiscalPdfFormat,
  ): Promise<Buffer> {
    const printed = buildPrintedSampleArtifact(record.document, record.tedXml);
    const barcodeOptions = {
      bcid: 'pdf417',
      text: String(printed.pdf417Payload),
      scale: format === 'thermal' ? 1 : 2,
      eclevel: 5,
      includetext: false,
      backgroundcolor: 'FFFFFF',
    } as bwipjs.RenderOptions;
    const barcode: Buffer = await bwipjs.toBuffer(barcodeOptions);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(
        buildDocumentHtml(record.document, barcode.toString('base64'), format),
        { waitUntil: 'load' },
      );
      await page.emulateMedia({ media: 'print' });

      const options: PdfOptions = {
        printBackground: true,
        preferCSSPageSize: format === 'a4',
        margin:
          format === 'thermal'
            ? { top: '3mm', right: '3mm', bottom: '3mm', left: '3mm' }
            : { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      };
      if (format === 'a4') {
        options.format = 'A4';
      } else {
        const heightPx = await page.evaluate(() =>
          Math.ceil(document.documentElement.scrollHeight),
        );
        options.width = '80mm';
        options.height =
          String(Math.max(80, heightPx * (25.4 / 96) + 6)) + 'mm';
      }

      return Buffer.from(await page.pdf(options));
    } finally {
      await page.close();
    }
  }

  private getBrowser(): Promise<Browser> {
    this.browserPromise ??= chromium.launch({ headless: true });
    return this.browserPromise;
  }
}

function resolveFormat(
  tipoDTE: number,
  requested: 'auto' | FiscalPdfFormat,
): FiscalPdfFormat {
  if (requested !== 'auto') return requested;
  return isBoletaTipoDTE(tipoDTE) ? 'thermal' : 'a4';
}

function buildDocumentHtml(
  document: DteDocument,
  barcodeBase64: string,
  format: FiscalPdfFormat,
): string {
  const isThermal = format === 'thermal';
  const receptor = document.receptor;
  const details = document.detalles
    .map(
      (detail) => `
        <tr>
          <td class="item">
            <strong>${escapeHtml(detail.nmbItem)}</strong>
            ${detail.dscItem ? `<span>${escapeHtml(detail.dscItem)}</span>` : ''}
          </td>
          <td class="num">${formatNumber(detail.qtyItem ?? 1)}</td>
          <td class="num">${formatMoney(detail.prcItem)}</td>
          <td class="num">${formatMoney(detail.montoItem)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  @page { size: ${isThermal ? '80mm auto' : 'A4'}; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
    font-size: ${isThermal ? '9px' : '11px'};
    line-height: 1.35;
  }
  main { width: 100%; }
  header {
    display: grid;
    grid-template-columns: ${isThermal ? '1fr' : '1fr 58mm'};
    gap: 8mm;
    align-items: start;
    padding-bottom: 4mm;
    border-bottom: 1px solid #111;
  }
  .issuer h1 { margin: 0 0 1mm; font-size: ${isThermal ? '14px' : '20px'}; }
  .issuer p, .receiver p { margin: 0.5mm 0; }
  .stamp {
    border: 2px solid #b42318;
    color: #b42318;
    padding: 3mm;
    text-align: center;
    font-weight: 700;
  }
  .stamp strong { display: block; font-size: ${isThermal ? '16px' : '24px'}; }
  .receiver { padding: 4mm 0; border-bottom: 1px solid #777; }
  table { width: 100%; border-collapse: collapse; margin-top: 4mm; table-layout: fixed; }
  th, td { padding: ${isThermal ? '1.5mm 0.8mm' : '2.2mm'}; vertical-align: top; }
  th { border-bottom: 1px solid #333; text-align: left; }
  td { border-bottom: 1px solid #ddd; }
  .item { width: 46%; overflow-wrap: anywhere; }
  .item span { display: block; color: #444; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin: 4mm 0 0 auto; width: ${isThermal ? '100%' : '72mm'}; }
  .total-row { display: flex; justify-content: space-between; padding: 1mm 0; }
  .total-row.grand { border-top: 2px solid #111; margin-top: 1mm; padding-top: 2mm; font-size: 1.15em; font-weight: 700; }
  .ted { margin-top: 6mm; text-align: center; break-inside: avoid; }
  .ted img { display: block; width: 100%; max-height: ${isThermal ? '32mm' : '42mm'}; object-fit: contain; }
  .ted strong { display: block; margin-top: 2mm; }
  .footer { margin-top: 3mm; color: #444; text-align: center; font-size: 0.9em; }
  ${isThermal ? '.stamp { margin-top: 3mm; } header { display: block; } .receiver { padding-top: 3mm; } th:nth-child(2), td:nth-child(2) { display:none; } .item { width: 48%; }' : ''}
</style>
</head>
<body>
<main>
  <header>
    <section class="issuer">
      <h1>${escapeHtml(document.emisor.rznSoc)}</h1>
      <p>RUT: ${escapeHtml(document.emisor.rutEmisor)}</p>
      <p>${escapeHtml(document.emisor.giroEmis)}</p>
      <p>${escapeHtml(document.emisor.dirOrigen)}, ${escapeHtml(document.emisor.cmnaOrigen)}</p>
    </section>
    <section class="stamp">
      RUT ${escapeHtml(document.emisor.rutEmisor)}
      <strong>DTE ${document.idDoc.tipoDTE}</strong>
      N° ${document.idDoc.folio}
    </section>
  </header>
  <section class="receiver">
    <p><strong>Fecha:</strong> ${escapeHtml(document.idDoc.fechaEmision)}</p>
    <p><strong>Señor(es):</strong> ${escapeHtml(receptor?.rznSocRecep || 'Consumidor final')}</p>
    <p><strong>RUT:</strong> ${escapeHtml(receptor?.rutRecep || 'Sin informar')}</p>
    ${receptor?.dirRecep ? `<p><strong>Dirección:</strong> ${escapeHtml(receptor.dirRecep)}, ${escapeHtml(receptor.cmnaRecep || '')}</p>` : ''}
  </section>
  <table>
    <thead>
      <tr><th>Detalle</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr>
    </thead>
    <tbody>${details}</tbody>
  </table>
  <section class="totals">
    ${totalRow('Neto', document.totales.mntNeto)}
    ${totalRow('Exento', document.totales.mntExento)}
    ${totalRow('IVA', document.totales.iva)}
    <div class="total-row grand"><span>Total</span><span>${formatMoney(document.totales.mntTotal)}</span></div>
  </section>
  <section class="ted">
    <img src="data:image/png;base64,${barcodeBase64}" alt="Timbre electrónico SII">
    <strong>Timbre Electrónico SII</strong>
    <span>Res. SII - Verifique documento en sii.cl</span>
  </section>
  <p class="footer">Representación impresa del Documento Tributario Electrónico</p>
</main>
</body>
</html>`;
}

function totalRow(label: string, value?: number): string {
  return value === undefined
    ? ''
    : `<div class="total-row"><span>${label}</span><span>${formatMoney(value)}</span></div>`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: 3,
  }).format(value);
}

function escapeHtml(value: unknown): string {
  const text =
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
      ? String(value)
      : '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
