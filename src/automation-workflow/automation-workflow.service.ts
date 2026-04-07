import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  AutomationWorkflow,
  AutomationWorkflowDocument,
  WorkflowActionType,
  WorkflowStep,
  WorkflowTrigger,
} from '../schema/automation-workflow.schema';
import {
  EnrollmentStatus,
  WorkflowEnrollment,
  WorkflowEnrollmentDocument,
} from '../schema/workflow-enrollment.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import {
  CreateWorkflowDto,
  EnrollmentQueryDto,
  ToggleWorkflowDto,
  UpdateWorkflowDto,
  WorkflowStatsDto,
} from '../dto-automation-workflow/automation-workflow.dto';
import { EmailService } from '../common/services/email.service';
import { PolicyService } from '../common/services/policy.service';
import { renderTemplate } from '../email-campaign/email-campaign-template.util';

// ─── Inactivity cooldown: 30 days per workflow per user ─────────────────────
const INACTIVITY_COOLDOWN_DAYS = 30;
// ─── Safety: max steps per enrollment to prevent infinite loops ──────────────
const MAX_STEP_HISTORY = 50;

@Injectable()
export class AutomationWorkflowService {
  private readonly logger = new Logger(AutomationWorkflowService.name);

  constructor(
    @InjectModel(AutomationWorkflow.name)
    private readonly workflowModel: Model<AutomationWorkflowDocument>,
    @InjectModel(WorkflowEnrollment.name)
    private readonly enrollmentModel: Model<WorkflowEnrollmentDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel('UserLoginActivity')
    private readonly loginActivityModel: Model<any>,
    @InjectModel('Order')
    private readonly orderModel: Model<any>,
    @InjectModel('CourseEnrollment')
    private readonly courseEnrollmentModel: Model<any>,
    private readonly emailService: EmailService,
    private readonly policyService: PolicyService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Ownership / access helper
  // ═══════════════════════════════════════════════════════════════════════════

  private async verifyCommunityAccess(
    communityId: string,
    creatorId: string,
  ): Promise<CommunityDocument> {
    const community = await this.communityModel
      .findById(communityId)
      .lean()
      .exec();
    if (!community) throw new NotFoundException('Community not found');
    if (String(community.createur) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this community');
    }
    return community as unknown as CommunityDocument;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async createWorkflow(
    creatorId: string,
    dto: CreateWorkflowDto,
  ): Promise<AutomationWorkflowDocument> {
    await this.verifyCommunityAccess(dto.communityId, creatorId);

    const workflow = new this.workflowModel({
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      name: dto.name,
      description: dto.description,
      trigger: dto.trigger,
      triggerConfig: dto.triggerConfig ?? {},
      steps: dto.steps,
      isActive: false,
      isPaused: false,
      enrolledCount: 0,
      completedCount: 0,
    });

    return workflow.save();
  }

  async updateWorkflow(
    workflowId: string,
    creatorId: string,
    dto: UpdateWorkflowDto,
  ): Promise<AutomationWorkflowDocument> {
    const workflow = await this.workflowModel.findById(workflowId).exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }

    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description;
    if (dto.trigger !== undefined) workflow.trigger = dto.trigger;
    if (dto.triggerConfig !== undefined)
      workflow.triggerConfig = dto.triggerConfig;
    if (dto.steps !== undefined) workflow.steps = dto.steps as WorkflowStep[];

    return workflow.save();
  }

  async deleteWorkflow(workflowId: string, creatorId: string): Promise<void> {
    const workflow = await this.workflowModel
      .findById(workflowId)
      .lean()
      .exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }
    await this.workflowModel.findByIdAndDelete(workflowId).exec();
    // Cancel all active enrollments
    await this.enrollmentModel
      .updateMany(
        {
          workflowId: new Types.ObjectId(workflowId),
          status: EnrollmentStatus.ACTIVE,
        },
        { $set: { status: EnrollmentStatus.CANCELLED } },
      )
      .exec();
  }

