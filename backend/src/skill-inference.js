const { pool } = require("./db");
const {
  SKILL_CATALOG,
  CHECKPOINT_SKILL_PROFILES,
  SENSE_MARKERS,
  getSkillByKey,
  getInferrableSkills,
  objectiveMatchesSkillDefinition,
  getObjectiveSkillLinks,
} = require("./skills-catalog");

const LEVEL_ORDER = ["emerging", "developing", "proficient", "advanced"];

const OBSERVATION_TEXT_KEYWORDS = ["看到", "觀察", "留意", "發現", "注意到", "照片", "圖片"];
const EXPRESSION_TEXT_KEYWORDS = ["感受", "形容", "描述", "體驗", "我覺得", "我認為", "文字"];
const REFLECTION_TEXT_KEYWORDS = ["反思", "感想", "學到", "明白", "體會", "原來", "之後", "回家後"];

function levelFromSignal({ hasFeedback = false, richText = false, multipleSignals = false }) {
  let index = 0;
  if (richText) index = 1;
  if (multipleSignals) index = Math.max(index, 1);
  if (hasFeedback) index = Math.min(index + 1, LEVEL_ORDER.length - 1);
  return LEVEL_ORDER[index];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function textIncludesAny(text, keywords = []) {
  const haystack = normalizeText(text).toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function excerptDescription(description, maxLen = 120) {
  const text = normalizeText(description).replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function getCheckpointProfile(checkpointId) {
  return CHECKPOINT_SKILL_PROFILES[checkpointId] || null;
}

async function getSkillIdByName(name) {
  const [rows] = await pool.query("SELECT id FROM skills WHERE name = ? LIMIT 1", [name]);
  return rows[0]?.id || null;
}

async function loadStudentCards(studentId) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.record_type,
      c.feedback,
      c.checkpoint_id,
      bc.stage_key,
      bc.title AS column_title,
      (SELECT COUNT(*) FROM card_images ci WHERE ci.card_id = c.id) AS image_count
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE bc.student_id = ?
    ORDER BY bc.sort_order, c.sort_order, c.id
    `,
    [studentId]
  );
  return rows;
}

async function loadCardObjectives(studentId) {
  const [rows] = await pool.query(
    `
    SELECT
      clo.card_id,
      lo.objective_code,
      lo.content,
      lo.description,
      lo.category
    FROM card_learning_objectives clo
    JOIN board_cards c ON c.id = clo.card_id
    JOIN board_columns bc ON bc.id = c.column_id
    JOIN learning_objectives lo ON lo.id = clo.objective_id
    WHERE bc.student_id = ?
    `,
    [studentId]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.card_id)) map.set(row.card_id, []);
    map.get(row.card_id).push(row);
  }
  return map;
}

function matchingObjectives(objectives, skill, profileConfig = null) {
  const allowedCodes = profileConfig?.objectiveCodes;
  return objectives.filter((objective) => {
    if (!objectiveMatchesSkillDefinition(objective.objective_code, skill)) return false;
    if (allowedCodes?.length) return allowedCodes.includes(objective.objective_code);
    return true;
  });
}

function inferSkillForCard(card, objectives, skill) {
  if (skill.libraryOnly) return null;

  const desc = normalizeText(card.description);
  const profile = getCheckpointProfile(card.checkpoint_id);
  const profileConfig = profile?.skills?.[skill.key] || null;
  const isFiveSense =
    card.record_type === "five_sense" ||
    card.title.includes("五官感受") ||
    textIncludesAny(desc, SENSE_MARKERS);
  const isPostTrip = card.stage_key === "post_trip";
  const reasons = [];

  if (skill.postTripOnly && !isPostTrip && !card.feedback) {
    return null;
  }

  if (profileConfig) {
    const profileKeywords = profileConfig.keywords || [];
    if (profileKeywords.length && textIncludesAny(desc, profileKeywords)) {
      reasons.push(`在${profile.label}的紀錄提及${skill.name}相關內容`);
    }
    if (profileConfig.senseMarkers && isFiveSense && textIncludesAny(desc, SENSE_MARKERS)) {
      reasons.push(`在${profile.label}以感官紀錄展現${skill.name}`);
    }

    for (const objective of matchingObjectives(objectives, skill, profileConfig)) {
      reasons.push(`對應學習重點 ${objective.objective_code}：${objective.content || objective.description}`);
    }

    if (!reasons.length) return null;
  } else if (card.checkpoint_id && card.record_type === "map_location") {
    return null;
  } else {
    if (skill.key === "observation") {
      if (isFiveSense && textIncludesAny(desc, SENSE_MARKERS)) {
        reasons.push("以五官感受紀錄觀察所見所聞");
      }
      if (skill.requiresImageWithText && Number(card.image_count) > 0 && textIncludesAny(desc, OBSERVATION_TEXT_KEYWORDS)) {
        reasons.push(`附圖並描述觀察內容（${card.image_count} 張照片）`);
      }
    }

    if (skill.key === "expression") {
      const minLen = skill.minDescriptionLength || 40;
      if (isFiveSense && desc.length >= minLen && textIncludesAny(desc, EXPRESSION_TEXT_KEYWORDS)) {
        reasons.push("以文字表達感官體驗與感受");
      }
      if (card.stage_key === "actual_trip" && desc.length >= 100 && textIncludesAny(desc, EXPRESSION_TEXT_KEYWORDS)) {
        reasons.push("在旅程中留下具體描述，展現表達能力");
      }
    }

    if (skill.key === "reflection") {
      if (isPostTrip && desc.length >= 30) reasons.push("在 Post Trip Reflection 階段整理學習反思");
      if (card.feedback && skill.allowsFeedback) reasons.push("獲得老師回饋，顯示已進行學習反思");
      if (textIncludesAny(desc, REFLECTION_TEXT_KEYWORDS) && desc.length >= 50) {
        reasons.push("描述中包含反思與學習體會");
      }
    }

    if (skill.keywords?.length && textIncludesAny(desc, skill.keywords)) {
      reasons.push(`紀錄內容展現${skill.name}相關描述`);
    }

    for (const objective of matchingObjectives(objectives, skill)) {
      reasons.push(`對應學習重點 ${objective.objective_code}：${objective.content || objective.description}`);
    }

    if (!reasons.length) return null;
  }

  const locationLabel = profile?.label || card.title;
  return {
    skillName: skill.name,
    reasons,
    evidence: excerptDescription(desc) || `於 ${locationLabel} 展現${skill.name}`,
    richText: desc.length >= 60,
    multipleSignals: reasons.length >= 2,
  };
}

function inferSkillsForCard(card, objectives) {
  const results = [];
  for (const skill of getInferrableSkills()) {
    const hit = inferSkillForCard(card, objectives, skill);
    if (hit) results.push(hit);
  }
  return results;
}

async function seedObjectiveSkillMappings() {
  const [skills] = await pool.query("SELECT id, name FROM skills");
  const skillIdByName = new Map(skills.map((row) => [row.name, row.id]));
  const [objectives] = await pool.query(
    "SELECT id, objective_code FROM learning_objectives"
  );

  for (const objective of objectives) {
    const linkedNames = getObjectiveSkillLinks(objective.objective_code);
    for (const skillName of linkedNames) {
      const skillId = skillIdByName.get(skillName);
      if (!skillId) continue;
      await pool.query(
        "INSERT IGNORE INTO learning_objective_skills (objective_id, skill_id) VALUES (?, ?)",
        [objective.id, skillId]
      );
    }
  }
}

async function upsertSuggestedRecord(studentId, skillId, payload) {
  const cardId = payload.cardId;
  if (!cardId) return null;

  const [existing] = await pool.query(
    `
    SELECT id, status, source
    FROM student_skills
    WHERE student_id = ? AND skill_id = ? AND card_id = ?
    LIMIT 1
    `,
    [studentId, skillId, cardId]
  );

  if (existing[0]?.status === "confirmed") {
    return existing[0].id;
  }

  if (!existing.length) {
    const [result] = await pool.query(
      `
      INSERT INTO student_skills (
        student_id, skill_id, level, evidence, card_id, status, source, inference_reason
      ) VALUES (?, ?, ?, ?, ?, 'suggested', 'inferred', ?)
      `,
      [studentId, skillId, payload.level, payload.evidence, cardId, payload.inferenceReason]
    );
    return result.insertId;
  }

  if (existing[0].status === "rejected") {
    await pool.query(
      `
      UPDATE student_skills
      SET level = ?, evidence = ?, status = 'suggested', source = 'inferred',
          inference_reason = ?, updated_by = NULL
      WHERE id = ?
      `,
      [payload.level, payload.evidence, payload.inferenceReason, existing[0].id]
    );
    return existing[0].id;
  }

  await pool.query(
    `
    UPDATE student_skills
    SET level = ?, evidence = ?, status = 'suggested', source = 'inferred',
        inference_reason = ?, updated_by = NULL
    WHERE id = ? AND status = 'suggested'
    `,
    [payload.level, payload.evidence, payload.inferenceReason, existing[0].id]
  );
  return existing[0].id;
}

async function pruneStaleSuggestions(studentId, activeKeys) {
  const [currentCards] = await pool.query(
    `
    SELECT c.id
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE bc.student_id = ?
    `,
    [studentId]
  );
  const validCardIds = new Set(currentCards.map((row) => String(row.id)));

  const [rows] = await pool.query(
    `
    SELECT id, skill_id, card_id
    FROM student_skills
    WHERE student_id = ? AND status = 'suggested' AND source = 'inferred'
    `,
    [studentId]
  );

  for (const row of rows) {
    const cardId = row.card_id ? String(row.card_id) : "";
    const shouldDelete =
      !cardId ||
      !validCardIds.has(cardId) ||
      !activeKeys.has(`${row.skill_id}:${row.card_id}`);

    if (shouldDelete) {
      await pool.query("DELETE FROM student_skills WHERE id = ?", [row.id]);
    }
  }
}

async function inferStudentSkills(studentId) {
  await seedObjectiveSkillMappings();
  const cards = await loadStudentCards(studentId);
  const objectiveMap = await loadCardObjectives(studentId);
  const recordIds = [];
  const activeKeys = new Set();

  for (const card of cards) {
    const objectives = objectiveMap.get(card.id) || [];
    const hits = inferSkillsForCard(card, objectives);

    for (const hit of hits) {
      const skillId = await getSkillIdByName(hit.skillName);
      if (!skillId) continue;

      const level = levelFromSignal({
        hasFeedback: Boolean(card.feedback),
        richText: hit.richText,
        multipleSignals: hit.multipleSignals,
      });

      const recordId = await upsertSuggestedRecord(studentId, skillId, {
        cardId: card.id,
        level,
        evidence: hit.evidence,
        inferenceReason: hit.reasons.join("；"),
      });

      if (recordId) {
        recordIds.push(recordId);
        activeKeys.add(`${skillId}:${card.id}`);
      }
    }
  }

  await pruneStaleSuggestions(studentId, activeKeys);
  return recordIds;
}

async function inferStudentSkillsForCard(cardId) {
  const [rows] = await pool.query(
    `
    SELECT bc.student_id
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [cardId]
  );
  const studentId = rows[0]?.student_id;
  if (!studentId) return [];
  return inferStudentSkills(studentId);
}

const SKILL_NAMES = Object.fromEntries(
  SKILL_CATALOG.map((skill) => [skill.key, skill.name])
);

module.exports = {
  inferStudentSkills,
  inferStudentSkillsForCard,
  seedObjectiveSkillMappings,
  inferSkillsForCard,
  SKILL_NAMES,
  CHECKPOINT_SKILL_PROFILES,
};
