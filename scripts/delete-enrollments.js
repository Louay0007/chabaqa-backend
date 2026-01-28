const { MongoClient, ObjectId } = require("mongodb");

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const dryRun = (process.env.DRY_RUN ?? "true") === "true";

  if (!mongoUri) throw new Error("Missing MONGO_URI env var");

  const client = new MongoClient(mongoUri, { ignoreUndefined: true });

  try {
    await client.connect();

    // Try common database names
    const dbNamesToTry = ["chabaqa", "chabaqa-dev", "chabaqa-prod", "test"];
    let db = null;
    let dbName = null;
    let collections = [];

    for (const name of dbNamesToTry) {
      try {
        const testDb = client.db(name);
        const testCollections = await testDb.listCollections({}, { nameOnly: true }).toArray();
        if (testCollections.length > 0) {
          db = testDb;
          dbName = name;
          collections = testCollections;
          console.log(`[INFO] Found database: ${name} with ${collections.length} collections`);
          break;
        }
      } catch (err) {
        // Continue to next database
      }
    }

    if (!db) {
      // Try the specified DB_NAME even if empty
      dbName = process.env.DB_NAME || "chabaqa";
      db = client.db(dbName);
      collections = await db.listCollections({}, { nameOnly: true }).toArray();
      console.log(`[INFO] Using database: ${dbName} (empty or no access)`);
    }

    const existingNames = new Set(collections.map((c) => c.name));
    
    console.log(`[INFO] Available collections in ${dbName}: ${[...existingNames].join(", ")}`);
    
    // Try common collection names (depends on your actual Mongo collection naming)
    const collectionsToTry = ["courseenrollments", "course_enrollments", "CourseEnrollment", "courseenrollment"];
    const collectionName = collectionsToTry.find((c) => existingNames.has(c));

    if (!collectionName) {
      console.log(`[ERROR] Could not find CourseEnrollment collection. Available: ${[...existingNames].join(", ")}`);
      throw new Error("Please update the collection name in the script");
    }

    const col = db.collection(collectionName);

    // Delete ALL enrollments from ALL users
    const filter = {}; // Empty filter matches all documents

    const count = await col.countDocuments(filter);
    console.log(`[INFO] Collection: ${collectionName}`);
    console.log(`[INFO] Total enrollments to delete: ${count}`);

    if (dryRun) {
      console.log("[DRY_RUN=true] No deletions executed.");
      return;
    }

    const res = await col.deleteMany(filter);
    console.log(`[OK] Deleted ALL enrollments: ${res.deletedCount}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
