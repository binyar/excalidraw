import Trans from "@excalidraw/excalidraw/components/Trans";
import { t } from "@excalidraw/excalidraw/i18n";
import React from "react";

type TopErrorBoundaryState = {
  hasError: boolean;
  localStorage: string;
};

export class TopErrorBoundary extends React.Component<
  React.PropsWithChildren,
  TopErrorBoundaryState
> {
  state: TopErrorBoundaryState = {
    hasError: false,
    localStorage: "",
  };

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Animation Canvas crashed", error, errorInfo);
    const storage: Record<string, unknown> = {};
    for (const [key, value] of Object.entries({ ...localStorage })) {
      try {
        storage[key] = JSON.parse(value);
      } catch {
        storage[key] = value;
      }
    }
    this.setState({
      hasError: true,
      localStorage: JSON.stringify(storage),
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div className="ErrorSplash powdoo">
        <div className="ErrorSplash-messageContainer">
          <div className="ErrorSplash-paragraph bigger align-center">
            <Trans
              i18nKey="errorSplash.headingMain"
              button={(content) => (
                <button onClick={() => window.location.reload()}>
                  {content}
                </button>
              )}
            />
          </div>
          <div className="ErrorSplash-paragraph align-center">
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            >
              {t("errorSplash.clearCanvasMessage")}
            </button>
          </div>
          <div className="ErrorSplash-details">
            <label>{t("errorSplash.sceneContent")}</label>
            <textarea
              rows={5}
              readOnly
              value={this.state.localStorage}
              onPointerDown={(event) => event.currentTarget.select()}
            />
          </div>
        </div>
      </div>
    );
  }
}
