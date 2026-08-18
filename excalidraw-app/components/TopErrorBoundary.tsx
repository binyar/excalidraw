import { t } from "@excalidraw/excalidraw/i18n";
import React from "react";

const ErrorSplashButtonMessage = ({
  message,
  onClick,
}: {
  message: string;
  onClick: () => void;
}) => {
  const match = message.match(/^(.*)<button>(.*)<\/button>(.*)$/s);
  if (!match) {
    return <button onClick={onClick}>{message}</button>;
  }
  return (
    <>
      {match[1]}
      <button onClick={onClick}>{match[2]}</button>
      {match[3]}
    </>
  );
};

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
            <ErrorSplashButtonMessage
              message={t("errorSplash.headingMain")}
              onClick={() => window.location.reload()}
            />
          </div>
          <div className="ErrorSplash-paragraph align-center">
            <ErrorSplashButtonMessage
              message={t("errorSplash.clearCanvasMessage")}
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            />
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
