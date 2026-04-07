import { WorkflowTrigger, WorkflowActionType } from '../schema/automation-workflow.schema';
import { CreateWorkflowDto } from '../dto-automation-workflow/automation-workflow.dto';

/**
 * Pre-built workflow templates that creators can clone.
 * communityId is intentionally omitted — it's set at clone time.
 */
export const WORKFLOW_TEMPLATES: Omit<CreateWorkflowDto, 'communityId'>[] = [
  // ── 1. Onboarding Sequence ─────────────────────────────────────────────────
  {
    name: 'Onboarding Sequence',
    description: 'Welcome new members with a warm email, then follow up if they haven\'t started a course.',
    trigger: WorkflowTrigger.MEMBER_JOINED,
    steps: [
      {
        stepId: 's1',
        type: 'wait',
        waitHours: 1,
        nextStepId: 's2',
      },
      {
        stepId: 's2',
        type: 'action',
        actionType: WorkflowActionType.SEND_EMAIL,
        actionConfig: {
          subject: 'Welcome to {{communityName}}!',
          content: `<p>Hi {{userName}},</p>
<p>We're thrilled to have you join <strong>{{communityName}}</strong>! 🎉</p>
<p>Here's what you can do to get started:</p>
<ul>
  <li>Explore our courses and content</li>
  <li>Introduce yourself to the community</li>
  <li>Check out the latest challenges</li>
</ul>
<p>If you have any questions, feel free to reach out.</p>
<p>See you inside,<br/>The {{communityName}} Team</p>`,
          isHtml: true,
        },
        nextStepId: 's3',
      },
      {
        stepId: 's3',
        type: 'wait',
        waitHours: 72,
        nextStepId: 's4',
      },
      {
        stepId: 's4',
        type: 'condition',
        conditionField: 'courseStarted',
        conditionOperator: 'eq',
        conditionValue: false,
        trueBranchStepId: 's5',
        falseBranchStepId: undefined,
      },
      {
        stepId: 's5',
        type: 'action',
        actionType: WorkflowActionType.SEND_EMAIL,
        actionConfig: {
          subject: 'Ready to get started, {{userName}}?',
          content: `<p>Hi {{userName}},</p>
<p>We noticed you haven't started a course yet. No worries — it happens!</p>
<p>Jump in now and take your first step towards your goals. Our courses are waiting for you.</p>
<p>See you inside,<br/>The {{communityName}} Team</p>`,
          isHtml: true,
        },
      },
    ],
  },

  // ── 2. Upsell Funnel ──────────────────────────────────────────────────────
  {
    name: 'Upsell Funnel',
    description: 'After a course is completed, invite members to the next level after a short wait.',
    trigger: WorkflowTrigger.COURSE_COMPLETED,
    steps: [
      {
        stepId: 's1',
        type: 'wait',
        waitHours: 24,
        nextStepId: 's2',
      },
      {
        stepId: 's2',
        type: 'action',
        actionType: WorkflowActionType.SEND_EMAIL,
        actionConfig: {
          subject: 'Ready for the next level, {{userName}}? 🚀',
          content: `<p>Hi {{userName}},</p>
<p>Congratulations on completing the course! You've shown incredible dedication.</p>
<p>We have an advanced course designed specifically for graduates like you. It picks up right where you left off and takes your skills to the next level.</p>
<p>Check it out now!</p>
<p>Cheers,<br/>The {{communityName}} Team</p>`,
          isHtml: true,
        },
        nextStepId: 's3',
      },
      {
        stepId: 's3',
        type: 'wait',
        waitHours: 48,
        nextStepId: 's4',
      },
      {
        stepId: 's4',
        type: 'condition',
        conditionField: 'hasPurchased',
        conditionOperator: 'eq',
        conditionValue: true,
        trueBranchStepId: 's5',
        falseBranchStepId: undefined,
      },
      {
        stepId: 's5',
        type: 'action',
        actionType: WorkflowActionType.NOTIFY_CREATOR,
        actionConfig: {
          message: '{{userName}} completed the course and made a purchase!',
        },
      },
    ],
  },

  // ── 3. Re-engagement ──────────────────────────────────────────────────────
  {
    name: 'Re-engagement',
    description: 'Win back inactive members with a DM and a follow-up email if they remain inactive.',
    trigger: WorkflowTrigger.INACTIVITY,
    triggerConfig: { minInactiveDays: 14 },
    steps: [
      {
        stepId: 's1',
        type: 'action',
        actionType: WorkflowActionType.SEND_DM,
        actionConfig: {
          message: 'Hey {{userName}}, we miss you! Come back and see what\'s new in {{communityName}}.',
        },
        nextStepId: 's2',
      },
      {
        stepId: 's2',
        type: 'wait',
        waitHours: 168, // 7 days
        nextStepId: 's3',
      },
      {
        stepId: 's3',
        type: 'condition',
        conditionField: 'isActive',
        conditionOperator: 'eq',
        conditionValue: false,
        trueBranchStepId: 's4',
        falseBranchStepId: undefined,
      },
      {
        stepId: 's4',
        type: 'action',
        actionType: WorkflowActionType.SEND_EMAIL,
        actionConfig: {
          subject: 'We have a special offer for you, {{userName}}!',
          content: `<p>Hi {{userName}},</p>
<p>It's been a while since we've seen you in <strong>{{communityName}}</strong>. We miss you!</p>
<p>We've been busy creating new content and resources just for members like you.</p>
<p>Come back and see what you've been missing — we'd love to have you active again.</p>
<p>With care,<br/>The {{communityName}} Team</p>`,
          isHtml: true,
        },
      },
    ],
  },

  // ── 4. Graduation Flow ────────────────────────────────────────────────────
  {
    name: 'Graduation Flow',
    description: 'Celebrate course graduates with a tag, a congratulation email, and a creator notification.',
    trigger: WorkflowTrigger.COURSE_COMPLETED,
    steps: [
      {
        stepId: 's1',
        type: 'action',
        actionType: WorkflowActionType.ADD_TAG,
        actionConfig: { tagName: 'graduate' },
        nextStepId: 's2',
      },
      {
        stepId: 's2',
        type: 'action',
        actionType: WorkflowActionType.SEND_EMAIL,
        actionConfig: {
          subject: 'Congratulations {{userName}}! 🎓',
          content: `<p>Dear {{userName}},</p>
<p>You did it! Completing this course is a significant achievement, and we couldn't be prouder of you.</p>
<p>Your hard work and dedication have paid off. You are now officially a graduate of <strong>{{communityName}}</strong>!</p>
<p>Keep up the excellent work and continue growing. We look forward to seeing where your journey takes you next.</p>
<p>With pride,<br/>The {{communityName}} Team</p>`,
          isHtml: true,
        },
        nextStepId: 's3',
      },
      {
        stepId: 's3',
        type: 'action',
        actionType: WorkflowActionType.NOTIFY_CREATOR,
        actionConfig: {
          message: '{{userName}} just completed the course and earned their graduation badge!',
        },
      },
    ],
  },

  // ── 5. Challenge Participant ───────────────────────────────────────────────
  {
    name: 'Challenge Welcome',
    description: 'Welcome challenge participants and keep them motivated.',
    trigger: WorkflowTrigger.CHALLENGE_JOINED,
    steps: [
      {
        stepId: 's1',
        type: 'action',
        actionType: WorkflowActionType.SEND_EMAIL,
        actionConfig: {
          subject: 'You\'re in the challenge! 💪',
          content: `<p>Hi {{userName}},</p>
<p>You've just joined a challenge in <strong>{{communityName}}</strong>!</p>
<p>Here are a few tips to succeed:</p>
<ul>
  <li>Set a daily reminder to complete your challenge tasks</li>
  <li>Engage with other participants for motivation</li>
  <li>Track your progress and celebrate small wins</li>
</ul>
<p>Good luck!</p>
<p>The {{communityName}} Team</p>`,
          isHtml: true,
        },
        nextStepId: 's2',
      },
      {
        stepId: 's2',
        type: 'wait',
        waitHours: 48,
        nextStepId: 's3',
      },
      {
        stepId: 's3',
        type: 'action',
        actionType: WorkflowActionType.SEND_DM,
        actionConfig: {
          message: 'Hey {{userName}}, how is the challenge going? Keep pushing — you\'ve got this! 🔥',
        },
      },
    ],
  },

  // ── 6. Purchase Thank You ─────────────────────────────────────────────────
  {
    name: 'Purchase Thank You',
    description: 'Thank members after a purchase and help them get started.',
    trigger: WorkflowTrigger.PURCHASE_COMPLETED,
    steps: [
      {
        stepId: 's1',
        type: 'action',
        actionType: WorkflowActionType.SEND_EMAIL,
        actionConfig: {
          subject: 'Thank you for your purchase, {{userName}}! 🙏',
          content: `<p>Hi {{userName}},</p>
<p>Thank you for your purchase in <strong>{{communityName}}</strong>!</p>
<p>Your investment in yourself is truly inspiring. You now have full access to everything included in your purchase.</p>
<p>Get started right away and don't hesitate to reach out if you need any help.</p>
<p>With gratitude,<br/>The {{communityName}} Team</p>`,
          isHtml: true,
        },
        nextStepId: 's2',
      },
      {
        stepId: 's2',
        type: 'wait',
        waitHours: 72,
        nextStepId: 's3',
      },
      {
        stepId: 's3',
        type: 'action',
        actionType: WorkflowActionType.NOTIFY_CREATOR,
        actionConfig: {
          message: '{{userName}} made a purchase 3 days ago. Consider following up!',
        },
      },
    ],
  },
];
