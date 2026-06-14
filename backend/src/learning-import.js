const fs = require("fs");
const path = require("path");
function getPool() {
  return require("./db").pool;
}
const {
  DATASET_STUDENTS,
  SENSE_LABELS,
  resolveCheckpoint,
  resolvePrimaryLocationInText,
  fiveSenseRowBelongsToLocation,
} = require("./constants");
const { readXlsxObjects, findDatasetFile, cellValueToString } = require("./xlsx-reader");

const DATASET_ROOT =
  process.env.LEARNING_DATASET_PATH || path.resolve(__dirname, "../../learning_content_dataset");

function normalizeSenseType(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key || key === "five sense") return "";
  if (key === "sight") return "sight";
  if (key === "hearing") return "hearing";
  if (key === "smell") return "smell";
  if (key === "taste") return "taste";
  if (key === "touch") return "touch";
  return key;
}

function senseLabel(senseType) {
  return SENSE_LABELS[senseType] || senseType;
}

function normalizeCellText(value) {
  const text = cellValueToString(value);
  if (!text || text === "[object Object]") return "";
  return text;
}

function collectImageNames(row) {
  return Object.keys(row)
    .filter((key) => /^post image/i.test(key))
    .sort()
    .map((key) => String(row[key] || "").trim())
    .filter(Boolean);
}

