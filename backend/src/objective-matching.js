const { pool } = require("./db");
const { CHECKPOINTS, resolveCheckpoint } = require("./constants");

const MAX_OBJECTIVES_PER_CARD = 5;

const CHECKPOINT_OBJECTIVE_CODES = {
  checkpoint1: ["4.5.1-1", "4.3.2-1", "4.3.3-1"],
  checkpoint2: ["4.5.1-1", "4.5.1-2", "4.3.2-1", "4.3.3-1"],
  checkpoint3: ["4.3.1-1", "4.3.2-1", "4.5.1-1"],
  checkpoint4: ["4.5.1-1", "4.3.2-1", "4.3.3-1"],
  checkpoint5: ["4.3.1-1", "4.3.2-1", "4.3.2-2", "4.5.1-2"],
  checkpoint6: ["4.3.1-1", "4.3.2-1", "4.5.1-1"],
};

const RECORD_TYPE_OBJECTIVE_CODES = {
  five_sense: ["4.SA.1-1", "4.SA.3-1", "4.3.2-1"],
  map_location: ["4.3.3-1", "4.5.1-1"],
  assessment: ["4.SA.1-1", "4.SA.3-1", "4.3.2-1"],
};

const KEYWORD_OBJECTIVE_RULES = [
  {
    keywords: ["古蹟", "法定古蹟", "文物", "文化遺產", "修繕", "保育"],
    codes: ["4.3.3-1", "4.3.2-1"],
  },
  {
    keywords: ["圍村", "圍牆", "圍門", "祠堂", "宗祠", "圍"],
    codes: ["4.3.2-1", "4.5.1-1"],
  },
  {
    keywords: ["清朝", "康熙", "乾隆", "清代"],
    codes: ["4.5.1-2"],
  },
  {
    keywords: ["龍躍頭", "文物徑", "粉嶺", "新界"],
    codes: ["4.5.1-1", "4.3.3-1"],
  },
  {
    keywords: ["視覺", "聽覺", "嗅覺", "味覺", "觸覺", "五官"],
    codes: ["4.SA.1-1", "4.SA.3-1"],
  },
  {
    keywords: ["天后", "廟", "神", "祭祀", "香火"],
    codes: ["4.3.1-1", "4.3.2-1"],
  },
  {
    keywords: ["教堂", "基督教", "傳教", "禮拜"],
    codes: ["4.5.1-1", "4.3.2-1"],
  },
  {
    keywords: ["science", "科學", "能源", "renewable", "energy"],
    codes: ["4.MB.1-1", "4.SA.1-1"],
  },
  {
    keywords: ["history", "歷史", "revolution", "industrial"],
    codes: ["4.5.1-1", "4.4.1-1"],
  },
  {
    keywords: ["art", "藝術", "畫", "watercolor", "painting"],
    codes: ["4.3.2-1"],
  },
  {
    keywords: ["濕地", "觀鳥", "鳥種", "生態", "動物", "植物"],
    codes: ["4.LD.1-1", "4.LE.3-1", "4.SA.1-1"],
  },
  {
    keywords: ["活化", "大館", "建築", "案例分析", "個案"],
    codes: ["4.3.3-1", "4.3.2-1", "4.5.1-6"],
  },
  {
    keywords: ["導覽", "廣場", "紀錄"],
    codes: ["4.5.1-1", "4.3.5-1"],
  },
];

const TITLE_OBJECTIVE_RULES = [
  { pattern: /崇謙堂/i, codes: CHECKPOINT_OBJECTIVE_CODES.checkpoint1 },
  { pattern: /麻笏/i, codes: CHECKPOINT_OBJECTIVE_CODES.checkpoint2 },
  { pattern: /土地神/i, codes: CHECKPOINT_OBJECTIVE_CODES.checkpoint3 },
  { pattern: /老圍/i, codes: CHECKPOINT_OBJECTIVE_CODES.checkpoint4 },
  { pattern: /天后/i, codes: CHECKPOINT_OBJECTIVE_CODES.checkpoint5 },
  { pattern: /鄧公祠|松嶺/i, codes: CHECKPOINT_OBJECTIVE_CODES.checkpoint6 },
  { pattern: /五官感受/i, codes: RECORD_TYPE_OBJECTIVE_CODES.five_sense },
  { pattern: /science fair/i, codes: ["4.MB.1-1", "4.SA.1-1"] },
  { pattern: /history essay/i, codes: ["4.5.1-1", "4.4.1-1"] },
  { pattern: /art project/i, codes: ["4.3.2-1"] },
  { pattern: /觀鳥|濕地/i, codes: ["4.LD.1-1", "4.LE.3-1", "4.SA.1-1"] },
  { pattern: /大館|活化/i, codes: ["4.3.3-1", "4.3.2-1", "4.5.1-6"] },
  { pattern: /test/i, codes: ["4.SA.1-1"] },
];

