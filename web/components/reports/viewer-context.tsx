"use client";
import * as React from "react";
import { ReportViewerModal } from "./viewer-modal";

type ViewerState = { reportId: string | null };
type Ctx = {
  openReport: (reportId: string) => void;
  closeReport: () => void;
};

const ViewerCtx = React.createContext<Ctx | null>(null);

export function ReportViewerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<ViewerState>({ reportId: null });

  const openReport = React.useCallback((id: string) => {
    setState({ reportId: id });
  }, []);
  const closeReport = React.useCallback(() => {
    setState({ reportId: null });
  }, []);

  // Lock body scroll while modal open
  React.useEffect(() => {
    if (state.reportId) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [state.reportId]);

  return (
    <ViewerCtx.Provider value={{ openReport, closeReport }}>
      {children}
      {state.reportId && (
        <ReportViewerModal
          reportId={state.reportId}
          onClose={closeReport}
        />
      )}
    </ViewerCtx.Provider>
  );
}

export function useReportViewer(): Ctx {
  const v = React.useContext(ViewerCtx);
  if (!v)
    throw new Error(
      "useReportViewer must be used inside <ReportViewerProvider>",
    );
  return v;
}
