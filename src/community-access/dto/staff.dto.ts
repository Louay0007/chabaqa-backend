import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityStaffRole } from '../../common/permissions';

export class AssignStaffRoleDto {
  @ApiProperty({ description: 'User ID to assign the role to' })
  @IsMongoId()
  userId: string;

  @ApiProperty({
    enum: CommunityStaffRole,
    description: 'Staff role to assign',
  })
  @IsEnum(CommunityStaffRole)
  role: string;
}

export class UpdateStaffRoleDto {
  @ApiProperty({
    enum: CommunityStaffRole,
    description: 'New staff role',
  })
  @IsEnum(CommunityStaffRole)
  role: string;
}
