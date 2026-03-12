"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ISLANDS, REGIONS, type Island } from "../data/islands";

const ISLAND_COORDINATES_STORAGE_KEY = "onepiece:island-coordinates:v1";

type CoordinateOverrides = Record<string, { lat: number; lon: number }>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

const OnePieceMap = dynamic(() => import("./Map"), {
  ssr: false,
});

export default function OnePieceMapClient() {
  const [islands, setIslands] = useState<Island[]>(ISLANDS);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All");
  const [selectedIslandId, setSelectedIslandId] = useState(ISLANDS[0]?.id ?? "");
  const [adminMode, setAdminMode] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const loadCoordinates = async () => {
      try {
        const response = await fetch("http://localhost:4000/api/islands/coordinates");
        if (!response.ok) {
          throw new Error("Failed to fetch coordinates");
        }

        const overrides = (await response.json()) as CoordinateOverrides;
        if (Object.keys(overrides).length === 0) {
          return;
        }

        setIslands((previous) =>
          previous.map((island) => {
            const override = overrides[island.id];
            if (!override) {
              return island;
            }

            return {
              ...island,
              coordinates: {
                lat: override.lat,
                lon: override.lon,
              },
            };
          }),
        );
      } catch (error) {
        console.warn("Could not load coordinates from server, trying localStorage...", error);
        try {
          const raw = window.localStorage.getItem(ISLAND_COORDINATES_STORAGE_KEY);
          if (!raw) {
            return;
          }

          const overrides = JSON.parse(raw) as CoordinateOverrides;
          setIslands((previous) =>
            previous.map((island) => {
              const override = overrides[island.id];
              if (!override) {
                return island;
              }

              return {
                ...island,
                coordinates: {
                  lat: override.lat,
                  lon: override.lon,
                },
              };
            }),
          );
        } catch {
          window.localStorage.removeItem(ISLAND_COORDINATES_STORAGE_KEY);
        }
      }
    };

    loadCoordinates();
  }, []);

  useEffect(() => {
    const overrides = islands.reduce<CoordinateOverrides>((accumulator, island) => {
      const baseIsland = ISLANDS.find((item) => item.id === island.id);
      if (!baseIsland) {
        return accumulator;
      }

      const latChanged = Math.abs(baseIsland.coordinates.lat - island.coordinates.lat) > 0.0001;
      const lonChanged = Math.abs(baseIsland.coordinates.lon - island.coordinates.lon) > 0.0001;

      if (latChanged || lonChanged) {
        accumulator[island.id] = {
          lat: Number(island.coordinates.lat.toFixed(3)),
          lon: Number(island.coordinates.lon.toFixed(3)),
        };
      }

      return accumulator;
    }, {});

    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(ISLAND_COORDINATES_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ISLAND_COORDINATES_STORAGE_KEY, JSON.stringify(overrides));
  }, [islands]);

  const filteredIslands = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    return islands.filter((island) => {
      const matchesRegion = region === "All" || island.region === region;
      const matchesQuery =
        lowerQuery.length === 0 ||
        island.name.toLowerCase().includes(lowerQuery) ||
        island.saga.toLowerCase().includes(lowerQuery) ||
        island.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));

      return matchesRegion && matchesQuery;
    });
  }, [islands, query, region]);

  const selectedIsland = useMemo(() => {
    return filteredIslands.find((island) => island.id === selectedIslandId) ?? filteredIslands[0] ?? null;
  }, [filteredIslands, selectedIslandId]);

  useEffect(() => {
    if (!selectedIsland && filteredIslands[0]) {
      setSelectedIslandId(filteredIslands[0].id);
    }
  }, [filteredIslands, selectedIsland]);

  useEffect(() => {
    if (!selectedIsland) {
      setLatInput("");
      setLonInput("");
      return;
    }

    setLatInput(selectedIsland.coordinates.lat.toFixed(2));
    setLonInput(selectedIsland.coordinates.lon.toFixed(2));
  }, [selectedIsland]);

  const pickRandomIsland = () => {
    if (filteredIslands.length === 0) {
      return;
    }

    const randomIsland = filteredIslands[Math.floor(Math.random() * filteredIslands.length)];
    setSelectedIslandId(randomIsland.id);
  };

  const updateIslandCoordinates = (islandId: string, coordinates: { lat: number; lon: number }) => {
    const safeLat = clamp(coordinates.lat, -89.5, 89.5);
    const wrappedLon = wrapLongitude(coordinates.lon);

    setIslands((previous) =>
      previous.map((island) => {
        if (island.id !== islandId) {
          return island;
        }

        return {
          ...island,
          coordinates: {
            lat: Number(safeLat.toFixed(3)),
            lon: Number(wrappedLon.toFixed(3)),
          },
        };
      }),
    );
  };

  const resetCoordinates = () => {
    setIslands(ISLANDS);
    window.localStorage.removeItem(ISLAND_COORDINATES_STORAGE_KEY);
  };

  const exportCoordinates = async () => {
    const payload = islands.map((island) => ({
      id: island.id,
      name: island.name,
      coordinates: island.coordinates,
    }));

    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op
    }
  };

  const saveToServer = async () => {
    setSaveStatus("saving");
    try {
      const overrides = islands.reduce<CoordinateOverrides>((accumulator, island) => {
        const baseIsland = ISLANDS.find((item) => item.id === island.id);
        if (!baseIsland) {
          return accumulator;
        }

        const latChanged = Math.abs(baseIsland.coordinates.lat - island.coordinates.lat) > 0.0001;
        const lonChanged = Math.abs(baseIsland.coordinates.lon - island.coordinates.lon) > 0.0001;

        if (latChanged || lonChanged) {
          accumulator[island.id] = {
            lat: Number(island.coordinates.lat.toFixed(3)),
            lon: Number(island.coordinates.lon.toFixed(3)),
          };
        }

        return accumulator;
      }, {});

      const response = await fetch("http://localhost:4000/api/islands/coordinates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(overrides),
      });

      if (!response.ok) {
        throw new Error("Failed to save coordinates");
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Error saving to server:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const statusClasses: Record<Island["status"], string> = {
    Known: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40",
    Hidden: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40",
    Legendary: "bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-300/40",
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <OnePieceMap
        islands={filteredIslands}
        selectedIslandId={selectedIsland?.id ?? null}
        onSelectIsland={setSelectedIslandId}
        focusCoordinates={selectedIsland?.coordinates ?? null}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/60" />

      <div className="absolute inset-0 grid grid-rows-[auto_1fr] p-4 sm:p-6">
        <header className="pointer-events-auto flex items-center justify-between rounded-2xl border border-white/15 bg-slate-900/60 px-4 py-3 backdrop-blur-md">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/85">One Piece World Atlas</p>
            <h1 className="text-lg font-semibold text-white sm:text-2xl">Carte interactive des îles</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdminMode((previous) => !previous)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                adminMode ? "bg-amber-400 text-slate-950 hover:bg-amber-300" : "bg-slate-100/15 text-slate-100 hover:bg-slate-100/25"
              }`}
            >
              {adminMode ? "Admin ON" : "Admin OFF"}
            </button>
            <button
              type="button"
              onClick={pickRandomIsland}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Explorer au hasard
            </button>
          </div>
        </header>

        <main className="mt-4 grid min-h-0 gap-4 lg:grid-cols-[minmax(270px,340px)_minmax(300px,390px)] lg:justify-between">
          <section className="pointer-events-auto flex min-h-0 flex-col rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-md">
            <div className="mb-3 grid gap-3">
              <label className="grid gap-1 text-xs font-medium uppercase tracking-wider text-slate-300">
                Recherche
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nom, saga, tag..."
                  className="rounded-lg border border-white/15 bg-slate-950/75 px-3 py-2 text-sm text-white outline-none ring-cyan-400/60 transition placeholder:text-slate-400 focus:ring-2"
                />
              </label>

              <label className="grid gap-1 text-xs font-medium uppercase tracking-wider text-slate-300">
                Zone maritime
                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value as (typeof REGIONS)[number])}
                  className="rounded-lg border border-white/15 bg-slate-950/75 px-3 py-2 text-sm text-white outline-none ring-cyan-400/60 transition focus:ring-2"
                >
                  {REGIONS.map((regionValue) => (
                    <option key={regionValue} value={regionValue}>
                      {regionValue}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="mb-2 text-xs text-slate-300">{filteredIslands.length} îles affichées</p>

            <ul className="min-h-0 space-y-2 overflow-y-auto pr-1">
              {filteredIslands.map((island) => {
                const active = selectedIsland?.id === island.id;
                return (
                  <li key={island.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedIslandId(island.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        active
                          ? "border-cyan-300/70 bg-cyan-500/15"
                          : "border-white/10 bg-slate-950/35 hover:border-cyan-500/50 hover:bg-slate-900/80"
                      }`}
                    >
                      <p className="text-sm font-semibold text-white">{island.name}</p>
                      <p className="mt-1 text-xs text-slate-300">{island.region}</p>
                    </button>
                  </li>
                );
              })}

              {filteredIslands.length === 0 && (
                <li className="rounded-xl border border-dashed border-white/20 bg-slate-950/45 px-3 py-5 text-center text-sm text-slate-300">
                  Aucune île trouvée avec ces filtres.
                </li>
              )}
            </ul>
          </section>

          <aside className="pointer-events-auto rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-md">
            {selectedIsland ? (
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-white">{selectedIsland.name}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[selectedIsland.status]}`}>
                    {selectedIsland.status}
                  </span>
                </div>

                <p className="mb-1 text-xs uppercase tracking-wider text-cyan-200">{selectedIsland.region}</p>
                <p className="mb-4 text-sm text-slate-200">{selectedIsland.saga}</p>

                <p className="mb-4 text-sm leading-relaxed text-slate-100">{selectedIsland.summary}</p>

                <div className="mb-4">
                  <p className="mb-2 text-xs uppercase tracking-wider text-slate-300">Points clés</p>
                  <ul className="space-y-2 text-sm text-slate-100">
                    {selectedIsland.highlights.map((point) => (
                      <li key={point} className="rounded-lg bg-slate-950/45 px-3 py-2">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                  <p>
                    Coordonnées mock: {selectedIsland.coordinates.lat}° / {selectedIsland.coordinates.lon}°
                  </p>
                  {adminMode ? (
                    <div className="space-y-3">
                      <p className="text-amber-200">Mode admin: modifie lat/lon en direct (auto-save local).</p>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                          Latitude
                          <input
                            type="number"
                            min={-89.5}
                            max={89.5}
                            step={0.1}
                            value={latInput}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setLatInput(nextValue);
                              const parsed = Number(nextValue);
                              if (Number.isNaN(parsed) || !selectedIsland) {
                                return;
                              }

                              updateIslandCoordinates(selectedIsland.id, {
                                lat: parsed,
                                lon: selectedIsland.coordinates.lon,
                              });
                            }}
                            className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                          Longitude
                          <input
                            type="number"
                            min={-180}
                            max={180}
                            step={0.1}
                            value={lonInput}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setLonInput(nextValue);
                              const parsed = Number(nextValue);
                              if (Number.isNaN(parsed) || !selectedIsland) {
                                return;
                              }

                              updateIslandCoordinates(selectedIsland.id, {
                                lat: selectedIsland.coordinates.lat,
                                lon: parsed,
                              });
                            }}
                            className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedIsland) {
                              return;
                            }
                            updateIslandCoordinates(selectedIsland.id, {
                              lat: selectedIsland.coordinates.lat + 0.5,
                              lon: selectedIsland.coordinates.lon,
                            });
                          }}
                          className="rounded-md bg-slate-800 px-2 py-1.5 text-[11px] text-white hover:bg-slate-700"
                        >
                          Lat +
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedIsland) {
                              return;
                            }
                            updateIslandCoordinates(selectedIsland.id, {
                              lat: selectedIsland.coordinates.lat - 0.5,
                              lon: selectedIsland.coordinates.lon,
                            });
                          }}
                          className="rounded-md bg-slate-800 px-2 py-1.5 text-[11px] text-white hover:bg-slate-700"
                        >
                          Lat -
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedIsland) {
                              return;
                            }
                            updateIslandCoordinates(selectedIsland.id, {
                              lat: selectedIsland.coordinates.lat,
                              lon: selectedIsland.coordinates.lon - 0.5,
                            });
                          }}
                          className="rounded-md bg-slate-800 px-2 py-1.5 text-[11px] text-white hover:bg-slate-700"
                        >
                          Lon -
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedIsland) {
                              return;
                            }
                            updateIslandCoordinates(selectedIsland.id, {
                              lat: selectedIsland.coordinates.lat,
                              lon: selectedIsland.coordinates.lon + 0.5,
                            });
                          }}
                          className="rounded-md bg-slate-800 px-2 py-1.5 text-[11px] text-white hover:bg-slate-700"
                        >
                          Lon +
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={saveToServer}
                          disabled={saveStatus === "saving"}
                          className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
                            saveStatus === "saved"
                              ? "bg-emerald-500 text-white"
                              : saveStatus === "error"
                                ? "bg-rose-600 text-white"
                                : saveStatus === "saving"
                                  ? "bg-amber-500 text-white opacity-50"
                                  : "bg-green-500 text-slate-950 hover:bg-green-400"
                          }`}
                        >
                          {saveStatus === "saved" ? "✓ Sauvegardé" : saveStatus === "error" ? "✗ Erreur" : saveStatus === "saving" ? "..." : "Save Server"}
                        </button>
                        <button
                          type="button"
                          onClick={exportCoordinates}
                          className="rounded-md bg-cyan-500 px-2 py-1.5 text-[11px] font-medium text-slate-950 hover:bg-cyan-400"
                        >
                          Export JSON
                        </button>
                        <button
                          type="button"
                          onClick={resetCoordinates}
                          className="rounded-md bg-rose-500/90 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-rose-500"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>Active le mode admin pour ajuster les positions des îles en direct.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-300">Sélectionne une île pour voir sa fiche détaillée.</p>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}