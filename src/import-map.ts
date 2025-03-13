/**
 * Module Script Integrity Implementation
 */

// Type definitions for Import Map with Integrity
interface ImportMapEntry {
  [moduleSpecifier: string]: string;
}

interface ImportMap {
  imports?: ImportMapEntry;
  scopes?: Record<string, ImportMapEntry>;
  integrity?: ImportMapEntry;
}

/**
 * Calculate SHA-384 integrity hash for content
 * @param content Content to hash
 * @returns Promise resolving to integrity string
 */
async function calculateIntegrity(content: string | ArrayBuffer): Promise<string> {
  // Convert string to ArrayBuffer if needed
  const data = typeof content === 'string' 
    ? new TextEncoder().encode(content) 
    : content;
  
  // Calculate SHA-384 hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-384', data);
  
  // Convert to base64
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  
  return `sha384-${hashBase64}`;
}

/**
 * Fetch module content and calculate its integrity
 * @param url Module URL
 * @returns Promise resolving to integrity string
 */
async function fetchAndCalculateIntegrity(url: string): Promise<string> {
  const response = await fetch(url);
  const content = await response.text();
  return calculateIntegrity(content);
}

/**
 * Resolve a module specifier to a URL using an import map
 * @param specifier Module specifier
 * @param importMap Import map
 * @returns Resolved URL or original specifier if not in import map
 */
function resolveModuleSpecifier(specifier: string, importMap: ImportMap): string {
  if (importMap.imports && specifier in importMap.imports) {
    return importMap.imports[specifier];
  }
  return specifier;
}

/**
 * Check if a module has an integrity hash in the import map
 * @param url Module URL
 * @param importMap Import map
 * @returns Boolean indicating if the module has an integrity hash
 */
function hasIntegrityCheck(url: string, importMap: ImportMap): boolean {
  return !!(importMap.integrity && importMap.integrity[url]);
}

/**
 * Get the integrity hash for a module URL from the import map
 * @param url Module URL
 * @param importMap Import map
 * @returns Integrity hash or undefined if not found
 */
function getIntegrityHash(url: string, importMap: ImportMap): string | undefined {
  return importMap.integrity?.[url];
}

/**
 * Verify module integrity
 * @param url Module URL
 * @param expectedHash Expected integrity hash
 * @returns Promise resolving to boolean indicating if integrity is valid
 */
async function verifyIntegrity(url: string, expectedHash: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    const content = await response.text();
    const actualHash = await calculateIntegrity(content);
    return actualHash === expectedHash;
  } catch (error) {
    console.error(`Error verifying integrity for ${url}:`, error);
    return false;
  }
}

/**
 * Enhanced dynamic import with integrity verification
 * @param specifier Module specifier
 * @param importMap Import map
 * @returns Promise resolving to imported module
 */
async function importWithIntegrity<T>(specifier: string, importMap: ImportMap): Promise<T> {
  // Resolve the specifier to a URL using the import map
  const resolvedUrl = resolveModuleSpecifier(specifier, importMap);
  
  // Check if the resolved URL has an integrity hash
  const integrity = getIntegrityHash(resolvedUrl, importMap);
  
  if (integrity) {
    // Verify integrity before importing
    const isValid = await verifyIntegrity(resolvedUrl, integrity);
    if (!isValid) {
      throw new Error(`Integrity check failed for module: ${resolvedUrl}`);
    }
  } else {
    // If no direct integrity hash for the resolved URL, check if there's a bare specifier
    // that resolves to this URL and has an integrity hash
    for (const [bareSpecifier, targetUrl] of Object.entries(importMap.imports || {})) {
      if (targetUrl === resolvedUrl && hasIntegrityCheck(bareSpecifier, importMap)) {
        throw new Error(`Integrity check failed for module: ${resolvedUrl} (via ${bareSpecifier})`);
      }
    }
  }
  
  // Import the module if integrity check passed or no integrity hash found
  return import(resolvedUrl) as Promise<T>;
}

/**
 * Parse an import map from JSON
 * @param json Import map JSON
 * @returns Parsed import map
 */
function parseImportMap(json: string): ImportMap {
  try {
    return JSON.parse(json) as ImportMap;
  } catch (error) {
    console.error('Error parsing import map:', error);
    throw error;
  }
}

/**
 * Load import map from a URL
 * @param url Import map URL
 * @returns Promise resolving to import map
 */
async function loadImportMap(url: string): Promise<ImportMap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load import map: ${response.statusText}`);
  }
  const json = await response.text();
  return parseImportMap(json);
}

/**
 * Apply import map to document
 * @param importMap Import map to apply
 */
function applyImportMap(importMap: ImportMap): void {
  const script = document.createElement('script');
  script.type = 'importmap';
  script.textContent = JSON.stringify(importMap);
  document.head.appendChild(script);
}

// Export functions
export {
  ImportMap,
  ImportMapEntry,
  calculateIntegrity,
  fetchAndCalculateIntegrity,
  resolveModuleSpecifier,
  hasIntegrityCheck,
  getIntegrityHash,
  verifyIntegrity,
  importWithIntegrity,
  parseImportMap,
  loadImportMap,
  applyImportMap
};