function findImageFile(studentDir, imageName) {
  const folders = [
    path.join(studentDir, "Map Location", "Image"),
    path.join(studentDir, "Five Senses", "Image"),
    path.join(studentDir, "Five Sense", "image"),
    path.join(studentDir, "Five Sense", "Image"),
  ];
  for (const folder of folders) {
    const fullPath = path.join(folder, imageName);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

function copyImageToUploads(sourcePath, uploadsDir) {
  const ext = path.extname(sourcePath) || ".jpg";
  const filename = `dataset-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const targetPath = path.join(uploadsDir, filename);
  fs.copyFileSync(sourcePath, targetPath);
  return filename;
}

function buildMapDescription(locationName, mapInputText) {
  const text = normalizeCellText(mapInputText);
  if (text) return text;
  return `參觀 ${locationName}。`;
}

function buildCardDescription(locationName, mapInputText, fiveSenseRows, locationNames) {
  const mapText = normalizeCellText(mapInputText);
  const senseText = buildFiveSenseDescriptionForLocation(locationName, fiveSenseRows, locationNames);
  if (senseText) {
    return [mapText, senseText].filter(Boolean).join("\n\n");
  }
  return buildMapDescription(locationName, mapInputText);
}

function collectCardImages(mapImageNames, fiveSenseRows, locationName, locationNames) {
  const imageNames = [...mapImageNames];
  for (const imageName of collectMatchedSenseImages(fiveSenseRows, locationName, locationNames)) {
    if (!imageNames.includes(imageName)) imageNames.push(imageName);
  }
  return imageNames;
}

function buildFiveSenseDescriptionForLocation(locationName, fiveSenseRows, locationNames) {
  const matched = fiveSenseRows.filter((row) =>
    fiveSenseRowBelongsToLocation(locationName, row.text, locationNames)
  );
  if (!matched.length) return null;
  return matched
    .map((row) => `[${senseLabel(row.senseType)}]\n${row.text}`)
    .join("\n\n");
}

function locationHasFiveSense(locationName, fiveSenseRows, locationNames) {
  return fiveSenseRows.some((row) =>
    fiveSenseRowBelongsToLocation(locationName, row.text, locationNames)
  );
}

function collectMatchedSenseImages(fiveSenseRows, locationName, locationNames) {
  const matched = fiveSenseRows.filter((row) =>
    fiveSenseRowBelongsToLocation(locationName, row.text, locationNames)
  );
  const imageNames = [];
  for (const row of matched) {
    for (const imageName of row.imageNames) {
      if (!imageNames.includes(imageName)) imageNames.push(imageName);
    }
  }
  return imageNames;
}

function buildUnmatchedFiveSenseSummary(fiveSenseRows, locationNames) {
  const unmatched = fiveSenseRows.filter(
    (row) => !resolvePrimaryLocationInText(row.text, locationNames)
  );
  if (!unmatched.length) return null;
  return unmatched
    .map((row) => `[${senseLabel(row.senseType)}]\n${row.text}`)
    .join("\n\n");
}

function collectUnmatchedSenseImages(fiveSenseRows, locationNames) {
  const imageNames = [];
  const unmatched = fiveSenseRows.filter(
    (row) => !resolvePrimaryLocationInText(row.text, locationNames)
  );
  for (const row of unmatched) {
    for (const imageName of row.imageNames) {
      if (!imageNames.includes(imageName)) imageNames.push(imageName);
    }
  }
  return imageNames;
}

async function ensureFixedColumns(studentId) {
  const { STAGE_COLUMNS } = require("./constants");
  const pool = getPool();
  const [columns] = await pool.query(
    `
    SELECT id, sort_order, stage_key, is_fixed_stage
    FROM board_columns
    WHERE student_id = ?
    ORDER BY sort_order ASC, id ASC
    `,
    [studentId]
  );

  const stageColumnIds = new Map();

  for (const stage of STAGE_COLUMNS) {
    const byKey = columns.filter((col) => col.stage_key === stage.key);
    let primary = byKey[0];

    if (!primary) {
      const legacy = columns.find(
        (col) => !col.stage_key && Number(col.sort_order) === stage.sortOrder
      );
      if (legacy) {
        await pool.query(
          `
          UPDATE board_columns
          SET title = ?, sort_order = ?, is_fixed_stage = 1, stage_key = ?
          WHERE id = ?
          `,
          [stage.title, stage.sortOrder, stage.key, legacy.id]
        );
        primary = { id: legacy.id };
      } else {
        const [result] = await pool.query(
          `
          INSERT INTO board_columns (student_id, title, sort_order, is_fixed_stage, stage_key)
          VALUES (?, ?, ?, 1, ?)
          `,
          [studentId, stage.title, stage.sortOrder, stage.key]
        );
        primary = { id: result.insertId };
      }
    } else {
      await pool.query(
        "UPDATE board_columns SET title = ?, sort_order = ?, is_fixed_stage = 1, stage_key = ? WHERE id = ?",
        [stage.title, stage.sortOrder, stage.key, primary.id]
      );
      for (const duplicate of byKey.slice(1)) {
        await pool.query("UPDATE board_cards SET column_id = ? WHERE column_id = ?", [
          primary.id,
          duplicate.id,
        ]);
        await pool.query("DELETE FROM board_columns WHERE id = ?", [duplicate.id]);
      }
    }

    stageColumnIds.set(stage.key, primary.id);
  }

  const [remainingLegacy] = await pool.query(
    `
    SELECT id
    FROM board_columns
    WHERE student_id = ?
      AND (stage_key IS NULL OR stage_key = '')
      AND sort_order < 3
    ORDER BY sort_order ASC, id ASC
    `,
    [studentId]
  );

  for (const legacy of remainingLegacy) {
    const [cards] = await pool.query(
      "SELECT id FROM board_cards WHERE column_id = ?",
      [legacy.id]
    );
    if (cards.length > 0) {
      await pool.query("UPDATE board_cards SET column_id = ? WHERE column_id = ?", [
        stageColumnIds.get("actual_trip"),
        legacy.id,
      ]);
    }
    await pool.query("DELETE FROM board_columns WHERE id = ?", [legacy.id]);
  }

  await pool.query(
    `
    UPDATE board_columns
    SET sort_order = sort_order + 3
    WHERE student_id = ?
      AND is_fixed_stage = 0
      AND sort_order < 3
    `,
    [studentId]
  );

  const [updated] = await pool.query(
    "SELECT id, stage_key FROM board_columns WHERE student_id = ? AND is_fixed_stage = 1 ORDER BY sort_order ASC",
    [studentId]
  );
  return updated;
}

async function importStudentDataset(studentEmail, uploadsDir, publicUrl) {
  const pool = getPool();
  const studentMeta = DATASET_STUDENTS.find((item) => item.email === studentEmail);
  if (!studentMeta) return { imported: 0 };

  const [memberRows] = await pool.query("SELECT id FROM members WHERE email = ? LIMIT 1", [studentEmail]);
  const studentId = memberRows[0]?.id;
  if (!studentId) return { imported: 0 };

  const studentDir = path.join(DATASET_ROOT, "Student Data", studentMeta.chineseName);
  if (!fs.existsSync(studentDir)) {
    console.warn(`Dataset folder missing for ${studentMeta.chineseName}`);
    return { imported: 0 };
  }

  const mapPath = findDatasetFile(studentDir, ["Map Location/MapLocation.xlsx"]);
  const fiveSensePath = findDatasetFile(studentDir, [
    "Five Senses/FiveSense.xlsx",
    "Five Sense/FiveSense.xlsx",
  ]);
  if (!mapPath) return { imported: 0 };

  const mapRows = readXlsxObjects(mapPath).map((row) => ({
    location: normalizeCellText(row.Location || row.location),
    inputText: normalizeCellText(row["Input Text"] || row.inputText),
    imageNames: collectImageNames(row),
  }));
  const fiveSenseRows = (fiveSensePath ? readXlsxObjects(fiveSensePath) : [])
    .map((row) => ({
      senseType: normalizeSenseType(row["Five Sense"] || row["Five sense"] || row.sense),
      text: normalizeCellText(row["Input Text"] || row.inputText),
      imageNames: collectImageNames(row),
    }))
    .filter((row) => row.text);

  const columns = await ensureFixedColumns(studentId);
  const actualTripColumn = columns.find((col) => col.stage_key === "actual_trip");
  const postTripColumn = columns.find((col) => col.stage_key === "post_trip");
  if (!actualTripColumn) return { imported: 0 };

  await pool.query(
    `
    DELETE ci FROM card_images ci
    JOIN board_cards c ON c.id = ci.card_id
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE bc.student_id = ?
    `,
    [studentId]
  );
  await pool.query(
    `
    DELETE clo FROM card_learning_objectives clo
    JOIN board_cards c ON c.id = clo.card_id
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE bc.student_id = ?
    `,
    [studentId]
  );
  await pool.query(
    `
    DELETE c FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE bc.student_id = ?
    `,
    [studentId]
  );

  let imported = 0;
  let actualTripSort = 0;
  let postTripSort = 0;
  const locationNames = mapRows.map((row) => row.location).filter(Boolean);
  for (let index = 0; index < mapRows.length; index += 1) {
    const mapRow = mapRows[index];
    if (!mapRow.location) continue;

    const checkpoint = resolveCheckpoint(mapRow.location);
    const hasFiveSense = locationHasFiveSense(mapRow.location, fiveSenseRows, locationNames);
    const targetColumn = hasFiveSense && postTripColumn ? postTripColumn : actualTripColumn;
    const sortOrder = hasFiveSense ? postTripSort : actualTripSort;
    if (hasFiveSense) postTripSort += 1;
    else actualTripSort += 1;

    const description = buildCardDescription(
      mapRow.location,
      mapRow.inputText,
      fiveSenseRows,
      locationNames
    );
    const [cardResult] = await pool.query(
      `
      INSERT INTO board_cards (
        column_id, title, description, location, activity_date, sort_order,
        checkpoint_id, lat, lng, record_type, source
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'imported')
      `,
      [
        targetColumn.id,
        mapRow.location,
        description,
        checkpoint?.nameChi || mapRow.location,
        sortOrder,
        checkpoint?.id || null,
        checkpoint?.lat ?? null,
        checkpoint?.lng ?? null,
        hasFiveSense ? "five_sense" : "map_location",
      ]
    );

    const cardId = cardResult.insertId;
    const allImageNames = collectCardImages(
      mapRow.imageNames,
      fiveSenseRows,
      mapRow.location,
      locationNames
    );
    for (let imageIndex = 0; imageIndex < allImageNames.length; imageIndex += 1) {
      const imageName = allImageNames[imageIndex];
      const sourcePath = findImageFile(studentDir, imageName);
      if (!sourcePath) continue;
      const filename = copyImageToUploads(sourcePath, uploadsDir);
      const imageUrl = `${publicUrl}/uploads/${filename}`;
      await pool.query("INSERT INTO card_images (card_id, image_url, sort_order) VALUES (?, ?, ?)", [
        cardId,
        imageUrl,
        imageIndex,
      ]);
    }
    imported += 1;
  }

  const unmatchedSummary = buildUnmatchedFiveSenseSummary(fiveSenseRows, locationNames);
  if (unmatchedSummary && postTripColumn) {
    const [summaryResult] = await pool.query(
      `
      INSERT INTO board_cards (
        column_id, title, description, location, sort_order, record_type, source
      ) VALUES (?, ?, ?, ?, ?, 'five_sense', 'imported')
      `,
      [
        postTripColumn.id,
        "五官感受紀錄",
        unmatchedSummary,
        "龍躍頭文物徑",
        postTripSort,
      ]
    );
    postTripSort += 1;
    imported += 1;

    const summaryCardId = summaryResult.insertId;
    const unmatchedImages = collectUnmatchedSenseImages(fiveSenseRows, locationNames);
    for (let imageIndex = 0; imageIndex < unmatchedImages.length; imageIndex += 1) {
      const imageName = unmatchedImages[imageIndex];
      const sourcePath = findImageFile(studentDir, imageName);
      if (!sourcePath) continue;
      const filename = copyImageToUploads(sourcePath, uploadsDir);
      await pool.query("INSERT INTO card_images (card_id, image_url, sort_order) VALUES (?, ?, ?)", [
        summaryCardId,
        `${publicUrl}/uploads/${filename}`,
        imageIndex,
      ]);
    }
  }

  return { imported, studentId };
}

async function importCurriculumObjectives() {
  const pool = getPool();
  const curriculumPath = path.join(DATASET_ROOT, "EDB_P4_人文科學課程_curriculum_總表.xlsx");
  if (!fs.existsSync(curriculumPath)) return 0;

  const { readXlsxRows } = require("./xlsx-reader");
  const AdmZip = require("adm-zip");
  const { XMLParser } = require("fast-xml-parser");
  const zip = new AdmZip(curriculumPath);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  function readSheet(sheetName) {
    const entry = zip.getEntry(`xl/worksheets/${sheetName}`);
    if (!entry) return [];
    const sharedEntry = zip.getEntry("xl/sharedStrings.xml");
    const sharedStrings = [];
    if (sharedEntry) {
      const sharedXml = parser.parse(sharedEntry.getData().toString("utf8"));
      const items = sharedXml?.sst?.si || [];
      const list = Array.isArray(items) ? items : [items];
      for (const item of list) {
        if (typeof item === "string") sharedStrings.push(item);
        else if (item.t !== undefined) sharedStrings.push(String(item.t));
        else if (item.r) {
          const runs = Array.isArray(item.r) ? item.r : [item.r];
          sharedStrings.push(runs.map((run) => String(run.t || "")).join(""));
        } else sharedStrings.push("");
      }
    }

    const sheetXml = parser.parse(entry.getData().toString("utf8"));
    const rowNodes = sheetXml?.worksheet?.sheetData?.row || [];
    const rows = Array.isArray(rowNodes) ? rowNodes : [rowNodes];
    const matrix = [];
    for (const row of rows) {
      const cells = row.c ? (Array.isArray(row.c) ? row.c : [row.c]) : [];
      for (const cell of cells) {
        const ref = cell["@_r"] || "A1";
        const match = /^([A-Z]+)(\d+)$/.exec(ref);
        const rowIndex = match ? Number(match[2]) - 1 : 0;
        const colLetters = match ? match[1] : "A";
        let colIndex = 0;
        for (let i = 0; i < colLetters.length; i += 1) {
          colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 64);
        }
        colIndex -= 1;
        if (!matrix[rowIndex]) matrix[rowIndex] = [];
        let value = "";
        if (cell["@_t"] === "s") value = sharedStrings[Number(cell.v)] || "";
        else if (cell.v !== undefined) value = String(cell.v);
        matrix[rowIndex][colIndex] = value;
      }
    }
    return matrix.filter((row) => row && row.some((cell) => String(cell || "").trim()));
  }

  let inserted = 0;
  const humanitiesRows = readSheet("sheet2.xml");
  if (humanitiesRows.length > 1) {
    for (const row of humanitiesRows.slice(1)) {
      const topicCode = String(row[0] || "").trim();
      const topic = String(row[1] || "").trim();
      const lessonCode = String(row[2] || "").trim();
      const lesson = String(row[3] || "").trim();
      const contentCode = String(row[4] || "").trim();
      const content = String(row[5] || "").trim();
      const objectiveCode = String(row[6] || "").trim();
      const description = String(row[7] || "").trim();
      if (!objectiveCode && !description) continue;

      const [existing] = await pool.query(
        "SELECT id FROM learning_objectives WHERE objective_code = ? AND category = 'humanities' LIMIT 1",
        [objectiveCode || contentCode]
      );
      if (existing.length) continue;

      await pool.query(
        `
        INSERT INTO learning_objectives (
          topic_code, topic, lesson_code, lesson, content_code, content,
          objective_code, description, category
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'humanities')
        `,
        [topicCode, topic, lessonCode, lesson, contentCode, content, objectiveCode || contentCode, description]
      );
      inserted += 1;
    }
  }

  const scienceRows = readSheet("sheet1.xml");
  if (scienceRows.length > 1) {
    for (const row of scienceRows.slice(1)) {
      const topicCode = String(row[0] || "").trim();
      const topic = String(row[1] || "").trim();
      const lessonCode = String(row[2] || "").trim();
      const lesson = String(row[3] || "").trim();
      const objectiveCode = String(row[4] || "").trim();
      const content = String(row[5] || "").trim();
      if (!objectiveCode && !content) continue;

      const [existing] = await pool.query(
        "SELECT id FROM learning_objectives WHERE objective_code = ? AND category = 'science' LIMIT 1",
        [objectiveCode]
      );
      if (existing.length) continue;

      await pool.query(
        `
        INSERT INTO learning_objectives (
          topic_code, topic, lesson_code, lesson, content_code, content,
          objective_code, description, category
        ) VALUES (?, ?, ?, ?, '', ?, ?, ?, 'science')
        `,
        [topicCode, topic, lessonCode, lesson, content, objectiveCode, content]
      );
      inserted += 1;
    }
  }

  return inserted;
}

async function importAllLearningContent(uploadsDir, publicUrl) {
  let totalCards = 0;
  for (const student of DATASET_STUDENTS) {
    const result = await importStudentDataset(student.email, uploadsDir, publicUrl);
    totalCards += result.imported || 0;
  }
  const objectives = await importCurriculumObjectives();
  return { totalCards, objectives };
}

module.exports = {
  importAllLearningContent,
  importStudentDataset,
  importCurriculumObjectives,
  ensureFixedColumns,
};
