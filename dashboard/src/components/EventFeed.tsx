import type { LendNetEvent } from "@/lib/types";

export default function EventFeed({ events }: { events: LendNetEvent[] }) {
  if (!events.length) {
    return (
      <p className="text-white/30 text-sm text-center py-8">
        Real-time events will stream here.
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-[300px] overflow-y-auto">
      {events.map((event, i) => (
        <div
          key={i}
          className="text-xs py-1.5 border-b border-white/5 flex gap-2"
        >
          <span className="text-emerald-400 font-semibold shrink-0">
            {event.type}
          </span>
          <span className="text-white/30 shrink-0">
            {new Date().toLocaleTimeString()}
          </span>
          <span className="text-white/40 truncate">
            {JSON.stringify(event).slice(0, 120)}
          </span>
        </div>
      ))}
    </div>
  );
}
