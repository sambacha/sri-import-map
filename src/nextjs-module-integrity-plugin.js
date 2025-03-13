// nextjs-module-integrity-plugin.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/**
 * Configuration for the NextJS Module Integrity Plugin
 * @typedef {Object} ModuleIntegrityConfig
 * @property {string[]} packages - Array of package names to generate integrity hashes for
 * @property {boolean} generateVercelConfig - Whether to generate headers in vercel.json
 * @property {string} importMapPath - Path to output the import map JSON
 * @property {boolean} injectImportMap - Whether to inject the import map into HTML
 */

/**
 * Middleware creator for NextJS v15+ that adds module integrity functionality
 * @param {ModuleIntegrityConfig} config - Middleware configuration
 * @returns {Function} - NextJS middleware function
 */
function createModuleIntegrityMiddleware(config = {}) {
	const moduleIntegrityPlugin = new NextJSModuleIntegrityPlugin(config);

	return (nextConfig = {}) => {
		return {
			...nextConfig,
			webpack(config, options) {
				// Apply our custom plugin
				config.plugins.push(moduleIntegrityPlugin);

				// Call the original webpack config if it exists
				if (typeof nextConfig.webpack === "function") {
					return nextConfig.webpack(config, options);
				}

				return config;
			},
		};
	};
}

/**
 * Creates a webpack plugin for NextJS v15 that generates integrity hashes for specified modules
 * @param {ModuleIntegrityConfig} config - Plugin configuration
 * @returns {Object} - NextJS webpack plugin
 * @private
 */
class NextJSModuleIntegrityPlugin {
	constructor(config = {}) {
		this.config = {
			packages: [],
			generateVercelConfig: true,
			importMapPath: "importmap.json",
			injectImportMap: true,
			...config,
		};

		// We now only support SHA-384 for integrity
		this.algorithm = "sha384";

		this.importMap = {
			imports: {},
			integrity: {},
		};
	}

	/**
	 * Applies the plugin to the webpack compiler
	 * @param {Object} compiler - Webpack compiler instance
	 */
	apply(compiler) {
		// Use the processAssets hook from the webpack 5 API for NextJS v15
		compiler.hooks.compilation.tap(
			"NextJSModuleIntegrityPlugin",
			(compilation) => {
				compilation.hooks.processAssets.tap(
					{
						name: "NextJSModuleIntegrityPlugin",
						stage: compilation.PROCESS_ASSETS_STAGE_ANALYZE,
					},
					(assets) => {
						const assetNames = Object.keys(assets);

						// Get JS assets
						const jsAssets = assetNames.filter((name) => name.endsWith(".js"));

						// Filter assets based on configured packages
						const targetAssets = this.filterAssetsByPackages(
							compilation,
							jsAssets,
						);

						// Process each target asset
						targetAssets.forEach((assetName) => {
							const asset = assets[assetName];
							const content = asset.source();

							// Calculate integrity hash
							const integrity = this.calculateIntegrity(content);

							// Add to import map
							this.addToImportMap(assetName, integrity);
						});

						// Add import map as an asset
						const importMapJson = JSON.stringify(this.importMap, null, 2);
						compilation.emitAsset(this.config.importMapPath, {
							source: () => importMapJson,
							size: () => importMapJson.length,
						});
					},
				);
			},
		);

		// Use the afterEmit hook to generate Vercel config
		compiler.hooks.afterEmit.tapAsync(
			"NextJSModuleIntegrityPlugin",
			(compilation, callback) => {
				if (this.config.generateVercelConfig) {
					this.generateVercelConfig();
				}

				callback();
			},
		);
	}

	/**
	 * Filter assets based on configured packages
	 * @param {Object} compilation - Webpack compilation object
	 * @param {string[]} assetNames - All asset names
	 * @returns {string[]} - Filtered asset names
	 */
	filterAssetsByPackages(compilation, assetNames) {
		if (!this.config.packages || this.config.packages.length === 0) {
			return assetNames;
		}

		return assetNames.filter((name) => {
			return this.config.packages.some((pkg) => {
				// Direct imports check
				if (name.includes(`node_modules/${pkg}/`)) {
					return true;
				}

				// Use the improved chunk detection
				if (
					this.chunkContainsPackage(compilation, name.replace(/\.js$/, ""), pkg)
				) {
					return true;
				}

				return false;
			});
		});
	}

