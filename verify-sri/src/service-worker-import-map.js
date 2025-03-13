// import-map-verifier.js - Service Worker for verifying import maps
// Usage: Register this service worker in your application

// Configuration
const config = {
  githubRepo: 'username/repo-name',
  githubBranch: 'main',
  importMapPath: 'path/to/import-map.json',
  enforceIntegrity: true, // Whether to enforce module integrity checks
  enforceTrustedMap: false, // If true, will use GitHub version when mismatch detected
  logResults: true // Whether to log verification results to console
};

// Cache name for storing the trusted import map
const CACHE_NAME = 'import-map-verification-cache';

// Service worker installation
self.addEventListener('install', event => {
  event.waitUntil(
    fetchTrustedImportMap()
      .then(trustedMap => {
        return caches.open(CACHE_NAME)
          .then(cache => cache.put('trusted-import-map', new Response(JSON.stringify(trustedMap))));
      })
      .then(() => self.skipWaiting())
  );
});

// Service worker activation
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Intercept fetch requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Check if this is an import map request (adjust detection as needed for your setup)
  if (url.pathname.endsWith('importmap.json') || 
      event.request.destination === 'script' && url.pathname.endsWith('importmap.js')) {
    
    event.respondWith(
      Promise.all([
        // Get the actual response from the network
        fetch(event.request.clone()),
        // Get our trusted import map from cache
        caches.open(CACHE_NAME).then(cache => cache.match('trusted-import-map'))
      ])
      .then(([networkResponse, cachedTrustedMapResponse]) => {
        // Process both responses
        return Promise.all([
          networkResponse.clone().json(),
          cachedTrustedMapResponse.json()
        ]).then(([servedMap, trustedMap]) => {
          // Verify the maps match
          const verificationResult = verifyImportMap(servedMap, trustedMap);
          
          if (config.logResults) {
            console.log('Import Map Verification:', verificationResult);
          }
          
          if (!verificationResult.matches && config.enforceTrustedMap) {
            // Use the trusted map instead if enforcing
            return new Response(JSON.stringify(trustedMap), {
              headers: {
                'Content-Type': 'application/importmap+json'
              }
            });
          }
          
          // Otherwise return the original response
          return networkResponse;
        });
      })
    );
  } 
  // For module requests, verify integrity if configured
  else if (config.enforceIntegrity && event.request.destination === 'script') {
    event.respondWith(
      caches.open(CACHE_NAME)
        .then(cache => cache.match('trusted-import-map'))
        .then(trustedMapResponse => trustedMapResponse.json())
        .then(trustedMap => {
          // Check if this module has integrity defined
          if (trustedMap.integrity && trustedMap.integrity[url.pathname]) {
            return fetch(event.request, {
              integrity: trustedMap.integrity[url.pathname]
            });
          }
          // No integrity defined, proceed normally
          return fetch(event.request);
        })
    );
  }
});

// Fetch the trusted import map from GitHub
function fetchTrustedImportMap() {
  const githubUrl = `https://raw.githubusercontent.com/${config.githubRepo}/${config.githubBranch}/${config.importMapPath}`;
  
  return fetch(githubUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch trusted import map: ${response.status}`);
      }
      return response.json();
    })
    .catch(error => {
      console.error('Error fetching trusted import map:', error);
      // Return empty import map as fallback
      return { imports: {}, scopes: {}, integrity: {} };
    });
}

// Verify that served import map matches trusted import map
function verifyImportMap(servedMap, trustedMap) {
  const result = {
    matches: true,
    discrepancies: {
      imports: {},
      scopes: {},
      integrity: {}
    }
  };
  
  // Check imports
  if (servedMap.imports && trustedMap.imports) {
    for (const [key, value] of Object.entries(trustedMap.imports)) {
      if (!servedMap.imports[key] || servedMap.imports[key] !== value) {
        result.matches = false;
        result.discrepancies.imports[key] = {
          expected: value,
          actual: servedMap.imports[key] || 'missing'
        };
      }
    }
    
    // Check for extra entries in served map
    for (const key of Object.keys(servedMap.imports)) {
      if (!trustedMap.imports[key]) {
        result.matches = false;
        result.discrepancies.imports[key] = {
          expected: 'not defined',
          actual: servedMap.imports[key]
        };
      }
    }
  }
  
  // Check scopes (similar approach)
  if (servedMap.scopes && trustedMap.scopes) {
    // Similar checking logic as for imports
    for (const [scopeKey, scopeValue] of Object.entries(trustedMap.scopes)) {
      if (!servedMap.scopes[scopeKey]) {
        result.matches = false;
        result.discrepancies.scopes[scopeKey] = { expected: scopeValue, actual: 'missing' };
        continue;
      }
      
      // Check each mapping within the scope
      for (const [mapKey, mapValue] of Object.entries(scopeValue)) {
        if (!servedMap.scopes[scopeKey][mapKey] || servedMap.scopes[scopeKey][mapKey] !== mapValue) {
          result.matches = false;
          result.discrepancies.scopes[scopeKey] = result.discrepancies.scopes[scopeKey] || {};
          result.discrepancies.scopes[scopeKey][mapKey] = {
            expected: mapValue,
            actual: servedMap.scopes[scopeKey][mapKey] || 'missing'
          };
        }
      }
    }
  }
  
  // Check integrity (if available)
  if (servedMap.integrity && trustedMap.integrity) {
    for (const [key, value] of Object.entries(trustedMap.integrity)) {
      if (!servedMap.integrity[key] || servedMap.integrity[key] !== value) {
        result.matches = false;
        result.discrepancies.integrity[key] = {
          expected: value,
          actual: servedMap.integrity[key] || 'missing'
        };
      }
    }
  }
  
  return result;
}