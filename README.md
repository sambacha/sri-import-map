
// Example: initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeModules().catch(console.error);
});


/**
 * Example usage

async function initializeModules(): Promise<void> {
  try {
    // Define modules
    const modules = {
      'square': './module/shapes/square.js',
      'circle': './module/shapes/circle.js',
      'app': './module/app.js'
    };

    // Generate import map with integrity
    const importMap = await generateImportMapWithIntegrity(modules);
    
    // Inject the import map into the document
    injectImportMap(importMap);
    
    console.log('Import map with integrity successfully injected');
    
    // Now you can safely use dynamic imports, and integrity will be verified
    const square = await import('square');
    square.draw();
  } catch (error) {
    console.error('Error initializing modules:', error);
  }
}
 */