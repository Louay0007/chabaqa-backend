import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddChannelMembersDto {
  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}
