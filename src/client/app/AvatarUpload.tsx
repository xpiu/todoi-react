import { useRef, useState } from "react";

import { AVATAR_ACCEPT, MAX_AVATAR_BYTES } from "../../shared/avatars";
import { errorMessage } from "../data/api";
import { Button } from "../design/core/Button";
import { InlineError } from "../design/core/InlineError";
import "./AvatarUpload.css";

export function AvatarUpload({ image, onChange }: { image?: string | null; onChange: (file: File | null) => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (file: File | null) => {
    if (busy) return;
    setError(null);
    if (file && file.size > MAX_AVATAR_BYTES) { setError("Choose an image up to 2 MB."); return; }
    setBusy(true);
    try { await onChange(file); }
    catch (err) { setError(`Couldn't save your image: ${errorMessage(err)} Try again.`); }
    finally { setBusy(false); }
  };
  return <div className="td-avatar-upload">
    <div className="td-avatar-upload-actions">
      <input ref={input} type="file" aria-label="Avatar image file" accept={AVATAR_ACCEPT} hidden disabled={busy} onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void save(file);
      }} />
      <Button icon="image" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Saving…" : image ? "Change image" : "Upload image"}</Button>
      {image ? <Button disabled={busy} onClick={() => void save(null)}>Remove image</Button> : null}
    </div>
    <InlineError message={error} />
  </div>;
}
