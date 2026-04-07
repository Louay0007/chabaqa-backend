import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Trigger types
// ---------------------------------------------------------------------------
export enum WorkflowTrigger {
  MEMBER_JOINED = 'MEMBER_JOINED',
  PURCHASE_COMPLETED = 'PURCHASE_COMPLETED',
  COURSE_COMPLETED = 'COURSE_COMPLETED',
  COURSE_STARTED = 'COURSE_STARTED',
  CHALLENGE_JOINED = 'CHALLENGE_JOINED',
  INACTIVITY = 'INACTIVITY',
  TAG_ADDED = 'TAG_ADDED',
  CUSTOM_EVENT = 'CUSTOM_EVENT',
}

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------
export enum WorkflowActionType {
  SEND_EMAIL = 'SEND_EMAIL',
  SEND_DM = 'SEND_DM',
  GRANT_ACCESS = 'GRANT_ACCESS',
  REVOKE_ACCESS = 'REVOKE_ACCESS',
  ADD_TAG = 'ADD_TAG',
  REMOVE_TAG = 'REMOVE_TAG',
  ADD_TO_SEGMENT = 'ADD_TO_SEGMENT',
  NOTIFY_CREATOR = 'NOTIFY_CREATOR',
  WAIT = 'WAIT',
}

// ---------------------------------------------------------------------------
// WorkflowStep sub-document
// ---------------------------------------------------------------------------
@Schema({ _id: false })
export class WorkflowStep {
  /** UUID used for branching references */
  @Prop({ required: true, type: String })
  stepId: string;

  @Prop({ required: true, type: String, enum: ['action', 'condition', 'wait'] })
  type: 'action' | 'condition' | 'wait';

  // ── action fields ──
  @Prop({ type: String, enum: Object.values(WorkflowActionType) })
  actionType?: WorkflowActionType;

  @Prop({ type: Object })
  actionConfig?: Record<string, any>;

  // ── wait fields ──
  @Prop({ type: Number })
  waitHours?: number;

  // ── condition fields ──
  @Prop({ type: String })
  conditionField?: string;

  @Prop({ type: String, enum: ['eq', 'neq', 'gt', 'lt', 'exists', 'not_exists'] })
  conditionOperator?: 'eq' | 'neq' | 'gt' | 'lt' | 'exists' | 'not_exists';

  @Prop({ type: Object })
  conditionValue?: any;

  @Prop({ type: String })
  trueBranchStepId?: string;

  @Prop({ type: String })
  falseBranchStepId?: string;

  // ── linear step ──
  @Prop({ type: String })
  nextStepId?: string;
}

export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

// ---------------------------------------------------------------------------
// AutomationWorkflow document
// ---------------------------------------------------------------------------
export type AutomationWorkflowDocument = AutomationWorkflow & Document;

@Schema({ timestamps: true })
export class AutomationWorkflow {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  creatorId: Types.ObjectId;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ required: true, type: String, enum: Object.values(WorkflowTrigger) })
  trigger: WorkflowTrigger;

  @Prop({ type: Object })
  triggerConfig?: Record<string, any>;

  @Prop({ type: [WorkflowStepSchema], default: [] })
  steps: WorkflowStep[];

  @Prop({ type: Boolean, default: false })
  isActive: boolean;

  @Prop({ type: Boolean, default: false })
  isPaused: boolean;

  @Prop({ type: Number, default: 0 })
  enrolledCount: number;

  @Prop({ type: Number, default: 0 })
  completedCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const AutomationWorkflowSchema =
  SchemaFactory.createForClass(AutomationWorkflow);

// Indexes
AutomationWorkflowSchema.index({ communityId: 1, isActive: 1, trigger: 1 });
AutomationWorkflowSchema.index({ creatorId: 1, communityId: 1 });
