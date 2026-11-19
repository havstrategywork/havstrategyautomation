"use client";

// Archived campaigns get no other action buttons today, so this is the only place delete needs to show up.
export function DeleteCampaignButton({ action, id }: { action: (fd: FormData) => void; id: string }) {
  return (
    <form className="row" style={{ marginTop: "1rem", justifyContent: "flex-end" }}>
      <input type="hidden" name="id" value={id} />
      <button
        formAction={action}
        className="ghost"
        onClick={(e) => { if (!confirm("Delete this campaign for good? This can't be undone.")) e.preventDefault(); }}
      >
        Delete
      </button>
    </form>
  );
}
