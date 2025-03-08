/**
 * TypeScript implementation for ES Module Integrity
 * Based on the article: "Shipping support for module script integrity in Chrome & Safari"
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
 * Calculates the SHA-384 hash for a given content
 * @param content The module content to hash
 * @returns Promise that resolves to the integrity string
 */
async function calculateIntegrity(content: string): Promise<string> {
  // Convert the content to an ArrayBuffer
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  // Calculate SHA-384 hash
  const hashBuffer = await crypto.subtle.digest('SHA-384', data);

  // Convert to base64
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  // Return the integrity string
  return `sha384-${hashBase64}`;
}

/**
 * Fetches module content and calculates its integrity
 * @param url The URL of the module
 * @returns Promise that resolves to the integrity string
 */
async function fetchAndCalculateIntegrity(url: string): Promise<string> {
  const response = await fetch(url);
  const content = await response.text();
  return calculateIntegrity(content);
}

/**
 * Generates an import map with integrity hashes for the specified modules
 * @param modules Object mapping module specifiers to their URLs
 * @returns Promise that resolves to an ImportMap object
 */
async function generateImportMapWithIntegrity(
  modules: Record<string, string>
): Promise<ImportMap> {
  const imports: ImportMapEntry = {};
  const integrity: ImportMapEntry = {};

  // For each module, add it to the imports map
  for (const [specifier, url] of Object.entries(modules)) {
    imports[specifier] = url;
    
    // Calculate integrity hash for the module
    integrity[url] = await fetchAndCalculateIntegrity(url);
  }

  return { imports, integrity };
}

/**
 * Injects an import map into the document
 * @param importMap The import map to inject
 */
function injectImportMap(importMap: ImportMap): void {
  const script = document.createElement('script');
  script.type = 'importmap';
  script.textContent = JSON.stringify(importMap, null, 2);
  document.head.appendChild(script);
}


/**
 * Validates whether a loaded module's integrity matches the expected hash
 * @param url The URL of the module
 * @param expectedIntegrity The expected integrity hash
 * @returns Promise that resolves to a boolean indicating if integrity is valid
 */
async function validateModuleIntegrity(
  url: string, 
  expectedIntegrity: string
): Promise<boolean> {
  try {
    const actualIntegrity = await fetchAndCalculateIntegrity(url);
    return actualIntegrity === expectedIntegrity;
  } catch (error) {
    console.error(`Error validating integrity for ${url}:`, error);
    return false;
  }
}

/**
 * A class to manage module loading with integrity verification
 */
class IntegrityModuleLoader {
  private importMap: ImportMap;
  
  constructor(importMap: ImportMap) {
    this.importMap = importMap;
  }
  
  /**
   * Safely imports a module, verifying its integrity
   * @param specifier The module specifier to import
   * @returns Promise that resolves to the imported module
   */
  async importModule<T>(specifier: string): Promise<T> {
    // Browser will automatically verify integrity based on import map
    return import(specifier) as Promise<T>;
  }
  
  /**
   * Adds a new module to the import map
   * @param specifier The module specifier
   * @param url The module URL
   */
  async addModule(specifier: string, url: string): Promise<void> {
    if (!this.importMap.imports) {
      this.importMap.imports = {};
    }
    
    if (!this.importMap.integrity) {
      this.importMap.integrity = {};
    }
    
    this.importMap.imports[specifier] = url;
    this.importMap.integrity[url] = await fetchAndCalculateIntegrity(url);
    
    // Update the import map in the document
    injectImportMap(this.importMap);
  }
}

// Export types and functions for use in other modules
export {
  ImportMap,
  ImportMapEntry,
  calculateIntegrity,
  fetchAndCalculateIntegrity,
  generateImportMapWithIntegrity,
  injectImportMap,
  validateModuleIntegrity,
  IntegrityModuleLoader
};
