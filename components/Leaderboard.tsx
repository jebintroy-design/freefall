"use client";

import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { FREEFALL, truncAddr } from "@/lib/contract";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export default function Leaderboard({ onBack }: { onBack: () => void }) {
  const { address } = useConnection();

  const top = useReadContract({
    ...FREEFALL,
    functionName: "getTop10",
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const me = useReadContracts({
    contracts: address
      ? [
          { ...FREEFALL, functionName: "bestScore", args: [address] },
          { ...FREEFALL, functionName: "gamesStarted", args: [address] },
        ]
      : [],
    query: { enabled: !!address, staleTime: 0, refetchOnMount: "always" },
  });

  const entries = [...(top.data ?? [])]
    .filter((e) => e.player !== ZERO_ADDR && e.score > 0n)
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0));

  const myBest = me.data?.[0]?.result;
  const myGames = me.data?.[1]?.result;

  return (
    <div className="board">
      <div className="board-head">
        <button className="btn btn-ghost" onClick={onBack}>
          ← back
        </button>
        <div className="board-title">top 10</div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            top.refetch();
            me.refetch();
          }}
          disabled={top.isFetching}
        >
          {top.isFetching ? "…" : "refresh"}
        </button>
      </div>

      {top.isLoading ? (
        <div className="board-state">loading leaderboard…</div>
      ) : top.error ? (
        <div className="board-state">
          <div className="board-error">couldn&apos;t load leaderboard</div>
          <button className="btn btn-chunky" onClick={() => top.refetch()}>
            try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="board-state">no scores yet — be the first</div>
      ) : (
        <ol className="board-list">
          {entries.map((e, i) => {
            const mine = address && e.player.toLowerCase() === address.toLowerCase();
            return (
              <li key={e.player} className={`board-row${mine ? " board-row-me" : ""}`}>
                <span className={`board-rank${i < 3 ? ` r${i + 1}` : ""}`}>{i + 1}</span>
                <span className="board-addr">
                  {truncAddr(e.player)}
                  {mine ? " (you)" : ""}
                </span>
                <span className="board-score">{e.score.toString()}</span>
              </li>
            );
          })}
        </ol>
      )}

      {address && (
        <div className="board-me-card">
          {me.isLoading ? (
            "loading your stats…"
          ) : me.error ? (
            "couldn't load your stats"
          ) : (
            <>
              you · best{" "}
              <span className="board-me-num">{myBest !== undefined ? myBest.toString() : "—"}</span>{" "}
              · games started{" "}
              <span className="board-me-num">{myGames !== undefined ? myGames.toString() : "—"}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
