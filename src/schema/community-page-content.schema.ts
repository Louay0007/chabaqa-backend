import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Overview Card Schema - For the 4 feature cards in Community Overview section
 */
@Schema({ _id: false })
export class OverviewCard {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  icon: string; // Icon name or emoji

  @Prop({ required: true })
  iconColor: string; // Hex color for icon background

  @Prop({ type: Number, default: 0 })
  order: number;

  @Prop({ type: Boolean, default: true })
  visible: boolean;
}

export const OverviewCardSchema = SchemaFactory.createForClass(OverviewCard);

/**
 * Benefit Item Schema - For "Transform Your Skills" section
 */
@Schema({ _id: false })
export class BenefitItem {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  icon: string; // Icon name or emoji

  @Prop({ required: true })
  iconColor: string;

  @Prop({ type: Number, default: 0 })
  order: number;

  @Prop({ type: Boolean, default: true })
  visible: boolean;
}

export const BenefitItemSchema = SchemaFactory.createForClass(BenefitItem);

/**
 * Testimonial Schema - For "What Members Are Saying" section
 */
@Schema({ _id: false })
export class Testimonial {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  role: string; // e.g., "Web Developer", "Product Manager"

  @Prop({ required: true })
  avatar: string; // URL to avatar image

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Number, default: 0 })
  order: number;

  @Prop({ type: Boolean, default: true })
  visible: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const TestimonialSchema = SchemaFactory.createForClass(Testimonial);

/**
 * Hero Section Configuration
 */
@Schema({ _id: false })
export class HeroSection {
  @Prop({ default: '' })
  customTitle?: string; // Override community name if set

  @Prop({ default: '' })
  customSubtitle?: string;

  @Prop({ default: '' })
  customBanner?: string; // Override default banner

  @Prop({ default: 'Join Community' })
  ctaButtonText: string;

  @Prop({ type: Boolean, default: true })
  showMemberCount: boolean;

  @Prop({ type: Boolean, default: true })
  showRating: boolean;

  @Prop({ type: Boolean, default: true })
  showCreator: boolean;
}

export const HeroSectionSchema = SchemaFactory.createForClass(HeroSection);

/**
 * Benefits Section Configuration
 */
@Schema({ _id: false })
export class BenefitsSection {
  @Prop({ default: 'Transform Your Skills with' })
  titlePrefix: string;

  @Prop({ default: '' })
  titleSuffix: string; // Appended after community name

  @Prop({ default: '' })
  subtitle: string;

  @Prop({ type: [BenefitItemSchema], default: [] })
  benefits: BenefitItem[];

  @Prop({ default: 'Ready to get started?' })
  ctaTitle: string;

  @Prop({ default: 'Join this community today' })
  ctaSubtitle: string;

  @Prop({ type: Boolean, default: true })
  visible: boolean;
}

export const BenefitsSectionSchema = SchemaFactory.createForClass(BenefitsSection);

/**
 * Testimonials Section Configuration
 */
@Schema({ _id: false })
export class TestimonialsSection {
  @Prop({ default: 'What Members Are Saying' })
  title: string;

  @Prop({ default: 'Join thousands of satisfied members who have achieved amazing results.' })
  subtitle: string;

  @Prop({ type: [TestimonialSchema], default: [] })
  testimonials: Testimonial[];

  @Prop({ type: Boolean, default: true })
  visible: boolean;

  @Prop({ type: Boolean, default: true })
  showRatings: boolean;
}

export const TestimonialsSectionSchema = SchemaFactory.createForClass(TestimonialsSection);

/**
 * Overview Section Configuration
 */
@Schema({ _id: false })
export class OverviewSection {
  @Prop({ default: 'Community Overview' })
  title: string;

  @Prop({ default: 'Everything you need to succeed is included in this community.' })
  subtitle: string;

  @Prop({ type: [OverviewCardSchema], default: [] })
  cards: OverviewCard[];

  @Prop({ type: Boolean, default: true })
  visible: boolean;
}

export const OverviewSectionSchema = SchemaFactory.createForClass(OverviewSection);

/**
 * CTA Section Configuration
 */
@Schema({ _id: false })
export class CTASection {
  @Prop({ default: 'Ready to Get Started?' })
  title: string;

  @Prop({ default: 'Take the first step in your journey to success with the System Admin community.' })
  subtitle: string;

  @Prop({ default: 'Join Community Now' })
  buttonText: string;

  @Prop({ type: Boolean, default: true })
  visible: boolean;

  @Prop({ default: '' })
  customBackground?: string; // URL to custom background image
}

export const CTASectionSchema = SchemaFactory.createForClass(CTASection);

