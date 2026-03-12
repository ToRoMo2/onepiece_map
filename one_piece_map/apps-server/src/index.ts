import express, { type Request, type Response } from "express";
import path from "path";
import fs from "fs/promises";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use((req: Request, res: Response, next: Function) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const DATA_DIR = path.join(__dirname, "..", "data");
const COORDINATES_FILE = path.join(DATA_DIR, "islands-coordinates.json");

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists or creation failed, continue anyway
  }
}

async function loadCoordinates(): Promise<Record<string, { lat: number; lon: number }>> {
  try {
    await ensureDataDir();
    const content = await fs.readFile(COORDINATES_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveCoordinates(coordinates: Record<string, { lat: number; lon: number }>): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(COORDINATES_FILE, JSON.stringify(coordinates, null, 2), "utf-8");
}

app.get("/api/islands/coordinates", async (_req: Request, res: Response) => {
  try {
    const coordinates = await loadCoordinates();
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

    await saveCoordinates(coordinates);
    res.json({ success: true, message: "Coordinates saved" });
  } catch (error) {
    console.error("Error saving coordinates:", error);
    res.status(500).json({ error: "Failed to save coordinates" });
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "on-voyage" });
});

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🌊 Le Vogue Merry lève l'ancre sur le port ${PORT} !`);
    console.log(`🗺️ Atlas One Piece est prêt à naviguer...`);
  });
};

startServer();