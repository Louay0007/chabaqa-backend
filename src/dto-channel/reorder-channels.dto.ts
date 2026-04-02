import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderChannelsDto {
  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  orderedIds: string[];
}
