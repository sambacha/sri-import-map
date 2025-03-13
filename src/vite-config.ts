// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import moduleIntegrityPlugin from "./vite-plugin-module-integrity";

export default defineConfig({
	plugins: [
		react(),
		moduleIntegrityPlugin({
			extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs"],
			algorithm: "sha384",
			importMapPath: "importmap.json",
		}),
	],
	build: {
		// Generate source maps for better debugging
		sourcemap: true,
		// Customize rollup options if needed
		rollupOptions: {
			// Ensure proper code splitting
			output: {
				manualChunks: {
					react: ["react", "react-dom"],
					// Add other dependencies as needed
				},
			},
		},
	},
});
