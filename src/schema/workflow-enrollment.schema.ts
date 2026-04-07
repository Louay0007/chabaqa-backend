import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Enrollment status
// ---------------------------------------------------------------------------
export enum EnrollmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

// ---------------------------------------------------------------------------
// Step history entry sub-document
// ---------------------------------------------------------------------------
@Schema({ _id: false })
export class StepHistoryEntry {
  @Prop({ required: true, type: String })
  stepId: string;

  @Prop({ required: true, type: Date })
  executedAt: Date;

  @Prop({ type: String })
  result?: string; // 'sent', 'skipped', 'condition_true', 'condition_false', 'wait_set', etc.
}

export const StepHistoryEntrySchema =
  SchemaFactory.createForClass(StepHistoryEntry);

// ---------------------------------------------------------------------------
// WorkflowEnrollment document
// ---------------------------------------------------------------------------
export type WorkflowEnrollmentDocument = WorkflowEnrollment & Document;

@Schema({ timestamps: true })
export class WorkflowEnrollment {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'AutomationWorkflow', index: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String })
  currentStepId: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(EnrollmentStatus),
    default: EnrollmentStatus.ACTIVE,
    index: true,
  })
  status: EnrollmentStatus;

  /** Set when the enrollment is paused on a WAIT step */
  @Prop({ type: Date, index: true })
  resumeAt?: Date;

  /** Runtime context data passed in from the triggering event */
  @Prop({ type: Object, default: {} })
  context: Record<string, any>;

  @Prop({ type: [StepHistoryEntrySchema], default: [] })
  stepHistory: StepHistoryEntry[];

  createdAt: Date;
  updatedAt: Date;
}

export const WorkflowEnrollmentSchema =
  SchemaFactory.createForClass(WorkflowEnrollment);

// Indexes
WorkflowEnrollmentSchema.index(
  { workflowId: 1, userId: 1 },
  { unique: true },
);
WorkflowEnrollmentSchema.index({ status: 1, resumeAt: 1 });
WorkflowEnrollmentSchema.index({ communityId: 1, userId: 1 });
WorkflowEnrollmentSchema.index({ workflowId: 1, status: 1 });
