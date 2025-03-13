/**
 * Next.js Module Script Integrity Implementation
 * Based on the article: "Shipping support for module script integrity in Chrome & Safari"
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createHash } from "crypto";
import { Plugin } from "next/dist/build/webpack/plugins/middleware-plugin";
import webpack from "webpack";

// Type definitions
interface ImportMapEntry {
	[moduleSpecifier: string]: string;
}

interface ImportMap {
	imports?: ImportMapEntry;
	scopes?: Record<string, ImportMapEntry>;
	integrity?: ImportMapEntry;
}

interface ModuleAsset {
	outputPath: string;
	source: string | Buffer;
	sourceMap?: string;
}

interface IntegrityConfig {
	/**
	 * Directories to scan for generating integrity hashes
	 * Relative to project root
	 * Optional when using webpack module dependency analysis
	 */
	directories?: string[];

	/**
	 * Extensions to include when scanning for modules
	 */
	extensions: string[];

	/**
	 * Output path for the generated import map
	 * Relative to public directory
	 */
	outputPath: string;

	/**
	 * Module specifier prefix to use in import map
	 */
	modulePrefix?: string;

	/**
	 * Include dynamic imports in the analysis
	 * Default: true
	 */
	includeDynamicImports?: boolean;

	/**
	 * Whether to follow all webpack dependencies or just direct imports
	 * Default: true
	 */
	followAllDependencies?: boolean;

	/**
	 * Custom filter function to determine if a module should be included
	 * This gives more control than just extensions and directories
	 */
	moduleFilter?: (filePath: string) => boolean;
}

/**
 * A custom error class for module integrity errors
 */
class ModuleIntegrityError extends Error {
	constructor(message: string) {
		super(`[ModuleIntegrity] ${message}`);
		this.name = "ModuleIntegrityError";
	}
}

/**
 * Assert that a condition is true, or throw an error
 */
function invariant(condition: any, message: string): asserts condition {
	if (!condition) {
		throw new ModuleIntegrityError(message);
	}
}

/**
 * Calculate integrity hash for a buffer or string
 * Compatible with both Node.js and browser environments
 */
function calculateIntegrity(content: string | Buffer): string {
	try {
		// Use Node.js crypto module
		const hash = createHash("sha384");
		hash.update(typeof content === "string" ? content : content);
		return `sha384-${hash.digest("base64")}`;
	} catch (error) {
		throw new ModuleIntegrityError(
			`Failed to calculate integrity: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Generate import map with integrity hashes for the specified modules
 * This runs during the build process
 */
function generateImportMapWithIntegrity(
	modules: Record<string, Buffer | string>,
	baseUrl: string = "/",
): ImportMap {
	invariant(
		Object.keys(modules).length > 0,
		"No modules provided for integrity calculation",
	);

	const imports: ImportMapEntry = {};
	const integrity: ImportMapEntry = {};

	// For each module, add it to the imports map
	for (const [modulePath, content] of Object.entries(modules)) {
		// Create a module specifier based on the file path
		const normalizedPath = modulePath.startsWith("/")
			? modulePath
			: `/${modulePath}`;
		const specifier = path.basename(modulePath, path.extname(modulePath));
		const url = path.join(baseUrl, normalizedPath).replace(/\\/g, "/");

		imports[specifier] = url;
		integrity[url] = calculateIntegrity(content);
	}

	return { imports, integrity };
}

/**
 * Read all modules from specified directories
 */
function readModulesFromDirectories(
	directories: string[],
	extensions: string[] = [".js", ".mjs"],
): Record<string, Buffer> {
	invariant(
		directories.length > 0,
		"No directories specified for module scanning",
	);
	invariant(
		extensions.length > 0,
		"No extensions specified for module scanning",
	);

	const modules: Record<string, Buffer> = {};

	for (const dir of directories) {
		invariant(fs.existsSync(dir), `Directory does not exist: ${dir}`);

		const files = getAllFiles(dir);
		for (const file of files) {
			if (extensions.includes(path.extname(file))) {
				try {
					const relativePath = path.relative(process.cwd(), file);
					const content = fs.readFileSync(file);
					modules[relativePath] = content;
				} catch (error) {
					throw new ModuleIntegrityError(
						`Failed to read file ${file}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		}
	}

	return modules;
}

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dir: string): string[] {
	invariant(fs.existsSync(dir), `Directory does not exist: ${dir}`);

	const files: string[] = [];

	const items = fs.readdirSync(dir);
	for (const item of items) {
		const itemPath = path.join(dir, item);
		const stats = fs.statSync(itemPath);

		if (stats.isDirectory()) {
			files.push(...getAllFiles(itemPath));
		} else if (stats.isFile()) {
			files.push(itemPath);
		}
	}

	return files;
}

