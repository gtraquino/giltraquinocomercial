import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  showHomeButton?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary apanhou um erro:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex flex-col items-center justify-center p-6 text-center bg-card rounded-2xl border border-destructive/20 shadow-sm m-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground mb-2">
            {this.props.fallbackTitle || "Ocorreu uma interrupção inesperada"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            {this.props.fallbackMessage || "O componente encontrou um problema ao processar esta secção. Os seus dados e permissões mantêm-se intactos."}
          </p>
          {this.state.error?.message && (
            <div className="mb-6 p-3 bg-muted/50 rounded-lg text-xs font-mono text-muted-foreground max-w-lg overflow-x-auto text-left">
              {this.state.error.message}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={this.handleReset} variant="default" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
            <Button onClick={this.handleReload} variant="outline" size="sm" className="gap-2">
              Recarregar página
            </Button>
            {this.props.showHomeButton && (
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <a href="/">
                  <Home className="h-4 w-4" /> Página inicial
                </a>
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
