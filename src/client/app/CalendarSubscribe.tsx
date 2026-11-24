// The Calendar's "Subscribe to calendar" dialog, wired: the person's feed link (made on first open), Reset
// link (the old link stops at once), and "Download a copy" — the account's existing one-time .ics.
// One feed per person (decisions B6–B8). Spec: DESIGN.md › Views › Calendar.
import { useState } from "react";

import { errorMessage } from "../data/api";
import { useAccountMutations, useCalendarFeed } from "../data/account";
import { CalendarSubscribeDialog } from "../design/calendar/CalendarSubscribeDialog";
import { useOnline } from "../design/core/ConnectionStatus";
import { downloadAccountExport } from "./exportData";

export function CalendarSubscribe({ open, onClose, projectName }: { open: boolean; onClose: () => void; projectName?: string }) {
  const online = useOnline();
  const feed = useCalendarFeed(open);
  const { resetCalendarFeed: reset } = useAccountMutations();
  const [justReset, setJustReset] = useState(false);
  const [download, setDownload] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const url = feed.data?.url;
  // Offline with nothing loaded: the panel says the link shows on reconnect, rather than an error.
  const state = url || !online ? "ready" : feed.isError ? "error" : "loading";
  const close = () => {
    setJustReset(false);
    reset.reset();
    setDownload({ busy: false });
    onClose();
  };
  return (
    <CalendarSubscribeDialog
      open={open}
      onClose={close}
      projectName={projectName}
      url={url}
      state={state}
      error={feed.isError ? `Couldn't create the link: ${errorMessage(feed.error)}` : undefined}
      onRetry={() => void feed.refetch()}
      offline={!online}
      onReset={() =>
        reset.mutate(
          { quiet: true },
          { onSuccess: () => setJustReset(true) },
        )
      }
      resetState={reset.isPending ? "busy" : "idle"}
      resetError={reset.isError ? errorMessage(reset.error) : undefined}
      justReset={justReset}
      onDownload={() => {
        setDownload({ busy: true });
        downloadAccountExport("ics").then(
          () => setDownload({ busy: false }),
          (err: unknown) => setDownload({ busy: false, error: errorMessage(err) }),
        );
      }}
      downloadState={download.busy ? "busy" : "idle"}
      downloadError={download.error}
    />
  );
}
