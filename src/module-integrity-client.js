// module-integrity-client.js - Updated for NextJS v15 with SHA-384 only
import { useEffect, useState } from "react";

/**
 * Gets the import map from the document
 * @returns {Object|null} Import map or null if not found
 */
export function getImportMap() {
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
 * @param {string} url URL to load the import map from
 * @returns {Promise<Object>} The loaded import map
 */
export async function loadImportMap(url = "/importmap.json") {
	if (typeof window === "undefined") return null;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch import map: ${response.statusText}`);
		}

		const importMap = await response.json();
		applyImportMap(importMap);
		return importMap;
	} catch (error) {
		console.error("Error loading import map:", error);
		throw error;
	}
}

/**
 * Applies an import map to the document
 * @param {Object} importMap Import map to apply
 */
export function applyImportMap(importMap) {
	if (typeof document === "undefined") return;

	// Remove existing import map if any
	const existingScript = document.querySelector('script[type="importmap"]');
	if (existingScript) {
		existingScript.remove();
	}

	// Create and add new import map
	const script = document.createElement("script");
	script.type = "importmap";
	script.textContent = JSON.stringify(importMap);
	document.head.appendChild(script);
}

/**
 * Calculates integrity hash for content using SHA-384 only
 * @param {string|ArrayBuffer} content Content to hash
 * @returns {Promise<string>} Integrity hash
 */
export async function calculateIntegrity(content) {
	if (typeof window === "undefined") return null;

	// We only support SHA-384 now
	const algorithm = "SHA-384";
	const encoder = new TextEncoder();
	const data = typeof content === "string" ? encoder.encode(content) : content;

	try {
		const hashBuffer = await crypto.subtle.digest(algorithm, data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));

		return `sha384-${hashBase64}`;
	} catch (error) {
		console.error("Error calculating integrity:", error);
		throw error;
	}
}

/**
 * Resolves a module specifier to a URL using the import map
 * @param {string} specifier Module specifier
 * @returns {string} Resolved URL
 */
export function resolveSpecifier(specifier) {
	const importMap = getImportMap();
	if (!importMap || !importMap.imports) {
		return specifier;
	}

	return importMap.imports[specifier] || specifier;
}

/**
 * Gets the integrity hash for a module URL
 * @param {string} url Module URL
 * @returns {string|undefined} Integrity hash
 */
export function getIntegrityForUrl(url) {
	const importMap = getImportMap();
	if (!importMap || !importMap.integrity) {
		return undefined;
	}

	return importMap.integrity[url];
}

/**
 * Checks if a URL has a direct or indirect integrity constraint
 * @param {string} url URL to check
 * @returns {boolean} Whether the URL has an integrity constraint
 */
export function hasIntegrityConstraint(url) {
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
 * Verifies the integrity of a module using SHA-384
 * @param {string} url Module URL
 * @returns {Promise<boolean>} Whether the module has valid integrity
 */
export async function verifyIntegrity(url) {
	const importMap = getImportMap();
	if (!importMap) return true;

	// Get direct integrity hash
	let integrity = importMap.integrity && importMap.integrity[url];

	// If no direct hash, check for indirect via bare specifiers
	if (!integrity && importMap.imports) {
		for (const [specifier, targetUrl] of Object.entries(importMap.imports)) {
			if (
				targetUrl === url &&
				importMap.integrity &&
				importMap.integrity[specifier]
			) {
				integrity = importMap.integrity[specifier];
				break;
			}
		}
	}

	// If no integrity hash, consider it valid
	if (!integrity) return true;

	// Verify integrity is using sha384
	if (!integrity.startsWith("sha384-")) {
		console.error(
			`Integrity hash format not supported: ${integrity}. Only SHA-384 is supported.`,
		);
		return false;
	}

	try {
		// Fetch the module
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch module: ${response.statusText}`);
		}

		// Calculate integrity
		const content = await response.text();
		const actualIntegrity = await calculateIntegrity(content);

		// Compare
		return actualIntegrity === integrity;
	} catch (error) {
		console.error(`Error verifying integrity for ${url}:`, error);
		return false;
	}
}

/**
 * Imports a module with integrity verification
 * @param {string} specifier Module specifier
 * @returns {Promise<any>} The imported module
 */
export async function importWithIntegrity(specifier) {
	// Resolve the specifier to a URL
	const url = resolveSpecifier(specifier);

	// Check if URL has an integrity constraint
	if (hasIntegrityConstraint(url)) {
		// Verify integrity
		const isValid = await verifyIntegrity(url);
		if (!isValid) {
			throw new Error(`Integrity check failed for module: ${url}`);
		}
	}

	// Import the module
	return import(url);
}

/**
 * React hook for importing a module with integrity verification - NextJS v15 compatible
 * @param {string} specifier Module specifier
 * @returns {Object} Module loading state
 */
export function useModuleWithIntegrity(specifier) {
	const [state, setState] = useState({
		module: null,
		loading: true,
		error: null,
	});

	useEffect(() => {
		let mounted = true;

		importWithIntegrity(specifier)
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
						error,
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
 * NextJS v15 compatible component for handling integrity verification errors
 * @param {Object} props Component props
 * @returns {JSX.Element} React component
 */
export function IntegrityErrorBoundary({ children, fallback }) {
	const [hasError, setHasError] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		const handleError = (event) => {
			if (event.message && event.message.includes("Integrity check failed")) {
				event.preventDefault();
				setError(event.message);
				setHasError(true);
			}
		};

		window.addEventListener("error", handleError);
		return () => window.removeEventListener("error", handleError);
	}, []);

	if (hasError) {
		if (fallback) {
			return fallback(error);
		}

		return (
			<div
				style={{
					padding: "20px",
					margin: "20px",
					border: "1px solid #f44336",
					borderRadius: "4px",
					backgroundColor: "#ffebee",
				}}
			>
				<h2>Module Integrity Error</h2>
				<p>
					A security issue has been detected. One or more scripts may have been
					tampered with.
				</p>
				{error && (
					<p>
						<strong>Error:</strong> {error}
					</p>
				)}
				<button onClick={() => window.location.reload()}>
					Reload Application
				</button>
			</div>
		);
	}

	return children;
}
