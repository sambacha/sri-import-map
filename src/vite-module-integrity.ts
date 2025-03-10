// vite-plugin-module-integrity.ts
import { Plugin, ResolvedConfig } from 'vite';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface ModuleIntegrityOptions {
  /**
   * Extensions to include when generating integrity hashes
   */
  extensions?: string[];
  
  /**
   * Hash algorithm to use
   */
  algorithm?: 'sha256' | 'sha384' | 'sha512';
  
  /**
   * Output path for the generated import map (relative to dist)
   */
  importMapPath?: string;
}

interface ImportMap {
  imports: Record<string, string>;
  integrity: Record<string, string>;
}

export default function moduleIntegrityPlugin(options: ModuleIntegrityOptions = {}): Plugin {
  const {
    extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
    algorithm = 'sha384',
    importMapPath = 'importmap.json',
  } = options;
  
  let config: ResolvedConfig;
  const importMap: ImportMap = {
    imports: {},
    integrity: {},
  };
  
  return {
    name: 'vite-plugin-module-integrity',
    
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    
    async generateBundle(_, bundle) {
      // Calculate integrity hashes for all assets with matching extensions
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (!extensions.some(ext => fileName.endsWith(ext))) {
          continue;
        }
        
        // Get asset content as string
        let content: string;
        if ('code' in asset) {
          content = asset.code;
        } else if ('source' in asset) {
          if (typeof asset.source === 'string') {
            content = asset.source;
          } else {
            content = Buffer.from(asset.source).toString('utf-8');
          }
        } else {
          continue;
        }
        
        // Calculate hash using specified algorithm
        const hash = createHash(algorithm)
          .update(content)
          .digest('base64');
        
        // Add to import map
        const integrity = `${algorithm}-${hash}`;
        const assetPath = config.base + fileName;
        
        // Add the module to imports and integrity maps
        const moduleName = fileName.replace(/\.\w+$/, '');
        importMap.imports[moduleName] = assetPath;
        importMap.integrity[assetPath] = integrity;
        
        // Also include the full path for direct matches
        importMap.imports[assetPath] = assetPath;
        
        // For entry chunks, add special mapping
        if ('isEntry' in asset && asset.isEntry) {
          importMap.imports[`entry:${fileName}`] = assetPath;
        }
      }
      
      // Write import map to output directory
      const importMapJson = JSON.stringify(importMap, null, 2);
      this.emitFile({
        type: 'asset',
        fileName: importMapPath,
        source: importMapJson,
      });
      
      // Inject script to load the import map
      const publicDir = path.join(config.root, 'public');
      try {
        const indexHtmlPath = path.join(publicDir, 'index.html');
        const indexHtml = await fs.readFile(indexHtmlPath, 'utf-8');
        
        const updatedHtml = indexHtml.replace(
          '</head>',
          `<script type="module">
            // Load the import map
            (async function() {
              const response = await fetch('${config.base}${importMapPath}');
              const importMap = await response.json();
              
              // Create and inject the import map
              const script = document.createElement('script');
              script.type = 'importmap';
              script.textContent = JSON.stringify(importMap);
              document.head.appendChild(script);
            })();
          </script>
          </head>`
        );
        
        await fs.writeFile(indexHtmlPath, updatedHtml);
      } catch (error) {
        // Handle case where index.html might not exist or isn't accessible
        this.warn(`Failed to inject import map loader into index.html: ${error}`);
      }
    },
    
    // Inject integrity validation helper into the build
    async closeBundle() {
      // Create a helper file for module integrity validation
      const validationHelper = `
      // module-integrity.js
      /**
       * Get the current import map from the document
       */
      export function getImportMap() {
        const script = document.querySelector('script[type="importmap"]');
        if (!script || !script.textContent) {
          return null;
        }
        
        try {
          return JSON.parse(script.textContent);
        } catch (error) {
          console.error('Error parsing import map:', error);
          return null;
        }
      }
      
      /**
       * Calculate integrity hash for content
       */
      export async function calculateIntegrity(content, algorithm = 'sha384') {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        
        const hashBuffer = await crypto.subtle.digest(algorithm.toUpperCase(), data);
        
        // Convert to base64
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));
        
        return \`\${algorithm}-\${hashBase64}\`;
      }
      
      /**
       * Import a module with integrity verification
       */
      export async function importWithIntegrity(specifier) {
        const importMap = getImportMap();
        if (!importMap) {
          console.warn('No import map found, integrity checks disabled');
          return import(specifier);
        }
        
        // Resolve the specifier to a URL
        let url = specifier;
        if (importMap.imports[specifier]) {
          url = importMap.imports[specifier];
        }
        
        // Check for integrity hash
        const integrity = importMap.integrity[url];
        if (!integrity) {
          // Also check if there's a mapping from a bare specifier
          for (const [bare, targetUrl] of Object.entries(importMap.imports)) {
            if (targetUrl === url && importMap.integrity[bare]) {
              throw new Error(\`Integrity check failed for module: \${url} (via \${bare})\`);
            }
          }
          
          // No integrity hash found, proceed with import
          return import(url);
        }
        
        // Verify integrity before importing
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(\`Failed to fetch module: \${response.statusText}\`);
        }
        
        const content = await response.text();
        const algorithm = integrity.split('-')[0];
        const actualIntegrity = await calculateIntegrity(content, algorithm);
        
        if (actualIntegrity !== integrity) {
          throw new Error(\`Integrity check failed for module: \${url}\`);
        }
        
        // Integrity check passed, import the module
        return import(url);
      }
      
      /**
       * React hook for importing modules with integrity checks
       */
      export function useModuleWithIntegrity(specifier) {
        const [state, setState] = React.useState({
          module: null,
          loading: true,
          error: null,
        });
        
        React.useEffect(() => {
          let mounted = true;
          
          importWithIntegrity(specifier)
            .then((module) => {
              if (mounted) {
                setState({
                  module,
                  loading: false,
                  error: null,
                });
              }
            })
            .catch((error) => {
              if (mounted) {
                setState({
                  module: null,
                  loading: false,
                  error,
                });
              }
            });
          
          return () => {
            mounted = false;
          };
        }, [specifier]);
        
        return state;
      }
      `;
      
      this.emitFile({
        type: 'asset',
        fileName: 'module-integrity.js',
        source: validationHelper,
      });
    }
  };
}
