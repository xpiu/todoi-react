interface CalendarItem {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  dueDate: string | null;
  startDate: string | null;
  dueTime: string | null;
  done: boolean;
}

const text = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&");
const date = (value: string) => value.replace(/-/g, "");
const timestamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 folds by UTF-8 octets, keeping code points intact and counting the continuation space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = "", length = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (length + size > 75) { result += "\r\n "; length = 1; }
    result += character;
    length += size;
  }
  return result;
}

/** A portable snapshot of dated items, with stable identities and links back to Todoi. */
export function itemsToCalendar(items: CalendarItem[], appUrl: string, now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Todoi//Calendar export//EN", "CALSCALE:GREGORIAN"];
  for (const item of items) {
    if (!item.dueDate) continue;
    lines.push("BEGIN:VEVENT", `UID:${item.id}@todoi.app`, `DTSTAMP:${timestamp(now)}`, `SUMMARY:${text(item.title)}`, "TRANSP:TRANSPARENT");
    if (item.dueTime) {
      const due = `${date(item.dueDate)}T${item.dueTime.replace(":", "")}00`;
      lines.push(`DTSTART:${item.startDate && item.startDate < item.dueDate ? `${date(item.startDate)}T000000` : due}`);
      if (item.startDate && item.startDate < item.dueDate) lines.push(`DTEND:${due}`);
    } else {
      const end = new Date(`${item.dueDate}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${date(item.startDate ?? item.dueDate)}`, `DTEND;VALUE=DATE:${date(end.toISOString().slice(0, 10))}`);
    }
    const description = [item.description, item.done ? "Completed in Todoi." : null].filter(Boolean).join("\n\n");
    if (description) lines.push(`DESCRIPTION:${text(description)}`);
    lines.push(`URL:${appUrl.replace(/\/$/, "")}${item.projectId ? `/p/${encodeURIComponent(item.projectId)}` : "/inbox"}?item=${encodeURIComponent(item.id)}`, "END:VEVENT");
  }
  return [...lines, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
