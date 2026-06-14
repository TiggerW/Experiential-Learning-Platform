const STAGE_COLUMNS = [
  { key: "pretrip", title: "Pretrip", sortOrder: 0 },
  { key: "actual_trip", title: "Actual Trip", sortOrder: 1 },
  { key: "post_trip", title: "Post Trip Reflection", sortOrder: 2 },
];

const CHECKPOINTS = [
  {
    id: "checkpoint1",
    nameChi: "崇謙堂",
    nameEng: "Tsung Kyam Church",
    lat: 22.49705470659744,
    lng: 114.14886933599814,
    aliases: ["崇謙堂"],
  },
  {
    id: "checkpoint2",
    nameChi: "麻笏圍",
    nameEng: "Ma Wat Wai",
    lat: 22.49887381303406,
    lng: 114.14994508551621,
    aliases: ["麻笏圍", "麻笏園", "麻笏园"],
  },
  {
    id: "checkpoint3",
    nameChi: "土地神壇",
    nameEng: "Shrine of the Earth God",
    lat: 22.498139784291663,
    lng: 114.15113478483966,
    aliases: ["土地神壇", "土地神坛"],
  },
  {
    id: "checkpoint4",
    nameChi: "老圍",
    nameEng: "Lo Wai Gate Tower",
    lat: 22.497848218245036,
    lng: 114.15209150970657,
    aliases: ["老圍", "老围"],
  },
  {
    id: "checkpoint5",
    nameChi: "龍躍頭天后宮",
    nameEng: "Tin Hau Temple, Lung Yeuk Tau",
    lat: 22.49753610364602,
    lng: 114.15271385276705,
    aliases: ["天后宮", "龙跃头天后宫", "龍躍頭天后宮"],
  },
  {
    id: "checkpoint6",
    nameChi: "松嶺鄧公祠",
    nameEng: "Tang Chung Ling Ancestral Hall",
    lat: 22.497643162996404,
    lng: 114.15284089145644,
    aliases: ["松嶺鄧公祠", "松岭邓公祠"],
  },
];

const DATASET_STUDENTS = [
  {
    email: "student1@edulearn.com",
    chineseName: "陳玥鈞",
    name: "Chan Yuet Kwan",
    className: "4B",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=chan-yuet-kwan",
  },
  {
    email: "student2@edulearn.com",
    chineseName: "陳翰霖",
    name: "Chan Hon Lam",
    className: "4B",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=chan-hon-lam",
  },
  {
    email: "student3@edulearn.com",
    chineseName: "洪号朗",
    name: "Hung Hou Long",
    className: "4B",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=hung-hou-long",
  },
  {
    email: "student4@edulearn.com",
    chineseName: "黃柏然",
    name: "Wong Pak Yin",
    className: "4B",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=wong-pak-yin",
  },
];

const SENSE_LABELS = {
  sight: "視覺",
  hearing: "聽覺",
  smell: "嗅覺",
  taste: "味覺",
  touch: "觸覺",
};

function resolveCheckpoint(locationName) {
  const normalized = String(locationName || "").trim();
  if (!normalized) return null;
  return (
    CHECKPOINTS.find(
      (cp) =>
        cp.nameChi === normalized ||
        cp.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
    ) || null
  );
}

function locationMentionedInText(locationName, text) {
  const checkpoint = resolveCheckpoint(locationName);
  const needles = checkpoint
    ? [checkpoint.nameChi, ...checkpoint.aliases]
    : [String(locationName || "").trim()];
  const haystack = String(text || "");
  return needles.filter(Boolean).some((needle) => haystack.includes(needle));
}

function resolvePrimaryLocationInText(text, locationNames) {
  const haystack = String(text || "");
  if (!haystack || !locationNames?.length) return null;

  let earliestIndex = Infinity;
  let primaryLocation = null;

  for (const locationName of locationNames) {
    const checkpoint = resolveCheckpoint(locationName);
    const needles = checkpoint
      ? [checkpoint.nameChi, ...checkpoint.aliases]
      : [String(locationName || "").trim()];

    for (const needle of needles.filter(Boolean)) {
      const index = haystack.indexOf(needle);
      if (index !== -1 && index < earliestIndex) {
        earliestIndex = index;
        primaryLocation = locationName;
      }
    }
  }

  return primaryLocation;
}

function fiveSenseRowBelongsToLocation(locationName, text, locationNames) {
  return resolvePrimaryLocationInText(text, locationNames) === locationName;
}

module.exports = {
  STAGE_COLUMNS,
  CHECKPOINTS,
  DATASET_STUDENTS,
  SENSE_LABELS,
  resolveCheckpoint,
  locationMentionedInText,
  resolvePrimaryLocationInText,
  fiveSenseRowBelongsToLocation,
};
