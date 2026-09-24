/** The boxed line a panel shows in place of what it couldn't load or doesn't
 *  have yet. */
export default function Notice({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what}
    </p>
  );
}
