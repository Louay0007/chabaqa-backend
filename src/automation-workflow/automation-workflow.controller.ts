import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import {
  CommunityIdFrom,
  RequireCommunityPermission,
} from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { AutomationWorkflowService } from './automation-workflow.service';
import {
  CreateWorkflowDto,
  EnrollmentQueryDto,
  ToggleWorkflowDto,
  UpdateWorkflowDto,
} from '../dto-automation-workflow/automation-workflow.dto';
import { WORKFLOW_TEMPLATES } from './workflow-templates';

@UseGuards(JwtAuthGuard)
@Controller('automation-workflows')
export class AutomationWorkflowController {
  constructor(private readonly workflowService: AutomationWorkflowService) {}

  // ─── Templates (no community-level auth needed, just logged in) ────────────

  @Get('templates')
  getTemplates() {
    return WORKFLOW_TEMPLATES;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  /**
   * POST /automation-workflows
   * Creates a new workflow. communityId comes from the body.
   */
  @Post()
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  createWorkflow(@Request() req: any, @Body() dto: CreateWorkflowDto) {
    return this.workflowService.createWorkflow(req.user._id, dto);
  }

  /**
   * GET /automation-workflows/community/:communityId
   * Lists all workflows for a community.
   */
  @Get('community/:communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  getWorkflows(
    @Request() req: any,
    @Param('communityId') communityId: string,
  ) {
    return this.workflowService.getWorkflows(req.user._id, communityId);
  }

  /**
   * GET /automation-workflows/:workflowId
   */
  @Get(':workflowId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  getWorkflow(@Request() req: any, @Param('workflowId') workflowId: string) {
    return this.workflowService.getWorkflow(workflowId, req.user._id);
  }

  /**
   * PUT /automation-workflows/:workflowId
   */
  @Put(':workflowId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  updateWorkflow(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowService.updateWorkflow(workflowId, req.user._id, dto);
  }

  /**
   * DELETE /automation-workflows/:workflowId
   */
  @Delete(':workflowId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  deleteWorkflow(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowService.deleteWorkflow(workflowId, req.user._id);
  }

  // ─── Status controls ──────────────────────────────────────────────────────

  /**
   * PATCH /automation-workflows/:workflowId/toggle
   * Body: { active: boolean }
   */
  @Patch(':workflowId/toggle')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  toggleWorkflow(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
    @Body() dto: ToggleWorkflowDto,
  ) {
    return this.workflowService.toggleWorkflow(workflowId, req.user._id, dto);
  }

  /**
   * PATCH /automation-workflows/:workflowId/pause
   */
  @Patch(':workflowId/pause')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  pauseWorkflow(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowService.pauseWorkflow(workflowId, req.user._id);
  }

  /**
   * PATCH /automation-workflows/:workflowId/resume
   */
  @Patch(':workflowId/resume')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  resumeWorkflow(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowService.resumeWorkflow(workflowId, req.user._id);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  /**
   * GET /automation-workflows/:workflowId/stats
   */
  @Get(':workflowId/stats')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  getWorkflowStats(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowService.getWorkflowStats(workflowId, req.user._id);
  }

  // ─── Enrollments ─────────────────────────────────────────────────────────

  /**
   * GET /automation-workflows/:workflowId/enrollments
   */
  @Get(':workflowId/enrollments')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  listEnrollments(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
    @Query() query: EnrollmentQueryDto,
  ) {
    return this.workflowService.listEnrollments(workflowId, req.user._id, query);
  }

  /**
   * GET /automation-workflows/:workflowId/enrollments/:userId
   */
  @Get(':workflowId/enrollments/:userId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AutomationWorkflow', paramName: 'workflowId' })
  getMemberJourney(
    @Request() req: any,
    @Param('workflowId') workflowId: string,
    @Param('userId') userId: string,
  ) {
    return this.workflowService.getMemberJourney(workflowId, userId, req.user._id);
  }
}
