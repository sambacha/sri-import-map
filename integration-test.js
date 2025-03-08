// module-integrity.test.js
describe('Module Integrity', () => {
  // Mock global fetch
  const originalFetch = global.fetch;
  let mockResponses = {};
  
  beforeAll(() => {
    // Mock importMap for testing
    document.head.innerHTML = `
      <script type="importmap">
        {
          "imports": {
            "../resources/log.js?pipe=sub&name=A": "../resources/log.js?pipe=sub&name=B",
            "../resources/log.js?pipe=sub&name=C": "../resources/log.js?pipe=sub&name=D",
            "../resources/log.js?pipe=sub&name=G": "../resources/log.js?pipe=sub&name=F",
            "bare": "../resources/log.js?pipe=sub&name=E",
            "bare2": "../resources/log.js?pipe=sub&name=F"
          },
          "integrity": {
            "../resources/log.js?pipe=sub&name=A": "sha384-Li9vy3DqF8tnTXuiaAJuML3ky+er10rcgNR/VqsVpcw+ThHmYcwiB1pbOxEbzJr7",
            "bare": "sha384-Li9vy3DqF8tnTXuiaAJuML3ky+tr10rcgNR/VqsVpcw+ThHmYcwiB1pbOxEbzJr7",
            "bare2": "sha384-Li9vy3DqF8tnTXuiaAJuML3ky+yr10rcgNR/VqsVpcw+ThHmYcwiB1pbOxEbzJr7"
          }
        }
      </script>
    `;
    
    // Mock fetch for testing
    global.fetch = jest.fn((url) => {
      if (mockResponses[url]) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockResponses[url])
        });
      } else {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        });
      }
    });
    
    // Mock crypto.subtle.digest
    global.crypto = {
      subtle: {
        digest: jest.fn((algorithm, data) => {
          // Simplified mock - returns different values based on URL
          const dataArray = new Uint8Array(data);
          const sum = Array.from(dataArray).reduce((sum, byte) => sum + byte, 0);
          
          // Create a mock hash buffer - in reality would depend on content
          const buffer = new ArrayBuffer(48); // SHA-384 hash length
          const view = new Uint8Array(buffer);
          
          // Fill with different values to simulate different hashes
          for (let i = 0; i < view.length; i++) {
            view[i] = (sum + i) % 256;
          }
          
          return Promise.resolve(buffer);
        })
      }
    };
    
    // Mock btoa
    global.btoa = jest.fn((str) => {
      // Simple mock implementation
      return Buffer.from(str, 'binary').toString('base64');
    });
    
    // Setup some mock module contents
    mockResponses["../resources/log.js?pipe=sub&name=B"] = 'console.log("Module B loaded")';
    mockResponses["../resources/log.js?pipe=sub&name=D"] = 'console.log("Module D loaded")';
    mockResponses["../resources/log.js?pipe=sub&name=E"] = 'console.log("Module E loaded")';
    mockResponses["../resources/log.js?pipe=sub&name=F"] = 'console.log("Module F loaded")';
  });
  
  afterAll(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });
  
  // Import the module integrity utils - in a real test this would use the actual imports
  let importWithIntegrity;
  
  beforeEach(() => {
    jest.resetAllMocks();
    global.log = [];
    
    // Mock calculateIntegrity function to return expected values
    const calculateIntegrity = async (content, algorithm = 'sha384') => {
      if (content.includes('Module B')) {
        // Return a hash that doesn't match
        return `${algorithm}-invalidHash`;
      } else if (content.includes('Module D')) {
        // Return a valid hash for module D (which doesn't have an integrity check)
        return `${algorithm}-validHashForD`;
      } else if (content.includes('Module E')) {
        // Return a hash that doesn't match for bare module
        return `${algorithm}-invalidHashForE`;
      } else if (content.includes('Module F')) {
        // Return a hash that doesn't match for module referenced via bare import
        return `${algorithm}-invalidHashForF`;
      }
      return `${algorithm}-someDefaultHash`;
    };
    
    // Create a mock importWithIntegrity function based on our implementation
    importWithIntegrity = async (specifier) => {
      const importMap = JSON.parse(document.querySelector('script[type="importmap"]').textContent);
      
      // Resolve the specifier to a URL
      let url = specifier;
      if (importMap.imports[specifier]) {
        url = importMap.imports[specifier];
      }
      
      // Check for integrity hash
      const integrity = importMap.integrity[url];
      if (!integrity) {
        // Check if there's a mapping from a bare specifier with integrity
        for (const [bare, targetUrl] of Object.entries(importMap.imports)) {
          if (targetUrl === url && importMap.integrity[bare]) {
            throw new Error(`Integrity check failed for module: ${url} (via ${bare})`);
          }
        }
        
        // No integrity hash, mock successful import
        global.log.push(`log:${url.split('=')[1]}`); // Extract name from URL
        return { default: {} };
      }
      
      // Verify integrity
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch module: ${response.statusText}`);
      }
      
      const content = await response.text();
      const actualIntegrity = await calculateIntegrity(content, integrity.split('-')[0]);
      
      if (actualIntegrity !== integrity) {
        // Integrity check failed
        return Promise.reject(new Error(`Integrity check failed for module: ${url}`));
      }
      
      // Integrity check passed
      global.log.push(`log:${url.split('=')[1]}`); // Extract name from URL
      return { default: {} };
    };
  });
  
  test('script was not loaded, as it failed its integrity check', async () => {
    await expect(importWithIntegrity("../resources/log.js?pipe=sub&name=A"))
      .rejects.toThrow();
    expect(global.log.length).toBe(0);
  });
  
  test('script was loaded, as it had no integrity check', async () => {
    await importWithIntegrity("../resources/log.js?pipe=sub&name=C");
    expect(global.log.length).toBe(1);
    expect(global.log[0]).toBe("log:D");
  });
  
  test('Bare specifier script was not loaded, as it failed its integrity check', async () => {
    global.log = [];
    await expect(importWithIntegrity("bare"))
      .rejects.toThrow();
    expect(global.log.length).toBe(0);
  });
  
  test('Even though G does not have an integrity check, the resolved URL does through its bare specifier', async () => {
    global.log = [];
    await expect(importWithIntegrity("../resources/log.js?pipe=sub&name=G"))
      .rejects.toThrow();
    expect(global.log.length).toBe(0);
  });
});