/**
 * Main Community Page Content Document
 * This stores all customizable content for a community's landing page
 */
export interface CommunityPageContentDocument extends Document {
  _id: Types.ObjectId;
  community: Types.ObjectId;
  hero: HeroSection;
  overview: OverviewSection;
  benefits: BenefitsSection;
  testimonials: TestimonialsSection;
  cta: CTASection;
  isPublished: boolean;
  lastEditedBy: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

@Schema({
  timestamps: true,
  collection: 'community_page_contents'
})
export class CommunityPageContent {
  _id: Types.ObjectId;

  /**
   * Reference to the community this content belongs to
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'Community',
    required: true,
    unique: true // One content document per community
  })
  community: Types.ObjectId;

  /**
   * Hero Section Configuration
   */
  @Prop({
    type: HeroSectionSchema,
    default: () => ({})
  })
  hero: HeroSection;

  /**
   * Overview Section Configuration
   */
  @Prop({
    type: OverviewSectionSchema,
    default: () => ({
      title: 'Community Overview',
      subtitle: 'Everything you need to succeed is included in this community.',
      visible: true,
      cards: [
        {
          id: '1',
          title: 'Access to exclusive community discussions and forums',
          description: 'Connect with like-minded individuals',
          icon: '💬',
          iconColor: '#3B82F6',
          order: 0,
          visible: true
        },
        {
          id: '2',
          title: 'Weekly live Q&A sessions with industry experts',
          description: 'Get your questions answered directly',
          icon: '🎥',
          iconColor: '#8B5CF6',
          order: 1,
          visible: true
        },
        {
          id: '3',
          title: 'Premium resources, templates, and learning materials',
          description: 'Everything you need to succeed',
          icon: '📚',
          iconColor: '#10B981',
          order: 2,
          visible: true
        },
        {
          id: '4',
          title: 'Networking opportunities with like-minded professionals',
          description: 'Build meaningful connections',
          icon: '🤝',
          iconColor: '#F59E0B',
          order: 3,
          visible: true
        }
      ]
    })
  })
  overview: OverviewSection;

  /**
   * Benefits Section Configuration
   */
  @Prop({
    type: BenefitsSectionSchema,
    default: () => ({
      titlePrefix: 'Transform Your Skills with',
      visible: true,
      benefits: [
        {
          id: '1',
          title: 'Expert-Led Content',
          description: 'Learn from industry professionals who coach teams, develop courses, and share real-world insights.',
          icon: '🎓',
          iconColor: '#8B5CF6',
          order: 0,
          visible: true
        },
        {
          id: '2',
          title: 'Proven Results',
          description: 'Join members who have significantly improved their skills through our structured learning approach.',
          icon: '📈',
          iconColor: '#8B5CF6',
          order: 1,
          visible: true
        },
        {
          id: '3',
          title: 'Lifetime Access',
          description: 'Get unlimited access to all current and future courses, resources, and community features.',
          icon: '♾️',
          iconColor: '#8B5CF6',
          order: 2,
          visible: true
        },
        {
          id: '4',
          title: 'Continuous Growth',
          description: 'Regular updates with new content and resources tailored to help you stay ahead in your field.',
          icon: '🚀',
          iconColor: '#8B5CF6',
          order: 3,
          visible: true
        }
      ]
    })
  })
  benefits: BenefitsSection;

  /**
   * Testimonials Section Configuration
   */
  @Prop({
    type: TestimonialsSectionSchema,
    default: () => ({
      title: 'What Members Are Saying',
      subtitle: 'Join thousands of satisfied members who have achieved amazing results.',
      visible: true,
      showRatings: true,
      testimonials: []
    })
  })
  testimonials: TestimonialsSection;

  /**
   * CTA Section Configuration
   */
  @Prop({
    type: CTASectionSchema,
    default: () => ({
      title: 'Ready to Get Started?',
      subtitle: 'Take the first step in your journey to success.',
      buttonText: 'Join Community Now',
      visible: true
    })
  })
  cta: CTASection;

  /**
   * Publish state - only published content is shown to public
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isPublished: boolean;

  /**
   * Track who last edited this content
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User'
  })
  lastEditedBy: Types.ObjectId;

  /**
   * Version tracking for content history
   */
  @Prop({
    type: Number,
    default: 1
  })
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export const CommunityPageContentSchema = SchemaFactory.createForClass(CommunityPageContent);

// Indexes for efficient queries
CommunityPageContentSchema.index({ community: 1 }, { unique: true });
CommunityPageContentSchema.index({ isPublished: 1 });
CommunityPageContentSchema.index({ lastEditedBy: 1 });

// Middleware to increment version on save
CommunityPageContentSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }
  next();
});
