// module-integrity-validator.js - Updated for NextJS v15 with SHA-384 only
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Configuration for the validator
 * @typedef {Object} ValidatorConfig
 * @property {string} distDir - Directory containing the build output
 * @property {string} importMapPath - Path to the import map (relative to distDir)
 */

/**
 * Validates the integrity of all modules in the NextJS v15 build output
 * against the generated import map, using SHA-384 only
 *
 * @param {ValidatorConfig} config - Configuration options
 * @returns {Promise<Object>} Validation results
 */
async function validateNextJSBuildIntegrity(config = {}) {
	const distDir = config.distDir || ".next";
	const importMapPath = config.importMapPath || "importmap.json";
	const algorithm = "sha384"; // We now only support SHA-384

	console.log(
		`Validating NextJS v15 build output integrity using ${algorithm.toUpperCase()}...`,
	);

	// Read the import map
	const fullImportMapPath = path.join(distDir, importMapPath);
	if (!fs.existsSync(fullImportMapPath)) {
		console.error(`Import map not found at ${fullImportMapPath}`);
		throw new Error(`Import map not found at ${fullImportMapPath}`);
	}

	const importMap = JSON.parse(fs.readFileSync(fullImportMapPath, "utf-8"));
	const { imports, integrity } = importMap;

	if (!integrity || Object.keys(integrity).length === 0) {
		console.error("No integrity hashes found in import map");
		throw new Error("No integrity hashes found in import map");
	}

	// Track validation results
	const results = {
		total: 0,
		passed: 0,
		failed: 0,
		missing: 0,
		failures: [],
		success: false,
	};

	// Validate each module with an integrity hash
	for (const [url, expectedHash] of Object.entries(integrity)) {
		results.total++;

		// Ensure hash is using SHA-384
		if (!expectedHash.startsWith(`${algorithm}-`)) {
			console.error(
				`Integrity hash format not supported: ${expectedHash}. Only SHA-384 is supported.`,
			);
			results.failed++;
			results.failures.push({
				url,
				expected: expectedHash,
				error: "Unsupported hash algorithm. Only SHA-384 is supported.",
			});
			continue;
		}

		// Get the file path from the URL
		let filePath = url;
		// Remove the base URL if present
		if (url.startsWith("/")) {
			filePath = url.substring(1);
		} else if (url.includes("://")) {
			// Handle absolute URLs
			const urlObj = new URL(url);
			filePath = urlObj.pathname.substring(1);
		}

		const fullPath = path.join(distDir, filePath);

		// Check if the file exists
		if (!fs.existsSync(fullPath)) {
			console.error(`Module file not found: ${fullPath}`);
			results.missing++;
			results.failures.push({
				url,
				expected: expectedHash,
				error: "File not found",
			});
			continue;
		}

		// Read file content
		const content = fs.readFileSync(fullPath);

		// Calculate hash with SHA-384 only
		const hash = crypto.createHash(algorithm).update(content).digest("base64");

		const actualHash = `${algorithm}-${hash}`;

		// Compare hashes
		if (actualHash === expectedHash) {
			results.passed++;
		} else {
			results.failed++;
			results.failures.push({
				url,
				expected: expectedHash,
				actual: actualHash,
			});
		}
	}

	// Report results
	console.log("\nIntegrity Validation Results:");
	console.log(`Total modules: ${results.total}`);
	console.log(`Passed: ${results.passed}`);
	console.log(`Failed: ${results.failed}`);
	console.log(`Missing: ${results.missing}`);

	if (results.failures.length > 0) {
		console.log("\nFailures:");
		results.failures.forEach((failure) => {
			console.log(`\nURL: ${failure.url}`);
			console.log(`Expected: ${failure.expected}`);
			if (failure.actual) {
				console.log(`Actual: ${failure.actual}`);
			} else if (failure.error) {
				console.log(`Error: ${failure.error}`);
			}
		});

		results.success = false;
	} else {
		console.log("\nAll modules passed integrity validation!");
		results.success = true;
	}

	return results;
}

/**
 * Command-line runner for the validation process
 * @param {string} distDir - Directory containing the build output
 */
function runValidation(distDir = ".next") {
	validateNextJSBuildIntegrity({ distDir })
		.then((results) => {
			if (!results.success) {
				process.exit(1);
			}
		})
		.catch((error) => {
			console.error("Validation failed:", error);
			process.exit(1);
		});
}

// Allow running as a standalone script
if (require.main === module) {
	const args = process.argv.slice(2);
	const distDir = args[0] || ".next";
	runValidation(distDir);
}

module.exports = {
	validateNextJSBuildIntegrity,
	runValidation,
};
