const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const { DATASET_STUDENTS, STAGE_COLUMNS } = require("./constants");

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || "localhost",
  user: process.env.DATABASE_USER || "root",
  password: process.env.DATABASE_PASSWORD || "",
  database: process.env.DATABASE_NAME || "skyline",
  waitForConnections: true,
  connectionLimit: 10,
});

async function addColumnIfMissing(tableName, columnName, definitionSql) {
  const dbName = process.env.DATABASE_NAME || "skyline";
  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
    `,
    [dbName, tableName, columnName]
  );
  if (rows[0].count === 0) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definitionSql}`);
  }
}

async function initDatabase() {
  const dbName = process.env.DATABASE_NAME || "skyline";
  const adminConn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || "localhost",
    user: process.env.DATABASE_USER || "root",
    password: process.env.DATABASE_PASSWORD || "",
  });
  await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await adminConn.end();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role ENUM('student', 'teacher', 'admin') NOT NULL,
      avatar VARCHAR(512) DEFAULT '',
      school VARCHAR(255) DEFAULT '',
      class_name VARCHAR(255) DEFAULT '',
      advisor_teacher_id INT DEFAULT NULL,
      bio TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing("members", "school", "school VARCHAR(255) DEFAULT ''");
  await addColumnIfMissing("members", "class_name", "class_name VARCHAR(255) DEFAULT ''");
  await addColumnIfMissing("members", "advisor_teacher_id", "advisor_teacher_id INT DEFAULT NULL");
  await addColumnIfMissing("members", "bio", "bio TEXT DEFAULT NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_columns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_cards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      column_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      location VARCHAR(255) NOT NULL,
      activity_date DATE DEFAULT NULL,
      feedback TEXT DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE CASCADE
    )
  `);

  await addColumnIfMissing("board_cards", "activity_date", "activity_date DATE DEFAULT NULL");
  await addColumnIfMissing("board_columns", "is_fixed_stage", "is_fixed_stage TINYINT(1) NOT NULL DEFAULT 0");
  await addColumnIfMissing("board_columns", "stage_key", "stage_key VARCHAR(64) DEFAULT NULL");
  await addColumnIfMissing("board_cards", "checkpoint_id", "checkpoint_id VARCHAR(64) DEFAULT NULL");
  await addColumnIfMissing("board_cards", "lat", "lat DECIMAL(10,8) DEFAULT NULL");
  await addColumnIfMissing("board_cards", "lng", "lng DECIMAL(11,8) DEFAULT NULL");
  await addColumnIfMissing("board_cards", "record_type", "record_type VARCHAR(32) NOT NULL DEFAULT 'general'");
  await addColumnIfMissing("board_cards", "source", "source VARCHAR(32) NOT NULL DEFAULT 'manual'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      card_id INT NOT NULL,
      image_url VARCHAR(1024) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (card_id) REFERENCES board_cards(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_objectives (
      id INT AUTO_INCREMENT PRIMARY KEY,
      topic_code VARCHAR(64) DEFAULT '',
      topic VARCHAR(255) DEFAULT '',
      lesson_code VARCHAR(64) DEFAULT '',
      lesson VARCHAR(255) DEFAULT '',
      content_code VARCHAR(64) DEFAULT '',
      content TEXT,
      objective_code VARCHAR(64) NOT NULL,
      description TEXT,
      category VARCHAR(64) DEFAULT 'general',
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_objective_code_category (objective_code, category)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_learning_objectives (
      card_id INT NOT NULL,
      objective_id INT NOT NULL,
      assigned_by INT DEFAULT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (card_id, objective_id),
      FOREIGN KEY (card_id) REFERENCES board_cards(id) ON DELETE CASCADE,
      FOREIGN KEY (objective_id) REFERENCES learning_objectives(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS skills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_skills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      skill_id INT NOT NULL,
      level ENUM('emerging', 'developing', 'proficient', 'advanced') NOT NULL DEFAULT 'developing',
      evidence TEXT,
      card_id INT DEFAULT NULL,
      status ENUM('suggested', 'confirmed', 'rejected') NOT NULL DEFAULT 'confirmed',
      source ENUM('manual', 'inferred') NOT NULL DEFAULT 'manual',
      inference_reason TEXT DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_student_skill_card (student_id, skill_id, card_id),
      FOREIGN KEY (student_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES board_cards(id) ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing("student_skills", "status", "status ENUM('suggested', 'confirmed', 'rejected') NOT NULL DEFAULT 'confirmed'");
  await addColumnIfMissing("student_skills", "source", "source ENUM('manual', 'inferred') NOT NULL DEFAULT 'manual'");
  await addColumnIfMissing("student_skills", "inference_reason", "inference_reason TEXT DEFAULT NULL");

  const [studentIdx] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_skills' AND INDEX_NAME = 'idx_student_skills_student'
    `,
    [dbName]
  );
  if (studentIdx[0].count === 0) {
    await pool.query("ALTER TABLE student_skills ADD INDEX idx_student_skills_student (student_id)");
  }

  const [oldUnique] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_skills' AND INDEX_NAME = 'uniq_student_skill'
    `,
    [dbName]
  );
  if (oldUnique[0].count > 0) {
    await pool.query("ALTER TABLE student_skills DROP INDEX uniq_student_skill");
  }
  const [newUnique] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_skills' AND INDEX_NAME = 'uniq_student_skill_card'
    `,
    [dbName]
  );
  if (newUnique[0].count === 0) {
    await pool.query(
      "ALTER TABLE student_skills ADD UNIQUE KEY uniq_student_skill_card (student_id, skill_id, card_id)"
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_objective_skills (
      objective_id INT NOT NULL,
      skill_id INT NOT NULL,
      PRIMARY KEY (objective_id, skill_id),
      FOREIGN KEY (objective_id) REFERENCES learning_objectives(id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      role ENUM('user', 'assistant') NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ai_chat_user_created (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  const passwordHash = await bcrypt.hash("password123", 10);
  const seedMembers = [
    {
      email: "student@edulearn.com",
      name: "Alex Johnson",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alex",
    },
    {
      email: "teacher@edulearn.com",
      name: "Dr. Sarah Williams",
      role: "teacher",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sarah",
    },
    {
      email: "admin@edulearn.com",
      name: "Michael Chen",
      role: "admin",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=michael",
    },
    {
      email: "student1@edulearn.com",
      name: "Chan Yuet Kwan",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=chan-yuet-kwan",
    },
    {
      email: "student2@edulearn.com",
      name: "Chan Hon Lam",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=chan-hon-lam",
    },
    {
      email: "student3@edulearn.com",
      name: "Hung Hou Long",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=hung-hou-long",
    },
    {
      email: "student4@edulearn.com",
      name: "Wong Pak Yin",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=wong-pak-yin",
    },
    {
      email: "student5@edulearn.com",
      name: "Sophia Martin",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sophia",
    },
  ];

  for (const member of seedMembers) {
    await pool.query(
      `
      INSERT INTO members (email, password_hash, name, role, avatar)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        role = VALUES(role),
        avatar = VALUES(avatar)
      `,
      [member.email, passwordHash, member.name, member.role, member.avatar]
    );
  }

  const [teacherRows] = await pool.query(
    "SELECT id FROM members WHERE email = 'teacher@edulearn.com' LIMIT 1"
  );
  const defaultTeacherId = teacherRows[0]?.id || null;
  const studentClassMap = {
    "student@edulearn.com": "4A",
    "student1@edulearn.com": "4B",
    "student2@edulearn.com": "4B",
    "student3@edulearn.com": "4B",
    "student4@edulearn.com": "4B",
    "student5@edulearn.com": "6B",
  };
  for (const datasetStudent of DATASET_STUDENTS) {
    studentClassMap[datasetStudent.email] = datasetStudent.className;
  }
  for (const [email, className] of Object.entries(studentClassMap)) {
    await pool.query(
      "UPDATE members SET class_name = ?, advisor_teacher_id = ? WHERE email = ?",
      [className, defaultTeacherId, email]
    );
  }

  const demoStudentProfiles = {
    "student@edulearn.com": {
      columns: {
        todo: "Pretrip",
        progress: "Actual Trip",
        done: "Post Trip Reflection",
      },
      cards: [
        {
          column: "To Do",
          title: "維港日落攝影練習",
          description: "規劃黃昏時段在尖沙咀海旁拍攝，練習長曝光與構圖。",
          location: "Tsim Sha Tsui Promenade, Hong Kong",
          activityDate: "2026-05-24",
          feedback: null,
          images: [
            "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1200&q=80",
          ],
        },
        {
          column: "In Progress",
          title: "太平山口述報告",
          description: "整理山頂歷史資料，準備 5 分鐘簡報。",
          location: "The Peak, Hong Kong",
          activityDate: "2026-05-26",
          feedback: null,
          images: [],
        },
        {
          column: "Completed",
          title: "中環壁畫導覽紀錄",
          description: "完成 Sheung Wan 街頭藝術路線，提交導覽筆記。",
          location: "Hollywood Road, Central, Hong Kong",
          activityDate: "2026-05-18",
          feedback: "內容完整，觀察角度很好。",
          images: [
            "https://images.unsplash.com/photo-1526481280695-3c4693b5d2ac?auto=format&fit=crop&w=1200&q=80",
          ],
        },
      ],
    },
    "student5@edulearn.com": {
      columns: {
        todo: "行前準備",
        progress: "現場記錄",
        done: "反思與分享",
      },
      cards: [
        {
          column: "To Do",
          title: "金紫荊廣場歷史導覽稿",
          description: "撰寫 3 分鐘導覽稿並錄音練習。",
          location: "Golden Bauhinia Square, Wan Chai, Hong Kong",
          activityDate: "2026-05-26",
          feedback: null,
          images: [],
        },
        {
          column: "In Progress",
          title: "香港濕地公園觀鳥紀錄",
          description: "整理觀鳥路線，記錄鳥種與時間。",
          location: "Hong Kong Wetland Park, Tin Shui Wai, Hong Kong",
          activityDate: "2026-05-28",
          feedback: null,
          images: [
            "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1200&q=80",
          ],
        },
        {
          column: "Completed",
          title: "大館建築活化案例分析",
          description: "比較活化前後功能，完成個案報告。",
          location: "Tai Kwun, Central, Hong Kong",
          activityDate: "2026-05-17",
          feedback: "分析角度新穎，結論明確。",
          images: [],
        },
      ],
    },
  };

  const datasetEmails = new Set(DATASET_STUDENTS.map((item) => item.email));
  const [students] = await pool.query("SELECT id FROM members WHERE role = 'student' ORDER BY id ASC");
  for (const student of students) {
    const studentId = student.id;
    const [studentRow] = await pool.query("SELECT email FROM members WHERE id = ?", [studentId]);
    const studentEmail = studentRow[0]?.email;

    const profile = demoStudentProfiles[studentEmail];
    const { ensureFixedColumns } = require("./learning-import");
    await ensureFixedColumns(studentId);

    const [columnRows] = await pool.query(
      "SELECT id, title, sort_order, stage_key FROM board_columns WHERE student_id = ? ORDER BY sort_order ASC, id ASC",
      [studentId]
    );
    const columns = columnRows;

    const todoColumn =
      columns.find((c) => c.stage_key === "pretrip") || columns.find((c) => c.sort_order === 0) || columns[0];
    const progressColumn =
      columns.find((c) => c.stage_key === "actual_trip") || columns.find((c) => c.sort_order === 1) || columns[0];
    const doneColumn =
      columns.find((c) => c.stage_key === "post_trip") || columns.find((c) => c.sort_order === 2) || columns[0];

    const [existingCards] = await pool.query(
      `
      SELECT c.id, c.title
      FROM board_cards c
      JOIN board_columns bc ON bc.id = c.column_id
      WHERE bc.student_id = ?
      `,
      [studentId]
    );

    const oldTemplateTitles = new Set(["Science Fair Project", "History Essay", "Art Project"]);
    const hasOnlyOldTemplate =
      existingCards.length > 0 && existingCards.every((card) => oldTemplateTitles.has(card.title));
    const shouldSeedDemoCards = existingCards.length === 0 || hasOnlyOldTemplate;

    if (profile) {
      for (const stage of STAGE_COLUMNS) {
        const column = columns.find((item) => item.stage_key === stage.key);
        if (column) {
          await pool.query("UPDATE board_columns SET title = ?, is_fixed_stage = 1 WHERE id = ?", [
            stage.title,
            column.id,
          ]);
        }
      }

      // Keep seeded demo cards aligned with canonical locations and activity dates.
      await Promise.all(
        profile.cards.map((item) =>
          pool.query(
            `
            UPDATE board_cards c
            JOIN board_columns bc ON bc.id = c.column_id
            SET c.location = ?, c.activity_date = ?
            WHERE bc.student_id = ? AND c.title = ?
            `,
            [item.location, item.activityDate || null, studentId, item.title]
          )
        )
      );
    }

    if (shouldSeedDemoCards && profile && !datasetEmails.has(studentEmail)) {
      if (existingCards.length > 0) {
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
          DELETE c FROM board_cards c
          JOIN board_columns bc ON bc.id = c.column_id
          WHERE bc.student_id = ?
          `,
          [studentId]
        );
      }

      for (let i = 0; i < profile.cards.length; i += 1) {
        const item = profile.cards[i];
        const columnId =
          item.column === "In Progress"
            ? progressColumn.id
            : item.column === "Completed"
              ? doneColumn.id
              : todoColumn.id;

        const [cardResult] = await pool.query(
          "INSERT INTO board_cards (column_id, title, description, location, activity_date, feedback, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [columnId, item.title, item.description, item.location, item.activityDate || null, item.feedback, i]
        );

        if (item.images.length > 0) {
          await Promise.all(
            item.images.map((url, index) =>
              pool.query(
                "INSERT INTO card_images (card_id, image_url, sort_order) VALUES (?, ?, ?)",
                [cardResult.insertId, url, index]
              )
            )
          );
        }
      }
    }
  }

  const { getDefaultSkillsForSeed } = require("./skills-catalog");
  const defaultSkills = getDefaultSkillsForSeed();
  for (const skill of defaultSkills) {
    const [existing] = await pool.query("SELECT id FROM skills WHERE name = ? LIMIT 1", [skill.name]);
    if (!existing.length) {
      await pool.query("INSERT INTO skills (name, description) VALUES (?, ?)", [skill.name, skill.description]);
    }
  }
}

module.exports = { pool, initDatabase };
