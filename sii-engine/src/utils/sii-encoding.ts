import { SiiValidationError } from "../errors/sii-errors.js";

export function assertLatin1Compatible(text: string, label = "XML"): void {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0xff) continue;

    const char = text[index] ?? "?";
    throw new SiiValidationError(
      `${label} contiene caracteres fuera de ISO-8859-1 y no puede enviarse al SII`,
      {
        fields: {
          index: String(index),
          codePoint: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
          character: JSON.stringify(char),
        },
      }
    );
  }
}

export function encodeSiiXml(text: string, label = "XML"): Buffer {
  assertLatin1Compatible(text, label);
  return Buffer.from(text, "latin1");
}

export function encodeSiiXmlBinary(text: string, label = "XML"): string {
  return encodeSiiXml(text, label).toString("binary");
}
