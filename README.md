# Module Integrity for NextJS v15

A modern module integrity system for NextJS v15 applications with SHA-384 support, providing subresource integrity verification for JavaScript modules.

## Overview

This library helps ensure that JavaScript modules loaded in your NextJS v15 application haven't been tampered with, improving security and reliability by verifying resource integrity via SHA-384 hashes.

> **Important:** This version **only supports SHA-384** integrity verification and is specifically designed for **NextJS v15+**.

## Features

- **NextJS v15 Middleware:** Easy integration with NextJS v15 projects via middleware pattern
- **SHA-384 Support:** Exclusive use of SHA-384 for maximum security
- **Import Map Integration:** Uses import maps to associate modules with their integrity hashes
- **React Hooks:** Provides React hooks for dynamic imports with integrity verification
- **Build Validation:** Tools to validate build output integrity
- **TypeScript Support:** Full TypeScript definitions and support

## Installation

```bash
npm install esm_sri --save
# or
yarn add esm_sri
# or 
pnpm add esm_sri
```

## Quick Start

### 1. Add the middleware to your Next.js config

```javascript
// next.config.js
const { createModuleIntegrityMiddleware } = require('esm_sri/src/nextjs-module-integrity-plugin');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your existing Next.js configuration
};

// Create and apply module integrity middleware
const moduleIntegrityMiddleware = createModuleIntegrityMiddleware({
  packages: ['react', 'react-dom'], // Packages to generate integrity hashes for
});

module.exports = moduleIntegrityMiddleware(nextConfig);
```

### 2. Add client-side verification to your app

```javascript
// app/layout.tsx or _app.tsx
import { 
  loadImportMap, 
  IntegrityErrorBoundary 
} from 'esm_sri/src/module-integrity-client';
import { useEffect } from 'react';

export default function RootLayout({ children }) {
  useEffect(() => {
    // Load the import map generated during build
    loadImportMap('/importmap.json').catch(console.error);
  }, []);

  return (
    <html lang="en">
      <body>
        <IntegrityErrorBoundary fallback={(error) => (
          <div>Module integrity error: {error.message}</div>
        )}>
          {children}
        </IntegrityErrorBoundary>
      </body>
    </html>
  );
}
```

### 3. Use the dynamic import hook for client components

```javascript
// components/DynamicComponent.tsx
'use client';
import { useModuleWithIntegrity } from 'esm_sri/src/module-integrity-client';

export default function DynamicComponent() {
  const { module, loading, error } = useModuleWithIntegrity('module-name');
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  const Component = module.default;
  return <Component />;
}
```

## How It Works

This library uses the import map specification to associate module URLs with their integrity hashes:

```json
{
  "imports": {
    "square": "./module/shapes/square.js"
  },
  "integrity": {
    "./module/shapes/square.js": "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  }
}
```

During the build process, the NextJS plugin:
1. Identifies modules to be included in the import map
2. Calculates SHA-384 integrity hashes for each module
3. Generates an import map with integrity information
4. Optionally updates security headers in Vercel configuration

At runtime, the client-side library:
1. Loads the import map
2. Verifies module integrity before execution
3. Prevents execution of compromised modules

## Validation

To validate your build output integrity during deployment:

```javascript
// scripts/validate-build.js
const { validateNextJSBuildIntegrity } = require('esm_sri/src/module-integrity-validator');

validateNextJSBuildIntegrity({ distDir: '.next' })
  .then(results => {
    if (!results.success) {
      process.exit(1);
    }
    console.log('Build validated successfully!');
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
```

## TypeScript Support

If you're using TypeScript, you can import from the TypeScript implementation:

```typescript
import { 
  useModuleWithIntegrity, 
  calculateIntegrity,
  ImportMap,
  NextJSIntegrityConfig
} from 'esm_sri/src/module-integrity-ts';
```

## References

- [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- [Import Maps](https://github.com/WICG/import-maps)
- [NextJS Documentation](https://nextjs.org/docs)

## License

ISC
