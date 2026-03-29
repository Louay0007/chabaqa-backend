const mongoose = require('mongoose');
const crypto = require('crypto');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

if (!MONGO_URI) {
  console.error('Missing MONGO_URI');
  process.exit(1);
}

const attendeeSchema = new mongoose.Schema(
  {
    id: String,
    userId: mongoose.Schema.Types.ObjectId,
    ticketType: String,
    registeredAt: Date,
    checkedIn: Boolean,
    checkedInAt: Date,
  },
  { _id: false },
);

const eventSchema = new mongoose.Schema(
  {
    id: String,
    attendees: [attendeeSchema],
  },
  { collection: 'events', strict: false },
);

const EventModel = mongoose.model('Event', eventSchema);

function buildAttendeeId(eventIdentifier, userId) {
  const seed = `${eventIdentifier}:${userId}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
}

async function run() {
  await mongoose.connect(MONGO_URI, DB_NAME ? { dbName: DB_NAME } : undefined);
  console.log('Connected to MongoDB');

  const cursor = EventModel.find({ 'attendees.id': { $in: [null, ''] } }).cursor();
  let updatedEvents = 0;
  let updatedAttendees = 0;

  for await (const event of cursor) {
    const eventIdentifier = event.id || String(event._id);
    let changed = false;

    for (const attendee of event.attendees || []) {
      if (!attendee) continue;
      if (!attendee.id) {
        attendee.id = buildAttendeeId(eventIdentifier, String(attendee.userId || 'unknown'));
        updatedAttendees += 1;
        changed = true;
      }
      if (!attendee.ticketType) {
        attendee.ticketType = 'general';
        updatedAttendees += 1;
        changed = true;
      }
    }

    if (changed) {
      await event.save();
      updatedEvents += 1;
    }
  }

  console.log(`Backfill complete. Updated events: ${updatedEvents}, updated attendees: ${updatedAttendees}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
