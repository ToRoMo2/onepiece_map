import express, { type NextFunction, type Request, type Response } from "express";
import { Pool } from "pg";
import fs from "fs/promises";
import path from "path";

const app = express();
const PORT = process.env.PORT || 4000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

type SeaRegion = "East Blue" | "Paradise" | "New World" | "Calm Belt" | "Sky Island";
type IslandStatus = "Known" | "Hidden" | "Legendary";

type Island = {
  id: string;
  name: string;
  region: SeaRegion;
  saga: string;
  summary: string;
  highlights: string[];
  tags: string[];
  status: IslandStatus;
  coordinates: {
    lat: number;
    lon: number;
  };
};

type IslandRow = {
  id: string;
  name: string;
  region: SeaRegion;
  saga: string;
  summary: string;
  highlights: string[];
  tags: string[];
  status: IslandStatus;
  lat: number;
  lon: number;
};

const VALID_REGIONS = new Set<SeaRegion>(["East Blue", "Paradise", "New World", "Calm Belt", "Sky Island"]);
const VALID_STATUS = new Set<IslandStatus>(["Known", "Hidden", "Legendary"]);
const SEED_FILE = path.join(__dirname, "..", "data", "islands-seed.json");

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `island-${Date.now()}`;
}

function toIsland(row: IslandRow): Island {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    saga: row.saga,
    summary: row.summary,
    highlights: row.highlights,
    tags: row.tags,
    status: row.status,
    coordinates: {
      lat: Number(row.lat),
      lon: Number(row.lon),
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseIslandPayload(raw: unknown, allowPartial = false): Island | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const idRaw = typeof payload.id === "string" ? payload.id.trim() : "";
  const region = payload.region;
  const saga = typeof payload.saga === "string" ? payload.saga.trim() : "";
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const status = payload.status;
  const highlights = payload.highlights;
  const tags = payload.tags;
  const coordinates = payload.coordinates as { lat?: unknown; lon?: unknown } | undefined;
  const lat = typeof coordinates?.lat === "number" ? coordinates.lat : NaN;
  const lon = typeof coordinates?.lon === "number" ? coordinates.lon : NaN;

  if (!allowPartial || payload.name !== undefined) {
    if (!name) return null;
  }

  if (!allowPartial || payload.region !== undefined) {
    if (!VALID_REGIONS.has(region as SeaRegion)) return null;
  }

  if (!allowPartial || payload.status !== undefined) {
    if (!VALID_STATUS.has(status as IslandStatus)) return null;
  }

  if (!allowPartial || payload.saga !== undefined) {
    if (!saga) return null;
  }

  if (!allowPartial || payload.summary !== undefined) {
    if (!summary) return null;
  }

  if (!allowPartial || payload.highlights !== undefined) {
    if (!isStringArray(highlights)) return null;
  }

  if (!allowPartial || payload.tags !== undefined) {
    if (!isStringArray(tags)) return null;
  }

  if (!allowPartial || payload.coordinates !== undefined) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  }

  return {
    id: idRaw || slugify(name),
    name,
    region: (region as SeaRegion) ?? "East Blue",
    saga,
    summary,
    highlights: (highlights as string[]) ?? [],
    tags: (tags as string[]) ?? [],
    status: (status as IslandStatus) ?? "Known",
    coordinates: {
      lat: Number(clamp(lat, -89.5, 89.5).toFixed(3)),
      lon: Number(wrapLongitude(lon).toFixed(3)),
    },
  };
}

