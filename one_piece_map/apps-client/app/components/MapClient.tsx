"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ISLANDS, REGIONS, type Island } from "../data/islands";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SEA_REGIONS = REGIONS.filter((region): region is Exclude<(typeof REGIONS)[number], "All"> => region !== "All");
const STATUS_OPTIONS: Island["status"][] = ["Known", "Hidden", "Legendary"];
const REGION_NOTES: Record<(typeof REGIONS)[number], string> = {
  All: "Vision complète du monde connu: les quatre Blues, les Calm Belts, Paradise, le Nouveau Monde et les routes majeures de l'équipage.",
  "East Blue": "Le berceau des débuts: des mers plus ouvertes, des itinéraires iconiques et les premiers compagnons des Mugiwara.",
  Paradise: "La première moitié de Grand Line, plus lumineuse et aventureuse, où les routes deviennent déjà imprévisibles.",
  "New World": "La zone la plus instable et la plus dangereuse du globe, dominée par les Empereurs et les archipels légendaires.",
  "Calm Belt": "Les bandes maritimes sans vent qui encerclent Grand Line. Elles sont pâles, calmes en surface, mais hostiles en profondeur.",
  "Sky Island": "L'axe vertical du monde: des îles hors mer qui donnent au globe une dimension mythique supplémentaire.",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

type AdminFormState = {
  name: string;
  region: Island["region"];
  saga: string;
  summary: string;
  highlights: string;
  tags: string;
  status: Island["status"];
  lat: string;
  lon: string;
};

const EMPTY_ADMIN_FORM: AdminFormState = {
  name: "",
  region: "East Blue",
  saga: "",
  summary: "",
  highlights: "",
  tags: "",
  status: "Known",
  lat: "0",
  lon: "0",
};

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
  const [createStatus, setCreateStatus] = useState<"idle" | "creating" | "created" | "error">("idle");
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "deleted" | "error">("idle");
  const [showHUD, setShowHUD] = useState(false);
  const [adminForm, setAdminForm] = useState<AdminFormState>(EMPTY_ADMIN_FORM);

  const loadIslandsFromServer = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/islands`);
      if (!response.ok) {
        throw new Error("Failed to fetch islands");
      }

      const data = (await response.json()) as Island[];
      if (Array.isArray(data) && data.length > 0) {
        setIslands(data);
      }
    } catch (error) {
      console.warn("Could not load islands from server. Using local fallback.", error);
    }
  }, []);

  useEffect(() => {
    loadIslandsFromServer();
  }, [loadIslandsFromServer]);

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

  const atlasStats = useMemo(() => {
    const known = islands.filter((island) => island.status === "Known").length;
    const hidden = islands.filter((island) => island.status === "Hidden").length;
    const legendary = islands.filter((island) => island.status === "Legendary").length;

    return { known, hidden, legendary };
  }, [islands]);

  const visibleLegendaryCount = useMemo(() => {
    return filteredIslands.filter((island) => island.status === "Legendary").length;
  }, [filteredIslands]);

  const pickRandomIsland = () => {
    if (filteredIslands.length === 0) {
      return;
    }

    const randomIsland = filteredIslands[Math.floor(Math.random() * filteredIslands.length)];
    setSelectedIslandId(randomIsland.id);
    setShowHUD(true);
  };

  const handleIslandSelect = (islandId: string) => {
    setSelectedIslandId(islandId);
    setShowHUD(true);
  };

  const handleGlobeInteraction = () => {
    setShowHUD(false);
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

  const saveSelectedIsland = async () => {
    if (!selectedIsland) {
      return;
    }

    setSaveStatus("saving");
    try {
      const response = await fetch(`${API_BASE_URL}/api/islands/${selectedIsland.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(selectedIsland),
      });

      if (!response.ok) {
        throw new Error("Failed to update island");
      }

      const updated = (await response.json()) as Island;
      setIslands((previous) => previous.map((island) => (island.id === updated.id ? updated : island)));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Error saving island:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const deleteSelectedIsland = async () => {
    if (!selectedIsland) {
      return;
    }

    setDeleteStatus("deleting");
    try {
      const response = await fetch(`${API_BASE_URL}/api/islands/${selectedIsland.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete island");
      }

      const remaining = islands.filter((island) => island.id !== selectedIsland.id);
      setIslands(remaining);
      if (remaining[0]) {
        setSelectedIslandId(remaining[0].id);
      }
      setDeleteStatus("deleted");
      setTimeout(() => setDeleteStatus("idle"), 2000);
    } catch (error) {
      console.error("Error deleting island:", error);
      setDeleteStatus("error");
      setTimeout(() => setDeleteStatus("idle"), 2000);
    }
  };

  const createIsland = async () => {
    const lat = Number(adminForm.lat);
    const lon = Number(adminForm.lon);
    const highlights = adminForm.highlights
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const tags = adminForm.tags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!adminForm.name.trim() || !adminForm.saga.trim() || !adminForm.summary.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setCreateStatus("error");
      setTimeout(() => setCreateStatus("idle"), 2000);
      return;
    }

    setCreateStatus("creating");

    try {
      const payload = {
        name: adminForm.name.trim(),
        region: adminForm.region,
        saga: adminForm.saga.trim(),
        summary: adminForm.summary.trim(),
        highlights,
        tags,
        status: adminForm.status,
        coordinates: {
          lat: Number(clamp(lat, -89.5, 89.5).toFixed(3)),
          lon: Number(wrapLongitude(lon).toFixed(3)),
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/islands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to create island");
      }

      const created = (await response.json()) as Island;
      setIslands((previous) => [...previous, created]);
      setSelectedIslandId(created.id);
      setAdminForm(EMPTY_ADMIN_FORM);
      setCreateStatus("created");
      setTimeout(() => setCreateStatus("idle"), 2000);
    } catch (error) {
      console.error("Error creating island:", error);
      setCreateStatus("error");
      setTimeout(() => setCreateStatus("idle"), 2000);
    }
  };

  const updateSelectedIslandText = (partial: Partial<Pick<Island, "name" | "region" | "saga" | "summary" | "status">>) => {
    if (!selectedIsland) {
      return;
    }

    setIslands((previous) =>
      previous.map((island) => {
        if (island.id !== selectedIsland.id) {
          return island;
        }
        return {
          ...island,
          ...partial,
        };
      }),
    );
  };

  const statusClasses: Record<Island["status"], string> = {
    Known: "bg-emerald-500/18 text-emerald-100 ring-1 ring-emerald-300/35",
    Hidden: "bg-amber-500/18 text-amber-100 ring-1 ring-amber-300/35",
    Legendary: "bg-violet-500/18 text-violet-100 ring-1 ring-violet-300/35",
  };

  const panelClass = "atlas-panel atlas-card-glow rounded-[28px]";
  const fieldClass = "atlas-input rounded-2xl px-4 py-3 text-sm text-[#fff7e8] outline-none ring-[rgba(120,217,247,0.45)] transition focus:ring-2 select-text";
  const smallFieldClass = "atlas-input rounded-xl px-3 py-2 text-sm text-[#fff7e8] outline-none ring-[rgba(120,217,247,0.45)] transition focus:ring-2 select-text";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#06141d] text-[#f5edd7] select-none" suppressHydrationWarning>
      <OnePieceMap
        islands={filteredIslands}
        selectedIslandId={selectedIsland?.id ?? null}
        onSelectIsland={handleIslandSelect}
        onGlobeInteraction={handleGlobeInteraction}
        focusCoordinates={selectedIsland?.coordinates ?? null}
      />

      <div className="atlas-map-vignette pointer-events-none absolute inset-0" suppressHydrationWarning />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,232,187,0.08),transparent_28%),linear-gradient(180deg,rgba(4,12,18,0.12),rgba(4,12,18,0.4))]" suppressHydrationWarning />

      {showHUD ? (
        <div className="absolute inset-0 grid grid-rows-[auto_1fr] gap-4 p-4 sm:p-5 lg:p-6 pointer-events-none" suppressHydrationWarning>
          <header className={`${panelClass} atlas-panel-strong pointer-events-auto flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-7`}>
            <div className="max-w-3xl" suppressHydrationWarning>
              <p className="atlas-overline text-[11px] sm:text-xs">Grand Line Observatory</p>
              <h1 className="font-display mt-2 text-3xl text-[#fff5dc] sm:text-4xl lg:text-[2.8rem] leading-tight">
                Globe du monde de One Piece
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d7d8cd] sm:text-[15px]">
                Relecture visuelle du monde canonique: Red Line sculptée, Calm Belts lisibles, routes de voyage mises en valeur et fiches d’îles plus désirables à explorer.
              </p>
              <div className="mt-4 flex flex-wrap gap-3" suppressHydrationWarning>
                <div className="rounded-2xl border border-[rgba(244,213,141,0.24)] bg-[rgba(255,244,220,0.04)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#f4d58d]/80">Monde indexé</p>
                  <p className="mt-1 text-xl font-semibold text-white">{islands.length} îles</p>
                </div>
                <div className="rounded-2xl border border-[rgba(120,217,247,0.22)] bg-[rgba(120,217,247,0.06)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#ace7f5]/80">Légendaires visibles</p>
                  <p className="mt-1 text-xl font-semibold text-white">{visibleLegendaryCount}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(239,123,95,0.22)] bg-[rgba(239,123,95,0.06)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#f7b59f]/80">Zone active</p>
                  <p className="mt-1 text-base font-semibold text-white">{region === "All" ? "Monde entier" : region}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start lg:self-end" suppressHydrationWarning>
              <button
                type="button"
                onClick={() => setAdminMode((previous) => !previous)}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  adminMode
                    ? "bg-[#f4d58d] text-[#0b1822] hover:bg-[#f1cb70]"
                    : "border border-[rgba(244,213,141,0.24)] bg-[rgba(255,245,226,0.08)] text-[#fff4d7] hover:bg-[rgba(255,245,226,0.16)]"
                }`}
              >
                {adminMode ? "Mode admin actif" : "Mode admin"}
              </button>
              <button
                type="button"
                onClick={pickRandomIsland}
                className="rounded-2xl bg-[linear-gradient(135deg,#f4d58d,#e4a65f)] px-4 py-3 text-sm font-semibold text-[#0b1822] transition hover:brightness-105"
              >
                Route aléatoire
              </button>
              <button
                type="button"
                onClick={() => setShowHUD(false)}
                className="rounded-2xl border border-[rgba(120,217,247,0.28)] bg-[rgba(120,217,247,0.08)] px-4 py-3 text-sm font-semibold text-[#dff7ff] transition hover:bg-[rgba(120,217,247,0.16)]"
              >
                Laisser le globe respirer
              </button>
            </div>
          </header>

          <main className="mt-1 grid min-h-0 gap-4 lg:grid-cols-[minmax(300px,370px)_minmax(330px,430px)] lg:justify-between">
            <section className={`${panelClass} pointer-events-auto flex min-h-0 flex-col px-5 py-5 sm:px-6`}>
              <div className="mb-5" suppressHydrationWarning>
                <p className="atlas-overline text-[10px]">Exploration</p>
                <h2 className="font-display mt-2 text-2xl text-[#fff6e2]">Atlas des mers</h2>
                <p className="mt-2 text-sm leading-6 text-[#c8d1d4]">{REGION_NOTES[region]}</p>
              </div>

              <div className="grid gap-3" suppressHydrationWarning>
                <label className="grid gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4d8cf]">
                  Recherche d’îles
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nom, saga, tag..."
                    className={fieldClass}
                  />
                </label>

                <label className="grid gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4d8cf]">
                  Zone maritime
                  <select
                    value={region}
                    onChange={(event) => setRegion(event.target.value as (typeof REGIONS)[number])}
                    className={fieldClass}
                  >
                    {REGIONS.map((regionValue) => (
                      <option key={regionValue} value={regionValue}>
                        {regionValue}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3" suppressHydrationWarning>
                <div className="rounded-2xl border border-white/8 bg-[rgba(4,16,25,0.5)] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#a8c5d1]">Connues</p>
                  <p className="mt-1 text-lg font-semibold text-white">{atlasStats.known}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-[rgba(4,16,25,0.5)] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#d8c9a0]">Cachées</p>
                  <p className="mt-1 text-lg font-semibold text-white">{atlasStats.hidden}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-[rgba(4,16,25,0.5)] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#d7b6ff]">Légendes</p>
                  <p className="mt-1 text-lg font-semibold text-white">{atlasStats.legendary}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between text-sm text-[#d4d9d7]" suppressHydrationWarning>
                <p>{filteredIslands.length} îles visibles</p>
                <p className="text-[#9db7c1]">Clique une route ou une île pour recentrer le globe.</p>
              </div>

              <ul className="atlas-scrollbar mt-4 min-h-0 space-y-2 overflow-y-auto pr-1">
                {filteredIslands.map((island) => {
                  const active = selectedIsland?.id === island.id;
                  return (
                    <li key={island.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedIslandId(island.id)}
                        className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                          active
                            ? "border-[rgba(244,213,141,0.5)] bg-[linear-gradient(135deg,rgba(244,213,141,0.16),rgba(120,217,247,0.1))] shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(4,16,25,0.52)] hover:border-[rgba(120,217,247,0.28)] hover:bg-[rgba(9,28,39,0.88)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3" suppressHydrationWarning>
                          <div>
                            <p className="text-base font-semibold text-white">{island.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#9dc8d8]">{island.region}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses[island.status]}`}>
                            {island.status}
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#d0d5d3]">{island.saga}</p>
                      </button>
                    </li>
                  );
                })}

                {filteredIslands.length === 0 ? (
                  <li className="rounded-[22px] border border-dashed border-[rgba(244,213,141,0.18)] bg-[rgba(4,16,25,0.5)] px-4 py-8 text-center text-sm text-[#cfd5d4]">
                    Aucune île trouvée avec ces filtres.
                  </li>
                ) : null}
              </ul>
            </section>

            <aside className={`${panelClass} atlas-scrollbar pointer-events-auto overflow-y-auto px-5 py-5 sm:px-6`}>
              {selectedIsland ? (
                <div className="flex h-full flex-col" suppressHydrationWarning>
                  <div className="flex items-start justify-between gap-4" suppressHydrationWarning>
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(244,213,141,0.3)] bg-[linear-gradient(135deg,rgba(244,213,141,0.22),rgba(255,255,255,0.05))] font-display text-3xl text-[#fff1c7] shadow-[0_10px_35px_rgba(0,0,0,0.22)]">
                        {selectedIsland.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="atlas-overline text-[10px]">Fiche d’île</p>
                        <h2 className="font-display mt-2 text-3xl leading-tight text-white">{selectedIsland.name}</h2>
                        <div className="mt-3 flex flex-wrap items-center gap-2" suppressHydrationWarning>
                          <span className="rounded-full border border-[rgba(120,217,247,0.22)] bg-[rgba(120,217,247,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7f6ff]">
                            {selectedIsland.region}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusClasses[selectedIsland.status]}`}>
                            {selectedIsland.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-5 text-sm uppercase tracking-[0.22em] text-[#9bc7d8]">{selectedIsland.saga}</p>
                  <p className="mt-3 text-[15px] leading-7 text-[#ede3cf]">{selectedIsland.summary}</p>

                  <div className="mt-5 flex flex-wrap gap-2" suppressHydrationWarning>
                    {selectedIsland.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[rgba(244,213,141,0.16)] bg-[rgba(255,245,226,0.05)] px-3 py-1.5 text-xs font-medium text-[#f5e4be]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6" suppressHydrationWarning>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c7d3d4]">Moments clés</p>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                      {selectedIsland.highlights.map((point) => (
                        <li
                          key={point}
                          className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,245,226,0.06),rgba(255,255,255,0.02))] px-4 py-4 text-sm leading-6 text-[#fff0d1]"
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 rounded-[24px] border border-[rgba(244,213,141,0.2)] bg-[rgba(4,16,25,0.54)] p-4 text-sm text-[#d2d7d2]" suppressHydrationWarning>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[#f4d58d]/80">Position</p>
                        <p className="mt-1 font-semibold text-white">
                          {selectedIsland.coordinates.lat}° / {selectedIsland.coordinates.lon}°
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[#ace7f5]/80">Visuel</p>
                        <p className="mt-1 font-semibold text-white">Balise lumineuse et focus caméra</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[rgba(4,16,25,0.5)] p-4 text-sm text-[#d1d8d8]" suppressHydrationWarning>
                    {adminMode ? (
                      <div className="space-y-4">
                        <p className="text-sm font-semibold text-[#f4d58d]">Mode admin actif: ajuste les fiches et synchronise les données avec l’API.</p>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
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
                              className={smallFieldClass}
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
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
                              className={smallFieldClass}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                            Nom
                            <input
                              value={selectedIsland.name}
                              onChange={(event) => updateSelectedIslandText({ name: event.target.value })}
                              className={smallFieldClass}
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                            Région
                            <select
                              value={selectedIsland.region}
                              onChange={(event) => updateSelectedIslandText({ region: event.target.value as Island["region"] })}
                              className={smallFieldClass}
                            >
                              {SEA_REGIONS.map((regionValue) => (
                                <option key={regionValue} value={regionValue}>
                                  {regionValue}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                          Saga
                          <input
                            value={selectedIsland.saga}
                            onChange={(event) => updateSelectedIslandText({ saga: event.target.value })}
                            className={smallFieldClass}
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                          Résumé
                          <textarea
                            value={selectedIsland.summary}
                            onChange={(event) => updateSelectedIslandText({ summary: event.target.value })}
                            rows={3}
                            className={smallFieldClass}
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                          Statut
                          <select
                            value={selectedIsland.status}
                            onChange={(event) => updateSelectedIslandText({ status: event.target.value as Island["status"] })}
                            className={smallFieldClass}
                          >
                            {STATUS_OPTIONS.map((statusValue) => (
                              <option key={statusValue} value={statusValue}>
                                {statusValue}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={saveSelectedIsland}
                            disabled={saveStatus === "saving"}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                              saveStatus === "saved"
                                ? "bg-emerald-500 text-white"
                                : saveStatus === "error"
                                  ? "bg-rose-600 text-white"
                                  : saveStatus === "saving"
                                    ? "bg-amber-500 text-white opacity-70"
                                    : "bg-[linear-gradient(135deg,#89d1a4,#5ab684)] text-[#07141d] hover:brightness-105"
                            }`}
                          >
                            {saveStatus === "saved" ? "Sauvegardé" : saveStatus === "error" ? "Erreur" : saveStatus === "saving" ? "Envoi..." : "Sauver la fiche"}
                          </button>
                          <button
                            type="button"
                            onClick={deleteSelectedIsland}
                            disabled={deleteStatus === "deleting"}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                              deleteStatus === "deleted"
                                ? "bg-emerald-600 text-white"
                                : deleteStatus === "error"
                                  ? "bg-rose-700 text-white"
                                  : deleteStatus === "deleting"
                                    ? "bg-rose-500/80 text-white opacity-70"
                                    : "bg-[linear-gradient(135deg,#ef7b5f,#d1514c)] text-white hover:brightness-105"
                            }`}
                          >
                            {deleteStatus === "deleted" ? "Supprimé" : deleteStatus === "error" ? "Erreur" : deleteStatus === "deleting" ? "Suppression..." : "Supprimer"}
                          </button>
                        </div>

                        <div className="border-t border-white/10 pt-4 space-y-3">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-[#f4d58d]">Ajouter une île</p>

                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                            Nom
                            <input
                              value={adminForm.name}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, name: event.target.value }))}
                              className={smallFieldClass}
                            />
                          </label>

                          <div className="grid grid-cols-2 gap-3">
                            <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                              Région
                              <select
                                value={adminForm.region}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, region: event.target.value as Island["region"] }))}
                                className={smallFieldClass}
                              >
                                {SEA_REGIONS.map((regionValue) => (
                                  <option key={regionValue} value={regionValue}>
                                    {regionValue}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                              Statut
                              <select
                                value={adminForm.status}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, status: event.target.value as Island["status"] }))}
                                className={smallFieldClass}
                              >
                                {STATUS_OPTIONS.map((statusValue) => (
                                  <option key={statusValue} value={statusValue}>
                                    {statusValue}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                            Saga
                            <input
                              value={adminForm.saga}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, saga: event.target.value }))}
                              className={smallFieldClass}
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                            Résumé
                            <textarea
                              value={adminForm.summary}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, summary: event.target.value }))}
                              rows={3}
                              className={smallFieldClass}
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                            Points clés
                            <textarea
                              value={adminForm.highlights}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, highlights: event.target.value }))}
                              rows={3}
                              className={smallFieldClass}
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                            Tags
                            <input
                              value={adminForm.tags}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, tags: event.target.value }))}
                              className={smallFieldClass}
                            />
                          </label>

                          <div className="grid grid-cols-2 gap-3">
                            <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                              Latitude
                              <input
                                type="number"
                                step={0.1}
                                value={adminForm.lat}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, lat: event.target.value }))}
                                className={smallFieldClass}
                              />
                            </label>

                            <label className="grid gap-1 text-[11px] uppercase tracking-[0.18em]">
                              Longitude
                              <input
                                type="number"
                                step={0.1}
                                value={adminForm.lon}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, lon: event.target.value }))}
                                className={smallFieldClass}
                              />
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={createIsland}
                            disabled={createStatus === "creating"}
                            className={`w-full rounded-xl px-3 py-2 text-sm font-semibold transition ${
                              createStatus === "created"
                                ? "bg-emerald-500 text-white"
                                : createStatus === "error"
                                  ? "bg-rose-600 text-white"
                                  : createStatus === "creating"
                                    ? "bg-amber-500 text-white opacity-70"
                                    : "bg-[linear-gradient(135deg,#78d9f7,#4da4d4)] text-[#07141d] hover:brightness-105"
                            }`}
                          >
                            {createStatus === "created" ? "Île ajoutée" : createStatus === "error" ? "Données invalides" : createStatus === "creating" ? "Création..." : "Ajouter l'île"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="leading-6">Active le mode admin pour ajuster les coordonnées, éditer les fiches et enrichir l’atlas avec de nouvelles îles.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#cfd5d4]">Sélectionne une île pour afficher sa fiche détaillée.</p>
              )}
            </aside>
          </main>
        </div>
      ) : (
        <div className="absolute inset-x-0 top-4 z-20 flex justify-between px-4 sm:px-6 pointer-events-none">
          <div className="pointer-events-auto max-w-sm rounded-[26px] border border-[rgba(244,213,141,0.22)] bg-[linear-gradient(180deg,rgba(8,24,35,0.92),rgba(7,22,33,0.78))] px-5 py-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <p className="atlas-overline text-[10px]">One Piece World Atlas</p>
            <h2 className="font-display mt-2 text-2xl text-white">Fais tourner le globe</h2>
            <p className="mt-2 text-sm leading-6 text-[#d4d9d7]">
              Explore les mers, zoome sur les routes majeures puis affiche les fiches détaillées quand tu veux.
            </p>
            <button
              onClick={() => setShowHUD(true)}
              className="mt-4 rounded-2xl bg-[linear-gradient(135deg,#f4d58d,#e4a65f)] px-4 py-3 text-sm font-semibold text-[#0b1822] transition hover:brightness-105"
            >
              Ouvrir l’atlas
            </button>
          </div>

          <div className="pointer-events-none hidden items-start lg:flex">
            <div className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(6,20,29,0.64)] px-4 py-2 text-xs uppercase tracking-[0.22em] text-[#d5edf5] backdrop-blur-md">
              Glisser pour pivoter · Roulette pour zoomer
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
