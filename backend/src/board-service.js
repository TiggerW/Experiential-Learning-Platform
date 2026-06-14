const { pool } = require("./db");

async function getCardObjectives(cardIds) {
  if (!cardIds.length) return new Map();
  const [rows] = await pool.query(
    `
    SELECT clo.card_id, lo.id, lo.objective_code, lo.content, lo.topic, lo.lesson, lo.category
    FROM card_learning_objectives clo
    JOIN learning_objectives lo ON lo.id = clo.objective_id
    WHERE clo.card_id IN (?)
    `,
    [cardIds]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.card_id)) map.set(row.card_id, []);
    map.get(row.card_id).push({
      id: String(row.id),
      objectiveCode: row.objective_code,
      content: row.content,
      topic: row.topic,
      lesson: row.lesson,
      category: row.category,
    });
  }
  return map;
}

async function getBoard(studentId) {
  const [columns] = await pool.query(
    `
    SELECT id, title, sort_order, is_fixed_stage, stage_key
    FROM board_columns
    WHERE student_id = ?
    ORDER BY sort_order ASC, id ASC
    `,
    [studentId]
  );
  const [cards] = await pool.query(
    `
      SELECT
        c.id,
        c.column_id,
        c.title,
        c.description,
        c.location,
        DATE_FORMAT(c.activity_date, '%Y-%m-%d') AS activity_date,
        c.feedback,
        c.created_at,
        c.sort_order,
        c.checkpoint_id,
        c.lat,
        c.lng,
        c.record_type,
        c.source
      FROM board_cards c
      JOIN board_columns col ON col.id = c.column_id
      WHERE col.student_id = ?
      ORDER BY c.sort_order ASC, c.id ASC
    `,
    [studentId]
  );
  const cardIds = cards.map((card) => card.id);
  const [images] = await pool.query(
    `
      SELECT i.id, i.card_id, i.image_url, i.sort_order
      FROM card_images i
      JOIN board_cards c ON c.id = i.card_id
      JOIN board_columns col ON col.id = c.column_id
      WHERE col.student_id = ?
      ORDER BY i.sort_order ASC, i.id ASC
    `,
    [studentId]
  );

  const imageMap = new Map();
  for (const image of images) {
    if (!imageMap.has(image.card_id)) imageMap.set(image.card_id, []);
    imageMap.get(image.card_id).push(image.image_url);
  }

  const objectiveMap = await getCardObjectives(cardIds);

  const cardsByColumn = new Map();
  for (const card of cards) {
    const shaped = {
      id: String(card.id),
      title: card.title,
      description: card.description,
      location: card.location,
      activityDate: card.activity_date || "",
      images: imageMap.get(card.id) || [],
      feedback: card.feedback || undefined,
      createdAt: card.created_at,
      checkpointId: card.checkpoint_id || undefined,
      lat: card.lat !== null ? Number(card.lat) : undefined,
      lng: card.lng !== null ? Number(card.lng) : undefined,
      recordType: card.record_type || "general",
      source: card.source || "manual",
      learningObjectives: objectiveMap.get(card.id) || [],
    };
    if (!cardsByColumn.has(card.column_id)) cardsByColumn.set(card.column_id, []);
    cardsByColumn.get(card.column_id).push(shaped);
  }

  return columns.map((col) => ({
    id: String(col.id),
    title: col.title,
    sortOrder: col.sort_order,
    isFixedStage: Boolean(col.is_fixed_stage),
    stageKey: col.stage_key || undefined,
    cards: cardsByColumn.get(col.id) || [],
  }));
}

module.exports = { getBoard };