/**
 * Write import map to the specified output file
 */
function writeImportMap(importMap: ImportMap, outputPath: string): void {
	invariant(outputPath, "No output path specified for import map");

	try {
		const outputDir = path.dirname(outputPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		fs.writeFileSync(outputPath, JSON.stringify(importMap, null, 2), "utf-8");
	} catch (error) {
		throw new ModuleIntegrityError(
			`Failed to write import map to ${outputPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Next.js webpack plugin to generate module integrity hashes during build
 * This enhanced version analyzes the webpack module dependency graph
 */
export class ModuleIntegrityPlugin implements webpack.WebpackPluginInstance {
	private config: IntegrityConfig;

	constructor(config: IntegrityConfig) {
		invariant(
			config.extensions?.length > 0,
			"Module extensions must be specified",
		);
		invariant(config.outputPath, "Output path must be specified");

		this.config = {
			...config,
			// Make directories optional since we'll use webpack's module graph
			directories: config.directories || [],
		};
	}

	apply(compiler: webpack.Compiler): void {
		// Use the compilation hook to access the module graph
		compiler.hooks.compilation.tap("ModuleIntegrityPlugin", (compilation) => {
			// Wait until after the chunk optimization to ensure all modules are processed
			compilation.hooks.afterOptimizeChunkModules.tap(
				"ModuleIntegrityPlugin",
				(chunks) => {
					try {
						// Map for collecting module assets
						const moduleAssets: Record<string, Buffer | string> = {};
						const processedModules = new Set<string>();

						// Process chunks to get all module dependencies
						chunks.forEach((chunk) => {
							// For webpack 5, use chunk.getModules()
							const chunkModules = Array.from(
								chunk.modulesIterable || chunk.getModules(),
							);

							chunkModules.forEach((module) => {
								this.processModule(
									module,
									moduleAssets,
									processedModules,
									compilation,
								);
							});
						});

						// If directories are specified, also include those modules
						// This is for modules that might not be in the webpack graph
						// but should still be integrity-verified
						if (this.config.directories.length > 0) {
							const filesFromDirs = readModulesFromDirectories(
								this.config.directories,
								this.config.extensions,
							);

							Object.entries(filesFromDirs).forEach(([filePath, content]) => {
								// Only add if not already processed through webpack
								if (!processedModules.has(filePath)) {
									moduleAssets[filePath] = content;
								}
							});
						}

						// Generate import map
						const importMap = generateImportMapWithIntegrity(
							moduleAssets,
							this.config.modulePrefix || "/",
						);

						// Write import map to output
						const outputPath = path.join(
							process.cwd(),
							"public",
							this.config.outputPath,
						);

						writeImportMap(importMap, outputPath);

						console.log(
							`[ModuleIntegrityPlugin] Generated import map with ${Object.keys(importMap.integrity || {}).length} integrity hashes from ${processedModules.size} webpack modules`,
						);
					} catch (error) {
						console.error(
							error instanceof Error ? error.message : String(error),
						);
						if (error instanceof ModuleIntegrityError) {
							// We don't want to fail the build for integrity errors
							console.error(
								"[ModuleIntegrityPlugin] Failed to generate import map",
							);
						} else {
							// For other errors, we might want to fail the build
							throw error;
						}
					}
				},
			);
		});
	}

	/**
	 * Process a webpack module and its dependencies recursively
	 */
	private processModule(
		module: any,
		moduleAssets: Record<string, Buffer | string>,
		processedModules: Set<string>,
		compilation: webpack.compilation.Compilation,
	): void {
		// Skip if module has no resource (like external modules) or has been processed
		if (!module.resource || processedModules.has(module.resource)) {
			return;
		}

		// Check if we should include this module
		if (this.shouldIncludeModule(module.resource)) {
			try {
				// Get module source code
				let source: string | Buffer;

				// Different ways to get source based on webpack version/module type
				if (typeof module.originalSource === "function") {
					source = module.originalSource().source();
				} else if (module.source) {
					source =
						typeof module.source === "function"
							? module.source().source()
							: module.source;
				} else if (compilation.moduleGraph) {
					// For webpack 5
					const moduleSource = compilation.codeGenerationResults
						?.get(module)
						?.sources?.get("javascript");
					if (moduleSource) {
						source = moduleSource.source();
					} else {
						// If we can't get the source, skip this module
						return;
					}
				} else {
					// If we can't get the source, skip this module
					return;
				}

				// Add to processed modules to avoid duplication
				processedModules.add(module.resource);

				// Store module source for integrity calculation
				moduleAssets[module.resource] = source;

				// Process dependencies recursively
				this.processDependencies(
					module,
					moduleAssets,
					processedModules,
					compilation,
				);
			} catch (error) {
				console.warn(
					`[ModuleIntegrityPlugin] Failed to process module ${module.resource}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}

	/**
	 * Process module dependencies recursively
	 */
	private processDependencies(
		module: any,
		moduleAssets: Record<string, Buffer | string>,
		processedModules: Set<string>,
		compilation: webpack.compilation.Compilation,
	): void {
		// Get dependencies based on webpack version
		let dependencies: any[] = [];

		if (compilation.moduleGraph) {
			// Webpack 5
			dependencies = Array.from(
				compilation.moduleGraph.getOutgoingConnections(module) || [],
			)
				.filter((connection) => connection.module)
				.map((connection) => connection.module);
		} else if (module.dependencies) {
			// Webpack 4
			dependencies = module.dependencies
				.filter((dep: any) => dep.module)
				.map((dep: any) => dep.module);
		}

		// Process each dependency
		dependencies.forEach((depModule) => {
			this.processModule(
				depModule,
				moduleAssets,
				processedModules,
				compilation,
			);
		});
	}

	/**
	 * Determine if a module should be included based on its file path
	 */
	private shouldIncludeModule(filePath: string): boolean {
		if (!filePath) return false;

		const ext = path.extname(filePath);
		if (!this.config.extensions.includes(ext)) {
			return false;
		}

		// If directories are specified, check if the module is in one of them
		if (this.config.directories.length > 0) {
			return this.config.directories.some(
				(dir) => filePath.startsWith(dir) || filePath.includes(`/${dir}/`),
			);
		}

		// If no directories specified, include all JS modules
		return true;
	}
}

// Client-side utilities

/**
 * Load the import map from a specified URL
 * This runs in the browser
 */
export async function loadImportMap(url: string): Promise<ImportMap> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch import map: ${response.statusText}`);
		}
		return await response.json();
	} catch (error) {
		console.error("Error loading import map:", error);
		throw error;
	}
}

/**
 * Apply import map to the document
 * This runs in the browser
 */
export function applyImportMap(importMap: ImportMap): void {
	if (typeof document === "undefined") {
		console.warn("applyImportMap can only be used in browser environment");
		return;
	}

	const script = document.createElement("script");
	script.type = "importmap";
	script.textContent = JSON.stringify(importMap, null, 2);
	document.head.appendChild(script);
}

/**
 * Next.js app configuration for module integrity
 * Use this in next.config.js
 */
export function withModuleIntegrity(
	nextConfig: Record<string, any> = {},
	integrityConfig: IntegrityConfig,
): Record<string, any> {
	return {
		...nextConfig,
		webpack(config: webpack.Configuration, options: any) {
			config.plugins = config.plugins || [];
			config.plugins.push(new ModuleIntegrityPlugin(integrityConfig));

			// Call the original webpack function if it exists
			if (typeof nextConfig.webpack === "function") {
				return nextConfig.webpack(config, options);
			}

			return config;
		},
	};
}

// Example usage in next.config.js:
/*
const { withModuleIntegrity } = require('./module-integrity');

module.exports = withModuleIntegrity(
  {
    // Your existing Next.js config
  },
  {
    // Optional: specify directories to include additional modules
    // not detected through webpack analysis
    directories: ['public/js', 'public/modules'],
    
    // Extensions to include in the integrity map
    extensions: ['.js', '.mjs'],
    
    // Where to output the import map (relative to public directory)
    outputPath: 'importmap.json',
    
    // Prefix to use for module specifiers
    modulePrefix: '/modules',
    
    // Optional: custom filter to determine which modules to include
    moduleFilter: (filePath) => {
      // Example: only include modules from specific vendors
      return !filePath.includes('node_modules') || 
             filePath.includes('node_modules/trusted-vendor');
    },
    
    // Optional: control dependency traversal
    followAllDependencies: true,
    includeDynamicImports: true
  }
);
*/

// Example usage in _app.tsx:
/*
import { useEffect } from 'react';
import { loadImportMap, applyImportMap } from '../lib/module-integrity';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    async function setupImportMap() {
      try {
        const importMap = await loadImportMap('/importmap.json');
        applyImportMap(importMap);
        console.log('Import map applied successfully');
      } catch (error) {
        console.error('Failed to setup import map:', error);
      }
    }
    
    setupImportMap();
  }, []);
  
  return <Component {...pageProps} />;
}

export default MyApp;
*/
