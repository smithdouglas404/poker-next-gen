// Shared prop contract for admin sections. `notify` surfaces a toast.

export type Notify = (msg: string, kind?: "ok" | "err") => void;

export interface SectionProps {
  notify: Notify;
}
