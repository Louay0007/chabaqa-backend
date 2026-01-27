import * as fc from 'fast-check';
import { Types } from 'mongoose';
import { CreateEventSessionDto, CreateEventTicketDto, CreateEventSpeakerDto } from '../../dto-event/create-event.dto';

/**
 * Generate a valid ObjectId string
 */
export const objectIdArbitrary = fc.stringMatching(/^[0-9a-f]{24}$/);

/**
 * Generate a valid event session
 */
export const eventSessionArbitrary: fc.Arbitrary<CreateEventSessionDto & { id?: string }> = fc.record({
  id: fc.option(objectIdArbitrary, { nil: undefined }),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  description: fc.string({ minLength: 1, maxLength: 1000 }),
  startTime: fc.string({ minLength: 1, maxLength: 10 }),
  endTime: fc.string({ minLength: 1, maxLength: 10 }),
  speaker: fc.string({ minLength: 1, maxLength: 100 }),
  notes: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
  isActive: fc.option(fc.boolean(), { nil: undefined }),
  attendance: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
});

/**
 * Generate a valid event ticket
 */
export const eventTicketArbitrary: fc.Arbitrary<CreateEventTicketDto & { id?: string; sold?: number }> = fc.record({
  id: fc.option(objectIdArbitrary, { nil: undefined }),
  type: fc.constantFrom('regular', 'vip', 'early-bird', 'student', 'free'),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  price: fc.float({ min: 0, max: 10000 }),
  description: fc.string({ minLength: 1, maxLength: 500 }),
  quantity: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
  sold: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
});

/**
 * Generate a valid event speaker
 */
export const eventSpeakerArbitrary: fc.Arbitrary<CreateEventSpeakerDto & { id?: string }> = fc.record({
  id: fc.option(objectIdArbitrary, { nil: undefined }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  bio: fc.string({ minLength: 1, maxLength: 1000 }),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  photo: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
});

/**
 * Generate an array of event sessions
 */
export const eventSessionsArbitrary = fc.array(eventSessionArbitrary, { minLength: 0, maxLength: 20 });

/**
 * Generate an array of event tickets
 */
export const eventTicketsArbitrary = fc.array(eventTicketArbitrary, { minLength: 0, maxLength: 10 });

/**
 * Generate an array of event speakers
 */
export const eventSpeakersArbitrary = fc.array(eventSpeakerArbitrary, { minLength: 0, maxLength: 20 });

/**
 * Generate a complete event update DTO with sub-entities
 */
export const eventUpdateDtoArbitrary = fc.record({
  title: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  description: fc.option(fc.string({ minLength: 1, maxLength: 2000 }), { nil: undefined }),
  sessions: fc.option(eventSessionsArbitrary, { nil: undefined }),
  tickets: fc.option(eventTicketsArbitrary, { nil: undefined }),
  speakers: fc.option(eventSpeakersArbitrary, { nil: undefined }),
});
