"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ISLANDS, REGIONS, type Island } from "../data/islands";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SEA_REGIONS = REGIONS.filter((region): region is Exclude<(typeof REGIONS)[number], "All"> => region !== "All");
const STATUS_OPTIONS: Island["status"][] = ["Known", "Hidden", "Legendary"];

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
    Known: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40",
    Hidden: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40",
    Legendary: "bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-300/40",
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950 text-slate-100 select-none" suppressHydrationWarning>
      <OnePieceMap
        islands={filteredIslands}
        selectedIslandId={selectedIsland?.id ?? null}
        onSelectIsland={handleIslandSelect}
        onGlobeInteraction={handleGlobeInteraction}
        focusCoordinates={selectedIsland?.coordinates ?? null}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/60" suppressHydrationWarning />

      {showHUD && (
        <div className="absolute inset-0 grid grid-rows-[auto_1fr] p-4 sm:p-6 pointer-events-none" suppressHydrationWarning>
          <header className="pointer-events-auto flex items-center justify-between rounded-2xl border border-white/15 bg-slate-900/60 px-4 py-3 backdrop-blur-md">
            <div suppressHydrationWarning>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/85">One Piece World Atlas</p>
              <h1 className="text-lg font-semibold text-white sm:text-2xl">Carte interactive des îles</h1>
            </div>
            <div className="flex items-center gap-2" suppressHydrationWarning>
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

          <main className="mt-4 grid min-h-0 gap-4 lg:grid-cols-[minmax(270px,340px)_minmax(300px,390px)] lg:justify-between pointer-events-none">
            <section className="pointer-events-auto flex min-h-0 flex-col rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-md">
              <div className="mb-3 grid gap-3" suppressHydrationWarning>
                <label className="grid gap-1 text-xs font-medium uppercase tracking-wider text-slate-300">
                  Recherche
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nom, saga, tag..."
                    className="rounded-lg border border-white/15 bg-slate-950/75 px-3 py-2 text-sm text-white outline-none ring-cyan-400/60 transition placeholder:text-slate-400 focus:ring-2 select-text"
                  />
                </label>

                <label className="grid gap-1 text-xs font-medium uppercase tracking-wider text-slate-300">
                  Zone maritime
                  <select
                    value={region}
                    onChange={(event) => setRegion(event.target.value as (typeof REGIONS)[number])}
                    className="rounded-lg border border-white/15 bg-slate-950/75 px-3 py-2 text-sm text-white outline-none ring-cyan-400/60 transition focus:ring-2 select-text"
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

            <aside className="pointer-events-auto rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-md overflow-y-auto">
              {selectedIsland ? (
                <div className="flex h-full flex-col" suppressHydrationWarning>
                  <div className="mb-3 flex items-center justify-between gap-3" suppressHydrationWarning>
                    <h2 className="text-xl font-semibold text-white">{selectedIsland.name}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[selectedIsland.status]}`}>
                      {selectedIsland.status}
                    </span>
                  </div>

                  <p className="mb-1 text-xs uppercase tracking-wider text-cyan-200">{selectedIsland.region}</p>
                  <p className="mb-4 text-sm text-slate-200">{selectedIsland.saga}</p>

                  <p className="mb-4 text-sm leading-relaxed text-slate-100">{selectedIsland.summary}</p>

                  <div className="mb-4" suppressHydrationWarning>
                    <p className="mb-2 text-xs uppercase tracking-wider text-slate-300">Points clés</p>
                    <ul className="space-y-2 text-sm text-slate-100">
                      {selectedIsland.highlights.map((point) => (
                        <li key={point} className="rounded-lg bg-slate-950/45 px-3 py-2">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300" suppressHydrationWarning>
                    <p>
                      Coordonnées: {selectedIsland.coordinates.lat}° / {selectedIsland.coordinates.lon}°
                    </p>
                    {adminMode ? (
                      <div className="space-y-3">
                        <p className="text-amber-200">Mode admin: ajoute, supprime et sauvegarde les fiches d&apos;îles en base.</p>

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
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2 select-text"
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
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2 select-text"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                            Nom
                            <input
                              value={selectedIsland.name}
                              onChange={(event) => updateSelectedIslandText({ name: event.target.value })}
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2 select-text"
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                            Région
                            <select
                              value={selectedIsland.region}
                              onChange={(event) => updateSelectedIslandText({ region: event.target.value as Island["region"] })}
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                            >
                              {SEA_REGIONS.map((regionValue) => (
                                <option key={regionValue} value={regionValue}>
                                  {regionValue}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                          Saga
                          <input
                            value={selectedIsland.saga}
                            onChange={(event) => updateSelectedIslandText({ saga: event.target.value })}
                            className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2 select-text"
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                          Résumé
                          <textarea
                            value={selectedIsland.summary}
                            onChange={(event) => updateSelectedIslandText({ summary: event.target.value })}
                            rows={3}
                            className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2 select-text"
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                          Statut
                          <select
                            value={selectedIsland.status}
                            onChange={(event) => updateSelectedIslandText({ status: event.target.value as Island["status"] })}
                            className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                          >
                            {STATUS_OPTIONS.map((statusValue) => (
                              <option key={statusValue} value={statusValue}>
                                {statusValue}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={saveSelectedIsland}
                            disabled={saveStatus === "saving"}
                            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
                              saveStatus === "saved"
                                ? "bg-emerald-500 text-white"
                                : saveStatus === "error"
                                  ? "bg-rose-600 text-white"
                                  : saveStatus === "saving"
                                    ? "bg-amber-500 text-white opacity-60"
                                    : "bg-green-500 text-slate-950 hover:bg-green-400"
                            }`}
                          >
                            {saveStatus === "saved" ? "✓ Sauvegardé" : saveStatus === "error" ? "✗ Erreur" : saveStatus === "saving" ? "..." : "Sauver la fiche"}
                          </button>
                          <button
                            type="button"
                            onClick={deleteSelectedIsland}
                            disabled={deleteStatus === "deleting"}
                            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
                              deleteStatus === "deleted"
                                ? "bg-emerald-600 text-white"
                                : deleteStatus === "error"
                                  ? "bg-rose-700 text-white"
                                  : deleteStatus === "deleting"
                                    ? "bg-rose-500/80 text-white opacity-70"
                                    : "bg-rose-600 text-white hover:bg-rose-500"
                            }`}
                          >
                            {deleteStatus === "deleted" ? "✓ Supprimé" : deleteStatus === "error" ? "✗ Erreur" : deleteStatus === "deleting" ? "..." : "Supprimer"}
                          </button>
                        </div>

                        <div className="border-t border-white/10 pt-3 space-y-2">
                          <p className="text-amber-100 text-[11px] uppercase tracking-wider">Ajouter une île</p>

                          <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                            Nom
                            <input
                              value={adminForm.name}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, name: event.target.value }))}
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                            />
                          </label>

                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                              Région
                              <select
                                value={adminForm.region}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, region: event.target.value as Island["region"] }))}
                                className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                              >
                                {SEA_REGIONS.map((regionValue) => (
                                  <option key={regionValue} value={regionValue}>
                                    {regionValue}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                              Statut
                              <select
                                value={adminForm.status}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, status: event.target.value as Island["status"] }))}
                                className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                              >
                                {STATUS_OPTIONS.map((statusValue) => (
                                  <option key={statusValue} value={statusValue}>
                                    {statusValue}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                            Saga
                            <input
                              value={adminForm.saga}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, saga: event.target.value }))}
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                            Résumé
                            <textarea
                              value={adminForm.summary}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, summary: event.target.value }))}
                              rows={3}
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                            Points clés (1 par ligne)
                            <textarea
                              value={adminForm.highlights}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, highlights: event.target.value }))}
                              rows={3}
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                            />
                          </label>

                          <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                            Tags (séparés par virgule)
                            <input
                              value={adminForm.tags}
                              onChange={(event) => setAdminForm((previous) => ({ ...previous, tags: event.target.value }))}
                              className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                            />
                          </label>

                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                              Latitude
                              <input
                                type="number"
                                step={0.1}
                                value={adminForm.lat}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, lat: event.target.value }))}
                                className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                              />
                            </label>

                            <label className="grid gap-1 text-[11px] uppercase tracking-wider">
                              Longitude
                              <input
                                type="number"
                                step={0.1}
                                value={adminForm.lon}
                                onChange={(event) => setAdminForm((previous) => ({ ...previous, lon: event.target.value }))}
                                className="rounded-md border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none ring-cyan-400/60 focus:ring-2"
                              />
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={createIsland}
                            disabled={createStatus === "creating"}
                            className={`w-full rounded-md px-2 py-2 text-[11px] font-medium transition ${
                              createStatus === "created"
                                ? "bg-emerald-500 text-white"
                                : createStatus === "error"
                                  ? "bg-rose-600 text-white"
                                  : createStatus === "creating"
                                    ? "bg-amber-500 text-white opacity-70"
                                    : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                            }`}
                          >
                            {createStatus === "created" ? "✓ Île ajoutée" : createStatus === "error" ? "✗ Données invalides" : createStatus === "creating" ? "..." : "Ajouter l'île"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>Active le mode admin pour ajuster, ajouter ou supprimer des îles en base.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-300">Sélectionne une île pour voir sa fiche détaillée.</p>
              )}
            </aside>
          </main>
        </div>
      )}

      {!showHUD && (
        <div className="absolute top-4 left-4 pointer-events-auto z-20">
          <button
            onClick={() => setShowHUD(true)}
            className="rounded-lg bg-slate-900/80 backdrop-blur-md border border-white/20 px-4 py-2 text-white text-sm font-medium hover:bg-slate-800/80 transition shadow-lg"
          >
            📍 Afficher les îles
          </button>
        </div>
      )}
    </div>
  );
}