function buildSearchText(card) {
  return [card.title, card.description, card.location, card.record_type, card.stage_key]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function collectObjectiveCodes(card) {
  const codeSet = new Set();

  if (card.checkpoint_id && CHECKPOINT_OBJECTIVE_CODES[card.checkpoint_id]) {
    for (const code of CHECKPOINT_OBJECTIVE_CODES[card.checkpoint_id]) {
      codeSet.add(code);
    }
  }

  const checkpoint = resolveCheckpoint(card.title) || resolveCheckpoint(card.location);
  if (checkpoint?.id && CHECKPOINT_OBJECTIVE_CODES[checkpoint.id]) {
    for (const code of CHECKPOINT_OBJECTIVE_CODES[checkpoint.id]) {
      codeSet.add(code);
    }
  }

  if (card.record_type && RECORD_TYPE_OBJECTIVE_CODES[card.record_type]) {
    for (const code of RECORD_TYPE_OBJECTIVE_CODES[card.record_type]) {
      codeSet.add(code);
    }
  }

  const searchText = buildSearchText(card);
  for (const rule of KEYWORD_OBJECTIVE_RULES) {
    if (rule.keywords.some((keyword) => searchText.includes(keyword.toLowerCase()))) {
      for (const code of rule.codes) codeSet.add(code);
    }
  }

  for (const rule of TITLE_OBJECTIVE_RULES) {
    if (rule.pattern.test(card.title || "") || rule.pattern.test(card.description || "")) {
      for (const code of rule.codes) codeSet.add(code);
    }
  }

  for (const checkpointMeta of CHECKPOINTS) {
    const needles = [checkpointMeta.nameChi, ...checkpointMeta.aliases];
    if (needles.some((needle) => searchText.includes(needle.toLowerCase()))) {
      const codes = CHECKPOINT_OBJECTIVE_CODES[checkpointMeta.id] || [];
      for (const code of codes) codeSet.add(code);
    }
  }

  return [...codeSet];
}

async function loadObjectiveCodeMap() {
  const [rows] = await pool.query(
    "SELECT id, objective_code, category FROM learning_objectives"
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.objective_code, row.id);
  }
  return map;
}

function resolveObjectiveIds(codes, codeMap) {
  const ids = [];
  for (const code of codes) {
    const id = codeMap.get(code);
    if (id) ids.push(id);
  }
  return [...new Set(ids)].slice(0, MAX_OBJECTIVES_PER_CARD);
}

async function matchObjectivesForCard(card, codeMap) {
  const codes = collectObjectiveCodes(card);
  return resolveObjectiveIds(codes, codeMap);
}

async function loadCard(cardId) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.location,
      c.record_type,
      c.checkpoint_id,
      bc.stage_key
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [cardId]
  );
  return rows[0] || null;
}

async function linkObjectivesToCard(cardId, objectiveIds, assignedBy = null) {
  if (!objectiveIds.length) return 0;

  const [existing] = await pool.query(
    "SELECT objective_id FROM card_learning_objectives WHERE card_id = ?",
    [cardId]
  );
  const existingIds = new Set(existing.map((row) => Number(row.objective_id)));
  const toInsert = objectiveIds.filter((id) => !existingIds.has(Number(id)));
  if (!toInsert.length) return 0;

  await Promise.all(
    toInsert.map((objectiveId) =>
      pool.query(
        "INSERT INTO card_learning_objectives (card_id, objective_id, assigned_by) VALUES (?, ?, ?)",
        [cardId, objectiveId, assignedBy]
      )
    )
  );
  return toInsert.length;
}

async function autoLinkCardObjectives(cardId, options = {}) {
  const card = await loadCard(cardId);
  if (!card) return { cardId, linked: 0, objectiveIds: [] };

  const codeMap = options.codeMap || (await loadObjectiveCodeMap());
  const objectiveIds = await matchObjectivesForCard(card, codeMap);
  const linked = await linkObjectivesToCard(cardId, objectiveIds, options.assignedBy ?? null);

  return {
    cardId: String(cardId),
    linked,
    objectiveIds: objectiveIds.map(String),
  };
}

async function autoLinkAllCards(options = {}) {
  const codeMap = await loadObjectiveCodeMap();
  const [cards] = await pool.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.location,
      c.record_type,
      c.checkpoint_id,
      bc.stage_key
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    ORDER BY c.id ASC
    `
  );

  const results = [];
  let totalLinked = 0;

  for (const card of cards) {
    const objectiveIds = await matchObjectivesForCard(card, codeMap);
    const linked = await linkObjectivesToCard(card.id, objectiveIds, options.assignedBy ?? null);
    totalLinked += linked;
    results.push({
      cardId: String(card.id),
      title: card.title,
      linked,
      objectiveIds: objectiveIds.map(String),
    });
  }

  return { totalCards: cards.length, totalLinked, results };
}

module.exports = {
  autoLinkCardObjectives,
  autoLinkAllCards,
  matchObjectivesForCard,
  collectObjectiveCodes,
  CHECKPOINT_OBJECTIVE_CODES,
};
