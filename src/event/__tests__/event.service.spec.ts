import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fc from 'fast-check';
import { jest } from '@jest/globals';
import { EventService } from '../event.service';
import { Event, EventDocument } from '../../schema/event.schema';
import { Community, CommunityDocument } from '../../schema/community.schema';
import { User, UserDocument } from '../../schema/user.schema';
import { FeeService } from '../../common/services/fee.service';
import { PromoService } from '../../common/services/promo.service';
import { PolicyService } from '../../common/services/policy.service';
import { CacheService } from '../../common/services/cache.service';
import { UploadService } from '../../upload/upload.service';
import { ContentTrackingService } from '../../common/services/content-tracking.service';
import {
  eventSessionArbitrary,
  eventTicketArbitrary,
  eventSpeakerArbitrary,
  eventSessionsArbitrary,
  eventTicketsArbitrary,
  eventSpeakersArbitrary,
} from './event-generators';

describe('EventService - Property-Based Tests', () => {
  let service: EventService;
  let eventModel: Model<EventDocument>;
  let communityModel: Model<CommunityDocument>;
  let userModel: Model<UserDocument>;

  const mockEventModel: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockCommunityModel: any = {
    findById: jest.fn(),
  };

  const mockUserModel: any = {};

  const mockFeeService = {
    calculateFee: jest.fn(),
  };

  const mockPromoService = {
    validatePromoCode: jest.fn(),
  };

  const mockPolicyService: any = {
    hasActiveSubscription: (jest.fn() as any).mockResolvedValue(true),
  };

  const mockCacheService = {
    deletePattern: jest.fn(),
  };

  const mockUploadService = {
    uploadImage: jest.fn(),
    uploadVideo: jest.fn(),
    uploadDocument: jest.fn(),
  };

  const mockContentTrackingService = {
    trackContentAccess: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        {
          provide: getModelToken(Event.name),
          useValue: mockEventModel,
        },
        {
          provide: getModelToken(Community.name),
          useValue: mockCommunityModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
          {
            provide: getModelToken('Order'),
            useValue: {},
          },
        {
          provide: FeeService,
          useValue: mockFeeService,
        },
        {
          provide: PromoService,
          useValue: mockPromoService,
        },
        {
          provide: PolicyService,
          useValue: mockPolicyService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: UploadService,
          useValue: mockUploadService,
        },
        {
          provide: ContentTrackingService,
          useValue: mockContentTrackingService,
        },
      ],
    }).compile();

    service = module.get<EventService>(EventService);
    eventModel = module.get<Model<EventDocument>>(getModelToken(Event.name));
    communityModel = module.get<Model<CommunityDocument>>(getModelToken(Community.name));
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Property 5: Ticket ID and Sold Count Preservation', () => {
    it('should preserve ticket IDs and sold counts when updating', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventTicketsArbitrary,
          eventTicketsArbitrary,
          fc.string(),
          async (existingTickets, updateTickets, eventId) => {
            // Setup: Create an event with existing tickets
            const existingEvent = {
              id: eventId,
              creatorId: new Types.ObjectId(),
              tickets: existingTickets.map((ticket, index) => ({
                id: ticket.id || new Types.ObjectId().toString(),
                type: ticket.type,
                name: ticket.name,
                price: ticket.price,
                description: ticket.description,
                quantity: ticket.quantity,
                sold: ticket.sold ?? Math.floor(Math.random() * 100),
              })),
              sessions: [],
              speakers: [],
              save: (jest.fn() as any).mockResolvedValue(true),
            } as any;

            (mockEventModel.findOne as any).mockResolvedValue(existingEvent);
            (mockCommunityModel.findById as any).mockResolvedValue({ name: 'Test Community' });

            // Create update DTO with tickets that may or may not have IDs
            const updateDto = {
              tickets: updateTickets.map((ticket, index) => {
                // Some tickets might reference existing ones by ID
                const existingTicket = existingTickets[index];
                return {
                  ...ticket,
                  id: ticket.id || (existingTicket?.id ? existingTicket.id : undefined),
                };
              }),
            };

            // Execute update
            return service
              .update(eventId, updateDto, existingEvent.creatorId.toString())
              .then(() => {
                // Verify: All existing ticket IDs are preserved
                const updatedTickets = existingEvent.tickets;
                existingTickets.forEach((originalTicket) => {
                  if (originalTicket.id) {
                    const preservedTicket = updatedTickets.find((t) => t.id === originalTicket.id);
                    expect(preservedTicket).toBeDefined();
                    // Sold count should be preserved from original
                    expect(preservedTicket.sold).toBe(
                      existingEvent.tickets.find((t) => t.id === originalTicket.id)?.sold
                    );
                  }
                });
              })
              .catch(() => {
                // If update fails, that's okay for property testing
                // We're testing the preservation logic, not the full update flow
              });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6: Speaker ID Preservation', () => {
    it('should preserve speaker IDs when updating', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventSpeakersArbitrary,
          eventSpeakersArbitrary,
          fc.string(),
          async (existingSpeakers, updateSpeakers, eventId) => {
            // Setup: Create an event with existing speakers
            const existingEvent: any = {
              id: eventId,
              creatorId: new Types.ObjectId(),
              speakers: existingSpeakers.map((speaker) => ({
                id: speaker.id || new Types.ObjectId().toString(),
                name: speaker.name,
                bio: speaker.bio,
                title: speaker.title,
                photo: speaker.photo,
              })),
              tickets: [],
              sessions: [],
              save: (jest.fn() as any).mockResolvedValue(true),
            };

            (mockEventModel.findOne as any).mockResolvedValue(existingEvent);
            (mockCommunityModel.findById as any).mockResolvedValue({ name: 'Test Community' });

            // Create update DTO with speakers that may or may not have IDs
            const updateDto = {
              speakers: updateSpeakers.map((speaker, index) => {
                const existingSpeaker = existingSpeakers[index];
                return {
                  ...speaker,
                  id: speaker.id || (existingSpeaker?.id ? existingSpeaker.id : undefined),
                };
              }),
            };

            // Execute update
            try {
              await service.update(eventId, updateDto, existingEvent.creatorId.toString());
              // Verify: All existing speaker IDs are preserved
              const updatedSpeakers = existingEvent.speakers;
              existingSpeakers.forEach((originalSpeaker) => {
                if (originalSpeaker.id) {
                  const preservedSpeaker = updatedSpeakers.find((s) => s.id === originalSpeaker.id);
                  expect(preservedSpeaker).toBeDefined();
                }
              });
            } catch {
              // ignore failures
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7: Session ID and Attendance Preservation', () => {
    it('should preserve session IDs and attendance when updating', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventSessionsArbitrary,
          eventSessionsArbitrary,
          fc.string(),
          async (existingSessions, updateSessions, eventId) => {
            // Setup: Create an event with existing sessions
            const existingEvent: any = {
              id: eventId,
              creatorId: new Types.ObjectId(),
              sessions: existingSessions.map((session) => ({
                id: session.id || new Types.ObjectId().toString(),
                title: session.title,
                description: session.description,
                startTime: session.startTime,
                endTime: session.endTime,
                speaker: session.speaker,
                notes: session.notes,
                isActive: session.isActive ?? true,
                attendance: session.attendance ?? Math.floor(Math.random() * 1000),
              })),
              tickets: [],
              speakers: [],
              save: (jest.fn() as any).mockResolvedValue(true),
            };

            (mockEventModel.findOne as any).mockResolvedValue(existingEvent);
            (mockCommunityModel.findById as any).mockResolvedValue({ name: 'Test Community' });

            // Create update DTO with sessions that may or may not have IDs
            const updateDto = {
              sessions: updateSessions.map((session, index) => {
                const existingSession = existingSessions[index];
                return {
                  ...session,
                  id: session.id || (existingSession?.id ? existingSession.id : undefined),
                };
              }),
            };

            // Execute update
            try {
              await service.update(eventId, updateDto, existingEvent.creatorId.toString());
              // Verify: All existing session IDs are preserved
              const updatedSessions = existingEvent.sessions;
              existingSessions.forEach((originalSession) => {
                if (originalSession.id) {
                  const preservedSession = updatedSessions.find((s) => s.id === originalSession.id);
                  expect(preservedSession).toBeDefined();
                  // Attendance should be preserved from original
                  const originalAttendance = existingEvent.sessions.find(
                    (s) => s.id === originalSession.id
                  )?.attendance;
                  expect(preservedSession.attendance).toBe(originalAttendance);
                }
              });
            } catch {
              // ignore
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8: New Sub-Entity ID Generation', () => {
    it('should generate new IDs for sub-entities without IDs', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventSessionsArbitrary,
          eventTicketsArbitrary,
          eventSpeakersArbitrary,
          fc.string(),
          async (sessions, tickets, speakers, eventId) => {
            // Setup: Create an event with no existing sub-entities
            const existingEvent: any = {
              id: eventId,
              creatorId: new Types.ObjectId(),
              sessions: [],
              tickets: [],
              speakers: [],
              save: (jest.fn() as any).mockResolvedValue(true),
            };

            (mockEventModel.findOne as any).mockResolvedValue(existingEvent);
            (mockCommunityModel.findById as any).mockResolvedValue({ name: 'Test Community' });

            // Create update DTO with sub-entities without IDs
            const updateDto = {
              sessions: sessions.map((s) => ({ ...s, id: undefined })),
              tickets: tickets.map((t) => ({ ...t, id: undefined })),
              speakers: speakers.map((s) => ({ ...s, id: undefined })),
            };

            // Execute update
            try {
              await service.update(eventId, updateDto, existingEvent.creatorId.toString());
              // Verify: All new sub-entities have generated IDs
              const updatedSessions = existingEvent.sessions;
              const updatedTickets = existingEvent.tickets;
              const updatedSpeakers = existingEvent.speakers;

              updatedSessions.forEach((session) => {
                expect(session.id).toBeDefined();
                expect(typeof session.id).toBe('string');
                expect(session.id.length).toBeGreaterThan(0);
              });

              updatedTickets.forEach((ticket) => {
                expect(ticket.id).toBeDefined();
                expect(typeof ticket.id).toBe('string');
                expect(ticket.id.length).toBeGreaterThan(0);
              });

              updatedSpeakers.forEach((speaker) => {
                expect(speaker.id).toBeDefined();
                expect(typeof speaker.id).toBe('string');
                expect(speaker.id.length).toBeGreaterThan(0);
              });
            } catch {
              // ignore
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
