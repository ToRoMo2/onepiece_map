export type SeaRegion = "East Blue" | "Paradise" | "New World" | "Calm Belt" | "Sky Island";

export const MAP_STRUCTURE = {
  grandLine: {
    centerLat: 0,
    halfWidth: 8,
    softness: 1.2,
  },
  calmBelts: {
    // Belts are directly adjacent to Grand Line: north starts at +8 and south ends at -8.
    northCenterLat: 13,
    southCenterLat: -13,
    halfWidth: 5,
    softness: 1.2,
  },
  corridors: {
    eastBlue: {
      latMin: -42,
      latMax: -18,
      lonMin: 40,
      lonMax: 140,
    },
    paradise: {
      latMin: -8,
      latMax: 8,
      lonMin: 90,
      lonMax: 179,
    },
    newWorld: {
      latMin: -8,
      latMax: 8,
      lonMin: -80,
      lonMax: 40,
    },
    sky: {
      latMin: 14,
      latMax: 50,
    },
  },
} as const;

export type Island = {
  id: string;
  name: string;
  region: SeaRegion;
  saga: string;
  summary: string;
  highlights: string[];
  tags: string[];
  status: "Known" | "Hidden" | "Legendary";
  coordinates: {
    lat: number;
    lon: number;
  };
};

