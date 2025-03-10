# SRI Module Integrity via Import Map

> [!WARNING]
> This is not production ready, beware slop ahead


This project provides tools for generating and validating Subresource Integrity (SRI) hashes for ES modules via an import map.

> It helps ensure that the modules you load in your application haven't been tampered with, improving security and reliability.


### How it Should Work 


```javascript
// Example usage
import { generateImportMapWithIntegrity, injectImportMap } from './src/module-integrity-typescript';

async function initializeModules() {
  const modules = {
    'square': './module/shapes/square.js',
    'circle': './module/shapes/circle.js',
    'app': './module/app.js'
  };

  const importMap = await generateImportMapWithIntegrity(modules);
  injectImportMap(importMap);
}

initializeModules();
```
