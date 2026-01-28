const { MongoClient } = require("mongodb");
require("dotenv").config();

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const dryRun = (process.env.DRY_RUN ?? "true") === "true";

  if (!mongoUri) {
    throw new Error("Missing MONGO_URI env var");
  }

  const client = new MongoClient(mongoUri, { ignoreUndefined: true });

  try {
    await client.connect();

    const dbName = process.env.DB_NAME || "chabaqa";
    const db = client.db(dbName);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = collections.map((c) => c.name);

    console.log(`[INFO] Connected to DB: ${dbName}`);
    console.log(`[INFO] Collections: ${collectionNames.join(", ") || "<none>"}`);

    if (dryRun) {
      console.log("[DRY_RUN=true] No deletions executed.");
      return;
    }

    for (const name of collectionNames) {
      const res = await db.collection(name).deleteMany({});
      console.log(`[OK] Cleared ${name}: ${res.deletedCount}`);
    }

    console.log("[DONE] Database wipe complete.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