  async getWorkflows(
    creatorId: string,
    communityId: string,
  ): Promise<AutomationWorkflowDocument[]> {
    await this.verifyCommunityAccess(communityId, creatorId);
    return this.workflowModel
      .find({ communityId: new Types.ObjectId(communityId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getWorkflow(
    workflowId: string,
    creatorId: string,
  ): Promise<AutomationWorkflowDocument> {
    const workflow = await this.workflowModel.findById(workflowId).exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }
    return workflow;
  }

  async toggleWorkflow(
    workflowId: string,
    creatorId: string,
    dto: ToggleWorkflowDto,
  ): Promise<AutomationWorkflowDocument> {
    const workflow = await this.workflowModel.findById(workflowId).exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }
    workflow.isActive = dto.active;
    if (dto.active) workflow.isPaused = false;
    return workflow.save();
  }

  async pauseWorkflow(
    workflowId: string,
    creatorId: string,
  ): Promise<AutomationWorkflowDocument> {
    const workflow = await this.workflowModel.findById(workflowId).exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }
    workflow.isPaused = true;
    return workflow.save();
  }

  async resumeWorkflow(
    workflowId: string,
    creatorId: string,
  ): Promise<AutomationWorkflowDocument> {
    const workflow = await this.workflowModel.findById(workflowId).exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }
    workflow.isPaused = false;
    return workflow.save();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Enrollment
  // ═══════════════════════════════════════════════════════════════════════════

  async enrollMember(
    workflowId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    context: Record<string, any> = {},
  ): Promise<WorkflowEnrollmentDocument | null> {
    const workflow = await this.workflowModel
      .findById(workflowId)
      .lean()
      .exec();
    if (!workflow || !workflow.isActive || workflow.isPaused) return null;
    if (!workflow.steps || workflow.steps.length === 0) return null;

    const wfOid = new Types.ObjectId(String(workflowId));
    const userOid = new Types.ObjectId(String(userId));

    // Prevent re-enrollment when already active in this workflow
    const existing = await this.enrollmentModel
      .findOne({
        workflowId: wfOid,
        userId: userOid,
        status: EnrollmentStatus.ACTIVE,
      })
      .exec();
    if (existing) return existing;

    const firstStep = workflow.steps[0];
    const enrollment = new this.enrollmentModel({
      workflowId: wfOid,
      communityId: workflow.communityId,
      userId: userOid,
      currentStepId: firstStep.stepId,
      status: EnrollmentStatus.ACTIVE,
      context,
      stepHistory: [],
    });

    const saved = await enrollment.save();

    // Update enrolled count
    await this.workflowModel
      .updateOne({ _id: wfOid }, { $inc: { enrolledCount: 1 } })
      .exec();

    // Immediately begin execution (non-blocking)
    this.executeNextStep(String(saved._id)).catch((err) =>
      this.logger.error(
        `executeNextStep failed for enrollment ${saved._id}: ${err?.message}`,
      ),
    );

    return saved;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Trigger entry points
  // ═══════════════════════════════════════════════════════════════════════════

  async triggerEvent(
    communityId: string,
    trigger: WorkflowTrigger,
    userId: string,
    context: Record<string, any> = {},
  ): Promise<void> {
    const workflows = await this.workflowModel
      .find({
        communityId: new Types.ObjectId(communityId),
        trigger,
        isActive: true,
        isPaused: false,
      })
      .lean()
      .exec();

    for (const wf of workflows) {
      try {
        await this.enrollMember(String(wf._id), userId, context);
      } catch (err: any) {
        this.logger.warn(
          `Failed to enroll user ${userId} in workflow ${wf._id}: ${err?.message}`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Step execution engine
  // ═══════════════════════════════════════════════════════════════════════════

  async executeNextStep(enrollmentId: string): Promise<void> {
    const enrollment = await this.enrollmentModel.findById(enrollmentId).exec();
    if (!enrollment || enrollment.status !== EnrollmentStatus.ACTIVE) return;

    // Safety guard against infinite loops
    if (enrollment.stepHistory.length >= MAX_STEP_HISTORY) {
      this.logger.warn(
        `Enrollment ${enrollmentId} exceeded max step history (${MAX_STEP_HISTORY}). Marking as FAILED.`,
      );
      enrollment.status = EnrollmentStatus.FAILED;
      enrollment.context['failReason'] = 'max_steps_exceeded';
      await enrollment.save();
      return;
    }

    const workflow = await this.workflowModel
      .findById(enrollment.workflowId)
      .lean()
      .exec();
    if (!workflow) {
      enrollment.status = EnrollmentStatus.FAILED;
      await enrollment.save();
      return;
    }

    const step = (workflow.steps as WorkflowStep[]).find(
      (s) => s.stepId === enrollment.currentStepId,
    );

    if (!step) {
      // No step found — treat as completed
      enrollment.status = EnrollmentStatus.COMPLETED;
      await enrollment.save();
      await this.workflowModel
        .updateOne(
          { _id: enrollment.workflowId },
          { $inc: { completedCount: 1 } },
        )
        .exec();
      return;
    }

    switch (step.type) {
      case 'wait':
        await this.handleWaitStep(enrollment, step);
        break;
      case 'condition':
        await this.handleConditionStep(enrollment, step, workflow);
        break;
      case 'action':
        await this.handleActionStep(enrollment, step, workflow);
        break;
    }
  }

  // ─── Wait step ─────────────────────────────────────────────────────────────
  private async handleWaitStep(
    enrollment: WorkflowEnrollmentDocument,
    step: WorkflowStep,
  ): Promise<void> {
    const waitMs = (step.waitHours ?? 0) * 3600 * 1000;
    enrollment.resumeAt = new Date(Date.now() + waitMs);
    enrollment.stepHistory.push({
      stepId: step.stepId,
      executedAt: new Date(),
      result: 'wait_set',
    });
    await enrollment.save();
    // Execution will resume when resumeDueEnrollments() picks it up
  }

  // ─── Condition step ────────────────────────────────────────────────────────
  private async handleConditionStep(
    enrollment: WorkflowEnrollmentDocument,
    step: WorkflowStep,
    workflow: AutomationWorkflow,
  ): Promise<void> {
    const conditionResult = await this.evaluateCondition(
      step.conditionField!,
      step.conditionOperator!,
      step.conditionValue,
      enrollment,
    );

    const resultLabel = conditionResult ? 'condition_true' : 'condition_false';
    enrollment.stepHistory.push({
      stepId: step.stepId,
      executedAt: new Date(),
      result: resultLabel,
    });

    const nextId = conditionResult
      ? step.trueBranchStepId
      : step.falseBranchStepId;

    if (!nextId) {
      // Branch leads to end of workflow
      enrollment.status = EnrollmentStatus.COMPLETED;
      await enrollment.save();
      await this.workflowModel
        .updateOne(
          { _id: enrollment.workflowId },
          { $inc: { completedCount: 1 } },
        )
        .exec();
      return;
    }

    enrollment.currentStepId = nextId;
    await enrollment.save();

    // Recurse immediately
    await this.executeNextStep(String(enrollment._id));
  }

  // ─── Action step ───────────────────────────────────────────────────────────
  private async handleActionStep(
    enrollment: WorkflowEnrollmentDocument,
    step: WorkflowStep,
    workflow: AutomationWorkflow,
  ): Promise<void> {
    let result = 'executed';
    try {
      await this.executeAction(step, enrollment, workflow);
    } catch (err: any) {
      this.logger.warn(
        `Action failed for enrollment ${enrollment._id}, step ${step.stepId}: ${err?.message}`,
      );
      result = `failed: ${err?.message ?? 'unknown'}`;
    }

    enrollment.stepHistory.push({
      stepId: step.stepId,
      executedAt: new Date(),
      result,
    });

    if (!step.nextStepId) {
      // End of workflow
      enrollment.status = EnrollmentStatus.COMPLETED;
      await enrollment.save();
      await this.workflowModel
        .updateOne(
          { _id: enrollment.workflowId },
          { $inc: { completedCount: 1 } },
        )
        .exec();
      return;
    }

    enrollment.currentStepId = step.nextStepId;
    await enrollment.save();

    // Check if the next step is a WAIT — if so, set resumeAt and stop recursing
    const steps = workflow.steps as WorkflowStep[];
    const nextStep = steps.find((s) => s.stepId === step.nextStepId);
    if (nextStep?.type === 'wait') {
      await this.executeNextStep(String(enrollment._id));
    } else {
      // Continue immediately
      await this.executeNextStep(String(enrollment._id));
    }
  }

  // ─── Execute a single action ───────────────────────────────────────────────
  private async executeAction(
    step: WorkflowStep,
    enrollment: WorkflowEnrollmentDocument,
    workflow: AutomationWorkflow,
  ): Promise<void> {
    const cfg = step.actionConfig ?? {};
    const userId = String(enrollment.userId);

    // Resolve user & community for template variables
    const [user, community] = await Promise.all([
      this.userModel.findById(userId).select('name email').lean().exec(),
      this.communityModel
        .findById(enrollment.communityId)
        .select('name createur')
        .lean()
        .exec(),
    ]);

    const vars: Record<string, string> = {
      userName: (user as any)?.name ?? '',
      userEmail: (user as any)?.email ?? '',
      communityName: (community as any)?.name ?? '',
      ...Object.fromEntries(
        Object.entries(enrollment.context).map(([k, v]) => [
          k,
          String(v ?? ''),
        ]),
      ),
    };

    switch (step.actionType) {
      case WorkflowActionType.SEND_EMAIL: {
        if (!user) break;
        const subject = renderTemplate(cfg.subject ?? '', vars);
        const content = renderTemplate(cfg.content ?? '', vars);

        // Check email quota before sending
        try {
          const creatorId = String(workflow.creatorId);
          await this.policyService.getEffectiveLimitsForCreator(creatorId);
          // (quota check — PolicyService enforces when PLAN_ENFORCEMENT_MODE=true)
        } catch {
          // quota exceeded — skip silently as per spec
          break;
        }

        await this.emailService.sendGenericEmail({
          to: (user as any).email,
          subject,
          html: cfg.isHtml ? content : undefined,
          text: !cfg.isHtml ? content : '',
        });
        break;
      }

      case WorkflowActionType.SEND_DM: {
        // Insert a notification document so it shows in-app
        const message = renderTemplate(cfg.message ?? '', vars);
        try {
          await this.enrollmentModel.db.collection('notifications').insertOne({
            recipient: new Types.ObjectId(userId),
            type: 'workflow_dm',
            title: 'New message',
            message,
            communityId: enrollment.communityId,
            workflowId: enrollment.workflowId,
            read: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } catch (err: any) {
          this.logger.warn(
            `SEND_DM notification insert failed: ${err?.message}`,
          );
        }
        break;
      }

      case WorkflowActionType.GRANT_ACCESS: {
        const contentId = cfg.contentId
          ? renderTemplate(cfg.contentId, vars)
          : null;
        if (!contentId || !/^[0-9a-fA-F]{24}$/.test(contentId)) break;
        await this.communityModel
          .updateOne(
            { _id: enrollment.communityId },
            { $addToSet: { members: new Types.ObjectId(userId) } },
          )
          .exec();
        break;
      }

      case WorkflowActionType.REVOKE_ACCESS: {
        await this.communityModel
          .updateOne(
            { _id: enrollment.communityId },
            { $pull: { members: new Types.ObjectId(userId) } as any },
          )
          .exec();
        break;
      }

      case WorkflowActionType.ADD_TAG: {
        const tagName = cfg.tagName ?? '';
        if (!tagName) break;
        await this.communityModel
          .updateOne(
            {
              _id: enrollment.communityId,
              'memberTags.userId': new Types.ObjectId(userId),
            },
            { $addToSet: { 'memberTags.$.tags': tagName } },
          )
          .exec()
          .catch(() =>
            this.communityModel.updateOne({ _id: enrollment.communityId }, {
              $push: {
                memberTags: {
                  userId: new Types.ObjectId(userId),
                  tags: [tagName],
                },
              },
            } as any),
          );
        break;
      }

      case WorkflowActionType.REMOVE_TAG: {
        const tagName = cfg.tagName ?? '';
        if (!tagName) break;
        await this.communityModel
          .updateOne(
            {
              _id: enrollment.communityId,
              'memberTags.userId': new Types.ObjectId(userId),
            },
            { $pull: { 'memberTags.$.tags': tagName } as any },
          )
          .exec();
        break;
      }

      case WorkflowActionType.ADD_TO_SEGMENT: {
        const segmentName = cfg.segmentName ?? 'default';
        await this.communityModel
          .updateOne({ _id: enrollment.communityId }, {
            $addToSet: {
              [`segments.${segmentName}`]: new Types.ObjectId(userId),
            },
          } as any)
          .exec();
        break;
      }

      case WorkflowActionType.NOTIFY_CREATOR: {
        if (!community) break;
        const creatorEmail = await this.userModel
          .findById((community as any).createur)
          .select('email')
          .lean()
          .exec();
        if (!creatorEmail) break;

        const message = renderTemplate(cfg.message ?? '', vars);
        await this.emailService.sendGenericEmail({
          to: (creatorEmail as any).email,
          subject: `Workflow notification: ${workflow.name}`,
          text: message,
        });
        break;
      }

      default:
        this.logger.warn(`Unknown action type: ${step.actionType}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Condition evaluation
  // ═══════════════════════════════════════════════════════════════════════════

  private async evaluateCondition(
    conditionField: string,
    operator: string,
    conditionValue: any,
    enrollment: WorkflowEnrollmentDocument,
  ): Promise<boolean> {
    const userId = String(enrollment.userId);
    const communityId = String(enrollment.communityId);
    let resolvedValue: any;

    switch (conditionField) {
      case 'courseStarted': {
        const count = await this.courseEnrollmentModel
          .countDocuments({ userId: new Types.ObjectId(userId) })
          .exec();
        resolvedValue = count > 0;
        break;
      }
      case 'courseCompleted': {
        const enrollments = await this.courseEnrollmentModel
          .find({ userId: new Types.ObjectId(userId) })
          .lean()
          .exec();
        resolvedValue = enrollments.some((e: any) => {
          if (!e.progression || !Array.isArray(e.progression)) return false;
          return (
            e.progression.length > 0 &&
            e.progression.every((p: any) => p.isCompleted)
          );
        });
        break;
      }
      case 'hasPurchased': {
        const order = await this.orderModel
          .findOne({ userId: new Types.ObjectId(userId), status: 'paid' })
          .lean()
          .exec();
        resolvedValue = !!order;
        break;
      }
      case 'isActive': {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const activity = await this.loginActivityModel
          .findOne({
            userId: new Types.ObjectId(userId),
            communityId: new Types.ObjectId(communityId),
            lastLoginAt: { $gte: sevenDaysAgo },
          })
          .lean()
          .exec();
        resolvedValue = !!activity;
        break;
      }
      case 'hasTag': {
        const tagName = enrollment.context['tagName'] ?? conditionValue;
        const community = await this.communityModel
          .findOne({
            _id: new Types.ObjectId(communityId),
            memberTags: {
              $elemMatch: {
                userId: new Types.ObjectId(userId),
                tags: tagName,
              },
            },
          })
          .lean()
          .exec();
        resolvedValue = !!community;
        break;
      }
      default:
        // Fall back to enrollment.context
        resolvedValue = enrollment.context[conditionField];
    }

    return this.applyOperator(resolvedValue, operator, conditionValue);
  }

  private applyOperator(value: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'eq':
        // eslint-disable-next-line eqeqeq
        return value == expected;
      case 'neq':
        // eslint-disable-next-line eqeqeq
        return value != expected;
      case 'gt':
        return Number(value) > Number(expected);
      case 'lt':
        return Number(value) < Number(expected);
      case 'exists':
        return value !== undefined && value !== null;
      case 'not_exists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cron: resume waiting enrollments
  // ═══════════════════════════════════════════════════════════════════════════

  async resumeDueEnrollments(): Promise<void> {
    const now = new Date();

    const due = await this.enrollmentModel
      .find({
        status: EnrollmentStatus.ACTIVE,
        resumeAt: { $lte: now },
      })
      .limit(100)
      .exec();

    if (due.length > 0) {
      this.logger.log(`Resuming ${due.length} waiting enrollments`);
    }

    for (const enrollment of due) {
      try {
        // Clear resumeAt before advancing
        enrollment.resumeAt = undefined;

        // Advance to next step
        const workflow = await this.workflowModel
          .findById(enrollment.workflowId)
          .lean()
          .exec();
        if (!workflow) {
          enrollment.status = EnrollmentStatus.FAILED;
          await enrollment.save();
          continue;
        }

        const currentStep = (workflow.steps as WorkflowStep[]).find(
          (s) => s.stepId === enrollment.currentStepId,
        );

        if (currentStep?.nextStepId) {
          enrollment.currentStepId = currentStep.nextStepId;
        } else if (!currentStep?.nextStepId && currentStep?.type === 'wait') {
          // Wait was the last step
          enrollment.status = EnrollmentStatus.COMPLETED;
          await enrollment.save();
          await this.workflowModel
            .updateOne(
              { _id: enrollment.workflowId },
              { $inc: { completedCount: 1 } },
            )
            .exec();
          continue;
        }

        await enrollment.save();
        await this.executeNextStep(String(enrollment._id));
      } catch (err: any) {
        this.logger.error(
          `Failed to resume enrollment ${enrollment._id}: ${err?.message}`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cron: daily inactivity trigger
  // ═══════════════════════════════════════════════════════════════════════════

  async triggerDailyInactivityWorkflows(): Promise<void> {
    const inactivityWorkflows = await this.workflowModel
      .find({
        trigger: WorkflowTrigger.INACTIVITY,
        isActive: true,
        isPaused: false,
      })
      .lean()
      .exec();

    this.logger.log(
      `Processing ${inactivityWorkflows.length} inactivity workflow(s)`,
    );

    for (const wf of inactivityWorkflows) {
      try {
        const minDays: number = wf.triggerConfig?.minInactiveDays ?? 14;
        const cutoffDate = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000);

        // Find inactive users in this community
        const inactiveActivities = await this.loginActivityModel
          .find({
            communityId: wf.communityId,
            lastLoginAt: { $lte: cutoffDate },
          })
          .select('userId lastReactivationEmailSent')
          .lean()
          .exec();

        const cooldownDate = new Date(
          Date.now() - INACTIVITY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
        );

        for (const activity of inactiveActivities) {
          // 30-day cooldown per user per workflow
          if (
            activity.lastReactivationEmailSent &&
            activity.lastReactivationEmailSent >= cooldownDate
          ) {
            continue;
          }

          // Check if already active in this workflow
          const alreadyEnrolled = await this.enrollmentModel
            .findOne({
              workflowId: wf._id,
              userId: activity.userId,
              status: EnrollmentStatus.ACTIVE,
            })
            .lean()
            .exec();

          if (alreadyEnrolled) continue;

          try {
            await this.enrollMember(String(wf._id), String(activity.userId), {
              triggeredBy: 'inactivity',
              inactiveSince: activity.lastLoginAt?.toISOString(),
            });

            // Update last reactivation timestamp
            await this.loginActivityModel
              .updateOne(
                { _id: activity._id },
                { $set: { lastReactivationEmailSent: new Date() } },
              )
              .exec();
          } catch (err: any) {
            this.logger.warn(
              `Inactivity enrollment failed for user ${activity.userId}: ${err?.message}`,
            );
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Inactivity workflow ${wf._id} processing error: ${err?.message}`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  async getWorkflowStats(
    workflowId: string,
    creatorId: string,
  ): Promise<WorkflowStatsDto> {
    const workflow = await this.workflowModel
      .findById(workflowId)
      .lean()
      .exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }

    const [activeCount, cancelledCount, failedCount] = await Promise.all([
      this.enrollmentModel
        .countDocuments({
          workflowId: new Types.ObjectId(workflowId),
          status: EnrollmentStatus.ACTIVE,
        })
        .exec(),
      this.enrollmentModel
        .countDocuments({
          workflowId: new Types.ObjectId(workflowId),
          status: EnrollmentStatus.CANCELLED,
        })
        .exec(),
      this.enrollmentModel
        .countDocuments({
          workflowId: new Types.ObjectId(workflowId),
          status: EnrollmentStatus.FAILED,
        })
        .exec(),
    ]);

    // Build per-step breakdown from step history
    const stepBreakdownAgg = await this.enrollmentModel
      .aggregate([
        { $match: { workflowId: new Types.ObjectId(workflowId) } },
        { $unwind: '$stepHistory' },
        { $group: { _id: '$stepHistory.stepId', executionCount: { $sum: 1 } } },
      ])
      .exec();

    const stepBreakdown = stepBreakdownAgg.map((item: any) => {
      const matchingStep = (workflow.steps as any[]).find(
        (s) => s.stepId === item._id,
      );
      return {
        stepId: item._id,
        executionCount: item.executionCount,
        actionType: matchingStep?.actionType,
      };
    });

    const completionRate =
      workflow.enrolledCount > 0
        ? Math.round((workflow.completedCount / workflow.enrolledCount) * 100)
        : 0;

    return {
      workflowId,
      enrolledCount: workflow.enrolledCount,
      completedCount: workflow.completedCount,
      activeCount,
      cancelledCount,
      failedCount,
      completionRate,
      stepBreakdown,
    };
  }

  async getMemberJourney(
    workflowId: string,
    userId: string,
    creatorId: string,
  ): Promise<WorkflowEnrollmentDocument> {
    const workflow = await this.workflowModel
      .findById(workflowId)
      .lean()
      .exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }

    const enrollment = await this.enrollmentModel
      .findOne({
        workflowId: new Types.ObjectId(workflowId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!enrollment)
      throw new NotFoundException('No enrollment found for this user');
    return enrollment;
  }

  async listEnrollments(
    workflowId: string,
    creatorId: string,
    query: EnrollmentQueryDto,
  ): Promise<{
    data: WorkflowEnrollmentDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const workflow = await this.workflowModel
      .findById(workflowId)
      .lean()
      .exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (String(workflow.creatorId) !== String(creatorId)) {
      throw new ForbiddenException('You do not own this workflow');
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const filter: Record<string, any> = {
      workflowId: new Types.ObjectId(workflowId),
    };
    if (query.status) filter['status'] = query.status;

    const [data, total] = await Promise.all([
      this.enrollmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.enrollmentModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }
}