async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS islands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      saga TEXT NOT NULL,
      summary TEXT NOT NULL,
      highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function seedDatabaseIfNeeded(): Promise<void> {
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM islands");
  const count = Number(countResult.rows[0]?.count ?? "0");
  if (count > 0) {
    return;
  }

  const content = await fs.readFile(SEED_FILE, "utf-8");
  const parsed = JSON.parse(content) as Island[];

  for (const item of parsed) {
    const island = parseIslandPayload(item);
    if (!island) {
      continue;
    }

    await pool.query(
      `
      INSERT INTO islands (id, name, region, saga, summary, highlights, tags, status, lat, lon)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        island.id,
        island.name,
        island.region,
        island.saga,
        island.summary,
        JSON.stringify(island.highlights),
        JSON.stringify(island.tags),
        island.status,
        island.coordinates.lat,
        island.coordinates.lon,
      ],
    );
  }
}

async function getAllIslands(): Promise<Island[]> {
  const result = await pool.query<IslandRow>(
    "SELECT id, name, region, saga, summary, highlights, tags, status, lat, lon FROM islands ORDER BY created_at ASC, name ASC",
  );
  return result.rows.map(toIsland);
}

async function getIslandById(id: string): Promise<Island | null> {
  const result = await pool.query<IslandRow>(
    "SELECT id, name, region, saga, summary, highlights, tags, status, lat, lon FROM islands WHERE id = $1 LIMIT 1",
    [id],
  );
  if (result.rowCount === 0) {
    return null;
  }
  return toIsland(result.rows[0]);
}

app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  
  next();
});

app.get("/api/islands", async (_req: Request, res: Response) => {
  try {
    const islands = await getAllIslands();
    res.json(islands);
  } catch (error) {
    console.error("Error loading islands:", error);
    res.status(500).json({ error: "Failed to load islands" });
  }
});

app.post("/api/islands", async (req: Request, res: Response) => {
  try {
    const island = parseIslandPayload(req.body);
    if (!island) {
      res.status(400).json({ error: "Invalid island payload" });
      return;
    }

    const existing = await getIslandById(island.id);
    if (existing) {
      res.status(409).json({ error: "An island with this id already exists" });
      return;
    }

    await pool.query(
      `
      INSERT INTO islands (id, name, region, saga, summary, highlights, tags, status, lat, lon)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
      `,
      [
        island.id,
        island.name,
        island.region,
        island.saga,
        island.summary,
        JSON.stringify(island.highlights),
        JSON.stringify(island.tags),
        island.status,
        island.coordinates.lat,
        island.coordinates.lon,
      ],
    );

    res.status(201).json(island);
  } catch (error) {
    console.error("Error creating island:", error);
    res.status(500).json({ error: "Failed to create island" });
  }
});

app.put("/api/islands/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await getIslandById(id);
    if (!existing) {
      res.status(404).json({ error: "Island not found" });
      return;
    }

    const incoming = req.body as Partial<Island>;
    const merged: Island = {
      ...existing,
      ...incoming,
      id,
      coordinates: {
        ...existing.coordinates,
        ...(incoming.coordinates ?? {}),
      },
      highlights: Array.isArray(incoming.highlights) ? incoming.highlights : existing.highlights,
      tags: Array.isArray(incoming.tags) ? incoming.tags : existing.tags,
    };

    const validated = parseIslandPayload(merged);
    if (!validated) {
      res.status(400).json({ error: "Invalid island payload" });
      return;
    }

    await pool.query(
      `
      UPDATE islands
      SET name = $2,
          region = $3,
          saga = $4,
          summary = $5,
          highlights = $6::jsonb,
          tags = $7::jsonb,
          status = $8,
          lat = $9,
          lon = $10
      WHERE id = $1
      `,
      [
        id,
        validated.name,
        validated.region,
        validated.saga,
        validated.summary,
        JSON.stringify(validated.highlights),
        JSON.stringify(validated.tags),
        validated.status,
        validated.coordinates.lat,
        validated.coordinates.lon,
      ],
    );

    res.json(validated);
  } catch (error) {
    console.error("Error updating island:", error);
    res.status(500).json({ error: "Failed to update island" });
  }
});

app.delete("/api/islands/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const result = await pool.query("DELETE FROM islands WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Island not found" });
      return;
    }

    res.json({ success: true, message: "Island deleted" });
  } catch (error) {
    console.error("Error deleting island:", error);
    res.status(500).json({ error: "Failed to delete island" });
  }
});

app.get("/api/islands/coordinates", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<{ id: string; lat: number; lon: number }>("SELECT id, lat, lon FROM islands");
    const coordinates = result.rows.reduce<Record<string, { lat: number; lon: number }>>((accumulator: Record<string, { lat: number; lon: number }>, row: { id: string; lat: number; lon: number }) => {
      accumulator[row.id] = {
        lat: Number(row.lat),
        lon: Number(row.lon),
      };
      return accumulator;
    }, {});

    res.json(coordinates);
  } catch (error) {
    console.error("Error loading coordinates:", error);
    res.status(500).json({ error: "Failed to load coordinates" });
  }
});

app.post("/api/islands/coordinates", async (req: Request, res: Response) => {
  try {
    const coordinates = req.body as Record<string, { lat: number; lon: number }>;

    if (!coordinates || typeof coordinates !== "object") {
      res.status(400).json({ error: "Invalid coordinates format" });
      return;
    }

    await pool.query("BEGIN");
    for (const [id, value] of Object.entries(coordinates)) {
      const lat = Number(value?.lat);
      const lon = Number(value?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      await pool.query(
        "UPDATE islands SET lat = $2, lon = $3 WHERE id = $1",
        [id, Number(clamp(lat, -89.5, 89.5).toFixed(3)), Number(wrapLongitude(lon).toFixed(3))],
      );
    }
    await pool.query("COMMIT");
    res.json({ success: true, message: "Coordinates saved" });
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    console.error("Error saving coordinates:", error);
    res.status(500).json({ error: "Failed to save coordinates" });
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "on-voyage" });
});

const startServer = async () => {
  await ensureSchema();
  await seedDatabaseIfNeeded();

  app.listen(PORT, () => {
    console.log(`🌊 Le Vogue Merry lève l'ancre sur le port ${PORT} !`);
    console.log(`🗺️ Atlas One Piece est prêt à naviguer...`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});