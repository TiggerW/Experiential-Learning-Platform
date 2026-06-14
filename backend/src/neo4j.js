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

function quoteNeo4jIdentifier(name) {
  return `\`${String(name).replace(/`/g, "``")}\``;
}

async function canConnectAs(uri, user, password) {
  const tempDriver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  try {
    await tempDriver.verifyConnectivity();
    return true;
  } catch (_error) {
    return false;
  } finally {
    await tempDriver.close();
  }
}

async function ensureNeo4jAppUser() {
  const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
  const password = process.env.NEO4J_PASSWORD || "";
  const appUser = process.env.NEO4J_USER || "skyline_admin";
  const bootstrapUser = process.env.NEO4J_BOOTSTRAP_USER || "neo4j";

  if (!password) {
    throw new Error("NEO4J_PASSWORD is not configured. Set it in .env or container environment.");
  }

  if (appUser === bootstrapUser) {
    return;
  }

  if (await canConnectAs(uri, appUser, password)) {
    console.log(`Neo4j app user ready: ${appUser}`);
    return;
  }

  const bootstrapDriver = neo4j.driver(uri, neo4j.auth.basic(bootstrapUser, password));
  const session = bootstrapDriver.session();
  try {
    const existing = await session.run("SHOW USERS YIELD user WHERE user = $username RETURN user LIMIT 1", {
      username: appUser,
    });

    const quotedUser = quoteNeo4jIdentifier(appUser);
    if (existing.records.length === 0) {
      await session.run(`CREATE USER ${quotedUser} SET PASSWORD $password CHANGE NOT REQUIRED`, { password });
      await session.run(`GRANT ROLE admin TO ${quotedUser}`);
      console.log(`Neo4j app user created: ${appUser}`);
    } else {
      await session.run(`ALTER USER ${quotedUser} SET PASSWORD $password CHANGE NOT REQUIRED`, { password });
      console.log(`Neo4j app user password synced: ${appUser}`);
    }
  } finally {
    await session.close();
    await bootstrapDriver.close();
  }

  if (!(await canConnectAs(uri, appUser, password))) {
    throw new Error(`Neo4j app user "${appUser}" is not reachable after bootstrap.`);
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
  ensureNeo4jAppUser,
  verifyNeo4jConnection,
  closeNeo4j,
};
