export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(bytes, { mergePages: true });
  const body = Array.isArray(text) ? text.join("\n") : text;
  return body.replace(/\u0000/g, "").trim();
}
