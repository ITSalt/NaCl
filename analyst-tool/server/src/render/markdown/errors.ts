/**
 * errors.ts — typed error classes for the Markdown renderer pipeline.
 */

export class MissingSourceFileError extends Error {
  constructor(public readonly nodeLabel: string, public readonly nodeId: string) {
    super(
      `${nodeLabel} ${nodeId} has no source_file in graph — cannot render. ` +
      `Wave 1 is read-only; set source_file via nacl-ba-sync or manually backfill.`,
    );
    this.name = 'MissingSourceFileError';
  }
}
