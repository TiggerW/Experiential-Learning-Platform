const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

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
      name: "Emma Davis",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=emma",
    },
    {
      email: "student2@edulearn.com",
      name: "James Wilson",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=james",
    },
    {
      email: "student3@edulearn.com",
      name: "Olivia Brown",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=olivia",
    },
    {
      email: "student4@edulearn.com",
      name: "Noah Taylor",
      role: "student",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=noah",
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
    "student2@edulearn.com": "5A",
    "student3@edulearn.com": "5B",
    "student4@edulearn.com": "6A",
    "student5@edulearn.com": "6B",
  };
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
    "student1@edulearn.com": {
      columns: {
        todo: "準備清單",
        progress: "旅程進行中",
        done: "旅程回顧",
      },
      cards: [
        {
          column: "To Do",
          title: "迪士尼服務流程觀察",
          description: "觀察入園動線與排隊管理，記錄服務設計亮點。",
          location: "Hong Kong Disneyland Resort, Lantau Island, Hong Kong",
          activityDate: "2026-05-20",
          feedback: null,
          images: [],
        },
        {
          column: "In Progress",
          title: "昂坪 360 纜車數據紀錄",
          description: "整理纜車班次與旅客流量，製作折線圖。",
          location: "Ngong Ping 360 Cable Car Terminal, Tung Chung, Hong Kong",
          activityDate: "2026-05-22",
          feedback: null,
          images: [
            "https://images.unsplash.com/photo-1505764706515-aa95265c5abc?auto=format&fit=crop&w=1200&q=80",
          ],
        },
        {
          column: "Completed",
          title: "天壇大佛文化心得",
          description: "完成宗教建築觀察與文化反思 800 字。",
          location: "Tian Tan Buddha (Big Buddha), Ngong Ping, Hong Kong",
          activityDate: "2026-05-15",
          feedback: "文字流暢，文化脈絡清楚。",
          images: [],
        },
      ],
    },
    "student2@edulearn.com": {
      columns: {
        todo: "構思中",
        progress: "外出採集",
        done: "提交成果",
      },
      cards: [
        {
          column: "To Do",
          title: "西貢海岸環境調查",
          description: "規劃採樣點，記錄海岸垃圾分類數據。",
          location: "East Dam of High Island Reservoir, Sai Kung, Hong Kong",
          activityDate: "2026-05-21",
          feedback: null,
          images: [],
        },
        {
          column: "In Progress",
          title: "彩虹邨建築色彩分析",
          description: "整理色彩搭配與公共空間使用觀察。",
          location: "Choi Hung Estate, Wong Tai Sin, Hong Kong",
          activityDate: "2026-05-23",
          feedback: null,
          images: [
            "https://images.unsplash.com/photo-1531572753322-ad063cecc140?auto=format&fit=crop&w=1200&q=80",
          ],
        },
        {
          column: "Completed",
          title: "星光大道人物研究",
          description: "完成 3 位香港電影人的背景與作品比較。",
          location: "Avenue of Stars, Tsim Sha Tsui, Hong Kong",
          activityDate: "2026-05-14",
          feedback: "比較方法有條理，值得延伸。",
          images: [],
        },
      ],
    },
    "student3@edulearn.com": {
      columns: {
        todo: "待安排",
        progress: "田野觀察",
        done: "成果展示",
      },
      cards: [
        {
          column: "To Do",
          title: "南丫島步道生態筆記",
          description: "記錄步道植物與海岸地形特徵。",
          location: "Yung Shue Wan, Lamma Island, Hong Kong",
          activityDate: "2026-05-25",
          feedback: null,
          images: [],
        },
        {
          column: "In Progress",
          title: "黃大仙廟節慶文化觀察",
          description: "採訪 2 位旅客，整理參拜動線與禮儀。",
          location: "Wong Tai Sin Temple, Hong Kong",
          activityDate: "2026-05-27",
          feedback: null,
          images: [],
        },
        {
          column: "Completed",
          title: "M+ 展覽學習反思",
          description: "提交當代藝術展觀後心得與案例分析。",
          location: "M+ Museum, West Kowloon Cultural District, Hong Kong",
          activityDate: "2026-05-16",
          feedback: "案例挑選很到位，分析完整。",
          images: [
            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
          ],
        },
      ],
    },
    "student4@edulearn.com": {
      columns: {
        todo: "研究題目",
        progress: "資料整理",
        done: "已完成",
      },
      cards: [
        {
          column: "To Do",
          title: "赤柱海濱商圈調查",
          description: "調查商圈客群分布與品牌類型。",
          location: "Stanley Plaza, Stanley, Hong Kong",
          activityDate: "2026-05-19",
          feedback: null,
          images: [],
        },
        {
          column: "In Progress",
          title: "香港公園生物多樣性記錄",
          description: "拍攝與辨識 10 種園區動植物。",
          location: "Hong Kong Park, Central, Hong Kong",
          activityDate: "2026-05-24",
          feedback: null,
          images: [
            "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
          ],
        },
        {
          column: "Completed",
          title: "山頂纜車交通史研究",
          description: "完成纜車發展歷程時間軸與簡報。",
          location: "The Peak Tram Lower Terminus, Central, Hong Kong",
          activityDate: "2026-05-12",
          feedback: "資料來源完整，圖表清晰。",
          images: [],
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

  const [students] = await pool.query("SELECT id FROM members WHERE role = 'student' ORDER BY id ASC");
  for (const student of students) {
    const studentId = student.id;
    const [studentRow] = await pool.query("SELECT email FROM members WHERE id = ?", [studentId]);
    const studentEmail = studentRow[0]?.email;

    const profile = demoStudentProfiles[studentEmail];

    const [columnRows] = await pool.query(
      "SELECT id, title, sort_order FROM board_columns WHERE student_id = ? ORDER BY sort_order ASC, id ASC",
      [studentId]
    );

    let columns = columnRows;
    if (columns.length === 0) {
      const todoTitle = profile?.columns?.todo || "To Do";
      const progressTitle = profile?.columns?.progress || "In Progress";
      const doneTitle = profile?.columns?.done || "Completed";
      await pool.query(
        "INSERT INTO board_columns (student_id, title, sort_order) VALUES (?, ?, 0), (?, ?, 1), (?, ?, 2)",
        [studentId, todoTitle, studentId, progressTitle, studentId, doneTitle]
      );
      const [createdColumns] = await pool.query(
        "SELECT id, title, sort_order FROM board_columns WHERE student_id = ? ORDER BY sort_order ASC, id ASC",
        [studentId]
      );
      columns = createdColumns;
    }

    const todoColumn = columns.find((c) => c.sort_order === 0) || columns[0];
    const progressColumn = columns.find((c) => c.sort_order === 1) || columns[1] || columns[0];
    const doneColumn = columns.find((c) => c.sort_order === 2) || columns[2] || columns[0];

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
      await pool.query("UPDATE board_columns SET title = ? WHERE id = ?", [profile.columns.todo, todoColumn.id]);
      await pool.query("UPDATE board_columns SET title = ? WHERE id = ?", [
        profile.columns.progress,
        progressColumn.id,
      ]);
      await pool.query("UPDATE board_columns SET title = ? WHERE id = ?", [profile.columns.done, doneColumn.id]);

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

    if (shouldSeedDemoCards && profile) {
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
}

module.exports = { pool, initDatabase };
