# SRI Module Integrity via Import Map

> [!WARNING]
> This is not production ready, beware slop ahead


This project provides tools for generating and validating Subresource Integrity (SRI) hashes for ES modules via an import map.

> It helps ensure that the modules you load in your application haven't been tampered with, improving security and reliability.


## Background

> see <https://shopify.engineering/shipping-support-for-module-script-integrity-in-chrome-safari>

## Abstract

Subresource Integrity (SRI) is a web platform capability that, on the surface, is the right tool for the job: it validates resource downloads via integrity hashes, blocking execution if there is a mismatch; it ensures that resources remain consistent from generation in the build process to delivery to users.

However, SRI had a critical capability gap, because it only applied to top-level scripts, styles, and preloads, and did not support imported JavaScript modules. This limitation prevented us from using the web platform’s import() function and required shimming functionality for dynamic script imports, creating maintenance challenges and adding runtime overhead.

> The proposal essentially uses import maps in order to map module URLs to their integrity hash, which seemed like an elegant solution that doesn’t reintroduce the cache invalidation cascades that import maps help us avoid.

```javascript

<script type="importmap">
{
  "imports": {
    "square": "./module/shapes/square.js"
  },

  "integrity": {
    "./module/shapes/square.js": "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  }
}
</script>
```


> That enables us to use dynamic imports without any change (e.g. import("./module/shapes/square.js")), and be assured that the module's integrity is verified via the provided hash before execution.




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
