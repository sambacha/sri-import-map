// App.tsx
import React, { useState, useEffect } from 'react';
import { importWithIntegrity, useModuleWithIntegrity } from './module-integrity';

// Component that directly uses importWithIntegrity
function DynamicComponent() {
  const [component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    importWithIntegrity('./components/LazyComponent')
      .then((module) => {
        setComponent(() => module.default);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading component...</div>;
  if (error) return <div>Error loading component: {error.message}</div>;
  if (!component) return <div>Component not found</div>;

  const Component = component;
  return <Component />;
}

// Component that uses the useModuleWithIntegrity hook
function HookBasedComponent() {
  const { module, loading, error } = useModuleWithIntegrity('./components/AnotherComponent');

  if (loading) return <div>Loading via hook...</div>;
  if (error) return <div>Hook error: {error.message}</div>;
  if (!module) return <div>No module loaded</div>;

  const Component = module.default;
  return <Component />;
}

// Example of handling integrity verification errors
function IntegrityErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Listen for unhandled errors that might be integrity-related
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('Integrity check failed')) {
        setHasError(true);
        setErrorMessage(event.message);
        event.preventDefault();
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="integrity-error">
        <h2>Security Warning</h2>
        <p>A module integrity check has failed. This could indicate tampered code.</p>
        <p>Error details: {errorMessage}</p>
        <button onClick={() => window.location.reload()}>Reload Application</button>
      </div>
    );
  }

  return <>{children}</>;
}

// Main App component
function App() {
  return (
    <IntegrityErrorBoundary>
      <div className="app">
        <h1>Module Integrity Example</h1>
        <DynamicComponent />
        <HookBasedComponent />
      </div>
    </IntegrityErrorBoundary>
  );
}

export default App;
