/**
 * TypeScript implementation for ES Module Integrity
 * Updated for NextJS v15 with SHA-384 support only
 */

import { useEffect, useState } from "react";

// Type definitions for Import Map with Integrity
interface ImportMapEntry {
	[moduleSpecifier: string]: string;
}

interface ImportMap {
	imports?: ImportMapEntry;
	scopes?: Record<string, ImportMapEntry>;
	integrity?: ImportMapEntry;
}

// NextJS-specific configuration options
interface NextJSIntegrityConfig {
	packages?: string[];
	generateVercelConfig?: boolean;
	importMapPath?: string;
	injectImportMap?: boolean;
}

// Module loading result
interface ModuleLoadingResult<T = any> {
	module: T | null;
	loading: boolean;
	error: Error | null;
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

	// Calculate SHA-384 hash (only algorithm supported)
	const hashBuffer = await crypto.subtle.digest("SHA-384", data);

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
	modules: Record<string, string>,
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
	// Skip if running on server
	if (typeof document === "undefined") return;

	const script = document.createElement("script");
	script.type = "importmap";
	script.textContent = JSON.stringify(importMap, null, 2);
	document.head.appendChild(script);
}

/**
 * Gets the import map from the document
 * @returns Import map or null if not found
 */
function getImportMap(): ImportMap | null {
	if (typeof document === "undefined") return null;

	const script = document.querySelector('script[type="importmap"]');
	if (!script || !script.textContent) {
		return null;
	}

	try {
		return JSON.parse(script.textContent);
	} catch (error) {
		console.error("Error parsing import map:", error);
		return null;
	}
}

/**
 * Loads and applies the import map from a URL
 * @param url URL to load the import map from
 * @returns Promise that resolves to the loaded import map
 */
async function loadImportMap(
	url = "/importmap.json",
): Promise<ImportMap | null> {
	if (typeof window === "undefined") return null;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch import map: ${response.statusText}`);
		}

		const importMap = await response.json();
		injectImportMap(importMap);
		return importMap;
	} catch (error) {
		console.error("Error loading import map:", error);
		throw error;
	}
}

/**
 * Validates whether a loaded module's integrity matches the expected hash
 * @param url The URL of the module
 * @param expectedIntegrity The expected integrity hash
 * @returns Promise that resolves to a boolean indicating if integrity is valid
 */
async function validateModuleIntegrity(
	url: string,
	expectedIntegrity: string,
): Promise<boolean> {
	try {
		// Verify the expected integrity uses sha384
		if (!expectedIntegrity.startsWith("sha384-")) {
			console.error(
				`Integrity hash algorithm not supported: ${expectedIntegrity}. Only SHA-384 is supported.`,
			);
			return false;
		}

		const actualIntegrity = await fetchAndCalculateIntegrity(url);
		return actualIntegrity === expectedIntegrity;
	} catch (error) {
		console.error(`Error validating integrity for ${url}:`, error);
		return false;
	}
}

/**
 * Resolves a module specifier to a URL using the import map
 * @param specifier Module specifier
 * @returns Resolved URL
 */
function resolveSpecifier(specifier: string): string {
	const importMap = getImportMap();
	if (!importMap || !importMap.imports) {
		return specifier;
	}

	return importMap.imports[specifier] || specifier;
}

/**
 * Gets the integrity hash for a module URL
 * @param url Module URL
 * @returns Integrity hash or undefined
 */
function getIntegrityForUrl(url: string): string | undefined {
	const importMap = getImportMap();
	if (!importMap || !importMap.integrity) {
		return undefined;
	}

	return importMap.integrity[url];
}

/**
 * Checks if a URL has a direct or indirect integrity constraint
 * @param url URL to check
 * @returns Whether the URL has an integrity constraint
 */
function hasIntegrityConstraint(url: string): boolean {
	const importMap = getImportMap();
	if (!importMap) return false;

	// Check direct integrity
	if (importMap.integrity && importMap.integrity[url]) {
		return true;
	}

	// Check indirect integrity via bare specifiers
	if (importMap.imports) {
		for (const [specifier, targetUrl] of Object.entries(importMap.imports)) {
			if (
				targetUrl === url &&
				importMap.integrity &&
				importMap.integrity[specifier]
			) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Imports a module with integrity verification
 * @param specifier Module specifier
 * @returns Promise that resolves to the imported module
 */
async function importWithIntegrity<T = any>(specifier: string): Promise<T> {
	// Resolve the specifier to a URL
	const url = resolveSpecifier(specifier);

	// Check if URL has an integrity constraint
	if (hasIntegrityConstraint(url)) {
		// Get the integrity hash
		const integrityHash = getIntegrityForUrl(url);

		if (integrityHash) {
			// Verify integrity
			const isValid = await validateModuleIntegrity(url, integrityHash);
			if (!isValid) {
				throw new Error(`Integrity check failed for module: ${url}`);
			}
		}
	}

	// Import the module
	return import(url) as Promise<T>;
}

/**
 * React hook for importing a module with integrity verification - NextJS v15 compatible
 * @param specifier Module specifier
 * @returns Module loading state
 */
function useModuleWithIntegrity<T = any>(
	specifier: string,
): ModuleLoadingResult<T> {
	const [state, setState] = useState<ModuleLoadingResult<T>>({
		module: null,
		loading: true,
		error: null,
	});

	useEffect(() => {
		let mounted = true;

		importWithIntegrity<T>(specifier)
			.then((module) => {
				if (mounted) {
					setState({
						module,
						loading: false,
						error: null,
					});
				}
			})
			.catch((error) => {
				if (mounted) {
					setState({
						module: null,
						loading: false,
						error: error instanceof Error ? error : new Error(String(error)),
					});
				}
			});

		return () => {
			mounted = false;
		};
	}, [specifier]);

	return state;
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
		return importWithIntegrity<T>(specifier);
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

/**
 * Creates a middleware configuration for NextJS v15
 * @param config Configuration options
 * @returns Middleware configuration object
 */
function createNextJSIntegrityConfig(
	config: NextJSIntegrityConfig = {},
): NextJSIntegrityConfig {
	return {
		packages: config.packages || [],
		generateVercelConfig:
			config.generateVercelConfig !== undefined
				? config.generateVercelConfig
				: true,
		importMapPath: config.importMapPath || "importmap.json",
		injectImportMap:
			config.injectImportMap !== undefined ? config.injectImportMap : true,
	};
}

// Export types and functions for use in other modules
export {
	ImportMap,
	ImportMapEntry,
	NextJSIntegrityConfig,
	ModuleLoadingResult,
	calculateIntegrity,
	fetchAndCalculateIntegrity,
	generateImportMapWithIntegrity,
	injectImportMap,
	getImportMap,
	loadImportMap,
	validateModuleIntegrity,
	resolveSpecifier,
	getIntegrityForUrl,
	hasIntegrityConstraint,
	importWithIntegrity,
	useModuleWithIntegrity,
	IntegrityModuleLoader,
	createNextJSIntegrityConfig,
};