	/**
	 * Determine if a chunk contains a specific package
	 * This method analyzes the module graph to determine this accurately
	 * @param {Object} compilation - Webpack compilation object
	 * @param {string} chunkName - Name of the chunk
	 * @param {string} packageName - Package to check for
	 * @returns {boolean} - Whether the chunk contains the package
	 */
	chunkContainsPackage(compilation, chunkName, packageName) {
		const chunk = compilation.namedChunks.get(chunkName);
		if (!chunk) return false;

		// Get all modules in this chunk - updated for webpack 5 API
		const modulesInChunk = new Set();
		for (const module of chunk.getModules()) {
			modulesInChunk.add(module);
		}

		// Check if any module is from the package
		return Array.from(modulesInChunk).some((module) => {
			// Check the module resource path
			if (module.resource) {
				return module.resource.includes(`node_modules/${packageName}/`);
			}

			// For concatenated modules, check each source
			if (module.modules) {
				return Array.from(module.modules).some(
					(m) =>
						m.resource && m.resource.includes(`node_modules/${packageName}/`),
				);
			}

			return false;
		});
	}

	/**
	 * Calculate integrity hash for content using SHA-384 only
	 * @param {string|Buffer} content - Content to hash
	 * @returns {string} - Integrity hash
	 */
	calculateIntegrity(content) {
		const hash = crypto.createHash(this.algorithm);
		hash.update(content);
		return `${this.algorithm}-${hash.digest("base64")}`;
	}

	/**
	 * Add an asset to the import map
	 * @param {string} assetName - Asset name
	 * @param {string} integrity - Integrity hash
	 */
	addToImportMap(assetName, integrity) {
		// Create a specifier from the asset name
		// Remove extension and path to create a simpler specifier
		const specifier = path.basename(assetName, path.extname(assetName));

		// Add to import map
		this.importMap.imports[specifier] = `/${assetName}`;
		this.importMap.integrity[`/${assetName}`] = integrity;
	}

	/**
	 * Generate or update Vercel configuration with security headers
	 */
	generateVercelConfig() {
		const vercelConfigPath = path.resolve(process.cwd(), "vercel.json");
		let vercelConfig = { headers: [] };

		// Check if vercel.json exists
		if (fs.existsSync(vercelConfigPath)) {
			try {
				vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
				if (!vercelConfig.headers) {
					vercelConfig.headers = [];
				}
			} catch (error) {
				console.error("Error reading vercel.json:", error);
			}
		}

		// Generate Content-Security-Policy with script-src entries
		const scriptSrcEntries = Object.entries(this.importMap.integrity)
			.map(([url, integrity]) => {
				return `'${integrity}'`;
			})
			.join(" ");

		// Check if we already have a CSP header
		const existingCspHeaderIndex = vercelConfig.headers.findIndex(
			(header) =>
				header.source &&
				header.headers &&
				header.headers.some((h) => h.key === "Content-Security-Policy"),
		);

		if (existingCspHeaderIndex >= 0) {
			// Update existing CSP header
			const cspHeaderIndex = vercelConfig.headers[
				existingCspHeaderIndex
			].headers.findIndex((h) => h.key === "Content-Security-Policy");

			if (cspHeaderIndex >= 0) {
				let cspValue =
					vercelConfig.headers[existingCspHeaderIndex].headers[cspHeaderIndex]
						.value;

				// Check if there's a script-src directive
				if (cspValue.includes("script-src ")) {
					// Add integrity hashes to existing script-src
					cspValue = cspValue.replace(
						/(script-src [^;]*)/,
						`$1 ${scriptSrcEntries}`,
					);
				} else {
					// Add new script-src directive
					cspValue += `; script-src 'self' ${scriptSrcEntries}`;
				}

				vercelConfig.headers[existingCspHeaderIndex].headers[
					cspHeaderIndex
				].value = cspValue;
			}
		} else {
			// Add new CSP header
			vercelConfig.headers.push({
				source: "/(.*)",
				headers: [
					{
						key: "Content-Security-Policy",
						value: `default-src 'self'; script-src 'self' ${scriptSrcEntries}`,
					},
				],
			});
		}

		// Write updated vercel.json
		fs.writeFileSync(vercelConfigPath, JSON.stringify(vercelConfig, null, 2));
		console.log(
			`Updated vercel.json with integrity headers for ${Object.keys(this.importMap.integrity).length} modules`,
		);
	}
}

// Export both the middleware creator (primary export) and the plugin class
module.exports = createModuleIntegrityMiddleware;
module.exports.NextJSModuleIntegrityPlugin = NextJSModuleIntegrityPlugin;
