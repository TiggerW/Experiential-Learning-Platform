/**
 * Audit imported cards: five-sense blocks should belong to the card's location
 * (primary location = first mentioned place name in the sense text).
 */
const path = require("path");
const { pool } = require("../src/db");
const { CHECKPOINTS, resolvePrimaryLocationInText } = require("../src/constants");

const SENSE_BLOCK_RE = /\[([^\]]+)\]\n([\s\S]*?)(?=\n\n\[|$)/g;
const ALL_LOCATION_NAMES = [
  ...new Set(CHECKPOINTS.flatMap((cp) => [cp.nameChi, ...cp.aliases])),
];

function mentionedLocations(text) {
  const haystack = String(text || "");
  return ALL_LOCATION_NAMES.filter((name) => name && haystack.includes(name));
}

function extractSenseBlocks(description) {
  const blocks = [];
  const text = String(description || "");
  for (const match of text.matchAll(SENSE_BLOCK_RE)) {
    blocks.push({ sense: match[1], body: match[2].trim() });
  }
  return blocks;
}

async function main() {
  const [rows] = await pool.query(
    `
    SELECT m.name AS student_name, c.title AS card_location, c.description
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    JOIN members m ON m.id = bc.student_id
    WHERE c.source = 'imported'
    ORDER BY m.name, c.title
    `
  );

  const issues = [];

  for (const row of rows) {
    const [mapRows] = await pool.query(
      `
      SELECT DISTINCT c.title AS location
      FROM board_cards c
      JOIN board_columns bc ON bc.id = c.column_id
      JOIN members m ON m.id = bc.student_id
      WHERE c.source = 'imported' AND m.name = ?
      `,
      [row.student_name]
    );
    const studentLocations = mapRows.map((r) => r.location);

    for (const block of extractSenseBlocks(row.description)) {
      const primary = resolvePrimaryLocationInText(block.body, studentLocations);
      const mentioned = mentionedLocations(block.body).filter((loc) =>
        studentLocations.some(
          (studentLoc) =>
            studentLoc === loc ||
            studentLoc.includes(loc) ||
            loc.includes(studentLoc)
        )
      );

      if (!primary) continue;

      if (primary !== row.card_location) {
        issues.push({
          student: row.student_name,
          card: row.card_location,
          shouldBe: primary,
          sense: block.sense,
          mentioned: [...new Set(mentioned)].join("、"),
          preview: block.body.slice(0, 60) + (block.body.length > 60 ? "..." : ""),
        });
      }
    }
  }

  if (!issues.length) {
    console.log("✓ 沒有發現五官感受區塊放錯 card 的情況。");
  } else {
    console.log(`✗ 發現 ${issues.length} 個錯放區塊：\n`);
    for (const issue of issues) {
      console.log(`學生: ${issue.student}`);
      console.log(`  錯放 card: ${issue.card} → 應為: ${issue.shouldBe}`);
      console.log(`  感官: [${issue.sense}]，文中提及: ${issue.mentioned || "—"}`);
      console.log(`  內容: ${issue.preview}\n`);
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
