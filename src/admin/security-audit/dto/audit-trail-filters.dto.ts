import { IsOptional, IsString, IsEnum, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminAction } from '../../schemas/audit-log.schema';

/**
 * DTO for audit trail filtering and search
 */
export class AuditTrailFiltersDto {
  @IsOptional()
  @IsString()
  adminUserId?: string;

  @IsOptional()
  @IsEnum(AdminAction)
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  searchTerm?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'timestamp';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * DTO for compliance report generation
 */
export class ComplianceReportDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['summary', 'detailed', 'full'])
  reportType?: 'summary' | 'detailed' | 'full' = 'summary';

  @IsOptional()
  @IsEnum(['pdf', 'csv', 'json'])
  format?: 'pdf' | 'csv' | 'json' = 'pdf';

  @IsOptional()
  @IsString({ each: true })
  includeActions?: string[];

  @IsOptional()
  @IsString({ each: true })
  includeAdminUsers?: string[];
}

/**
 * DTO for audit trail export
 */
export class AuditTrailExportDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['csv', 'json', 'excel'])
  format?: 'csv' | 'json' | 'excel' = 'csv';

  @IsOptional()
  @IsString({ each: true })
  fields?: string[];

  @IsOptional()
  @IsString()
  adminUserId?: string;

  @IsOptional()
  @IsEnum(AdminAction)
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;
}
