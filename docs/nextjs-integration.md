# Next.js v15 Integration

This document provides a step-by-step guide on how to integrate the module integrity tool with Next.js v15 projects.

## Installation

To use the module integrity tool with your Next.js v15 project, follow these steps:

1. Install the package:

```bash
npm install esm_sri --save
# or
yarn add esm_sri
# or
pnpm add esm_sri
```

2. Update your Next.js configuration in `next.config.js`:

```javascript
const { createModuleIntegrityMiddleware } = require('esm_sri/src/nextjs-module-integrity-plugin');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your existing Next.js configuration
};

// Create module integrity middleware with options
const moduleIntegrityMiddleware = createModuleIntegrityMiddleware({
  packages: ['react', 'react-dom'], // Packages to generate integrity hashes for
  generateVercelConfig: true, // Whether to generate headers in vercel.json
  importMapPath: 'importmap.json', // Path to output the import map JSON
  injectImportMap: true, // Whether to inject the import map into HTML
});

// Apply the middleware to your Next.js config
module.exports = moduleIntegrityMiddleware(nextConfig);
```

## Usage

After installation, the middleware will automatically:

1. Generate SHA-384 integrity hashes for specified JavaScript modules during build
2. Create an import map with integrity information
3. Optionally generate Vercel configuration with appropriate security headers

### Client-Side Validation

To validate module integrity on the client-side, import the client utilities:

```javascript
import { 
  loadImportMap, 
  importWithIntegrity, 
  IntegrityErrorBoundary 
} from 'esm_sri/src/module-integrity-client';

// In your application entry point
useEffect(() => {
  // Load the import map generated during build
  loadImportMap('/importmap.json').catch(console.error);
}, []);

// Wrap your application with the error boundary
function MyApp({ Component, pageProps }) {
  return (
    <IntegrityErrorBoundary fallback={(error) => <div>Security Error: {error}</div>}>
      <Component {...pageProps} />
    </IntegrityErrorBoundary>
  );
}
```

### Dynamic Imports with Integrity Checks

Use the provided hook for safely importing modules with integrity verification:

```javascript
import { useModuleWithIntegrity } from 'esm_sri/src/module-integrity-client';

function DynamicComponent() {
  const { module, loading, error } = useModuleWithIntegrity('module-name');
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  const Component = module.default;
  return <Component />;
}
```

### Build Validation

To validate the integrity of your build output, use the validation utility:

```javascript
const { validateNextJSBuildIntegrity } = require('esm_sri/src/module-integrity-validator');

// Add this to your build or deployment script
validateNextJSBuildIntegrity({
  distDir: '.next', // Next.js output directory
  importMapPath: 'importmap.json' // Import map path relative to distDir
})
  .then(results => {
    if (!results.success) {
      process.exit(1); // Exit with error if validation fails
    }
    console.log('Build validated successfully!');
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
```

## Important Notes

- This version only supports SHA-384 for integrity hashes
- This integration is designed specifically for Next.js v15 and is not backward compatible
- The module integrity system works with both client-side and server-side rendering
