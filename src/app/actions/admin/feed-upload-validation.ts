export interface UploadMetadata {
  name: string;
  type: string;
}

const JSON_TYPES_BY_EXTENSION: Record<string, ReadonlySet<string>> = {
  '.json': new Set(['application/json', 'text/json']),
  '.js': new Set(['text/javascript', 'application/javascript']),
  // Browsers commonly label TypeScript files as video/mp2t.
  '.ts': new Set(['text/typescript', 'application/typescript', 'video/mp2t']),
};

const SPREADSHEET_TYPES_BY_EXTENSION: Record<string, ReadonlySet<string>> = {
  '.csv': new Set(['text/csv', 'application/csv', 'text/plain']),
  '.xlsx': new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function validateAgainst(
  file: UploadMetadata,
  allowed: Record<string, ReadonlySet<string>>,
): boolean {
  const types = allowed[extensionOf(file.name)];
  return types !== undefined && types.has(file.type.toLowerCase());
}

export function isAllowedJsonFeedUpload(file: UploadMetadata): boolean {
  return validateAgainst(file, JSON_TYPES_BY_EXTENSION);
}

export function isAllowedSpreadsheetUpload(file: UploadMetadata): boolean {
  return validateAgainst(file, SPREADSHEET_TYPES_BY_EXTENSION);
}
