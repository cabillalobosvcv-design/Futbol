import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      let parsedMsg = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed?.error) {
          parsedMsg = `${parsed.error} (${parsed.operationType || 'operación'} en ${parsed.path || 'Firestore'})`;
        }
      } catch {
        // plain string message
      }

      return (
        <div className="min-h-screen bg-pitch-canvas flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-red-50 text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  Error de operación en SIGD
                </h2>
                <p className="mt-1 text-sm text-slate-600 break-words">
                  {parsedMsg}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Recargar aplicación
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
