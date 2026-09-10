import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Canvas error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '2rem',
          backgroundColor: 'var(--secondary-bg)',
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}>
          <h2 style={{ marginBottom: '1rem' }}>⚠️ 3D View Error</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Terjadi kesalahan pada tampilan 3D
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            🔄 Reload Halaman
          </button>
          {this.state.error && (
            <details style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <summary style={{ cursor: 'pointer' }}>Detail Error</summary>
              <pre style={{ 
                marginTop: '0.5rem', 
                padding: '0.5rem', 
                backgroundColor: 'var(--card-bg)',
                borderRadius: '4px',
                overflow: 'auto',
                textAlign: 'left',
              }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
