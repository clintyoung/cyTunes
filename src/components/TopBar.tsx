import Link from "next/link";

export function TopBar({
  title,
  back,
  rightSlot,
}: {
  title?: string;
  back?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {back && (
          <Link href={back} className="icon-btn" aria-label="Back">
            ←
          </Link>
        )}
        <div className="brand">
          {title ? (
            title
          ) : (
            <>
              cy<span className="brand-accent">Tunes</span>
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {rightSlot}
        <Link href="/api/auth/logout" className="icon-btn" title="Log out">
          ⏻
        </Link>
      </div>
    </div>
  );
}
