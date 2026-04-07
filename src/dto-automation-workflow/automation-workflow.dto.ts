import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
  IsBoolean,
  ValidateNested,
  Min,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowTrigger, WorkflowActionType } from '../schema/automation-workflow.schema';

// ---------------------------------------------------------------------------
// Step DTO
// ---------------------------------------------------------------------------
export class WorkflowStepDto {
  @IsString()
  @IsNotEmpty()
  stepId: string;

  @IsEnum(['action', 'condition', 'wait'])
  type: 'action' | 'condition' | 'wait';

  @IsOptional()
  @IsEnum(WorkflowActionType)
  actionType?: WorkflowActionType;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waitHours?: number;

  @IsOptional()
  @IsString()
  conditionField?: string;

  @IsOptional()
  @IsEnum(['eq', 'neq', 'gt', 'lt', 'exists', 'not_exists'])
  conditionOperator?: 'eq' | 'neq' | 'gt' | 'lt' | 'exists' | 'not_exists';

  @IsOptional()
  conditionValue?: any;

  @IsOptional()
  @IsString()
  trueBranchStepId?: string;

  @IsOptional()
  @IsString()
  falseBranchStepId?: string;

  @IsOptional()
  @IsString()
  nextStepId?: string;
}

// ---------------------------------------------------------------------------
// Create workflow DTO
// ---------------------------------------------------------------------------
export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(WorkflowTrigger)
  trigger: WorkflowTrigger;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  communityId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}

// ---------------------------------------------------------------------------
// Update workflow DTO
// ---------------------------------------------------------------------------
export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(WorkflowTrigger)
  trigger?: WorkflowTrigger;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}

// ---------------------------------------------------------------------------
// Toggle workflow DTO
// ---------------------------------------------------------------------------
export class ToggleWorkflowDto {
  @IsBoolean()
  active: boolean;
}

// ---------------------------------------------------------------------------
// Workflow stats response DTO
// ---------------------------------------------------------------------------
export class WorkflowStepBreakdownDto {
  stepId: string;
  executionCount: number;
  actionType?: string;
}

export class WorkflowStatsDto {
  workflowId: string;
  enrolledCount: number;
  completedCount: number;
  activeCount: number;
  cancelledCount: number;
  failedCount: number;
  completionRate: number;
  stepBreakdown: WorkflowStepBreakdownDto[];
}

// ---------------------------------------------------------------------------
// List enrollments query DTO
// ---------------------------------------------------------------------------
export class EnrollmentQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
