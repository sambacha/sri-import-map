// _app.js or _app.tsx
import { useEffect } from 'react';
import { loadImportMap, IntegrityErrorBoundary } from '../lib/module-integrity';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Load the import map in client-side navigation
    if (typeof window !== 'undefined') {
      loadImportMap('/importmap.json').catch(error => {
        console.error('Failed to load import map:', error);
      });
    }
  }, []);

  return (
    <IntegrityErrorBoundary
      fallback={(error) => (
        <div className="security-error-container">
          <h1>Security Alert</h1>
          <p>We've detected that some resources on this page may have been tampered with.</p>
          <p>Error details: {error}</p>
          <button onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      )}
    >
      <Component {...pageProps} />
    </IntegrityErrorBoundary>
  );
}

export default MyApp;

// Example component using dynamic import with integrity verification
// pages/dynamic-component.js or .tsx
import { useModuleWithIntegrity } from '../lib/module-integrity';

export default function DynamicComponentPage() {
  const { module, loading, error } = useModuleWithIntegrity('lodash');

  if (loading) return <div>Loading module...</div>;
  if (error) return <div>Error loading module: {error.message}</div>;

  const _ = module.default;
  
  return (
    <div>
      <h1>Dynamic Module Example</h1>
      <p>Successfully loaded lodash with integrity verification!</p>
      <p>Random number array: {JSON.stringify(_.times(5, _.random.bind(null, 100)))}</p>
    </div>
  );
}

// Example of direct usage in a component
// components/AsyncDataLoader.js or .tsx
import { useState, useEffect } from 'react';
import { importWithIntegrity } from '../lib/module-integrity';

export default function AsyncDataLoader({ dataUrl }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Import axios with integrity verification
    importWithIntegrity('axios')
      .then(async (axiosModule) => {
        const axios = axiosModule.default;
        
        try {
          // Use axios to fetch data
          const response = await axios.get(dataUrl);
          setData(response.data);
          setLoading(false);
        } catch (err) {
          setError(err.message);
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(`Module integrity error: ${err.message}`);
        setLoading(false);
      });
  }, [dataUrl]);

  if (loading) return <div>Loading data...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <h2>Data Loaded Successfully</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

// Custom Document example to inject import map server-side
// pages/_document.js or .tsx
import { Html, Head, Main, NextScript } from 'next/document';
import fs from 'fs';
import path from 'path';

export default function Document() {
  return (
    <Html>
      <Head>
        {/* Import map will be injected here during build */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

// This function runs at build time
export async function getInitialProps(ctx) {
  const initialProps = await Document.getInitialProps(ctx);
  
  // In production, try to read the import map
  if (process.env.NODE_ENV === 'production') {
    try {
      const importMapPath = path.join(process.cwd(), '.next/static', 'importmap.json');
      if (fs.existsSync(importMapPath)) {
        const importMap = JSON.parse(fs.readFileSync(importMapPath, 'utf8'));
        
        // Add import map to head
        initialProps.head = [
          ...initialProps.head,
          <script 
            key="importmap" 
            type="importmap" 
            dangerouslySetInnerHTML={{ __html: JSON.stringify(importMap) }}
          />
        ];
      }
    } catch (error) {
      console.error('Error reading import map:', error);
    }
  }
  
  return initialProps;
}