export const ISLANDS: Island[] = [
  {
    id: "dawn-island",
    name: "Dawn Island",
    region: "East Blue",
    saga: "East Blue Saga",
    summary: "Lieu de départ de Luffy avec le village de Fuchsia et le Mont Corvo.",
    highlights: ["Naissance du rêve de pirate", "Shanks et le chapeau de paille", "Foosha Village"],
    tags: ["luffy", "origine", "east blue"],
    status: "Known",
    coordinates: { lat: -34, lon: 112 },
  },
  {
    id: "shells-town",
    name: "Shells Town",
    region: "East Blue",
    saga: "East Blue Saga",
    summary: "Base de la Marine où Zoro rejoint officiellement l'équipage.",
    highlights: ["Recrutement de Zoro", "Capitaine Morgan", "Début de l'équipage"],
    tags: ["zoro", "marine", "premiers alliés"],
    status: "Known",
    coordinates: { lat: -32, lon: 104 },
  },
  {
    id: "orange-town",
    name: "Orange Town",
    region: "East Blue",
    saga: "East Blue Saga",
    summary: "Ville attaquée par Baggy où Nami collabore avec Luffy pour la première fois.",
    highlights: ["Baggy le Clown", "Nami", "Premier vrai duel équipage"],
    tags: ["nami", "baggy", "east blue"],
    status: "Known",
    coordinates: { lat: -30, lon: 95 },
  },
  {
    id: "syrup-village",
    name: "Syrup Village",
    region: "East Blue",
    saga: "East Blue Saga",
    summary: "Île d'Usopp et de Kaya, marquant le recrutement du sniper des Mugiwara.",
    highlights: ["Recrutement d'Usopp", "Klahadore", "Going Merry"],
    tags: ["usopp", "going merry", "kaya"],
    status: "Known",
    coordinates: { lat: -28, lon: 86 },
  },
  {
    id: "baratie",
    name: "Baratie",
    region: "East Blue",
    saga: "East Blue Saga",
    summary: "Restaurant flottant où Sanji rejoint l'équipage après l'arc Don Krieg.",
    highlights: ["Sanji", "Mihawk vs Zoro", "Don Krieg"],
    tags: ["sanji", "mihawk", "restaurant"],
    status: "Known",
    coordinates: { lat: -26, lon: 76 },
  },
  {
    id: "arlong-park",
    name: "Arlong Park",
    region: "East Blue",
    saga: "East Blue Saga",
    summary: "Arc fondateur sur le passé de Nami et la promesse d'équipage.",
    highlights: ["Arlong", "Moment iconique de Nami", "Luffy détruit Arlong Park"],
    tags: ["nami", "arlong", "moment culte"],
    status: "Known",
    coordinates: { lat: -24, lon: 66 },
  },
  {
    id: "loguetown",
    name: "Loguetown",
    region: "East Blue",
    saga: "East Blue Saga",
    summary: "Dernière escale avant Grand Line, ville d'exécution de Gol D. Roger.",
    highlights: ["Smoker", "Dragon", "Départ pour Grand Line"],
    tags: ["roger", "smoker", "grand line"],
    status: "Known",
    coordinates: { lat: -22, lon: 56 },
  },
  {
    id: "reverse-mountain",
    name: "Reverse Mountain",
    region: "Paradise",
    saga: "Alabasta Saga",
    summary: "Porte d'entrée mythique de Grand Line avec les courants inversés.",
    highlights: ["Laboon", "Cap Crocus", "Entrée de Grand Line"],
    tags: ["laboon", "grand line", "mythique"],
    status: "Known",
    coordinates: { lat: 0, lon: 178 },
  },
  {
    id: "alabasta",
    name: "Alabasta",
    region: "Paradise",
    saga: "Alabasta Saga",
    summary: "Royaume désertique central dans la lutte contre Crocodile et Baroque Works.",
    highlights: ["Vivi", "Crocodile", "Pluie de Yuba"],
    tags: ["vivi", "crocodile", "baroque works"],
    status: "Known",
    coordinates: { lat: 2, lon: 150 },
  },
  {
    id: "jaya",
    name: "Jaya",
    region: "Paradise",
    saga: "Sky Island Saga",
    summary: "Île charnière menant à Skypiea avec Bellamy et le rêve de l'île céleste.",
    highlights: ["Bellamy", "Teach", "Rêves de pirates"],
    tags: ["teach", "bellamy", "skypiea"],
    status: "Known",
    coordinates: { lat: 1, lon: 132 },
  },
  {
    id: "skypiea",
    name: "Skypiea",
    region: "Sky Island",
    saga: "Sky Island Saga",
    summary: "Île céleste mythique avec les ruines de Shandora et le conflit avec Ener.",
    highlights: ["Ener", "Shandora", "Cloche d'or"],
    tags: ["ciel", "ener", "mythe"],
    status: "Legendary",
    coordinates: { lat: 24, lon: 132 },
  },
  {
    id: "water-7",
    name: "Water 7",
    region: "Paradise",
    saga: "Water 7 Saga",
    summary: "Ville aquatique des charpentiers, naissance du Thousand Sunny.",
    highlights: ["Franky", "Galley-La", "CP9"],
    tags: ["franky", "sunny", "cp9"],
    status: "Known",
    coordinates: { lat: -1, lon: 112 },
  },
  {
    id: "thriller-bark",
    name: "Thriller Bark",
    region: "Paradise",
    saga: "Thriller Bark Saga",
    summary: "Navire-île hanté où Brook rejoint l'équipage.",
    highlights: ["Brook", "Moria", "Zoro et Kuma"],
    tags: ["brook", "moria", "kuma"],
    status: "Known",
    coordinates: { lat: -3, lon: 98 },
  },
  {
    id: "dressrosa",
    name: "Dressrosa",
    region: "New World",
    saga: "Dressrosa Saga",
    summary: "Royaume sous contrôle de Doflamingo, arc clé de l'alliance pirate.",
    highlights: ["Doflamingo", "Law", "Grand Fleet"],
    tags: ["law", "doflamingo", "alliance"],
    status: "Known",
    coordinates: { lat: 1, lon: 28 },
  },
  {
    id: "whole-cake-island",
    name: "Whole Cake Island",
    region: "New World",
    saga: "Whole Cake Island Saga",
    summary: "Territoire de Big Mom, infiltration de Sanji Retrieval Team.",
    highlights: ["Big Mom", "Sanji", "Pudding"],
    tags: ["yonko", "sanji", "totto land"],
    status: "Known",
    coordinates: { lat: 3, lon: -6 },
  },
  {
    id: "wano",
    name: "Wano Kuni",
    region: "New World",
    saga: "Wano Country Saga",
    summary: "Pays fermé inspiré du Japon féodal, bataille majeure contre Kaido.",
    highlights: ["Kaido", "Samouraïs", "Gear 5"],
    tags: ["kaido", "gear 5", "samourai"],
    status: "Legendary",
    coordinates: { lat: 5, lon: -42 },
  },
];

export const REGIONS: Array<"All" | SeaRegion> = ["All", "East Blue", "Paradise", "New World", "Calm Belt", "Sky Island"];