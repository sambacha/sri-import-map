// build-validator.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Validates the integrity of all modules in the build output
 * against the generated import map
 */
async function validateBuildOutput(distDir = 'dist') {
  console.log('Validating build output integrity...');
  
  // Read the import map
  const importMapPath = path.join(distDir, 'importmap.json');
  if (!fs.existsSync(importMapPath)) {
    console.error(`Import map not found at ${importMapPath}`);
    process.exit(1);
  }
  
  const importMap = JSON.parse(fs.readFileSync(importMapPath, 'utf-8'));
  const { imports, integrity } = importMap;
  
  if (!integrity || Object.keys(integrity).length === 0) {
    console.error('No integrity hashes found in import map');
    process.exit(1);
  }
  
  // Track validation results
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    missing: 0,
    failures: []
  };
  
  // Validate each module with an integrity hash
  for (const [url, expectedHash] of Object.entries(integrity)) {
    results.total++;
    
    // Get the file path from the URL
    let filePath = url;
    // Remove the base URL if present
    if (url.startsWith('/')) {
      filePath = url.substring(1);
    } else if (url.includes('://')) {
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
        error: 'File not found'
      });
      continue;
    }
    
    // Read file content
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Calculate hash
    const algorithm = expectedHash.split('-')[0];
    const hash = crypto.createHash(algorithm)
      .update(content)
      .digest('base64');
    
    const actualHash = `${algorithm}-${hash}`;
    
    // Compare hashes
    if (actualHash === expectedHash) {
      results.passed++;
    } else {
      results.failed++;
      results.failures.push({
        url,
        expected: expectedHash,
        actual: actualHash
      });
    }
  }
  
  // Report results
  console.log('\nIntegrity Validation Results:');
  console.log(`Total modules: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Missing: ${results.missing}`);
  
  if (results.failures.length > 0) {
    console.log('\nFailures:');
    results.failures.forEach(failure => {
      console.log(`\nURL: ${failure.url}`);
      console.log(`Expected: ${failure.expected}`);
      if (failure.actual) {
        console.log(`Actual: ${failure.actual}`);
      } else if (failure.error) {
        console.log(`Error: ${failure.error}`);
      }
    });
    
    process.exit(1);
  } else {
    console.log('\nAll modules passed integrity validation!');
  }
}

// Run the validation
validateBuildOutput();
