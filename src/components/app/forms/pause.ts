import { askConfirm } from "../Dialogs";

// Pause the form (the form page's and the Forms list's more menu): a pop-up says what pausing does before it happens.

export const confirmPause = (name: string) =>
  askConfirm(`Pause ${name}?`, {
    body: "While it's paused, everywhere the form is (its link, your website, the QR code) shows \"This form is closed.\" and nobody can send it. Its submissions, contacts and settings stay as they are, and Resume the form brings it back at the same links.",
    ok: "Pause the form",
  });
