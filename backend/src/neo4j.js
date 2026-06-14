const neo4j = require("neo4j-driver");

let driver = null;

function getDriver() {
  if (driver) return driver;
  const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
  const user = process.env.NEO4J_USER || "skyline_admin";
  const password = process.env.NEO4J_PASSWORD || "";
  if (!password) {
    throw new Error("NEO4J_PASSWORD is not configured. Set it in .env or container environment.");
  }
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return driver;
}

async function runQuery(cypher, params = {}) {
  const session = getDriver().session();
  try {
    return await session.executeWrite((tx) => tx.run(cypher, params));
  } finally {
    await session.close();
  }
}

async function runReadQuery(cypher, params = {}) {
  const session = getDriver().session();
  try {
    return await session.executeRead((tx) => tx.run(cypher, params));
  } finally {
    await session.close();
  }
}

async function verifyNeo4jConnection(maxAttempts = 20, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runReadQuery("RETURN 1 AS ok");
      return true;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      console.log(`Neo4j not ready (attempt ${attempt}/${maxAttempts}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

async function closeNeo4j() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

module.exports = {
  getDriver,
  runQuery,
  runReadQuery,
  verifyNeo4jConnection,
  closeNeo4j,
};
