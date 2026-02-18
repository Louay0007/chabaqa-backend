import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateChallengeTaskDto } from './create-challenge.dto';

export class UpdateChallengeTasksDto {
  @ApiProperty({ description: 'Liste des tâches du défi', type: [CreateChallengeTaskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallengeTaskDto)
  tasks: CreateChallengeTaskDto[];
}

