const { pool } = require("./db");

async function getBoard(studentId) {
  const [columns] = await pool.query(
    "SELECT id, title, sort_order FROM board_columns WHERE student_id = ? ORDER BY sort_order ASC, id ASC",
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
        c.sort_order
      FROM board_cards c
      JOIN board_columns col ON col.id = c.column_id
      WHERE col.student_id = ?
      ORDER BY c.sort_order ASC, c.id ASC
    `,
    [studentId]
  );
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
    };
    if (!cardsByColumn.has(card.column_id)) cardsByColumn.set(card.column_id, []);
    cardsByColumn.get(card.column_id).push(shaped);
  }

  return columns.map((col) => ({
    id: String(col.id),
    title: col.title,
    cards: cardsByColumn.get(col.id) || [],
  }));
}

module.exports = { getBoard };
