const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const NextJSModuleIntegrityPlugin = require("./nextjs-module-integrity-plugin");

// Mock fs and crypto
jest.mock("fs");
jest.mock("crypto");

describe("NextJSModuleIntegrityPlugin", () => {
	let plugin;
	let mockCompiler;
	let mockCompilation;
	let mockCreateHash;
	let mockDigest;
	let mockCallback;

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Setup crypto mocks
		mockDigest = jest.fn().mockReturnValue("mocked-hash-value");
		mockCreateHash = jest.fn().mockReturnValue({
			update: jest.fn().mockReturnThis(),
			digest: mockDigest,
		});
		crypto.createHash.mockImplementation(mockCreateHash);

		// Setup fs mocks
		fs.existsSync = jest.fn().mockReturnValue(false);
		fs.writeFileSync = jest.fn();
		fs.readFileSync = jest.fn().mockReturnValue("{}");

		// Setup webpack compiler mocks
		mockCallback = jest.fn();
		mockCompilation = {
			assets: {
				"chunk1.js": {
					source: () => 'const module1 = "content";',
					size: () => 25,
				},
				"chunk2.js": {
					source: () => 'const module2 = "content";',
					size: () => 25,
				},
				"node_modules/test-package/index.js": {
					source: () => "export default {}",
					size: () => 15,
				},
			},
			chunks: [
				{
					name: "chunk1",
					getModules: jest
						.fn()
						.mockReturnValue([
							{ resource: "/path/to/node_modules/test-package/index.js" },
						]),
				},
				{
					name: "chunk2",
					getModules: jest
						.fn()
						.mockReturnValue([{ resource: "/path/to/src/local-module.js" }]),
				},
			],
		};

		mockCompiler = {
			hooks: {
				emit: { tapAsync: jest.fn() },
				afterEmit: { tapAsync: jest.fn() },
			},
		};

		// Create the plugin instance with default config
		plugin = new NextJSModuleIntegrityPlugin();
	});

	test("initializes with default config", () => {
		expect(plugin.config).toEqual({
			packages: [],
			algorithm: "sha384",
			generateVercelConfig: true,
			importMapPath: "importmap.json",
			injectImportMap: true,
		});

		expect(plugin.importMap).toEqual({
			imports: {},
			integrity: {},
		});
	});

	test("initializes with custom config", () => {
		const customConfig = {
			packages: ["react", "lodash"],
			algorithm: "sha256",
			generateVercelConfig: false,
			importMapPath: "custom/path.json",
			injectImportMap: false,
		};

		const customPlugin = new NextJSModuleIntegrityPlugin(customConfig);
		expect(customPlugin.config).toEqual(customConfig);
	});

	test("apply method registers emit and afterEmit hooks", () => {
		plugin.apply(mockCompiler);

		expect(mockCompiler.hooks.emit.tapAsync).toHaveBeenCalledWith(
			"NextJSModuleIntegrityPlugin",
			expect.any(Function),
		);

		expect(mockCompiler.hooks.afterEmit.tapAsync).toHaveBeenCalledWith(
			"NextJSModuleIntegrityPlugin",
			expect.any(Function),
		);
	});

	test("calculateIntegrity generates correct hash format", () => {
		const content = "test content";
		const result = plugin.calculateIntegrity(content);

		expect(crypto.createHash).toHaveBeenCalledWith("sha384");
		expect(mockDigest).toHaveBeenCalledWith("base64");
		expect(result).toBe("sha384-mocked-hash-value");
	});

	test("addToImportMap adds entries correctly", () => {
		plugin.addToImportMap("scripts/bundle.js", "sha384-hashvalue");

		expect(plugin.importMap).toEqual({
			imports: {
				bundle: "/scripts/bundle.js",
			},
			integrity: {
				"/scripts/bundle.js": "sha384-hashvalue",
			},
		});
	});

	test("chunkContainsPackage detects package in chunk", () => {
		const containsPackage = plugin.chunkContainsPackage(
			mockCompilation,
			"chunk1",
			"test-package",
		);

		expect(containsPackage).toBe(true);
	});

	test("chunkContainsPackage returns false when package not in chunk", () => {
		const containsPackage = plugin.chunkContainsPackage(
			mockCompilation,
			"chunk2",
			"test-package",
		);

		expect(containsPackage).toBe(false);
	});

	test("chunkContainsPackage returns false when chunk not found", () => {
		const containsPackage = plugin.chunkContainsPackage(
			mockCompilation,
			"non-existent-chunk",
			"test-package",
		);

		expect(containsPackage).toBe(false);
	});

	test("generateVercelConfig creates new config when file does not exist", () => {
		// Setup plugin with some integrity hashes
		plugin.importMap.integrity = {
			"/bundle1.js": "sha384-hash1",
			"/bundle2.js": "sha384-hash2",
		};

		plugin.generateVercelConfig();

		expect(fs.existsSync).toHaveBeenCalledWith(
			expect.stringContaining("vercel.json"),
		);
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining("vercel.json"),
			expect.stringContaining('"Content-Security-Policy"'),
		);

		// Check the written content includes the integrity hashes
		const writtenContent = fs.writeFileSync.mock.calls[0][1];
		expect(writtenContent).toContain("sha384-hash1");
		expect(writtenContent).toContain("sha384-hash2");
	});

	test("generateVercelConfig updates existing config when file exists", () => {
		// Mock existing vercel.json
		fs.existsSync.mockReturnValue(true);
		fs.readFileSync.mockReturnValue(
			JSON.stringify({
				headers: [
					{
						source: "/(.*)",
						headers: [
							{
								key: "Content-Security-Policy",
								value: "default-src 'self'; script-src 'self'",
							},
						],
					},
				],
			}),
		);

		// Setup plugin with some integrity hashes
		plugin.importMap.integrity = {
			"/bundle1.js": "sha384-hash1",
		};

		plugin.generateVercelConfig();

		expect(fs.writeFileSync).toHaveBeenCalled();
		const writtenContent = fs.writeFileSync.mock.calls[0][1];

		// Verify the existing CSP was updated
		expect(writtenContent).toContain("script-src 'self' 'sha384-hash1'");
	});

	test("emit hook processes assets and creates import map", () => {
		// Get the emit hook function
		plugin.apply(mockCompiler);
		const emitFn = mockCompiler.hooks.emit.tapAsync.mock.calls[0][1];

		// Call the emit hook function
		emitFn(mockCompilation, mockCallback);

		// Check that importmap.json was added to the assets
		expect(mockCompilation.assets["importmap.json"]).toBeDefined();
		expect(mockCallback).toHaveBeenCalled();
	});

	test("afterEmit hook generates Vercel config when enabled", () => {
		// Spy on generateVercelConfig
		const generateVercelConfigSpy = jest.spyOn(plugin, "generateVercelConfig");

		// Get the afterEmit hook function
		plugin.apply(mockCompiler);
		const afterEmitFn = mockCompiler.hooks.afterEmit.tapAsync.mock.calls[0][1];

		// Call the afterEmit hook function
		afterEmitFn(mockCompilation, mockCallback);

		// Check that generateVercelConfig was called
		expect(generateVercelConfigSpy).toHaveBeenCalled();
		expect(mockCallback).toHaveBeenCalled();
	});

	test("afterEmit hook does not generate Vercel config when disabled", () => {
		// Create plugin with generateVercelConfig disabled
		plugin = new NextJSModuleIntegrityPlugin({
			generateVercelConfig: false,
		});

		// Spy on generateVercelConfig
		const generateVercelConfigSpy = jest.spyOn(plugin, "generateVercelConfig");

		// Get the afterEmit hook function
		plugin.apply(mockCompiler);
		const afterEmitFn = mockCompiler.hooks.afterEmit.tapAsync.mock.calls[0][1];

		// Call the afterEmit hook function
		afterEmitFn(mockCompilation, mockCallback);

		// Check that generateVercelConfig was not called
		expect(generateVercelConfigSpy).not.toHaveBeenCalled();
		expect(mockCallback).toHaveBeenCalled();
	});
});
