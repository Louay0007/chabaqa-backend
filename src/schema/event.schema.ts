import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Sous-schéma pour les sessions d'événement
 */
@Schema({ _id: false })
export class EventSession {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 200
  })
  title: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 1000
  })
  description: string;

  @Prop({
    required: true,
    trim: true
  })
  startTime: string;

  @Prop({
    required: true,
    trim: true
  })
  endTime: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100
  })
  speaker: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 500
  })
  notes?: string;

  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  attendance: number;
}

export const EventSessionSchema = SchemaFactory.createForClass(EventSession);

/**
 * Sous-schéma pour les billets d'événement
 */
@Schema({ _id: false })
export class EventTicket {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    enum: ['regular', 'vip', 'early-bird', 'student', 'free'],
    type: String
  })
  type: 'regular' | 'vip' | 'early-bird' | 'student' | 'free';

  @Prop({
    required: true,
    trim: true,
    maxlength: 100
  })
  name: string;

  @Prop({
    required: true,
    min: 0
  })
  price: number;

  @Prop({
    required: true,
    trim: true,
    maxlength: 500
  })
  description: string;

  @Prop({
    type: Number,
    min: 0
  })
  quantity?: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  sold: number;
}

export const EventTicketSchema = SchemaFactory.createForClass(EventTicket);

/**
 * Sous-schéma pour les conférenciers d'événement
 */
@Schema({ _id: false })
export class EventSpeaker {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100
  })
  name: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 200
  })
  title: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 1000
  })
  bio: string;

  @Prop({
    type: String,
    trim: true
  })
  photo?: string;
}

export const EventSpeakerSchema = SchemaFactory.createForClass(EventSpeaker);

/**
 * Sous-schéma pour les participants d'événement
 */
@Schema({ _id: false })
export class EventAttendee {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100
  })
  ticketType: string;

  @Prop({
    type: Date,
    default: Date.now
  })
  registeredAt: Date;

  @Prop({
    type: Boolean,
    default: false
  })
  checkedIn: boolean;

  @Prop({
    type: Date
  })
  checkedInAt?: Date;
}

export const EventAttendeeSchema = SchemaFactory.createForClass(EventAttendee);

/**
 * Schéma principal pour l'entité Event
 */
@Schema({ timestamps: true })
export class Event {
  @Prop({
    required: true,
    type: String,
    unique: true
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 200
  })
  title: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 2000
  })
  description: string;

  @Prop({
    required: true,
    type: Date
  })
  startDate: Date;

  @Prop({
    type: Date
  })
  endDate?: Date;

  @Prop({
    required: true,
    trim: true
  })
  startTime: string;

  @Prop({
    required: true,
    trim: true
  })
  endTime: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 50
  })
  timezone: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 200
  })
  location: string;

  @Prop({
    type: String,
    trim: true
  })
  onlineUrl?: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 50
  })
  category: string;

  @Prop({
    required: true,
    enum: ['In-person', 'Online', 'Hybrid'],
    type: String
  })
  type: 'In-person' | 'Online' | 'Hybrid';

  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  @Prop({
    type: String,
    trim: true,
    maxlength: 1000
  })
  notes?: string;

  @Prop({
    type: String,
    trim: true
  })
  image?: string;

  @Prop({
    type: [EventAttendeeSchema],
    default: []
  })
  attendees: EventAttendee[];

  @Prop({
    type: [EventTicketSchema],
    default: []
  })
  tickets: EventTicket[];

  /**
   * Configuration de prix avancée de l'événement
   */
  @Prop({
    type: {
      // Prix de base
      price: { type: Number, default: 0, min: 0 },
      currency: { type: String, enum: ['USD', 'EUR', 'TND'], default: 'TND' },
      
      // Type de prix
      priceType: { type: String, enum: ['free', 'one-time', 'monthly', 'yearly'], default: 'free' },
      
      // Produit récurrent
      isRecurring: { type: Boolean, default: false },
      recurringInterval: { type: String, enum: ['month', 'year', 'week'] },
      
      // Fonctionnalités incluses
      features: [{ type: String }],
      
      // Options de paiement
      paymentOptions: {
        allowInstallments: { type: Boolean, default: false },
        installmentCount: { type: Number, min: 2, max: 12 },
        earlyBirdDiscount: { type: Number, min: 0, max: 100 },
        groupDiscount: { type: Number, min: 0, max: 100 },
        memberDiscount: { type: Number, min: 0, max: 100 }
      },
      
      // Période d'essai
      freeTrialDays: { type: Number, min: 0, max: 30 },
      trialFeatures: [{ type: String }]
    },
    default: {}
  })
  pricing?: {
    price: number;
    currency: string;
    priceType: 'free' | 'one-time' | 'monthly' | 'yearly';
    isRecurring: boolean;
    recurringInterval?: 'month' | 'year' | 'week';
    features: string[];
    paymentOptions: {
      allowInstallments: boolean;
      installmentCount?: number;
      earlyBirdDiscount?: number;
      groupDiscount?: number;
      memberDiscount?: number;
    };
    freeTrialDays?: number;
    trialFeatures?: string[];
  };

  /**
   * Note moyenne de l'événement
   */
  @Prop({ type: Number, default: 0 })
  averageRating: number;

  /**
   * Nombre de notes
   */
  @Prop({ type: Number, default: 0 })
  ratingCount: number;

  @Prop({
    type: [EventSpeakerSchema],
    default: []
  })
  speakers: EventSpeaker[];

  @Prop({
    type: [EventSessionSchema],
    default: []
  })
  sessions: EventSession[];

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Community'
  })
  communityId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  creatorId: Types.ObjectId;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  totalRevenue: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  totalAttendees: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  averageAttendance: number;

  @Prop({
    type: [String],
    default: []
  })
  tags: string[];

  @Prop({
    type: Boolean,
    default: false
  })
  isPublished: boolean;

  @Prop({
    type: Date
  })
  publishedAt?: Date;

  @Prop({ type: Boolean, default: false })
  reminderSent?: boolean;
}

export const EventSchema = SchemaFactory.createForClass(Event);

// Index pour les recherches
EventSchema.index({ communityId: 1, isActive: 1 });
EventSchema.index({ creatorId: 1 });
EventSchema.index({ startDate: 1 });
EventSchema.index({ category: 1 });
EventSchema.index({ type: 1 });
EventSchema.index({ isPublished: 1 });

// Pre-save hook pour générer l'ID
EventSchema.pre('save', function(next) {
  if (!this.id) {
    this.id = new Types.ObjectId().toString();
  }
  next();
});

// Pre-save hook pour calculer les statistiques
EventSchema.pre('save', function(next) {
  // Calculer le total des revenus
  this.totalRevenue = this.tickets.reduce((total, ticket) => {
    return total + (ticket.price * ticket.sold);
  }, 0);

  // Calculer le total des participants
  this.totalAttendees = this.attendees.length;

  // Calculer la moyenne d'assistance
  if (this.sessions.length > 0) {
    this.averageAttendance = this.sessions.reduce((total, session) => {
      return total + session.attendance;
    }, 0) / this.sessions.length;
  }

  next();
});

export type EventDocument = Event & Document;

